"""Generate a fake-but-shaped CSV with the schema the real Mesa runs will use.

This is for pipeline testing only. The relationships here are toy heuristics
(NOT epidemiologically accurate) — they exist so we can verify train.py learns
*something* and predict.py wires up correctly. Replace with real Mesa output
once param_sampling + abm_simulator are producing rows.

Usage: python -m surrogate.make_synthetic --n 2000 --out data/synthetic.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from .schema import (
    INPUT_COLS,
    INPUT_RANGES,
    N_TRAJECTORY_DAYS,
    OUTPUT_COLS,
    TRAJECTORY_COLS,
)


def sample_inputs(n: int, rng: np.random.Generator) -> pd.DataFrame:
    cols = {}
    for name in INPUT_COLS:
        lo, hi = INPUT_RANGES[name]
        if lo == hi:
            cols[name] = np.full(n, lo, dtype=float)
        elif name in {"initial_infected", "intervention_day"}:
            cols[name] = rng.integers(int(lo), int(hi) + 1, size=n).astype(float)
        else:
            cols[name] = rng.uniform(lo, hi, size=n)
    return pd.DataFrame(cols)


def fake_outputs(X: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Cheap stand-in for the SEIR dynamics. Just monotonic enough that an MLP
    can fit it and we can confirm the pipeline learns gradients in the right
    direction."""
    n = len(X)
    pop = X["population"].to_numpy()

    # effective R after response
    r_eff = (
        X["r0"]
        * (1.0 - 0.5 * X["mask_compliance"])
        * (1.0 - 0.7 * X["contact_reduction"])
        * (1.0 - X["vaccination_rate"] * X["vaccination_effectiveness"])
    ).clip(lower=0.05)

    # rough final attack rate from a Kermack–McKendrick-style approximation
    # (1 - exp(-R * AR)), solved with a couple of fixed-point iterations.
    ar = np.full(n, 0.5)
    for _ in range(20):
        ar = 1.0 - np.exp(-r_eff.to_numpy() * ar)
    ar = ar.clip(0.001, 0.999)
    # intervention_day damps it slightly (later intervention => more cases)
    intervention_penalty = 1.0 + 0.005 * X["intervention_day"]
    ar = (ar * intervention_penalty).clip(0.001, 0.999)

    total_cases = ar * pop
    total_deaths = total_cases * X["mortality_rate"]

    peak_cases = total_cases * (0.05 + 0.15 * (r_eff / 6.0))
    peak_day = (
        20.0
        + 30.0 / r_eff
        + 0.3 * X["intervention_day"]
        + 5.0 * X["contact_reduction"]
    ).clip(5, 200)

    hosp_beds = X["hospital_capacity"] * (pop / 100_000.0)
    over_cap = (peak_cases > hosp_beds).astype(float)
    days_over = over_cap * (15.0 + 30.0 * (r_eff / 6.0))

    out = pd.DataFrame(
        {
            "peak_cases": peak_cases,
            "peak_day": peak_day,
            "total_cases": total_cases,
            "total_deaths": total_deaths,
            "days_over_hospital_capacity": days_over,
            "attack_rate": ar,
        }
    )
    # noise so the MLP doesn't memorize the closed form
    for c in OUTPUT_COLS:
        out[c] = out[c] * rng.normal(1.0, 0.05, size=n)
    return out


def fake_trajectories(X: pd.DataFrame, Y: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Bell-shaped curves keyed off peak_cases / peak_day (toy SEIR shape)."""
    days = np.arange(N_TRAJECTORY_DAYS)
    peak_d = Y["peak_day"].to_numpy()[:, None]
    peak_c = Y["peak_cases"].to_numpy()[:, None]
    width  = (8.0 + 4.0 * X["incubation_period"].to_numpy())[:, None]
    curves = peak_c * np.exp(-((days[None, :] - peak_d) ** 2) / (2.0 * width ** 2))
    curves = curves * rng.normal(1.0, 0.05, size=curves.shape)
    curves = np.clip(curves, 0.0, None)
    return pd.DataFrame(curves, columns=TRAJECTORY_COLS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--out", type=Path, default=Path("data/synthetic.csv"))
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    X = sample_inputs(args.n, rng)
    Y = fake_outputs(X, rng)
    T = fake_trajectories(X, Y, rng)
    df = pd.concat([X, Y, T], axis=1)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"wrote {len(df)} rows to {args.out}")


if __name__ == "__main__":
    main()
