"""Orchestrate point prediction, Monte Carlo, and Sobol in one API-friendly bundle."""
from __future__ import annotations

from typing import Any, Mapping

from .monte_carlo import build_nominal_row, run_monte_carlo
from .predict import Surrogate
from .sobol_analysis import run_sobol


def run_point_predict(
    surrogate: Surrogate,
    virus_id: str,
    intervention: Mapping[str, float],
) -> dict[str, Any]:
    """Single nominal scenario (no input uncertainty)."""
    row = build_nominal_row(virus_id, intervention)
    out = surrogate.predict(row)
    return {
        "distribution": "point",
        "virus_id": virus_id,
        "summary": out["summary"],
        "trajectory": out["trajectory"].tolist(),
    }


def run_mc_with_sobol(
    surrogate: Surrogate,
    virus_id: str,
    intervention: Mapping[str, float],
    n_runs: int,
    sobol_base_n: int,
    sensitivity_output: str,
    seed: int | None = None,
) -> dict[str, Any]:
    """Monte Carlo forecast distribution + Sobol indices for one outcome metric."""
    mc = run_monte_carlo(surrogate, virus_id, intervention, n_runs, seed)
    sens = run_sobol(
        surrogate,
        virus_id,
        intervention,
        sensitivity_output,
        sobol_base_n,
        seed=seed,
    )
    return {
        "distribution": "mc",
        "virus_id": virus_id,
        "monte_carlo": mc,
        "sensitivity": sens,
    }
