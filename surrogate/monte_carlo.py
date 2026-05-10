"""Monte Carlo sampling over uncertain disease inputs, then batched surrogate inference.

Uncertainty bands match product decisions (per-virus incubation & mortality ranges;
±1 day infectious period; ±0.0005 asymptomatic & vaccine effectiveness; ±0.2 R₀).
All draws are clipped to ``INPUT_RANGES``.
"""
from __future__ import annotations

from typing import Any, Mapping

import numpy as np

from abm_simulator.simulator import DISEASE_PRESETS

from .predict import Surrogate
from .schema import INPUT_COLS, INPUT_RANGES, OUTPUT_COLS, N_TRAJECTORY_DAYS

# --- User-defined sampling bands (incubation & mortality: uniform in box) ---

INCUBATION_RANGE: dict[str, tuple[float, float]] = {
    "covid_wuhan": (3.0, 6.0),
    "hantavirus_andes": (10.0, 20.0),
    "h1n1_swine_flu": (2.0, 4.0),
    "human_metapneumovirus": (3.0, 6.0),
    "influenza_a_h3n2": (2.0, 4.0),
    "spanish_flu": (1.0, 3.0),
}

MORTALITY_RANGE: dict[str, tuple[float, float]] = {
    "covid_wuhan": (0.005, 0.007),
    "hantavirus_andes": (0.35, 0.395),
    "h1n1_swine_flu": (0.0001, 0.0003),
    "human_metapneumovirus": (0.0038, 0.005),
    "influenza_a_h3n2": (0.001, 0.0018),
    "spanish_flu": (0.013, 0.020),
}

# ± around preset nominal
DELTA_R0 = 0.2
DELTA_INFECTIOUS_DAYS = 1.0
DELTA_ASYMPTOMATIC = 0.0005
DELTA_VACCINATION_EFFECTIVENESS = 0.0005

FIXED_POPULATION = 30_000
FIXED_INITIAL_INFECTED = 10
FIXED_HOSPITAL_CAPACITY_SLIDER = 50.0
FIXED_SYMPTOMATIC_CONTACT = 0.3

_QUANTILES = (5, 50, 95)


def _clip(x: float, lo: float, hi: float) -> float:
    return float(np.clip(x, lo, hi))


def build_nominal_row(
    virus_id: str,
    intervention: Mapping[str, float],
) -> dict[str, float]:
    """Single scenario row (all ``INPUT_COLS``) from preset + slider intervention."""
    if virus_id not in DISEASE_PRESETS:
        raise KeyError(f"unknown virus_id: {virus_id}")
    if virus_id not in INCUBATION_RANGE:
        raise KeyError(f"no Monte Carlo incubation range for {virus_id}")

    d = DISEASE_PRESETS[virus_id]
    full = full_intervention(intervention)
    return {
        "r0": d.r0,
        "incubation_period": d.incubation_period,
        "infectious_period": d.infectious_period,
        "mortality_rate": d.mortality_rate,
        "asymptomatic_fraction": d.asymptomatic_fraction,
        "vaccination_effectiveness": d.vaccination_effectiveness,
        "population": float(FIXED_POPULATION),
        "initial_infected": float(FIXED_INITIAL_INFECTED),
        "hospital_capacity": FIXED_HOSPITAL_CAPACITY_SLIDER,
        "intervention_day": float(full["intervention_day"]),
        "mask_compliance": float(full["mask_compliance"]),
        "vaccination_rate": float(full["vaccination_rate"]),
        "contact_reduction": float(full["contact_reduction"]),
        "symptomatic_contact_multiplier": FIXED_SYMPTOMATIC_CONTACT,
    }


def full_intervention(user: Mapping[str, float]) -> dict[str, float]:
    """Merge slider fields with fixed symptomatic multiplier (matches frontend)."""
    return {
        "intervention_day": float(user["intervention_day"]),
        "mask_compliance": float(user["mask_compliance"]),
        "vaccination_rate": float(user["vaccination_rate"]),
        "contact_reduction": float(user["contact_reduction"]),
        "symptomatic_contact_multiplier": FIXED_SYMPTOMATIC_CONTACT,
    }


