"""Tests for abm_simulator.simulator.DiseaseModel — real agent-based sim runs.

Kept to small populations / short horizons so the suite stays fast; the
invariants checked here (conservation, monotonic counters, determinism,
directional response to interventions) hold regardless of scale.
"""
from __future__ import annotations

from abm_simulator.simulator import DiseaseModel, InfectionState


def _state_counts(model: DiseaseModel) -> dict[InfectionState, int]:
    return {s: model._count(s) for s in InfectionState}


def test_population_is_conserved_across_states():
    model = DiseaseModel(population=500, initial_infected=10, seed=1)
    for _ in range(60):
        model.step()
    counts = _state_counts(model)
    assert sum(counts.values()) == 500


def test_total_cases_and_deaths_are_monotonic_nondecreasing():
    model = DiseaseModel(population=500, initial_infected=10, seed=2)
    prev_cases, prev_deaths = model.total_cases, model.total_deaths
    for _ in range(80):
        model.step()
        assert model.total_cases >= prev_cases
        assert model.total_deaths >= prev_deaths
        prev_cases, prev_deaths = model.total_cases, model.total_deaths


def test_same_seed_gives_identical_results():
    def run():
        model = DiseaseModel(
            population=300, initial_infected=10, seed=42, intervention_day=15,
        )
        for _ in range(90):
            model.step()
        return model.results()

    assert run() == run()


def test_different_seeds_generally_diverge():
    def run(seed):
        model = DiseaseModel(population=300, initial_infected=10, seed=seed)
        for _ in range(90):
            model.step()
        return model.results()

    assert run(1) != run(2)


def test_no_initial_infections_stays_fully_susceptible():
    model = DiseaseModel(population=200, initial_infected=0, seed=3)
    for _ in range(30):
        model.step()
    counts = _state_counts(model)
    assert counts[InfectionState.S] == 200
    assert model.total_deaths == 0


def test_strong_intervention_reduces_peak_cases_vs_no_intervention():
    """Immediate, aggressive intervention should suppress the outbreak peak
    relative to an identical run where the intervention never kicks in
    (intervention_day beyond the simulated horizon)."""
    common = dict(
        disease="spanish_flu",  # high r0, no baseline vaccination effectiveness
        population=800,
        initial_infected=15,
        mask_compliance=0.9,
        vaccination_rate=0.02,
        contact_reduction=0.85,
        seed=7,
    )
    suppressed = DiseaseModel(intervention_day=0, **common)
    unmitigated = DiseaseModel(intervention_day=200, **common)  # never triggers in 90 steps

    for _ in range(90):
        suppressed.step()
        unmitigated.step()

    assert suppressed.results()["peak_cases"] < unmitigated.results()["peak_cases"]


def test_results_dict_has_expected_keys():
    model = DiseaseModel(population=100, initial_infected=5, seed=4)
    for _ in range(10):
        model.step()
    assert set(model.results()) == {
        "peak_cases", "peak_day", "total_cases", "total_deaths",
        "days_over_hospital_capacity", "attack_rate",
    }
    assert 0.0 <= model.results()["attack_rate"] <= 1.0
