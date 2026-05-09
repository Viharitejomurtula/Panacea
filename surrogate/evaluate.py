"""Compare surrogate predictions against ABM ground truth.

Loads a trained checkpoint, re-creates the same train/val/test split as train.py
(via the seed), predicts on the held-out test rows, and writes:

  checkpoints/<run>/test_predictions.csv  — per-row truth & prediction
  checkpoints/<run>/parity.png            — 2x3 grid of pred-vs-actual scatters
  checkpoints/<run>/metrics.json          — MAE, RMSE, R^2 per output

Usage:
    python -m surrogate.evaluate --run checkpoints/run1 --csv data/abm_runs.csv
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from .data import split_raw
from .predict import Surrogate
from .schema import OUTPUT_COLS


def metrics(truth: np.ndarray, pred: np.ndarray) -> dict[str, dict[str, float]]:
    """Per-output MAE / RMSE / R^2 in original units."""
    out = {}
    for i, col in enumerate(OUTPUT_COLS):
        t, p = truth[:, i], pred[:, i]
        mae = float(np.mean(np.abs(p - t)))
        rmse = float(np.sqrt(np.mean((p - t) ** 2)))
        var = float(np.var(t))
        r2 = float(1.0 - np.mean((p - t) ** 2) / var) if var > 0 else float("nan")
        out[col] = {"mae": mae, "rmse": rmse, "r2": r2}
    return out


def parity_plot(truth: np.ndarray, pred: np.ndarray, out_path: Path) -> None:
    """2x3 grid: one scatter per output, with y=x diagonal."""
    n = len(OUTPUT_COLS)
    cols = 3
    rows = (n + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(4 * cols, 4 * rows))
    axes = axes.flatten()

    for i, col in enumerate(OUTPUT_COLS):
        ax = axes[i]
        t, p = truth[:, i], pred[:, i]
        ax.scatter(t, p, s=8, alpha=0.5)
        lo = float(min(t.min(), p.min()))
        hi = float(max(t.max(), p.max()))
        ax.plot([lo, hi], [lo, hi], "k--", linewidth=1, label="y = x")
        # R^2 in the corner
        var = float(np.var(t))
        r2 = 1.0 - np.mean((p - t) ** 2) / var if var > 0 else float("nan")
        ax.set_title(f"{col}\nR² = {r2:.3f}")
        ax.set_xlabel("ABM (truth)")
        ax.set_ylabel("Surrogate (pred)")
        ax.grid(True, alpha=0.3)

    for j in range(n, len(axes)):
        axes[j].set_visible(False)

    fig.tight_layout()
    fig.savefig(out_path, dpi=130)
    plt.close(fig)


def evaluate(
    run_dir: Path,
    csv_path: Path,
    seed: int = 0,
    val_frac: float = 0.15,
    test_frac: float = 0.15,
) -> dict:
    """Run the full evaluation. Saves test_predictions.csv, parity.png, metrics.json."""
    run_dir = Path(run_dir)
    s = Surrogate.load(run_dir)

    splits = split_raw(csv_path, val_frac=val_frac, test_frac=test_frac, seed=seed)
    X_test, Y_test = splits["X_test"], splits["Y_test"]
    pred = s.predict_batch(X_test)

    # Per-row CSV with truth + prediction
    df = pd.DataFrame()
    for i, col in enumerate(OUTPUT_COLS):
        df[f"{col}_true"] = Y_test[:, i]
        df[f"{col}_pred"] = pred[:, i]
        df[f"{col}_err"]  = pred[:, i] - Y_test[:, i]
    df.to_csv(run_dir / "test_predictions.csv", index=False)

    m = metrics(Y_test, pred)
    (run_dir / "metrics.json").write_text(json.dumps(m, indent=2))

    parity_plot(Y_test, pred, run_dir / "parity.png")

    print(f"\nEvaluation on held-out test set ({len(X_test)} rows):")
    print(f"  {'output':35s}  {'MAE':>10s}  {'RMSE':>10s}  {'R²':>7s}")
    for col, vals in m.items():
        print(f"  {col:35s}  {vals['mae']:>10.3f}  {vals['rmse']:>10.3f}  {vals['r2']:>7.3f}")
    print(f"\nSaved: {run_dir/'test_predictions.csv'}")
    print(f"       {run_dir/'metrics.json'}")
    print(f"       {run_dir/'parity.png'}")
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", type=Path, required=True, help="checkpoint dir")
    ap.add_argument("--csv", type=Path, required=True, help="same CSV used for training")
    ap.add_argument("--seed", type=int, default=0, help="must match training seed")
    args = ap.parse_args()
    evaluate(args.run, args.csv, seed=args.seed)


if __name__ == "__main__":
    main()
