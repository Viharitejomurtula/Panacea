"""Latin Hypercube Sampling over the simulator's input space.

Each call to `sample(n)` returns `n` parameter dicts whose keys exactly match
surrogate.schema.INPUT_COLS. Ranges come from schema.INPUT_RANGES — change
ranges in one place, both LHS and synthetic generation pick it up.

Cols whose range is a single point (e.g. population fixed at 10_000) are held
constant. Integer cols (initial_infected, intervention_day) are rounded.
"""
from __future__ import annotations

from typing import Iterable, Optional

import numpy as np
import pandas as pd
from scipy.stats.qmc import LatinHypercube

from surrogate.schema import INPUT_COLS, INPUT_RANGES

INTEGER_COLS = {"initial_infected", "intervention_day", "population"}


def sample(n: int, seed: Optional[int] = None) -> pd.DataFrame:
    """Draw `n` parameter rows via Latin Hypercube Sampling.

    Returns a DataFrame with columns in INPUT_COLS order, ready to feed into
    abm_simulator.runner.run_many.
    """
    varying_cols = [c for c in INPUT_COLS if INPUT_RANGES[c][0] != INPUT_RANGES[c][1]]
    fixed_cols = [c for c in INPUT_COLS if c not in varying_cols]

    sampler = LatinHypercube(d=len(varying_cols), seed=seed)
    unit = sampler.random(n=n)  # shape (n, d), values in [0, 1)

    cols: dict[str, np.ndarray] = {}
    for j, name in enumerate(varying_cols):
        lo, hi = INPUT_RANGES[name]
        scaled = lo + unit[:, j] * (hi - lo)
        if name in INTEGER_COLS:
            scaled = np.round(scaled).astype(int)
        cols[name] = scaled

    for name in fixed_cols:
        lo, _ = INPUT_RANGES[name]
        cols[name] = np.full(n, lo, dtype=int if name in INTEGER_COLS else float)

    return pd.DataFrame({c: cols[c] for c in INPUT_COLS})


def to_dicts(df: pd.DataFrame) -> Iterable[dict]:
    """Convert an LHS DataFrame to the list-of-dicts shape run_many expects."""
    return df.to_dict(orient="records")
