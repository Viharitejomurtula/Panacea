from __future__ import annotations

import numpy as np
import mesa
from dataclasses import dataclass
from enum import Enum
from typing import Optional


# ── Enumerations ──────────────────────────────────────────────────────────────

class InfectionState(str, Enum):
    S = "Susceptible"
    E = "Exposed"
    I = "Infected"
    R = "Recovered"
    D = "Dead"


class AgeGroup(str, Enum):
    baby    = "baby"     # 0–2 years
    child   = "child"    # 3–15 years
    adult   = "adult"    # 16–64 years
    elderly = "elderly"  # 65+ years


# ── Disease parameters ────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DiseaseParams:
    r0:                        float
    incubation_period:         float
    infectious_period:         float
    mortality_rate:            float
    asymptomatic_fraction:     float
    vaccination_effectiveness: float


DISEASE_PRESETS: dict[str, DiseaseParams] = {
    "covid_wuhan": DiseaseParams(
        r0=3.0, incubation_period=4.5, infectious_period=9.0,
        mortality_rate=0.021, asymptomatic_fraction=0.35, vaccination_effectiveness=0.875,
    ),
    "hantavirus_andes": DiseaseParams(
        r0=1.3, incubation_period=18.0, infectious_period=10.0,
        mortality_rate=0.35, asymptomatic_fraction=0.01, vaccination_effectiveness=0.0,
    ),
    "h1n1_swine_flu": DiseaseParams(
        r0=1.6, incubation_period=2.0, infectious_period=8.0,
        mortality_rate=0.000045, asymptomatic_fraction=0.20, vaccination_effectiveness=0.7,
    ),
    "human_metapneumovirus": DiseaseParams(
        r0=1.2, incubation_period=4.5, infectious_period=10.0,
        mortality_rate=0.01, asymptomatic_fraction=0.40, vaccination_effectiveness=0.0,
    ),
    "influenza_a_h3n2": DiseaseParams(
        r0=1.3, incubation_period=2.0, infectious_period=8.0,
        mortality_rate=0.009, asymptomatic_fraction=0.185, vaccination_effectiveness=0.38,
    ),
    "spanish_flu": DiseaseParams(
        r0=1.8, incubation_period=2.0, infectious_period=4.1,
        mortality_rate=0.027, asymptomatic_fraction=0.057, vaccination_effectiveness=0.0,
    ),
}


# ── Age-group lookup tables (replace all age-based if-chains) ─────────────────

BASE_CONTACTS_PD: dict[AgeGroup, int] = {
    AgeGroup.baby:    3,
    AgeGroup.child:   20,
    AgeGroup.adult:   12,
    AgeGroup.elderly: 5,
}

# Multiplier applied to the disease's base mortality_rate
AGE_MORTALITY_MULTIPLIER: dict[AgeGroup, float] = {
    AgeGroup.baby:    3,
    AgeGroup.child:   1.5,
    AgeGroup.adult:   1.0,
    AgeGroup.elderly: 2.5,
}

# Approximate real-world age distribution for seeding a generic community
AGE_DISTRIBUTION: dict[AgeGroup, float] = {
    AgeGroup.baby:    0.05,
    AgeGroup.child:   0.20,
    AgeGroup.adult:   0.64,
    AgeGroup.elderly: 0.11,
}

# Fraction of transmission blocked when a mask is worn (split between source/target)
MASK_EFFECTIVENESS = 0.65


# ── Human Agent ───────────────────────────────────────────────────────────────

