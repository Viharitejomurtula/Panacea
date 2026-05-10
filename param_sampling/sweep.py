"""End-to-end driver: LHS → ABM runs → CSV the surrogate trains on.

Usage:
    python -m param_sampling.sweep --n 500 --days 365 --out data/abm_runs.csv
    python -m param_sampling.sweep --n 5000 --workers 8     # parallel
"""
from __future__ import annotations

import argparse
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

from abm_simulator.runner import run_one
from param_sampling.lhs import sample, to_dicts
from surrogate.schema import ALL_OUTPUT_COLS, INPUT_COLS


def _run_indexed(args: tuple[int, dict, int, int]) -> tuple[int, dict]:
    i, params, n_days, seed = args
    return i, run_one(params, n_days=n_days, seed=seed)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=500, help="number of LHS samples")
    ap.add_argument("--days", type=int, default=365, help="max sim days per run")
    ap.add_argument("--out", type=Path, default=Path("data/abm_runs.csv"))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--workers", type=int, default=1,
                    help="parallel processes (1 = sequential)")
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)

    print(f"sampling {args.n} parameter rows via LHS (seed={args.seed})")
    df_inputs = sample(args.n, seed=args.seed)
    param_dicts = list(to_dicts(df_inputs))

    print(f"running {len(param_dicts)} simulations on {args.workers} worker(s)")
    t0 = time.time()
    rows: list[dict] = [None] * len(param_dicts)  # type: ignore[list-item]

    if args.workers <= 1:
        for i, params in enumerate(param_dicts):
            rows[i] = run_one(params, n_days=args.days, seed=args.seed + i)
            if (i + 1) % max(1, len(param_dicts) // 20) == 0:
                print(f"  {i + 1}/{len(param_dicts)}  ({time.time() - t0:.1f}s)")
    else:
        tasks = [(i, p, args.days, args.seed + i) for i, p in enumerate(param_dicts)]
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            done = 0
            for i, row in ex.map(_run_indexed, tasks, chunksize=4):
                rows[i] = row
                done += 1
                if done % max(1, len(tasks) // 20) == 0:
                    print(f"  {done}/{len(tasks)}  ({time.time() - t0:.1f}s)")

    df = pd.DataFrame(rows, columns=INPUT_COLS + ALL_OUTPUT_COLS)
    df.to_csv(args.out, index=False)
    print(f"wrote {len(df)} rows to {args.out} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    # Avoid macOS fork issues with PyTorch / Mesa rng
    os.environ.setdefault("PYTHONHASHSEED", "0")
    main()
