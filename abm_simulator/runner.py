"""Bridge between abm_simulator/simulator.py and surrogate/.

Takes a row of parameters in the surrogate's INPUT_COLS schema, builds a
DiseaseModel, runs it for n_days, and returns a row containing INPUT_COLS +
OUTPUT_COLS — exactly what surrogate/train.py expects to read from CSV.

Usage:
    from abm_simulator.runner import run_one, run_many

    row = run_one({
        "r0": 3.0, "incubation_period": 4.5, "infectious_period": 9,
        "mortality_rate": 0.021, "asymptomatic_fraction": 0.35,
        "vaccination_effectiveness": 0.85,
        "population": 10000, "initial_infected": 10, "hospital_capacity": 50,
        "intervention_day": 30, "mask_compliance": 0.6,
        "vaccination_rate": 0.004, "contact_reduction": 0.5,
        "symptomatic_contact_multiplier": 0.3,
    })

    run_many(rows, "data/abm_runs.csv")
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Mapping, Optional

import pandas as pd

from abm_simulator.simulator import DiseaseModel, DiseaseParams, InfectionState
from surrogate.schema import INPUT_COLS, OUTPUT_COLS

DISEASE_PARAM_FIELDS = (
    "r0",
    "incubation_period",
    "infectious_period",
    "mortality_rate",
    "asymptomatic_fraction",
    "vaccination_effectiveness",
)


def _build_model(params: Mapping[str, float], seed: Optional[int]) -> DiseaseModel:
    disease = DiseaseParams(**{f: params[f] for f in DISEASE_PARAM_FIELDS})
    return DiseaseModel(
        disease=disease,
        population=int(params["population"]),
        initial_infected=int(params["initial_infected"]),
        hospital_capacity_per_100k=float(params["hospital_capacity"]),
        intervention_day=int(params["intervention_day"]),
        mask_compliance=float(params["mask_compliance"]),
        vaccination_rate=float(params["vaccination_rate"]),
        contact_reduction=float(params["contact_reduction"]),
        symptomatic_contact_multiplier=float(params["symptomatic_contact_multiplier"]),
        seed=seed,
    )


def run_one(
    params: Mapping[str, float],
    n_days: int = 365,
    seed: Optional[int] = None,
) -> dict:
    """Run a single simulation. Returns a dict containing INPUT_COLS + OUTPUT_COLS."""
    missing = [c for c in INPUT_COLS if c not in params]
    if missing:
        raise KeyError(f"missing input parameters: {missing}")

    model = _build_model(params, seed)
    for _ in range(n_days):
        model.step()
        # outbreak ended early — no E or I left, nothing more will happen
        if (model.day > 1
                and model.infected_count == 0
                and model._count(InfectionState.E) == 0):
            break

    out = model.results()
    row = {c: params[c] for c in INPUT_COLS}
    row.update({c: out[c] for c in OUTPUT_COLS})
    return row


def run_many(
    param_rows: Iterable[Mapping[str, float]],
    out_csv: str | Path,
    n_days: int = 365,
    seed_base: int = 0,
) -> pd.DataFrame:
    """Run many simulations, write to CSV in the surrogate's column order."""
    out_csv = Path(out_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, params in enumerate(param_rows):
        rows.append(run_one(params, n_days=n_days, seed=seed_base + i))

    df = pd.DataFrame(rows, columns=INPUT_COLS + OUTPUT_COLS)
    df.to_csv(out_csv, index=False)
    return df