class Human(mesa.Agent):
    def __init__(self, model: DiseaseModel, age_group: AgeGroup):
        super().__init__(model)
        self.state:           InfectionState = InfectionState.S
        self.day_infected:    int            = -1
        self.day_recovered:   int            = -1
        self.days_in_state:   int            = 0
        self.age_group:       AgeGroup       = age_group
        self.wears_mask:      bool           = model.rng.random() < model.mask_compliance
        self.is_vaccinated:   bool           = False   # updated daily via vaccination_rate
        self.is_asymptomatic: bool           = False   # set when transitioning I
        self.contacts_pd:     int            = BASE_CONTACTS_PD[age_group]

        # Dispatch table — no if/elif chains in step()
        self._handlers = {
            InfectionState.S: self._step_susceptible,
            InfectionState.E: self._step_exposed,
            InfectionState.I: self._step_infected,
            InfectionState.R: self._noop,
            InfectionState.D: self._noop,
        }

    # ── helpers ───────────────────────────────────────────────────────────────

    def _noop(self): pass

    def _transition(self, new_state: InfectionState) -> None:
        self.state = new_state
        self.days_in_state = 0

    def _effective_contacts(self) -> float:
        """Base contacts adjusted for symptomatic isolation and lockdown."""
        m = self.model
        contacts = float(self.contacts_pd)

        # Symptomatic infected reduce contacts — babies and elderly are unable to
        # self-isolate reliably, so the multiplier is skipped for them
        if (self.state == InfectionState.I
                and not self.is_asymptomatic
                and self.age_group not in (AgeGroup.baby, AgeGroup.elderly)):
            contacts *= m.symptomatic_contact_multiplier

        if m.day >= m.intervention_day:
            contacts *= 1.0 - m.contact_reduction

        return max(0.0, contacts)

    def _transmission_prob(self) -> float:
        """Per-contact probability of S→E, incorporating masks and vaccination."""
        m = self.model
        p = m.base_transmission_prob

        if m.day >= m.intervention_day:
            # Inbound protection from this agent's own mask
            if self.wears_mask:
                p *= 1.0 - MASK_EFFECTIVENESS * 0.5
            # Average outbound protection from the contact pool
            p *= 1.0 - m.mask_compliance * MASK_EFFECTIVENESS * 0.5

        if self.is_vaccinated:
            p *= 1.0 - m.disease.vaccination_effectiveness

        return float(np.clip(p, 0.0, 1.0))

    # ── state handlers ────────────────────────────────────────────────────────

    def _step_susceptible(self) -> None:
        m = self.model
        if m.infected_count == 0:
            return

        contacts = self._effective_contacts()
        p_infected = min(1.0, m.infected_count / max(1, len(m.agents) - 1))
        n_infected_contacts = m.rng.binomial(max(0, int(round(contacts))), p_infected)

        if n_infected_contacts == 0:
            return

        # Probability of at least one successful transmission across all infected contacts
        p_expose = 1.0 - (1.0 - self._transmission_prob()) ** n_infected_contacts
        if m.rng.random() < p_expose:
            self._transition(InfectionState.E)
            self.day_infected = m.day
            m.total_cases += 1

    def _step_exposed(self) -> None:
        if self.days_in_state >= self.model.disease.incubation_period:
            self._transition(InfectionState.I)
            self.is_asymptomatic = (
                self.model.rng.random() < self.model.disease.asymptomatic_fraction
            )

    def _step_infected(self) -> None:
        if self.days_in_state >= self.model.disease.infectious_period:
            p_die = float(np.clip(
                self.model.disease.mortality_rate * AGE_MORTALITY_MULTIPLIER[self.age_group],
                0.0, 1.0,
            ))
            if self.model.rng.random() < p_die:
                self._transition(InfectionState.D)
                self.model.total_deaths += 1
            else:
                self._transition(InfectionState.R)
                self.day_recovered = self.model.day

    # ── main step ─────────────────────────────────────────────────────────────

    def step(self) -> None:
        if self.state == InfectionState.D:
            return

        # Rolling vaccination campaign — each unvaccinated agent has a daily chance
        if not self.is_vaccinated:
            self.is_vaccinated = self.model.rng.random() < self.model.vaccination_rate

        self._handlers[self.state]()
        self.days_in_state += 1


# ── Disease Model ─────────────────────────────────────────────────────────────