def sample_input_matrix(
    virus_id: str,
    intervention: Mapping[str, float],
    n_runs: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Shape (n_runs, len(INPUT_COLS)), float32."""
    nominal = build_nominal_row(virus_id, intervention)
    inc_lo, inc_hi = INCUBATION_RANGE[virus_id]
    mort_lo, mort_hi = MORTALITY_RANGE[virus_id]
    inc_r_lo, inc_r_hi = INPUT_RANGES["incubation_period"]
    mort_r_lo, mort_r_hi = INPUT_RANGES["mortality_rate"]
    r0_b, r1 = INPUT_RANGES["r0"]
    ip_b, ip1 = INPUT_RANGES["infectious_period"]
    asym_b, asym1 = INPUT_RANGES["asymptomatic_fraction"]
    vacc_b, vacc1 = INPUT_RANGES["vaccination_effectiveness"]

    rows = np.empty((n_runs, len(INPUT_COLS)), dtype=np.float32)
    for i in range(n_runs):
        row = nominal.copy()
        row["incubation_period"] = _clip(
            rng.uniform(inc_lo, inc_hi), inc_r_lo, inc_r_hi
        )
        row["mortality_rate"] = _clip(
            rng.uniform(mort_lo, mort_hi), mort_r_lo, mort_r_hi
        )
        row["infectious_period"] = _clip(
            rng.uniform(
                nominal["infectious_period"] - DELTA_INFECTIOUS_DAYS,
                nominal["infectious_period"] + DELTA_INFECTIOUS_DAYS,
            ),
            ip_b,
            ip1,
        )
        row["asymptomatic_fraction"] = _clip(
            rng.uniform(
                nominal["asymptomatic_fraction"] - DELTA_ASYMPTOMATIC,
                nominal["asymptomatic_fraction"] + DELTA_ASYMPTOMATIC,
            ),
            asym_b,
            asym1,
        )
        row["vaccination_effectiveness"] = _clip(
            rng.uniform(
                nominal["vaccination_effectiveness"] - DELTA_VACCINATION_EFFECTIVENESS,
                nominal["vaccination_effectiveness"] + DELTA_VACCINATION_EFFECTIVENESS,
            ),
            vacc_b,
            vacc1,
        )
        row["r0"] = _clip(
            rng.uniform(nominal["r0"] - DELTA_R0, nominal["r0"] + DELTA_R0),
            r0_b,
            r1,
        )
        rows[i] = [row[c] for c in INPUT_COLS]
    return rows


def run_monte_carlo(
    surrogate: Surrogate,
    virus_id: str,
    intervention: Mapping[str, float],
    n_runs: int,
    seed: int | None = None,
) -> dict[str, Any]:
    """Sample uncertain inputs, batch predict, return percentiles for summaries + trajectory."""
    rng = np.random.default_rng(seed)
    X = sample_input_matrix(virus_id, intervention, n_runs, rng)
    batch = surrogate.predict_batch(X)
    summary = batch["summary"]
    trajectory = batch["trajectory"]

    out_summary: dict[str, dict[str, float]] = {}
    for j, name in enumerate(OUTPUT_COLS):
        col = summary[:, j]
        out_summary[name] = {
            f"p{int(q)}": float(np.percentile(col, q)) for q in _QUANTILES
        }
        out_summary[name]["mean"] = float(np.mean(col))

    traj_pct: dict[str, list[float]] = {}
    for q in _QUANTILES:
        traj_pct[f"p{int(q)}"] = np.percentile(trajectory, q, axis=0).tolist()

    return {
        "n_runs": n_runs,
        "virus_id": virus_id,
        "summary_percentiles": out_summary,
        "trajectory_percentiles": traj_pct,
        "trajectory_days": N_TRAJECTORY_DAYS,
    }