class DiseaseModel(mesa.Model):
    def __init__(
        self,
        disease: DiseaseParams | str = "covid_wuhan",
        *,
        population:                     int   = 10_000,
        initial_infected:               int   = 10,
        hospital_capacity_per_100k:     float = 50.0,
        intervention_day:               int   = 30,
        mask_compliance:                float = 0.6,
        vaccination_rate:               float = 0.004,   # daily probability per agent
        contact_reduction:              float = 0.5,
        symptomatic_contact_multiplier: float = 0.3,
        seed: Optional[int] = None,
    ):
        super().__init__(rng=np.random.default_rng(seed))
        self.disease    = DISEASE_PRESETS[disease] if isinstance(disease, str) else disease
        self.population = population
        self.hospital_capacity = hospital_capacity_per_100k * population / 100_000

        self.intervention_day               = intervention_day
        self.mask_compliance                = mask_compliance
        self.vaccination_rate               = vaccination_rate
        self.contact_reduction              = contact_reduction
        self.symptomatic_contact_multiplier = symptomatic_contact_multiplier

        # Derive per-contact transmission probability from R0
        avg_contacts = sum(BASE_CONTACTS_PD.values()) / len(BASE_CONTACTS_PD)
        self.base_transmission_prob = self.disease.r0 / (
            avg_contacts * self.disease.infectious_period
        )

        # Simulation-level counters and outputs
        self.day                = 0
        self.infected_count     = 0       # cached each model step for agent use
        self.peak_cases         = 0
        self.peak_day           = 0
        self.total_cases        = initial_infected
        self.total_deaths       = 0
        self.days_over_capacity = 0

        # Populate agents with a weighted age distribution
        ages    = list(AGE_DISTRIBUTION.keys())
        weights = list(AGE_DISTRIBUTION.values())
        for _ in range(population):
            idx = int(self.rng.choice(len(ages), p=weights))
            Human(self, age_group=ages[idx])

        # Seed initial infections
        susceptible = [a for a in self.agents if a.state == InfectionState.S]
        seed_count  = min(initial_infected, len(susceptible))
        for i in self.rng.choice(len(susceptible), size=seed_count, replace=False):
            susceptible[i]._transition(InfectionState.I)
            susceptible[i].day_infected = 0

        self.datacollector = mesa.DataCollector(
            model_reporters={
                "Susceptible":        lambda m: m._count(InfectionState.S),
                "Exposed":            lambda m: m._count(InfectionState.E),
                "Infected":           lambda m: m._count(InfectionState.I),
                "Recovered":          lambda m: m._count(InfectionState.R),
                "Dead":               lambda m: m._count(InfectionState.D),
                "Total Cases":        "total_cases",
                "Total Deaths":       "total_deaths",
                "Peak Cases":         "peak_cases",
                "Peak Day":           "peak_day",
                "Days Over Capacity": "days_over_capacity",
                "Attack Rate":        lambda m: m.total_cases / m.population,
            },
            agent_reporters={
                "State":         "state",
                "Age Group":     "age_group",
                "Wears Mask":    "wears_mask",
                "Is Vaccinated": "is_vaccinated",
                "Day Infected":  "day_infected",
                "Day Recovered": "day_recovered",
            },
        )

    # ── helpers ───────────────────────────────────────────────────────────────

    def _count(self, state: InfectionState) -> int:
        return sum(1 for a in self.agents if a.state == state)

    # ── model step ────────────────────────────────────────────────────────────

    def step(self) -> None:
        self.infected_count = self._count(InfectionState.I)

        if self.infected_count > self.peak_cases:
            self.peak_cases = self.infected_count
            self.peak_day   = self.day

        if self.infected_count > self.hospital_capacity:
            self.days_over_capacity += 1

        self.agents.shuffle_do("step")
        self.datacollector.collect(self)
        self.day += 1

    def results(self) -> dict:
        return {
            "peak_cases":                  self.peak_cases,
            "peak_day":                    self.peak_day,
            "total_cases":                 self.total_cases,
            "total_deaths":                self.total_deaths,
            "days_over_hospital_capacity": self.days_over_capacity,
            "attack_rate":                 self.total_cases / self.population,
        }
