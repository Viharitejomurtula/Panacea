"""Train the MLP surrogate.

Usage:
    python -m surrogate.train --csv data/synthetic.csv --out checkpoints/run1
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam

from .data import make_loaders
from .model import SurrogateMLP
from .schema import ALL_OUTPUT_COLS, INPUT_COLS, N_OUTPUTS, OUTPUT_COLS


def epoch(model: nn.Module, loader, optim, device, train: bool) -> float:
    model.train(train)
    loss_fn = nn.MSELoss()
    total = 0.0
    n = 0
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        if train:
            optim.zero_grad()
        with torch.set_grad_enabled(train):
            pred = model(xb)
            loss = loss_fn(pred, yb)
        if train:
            loss.backward()
            optim.step()
        total += loss.item() * xb.size(0)
        n += xb.size(0)
    return total / max(n, 1)


def per_output_metrics(model, loader, scalers, device) -> dict:
    """MAE per *summary* output in original units, plus mean trajectory MAE."""
    model.eval()
    preds_s, ys_s = [], []
    with torch.no_grad():
        for xb, yb in loader:
            preds_s.append(model(xb.to(device)).cpu().numpy())
            ys_s.append(yb.numpy())
    preds_s = np.concatenate(preds_s)
    ys_s = np.concatenate(ys_s)
    preds = scalers.inverse_y(preds_s)
    truth = scalers.inverse_y(ys_s)
    mae = np.mean(np.abs(preds - truth), axis=0)
    out = {col: float(m) for col, m in zip(OUTPUT_COLS, mae[:N_OUTPUTS])}
    out["trajectory_mean_mae"] = float(np.mean(mae[N_OUTPUTS:]))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("checkpoints/run1"))
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--patience", type=int, default=25)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    device = "cuda" if torch.cuda.is_available() else "cpu"

    print("=" * 70)
    print(f"  surrogate training")
    print("=" * 70)
    print(f"  csv:          {args.csv}")
    print(f"  out:          {args.out}")
    print(f"  device:       {device}")
    print(f"  seed:         {args.seed}")
    print(f"  epochs:       {args.epochs}  (patience {args.patience})")
    print(f"  batch size:   {args.batch_size}")
    print(f"  learning rate:{args.lr}")
    print(f"  inputs:       {len(INPUT_COLS)}")
    print(f"  outputs:      {len(ALL_OUTPUT_COLS)}  ({N_OUTPUTS} summary + {len(ALL_OUTPUT_COLS) - N_OUTPUTS} trajectory)")

    print("\n[1/4] loading CSV + fitting scalers ...")
    t = time.time()
    train_loader, val_loader, test_loader, scalers = make_loaders(
        args.csv, batch_size=args.batch_size, seed=args.seed
    )
    n_train = len(train_loader.dataset)
    n_val   = len(val_loader.dataset)
    n_test  = len(test_loader.dataset)
    print(f"      done in {time.time()-t:.1f}s "
          f"(train={n_train}, val={n_val}, test={n_test})")

    print("\n[2/4] building model ...")
    model = SurrogateMLP().to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"      {model.__class__.__name__}  ({n_params:,} parameters)")
    optim = Adam(model.parameters(), lr=args.lr)

    args.out.mkdir(parents=True, exist_ok=True)
    best_val = float("inf")
    best_epoch = -1
    bad = 0
    history = []

    print(f"\n[3/4] training for up to {args.epochs} epochs ...")
    print(f"      {'epoch':>6s}  {'train MSE':>12s}  {'val MSE':>12s}  "
          f"{'sec':>6s}  {'best':>6s}  {'patience':>9s}")
    t_start = time.time()
    for ep in range(1, args.epochs + 1):
        t_ep = time.time()
        tr = epoch(model, train_loader, optim, device, train=True)
        va = epoch(model, val_loader, optim, device, train=False)
        dt = time.time() - t_ep
        history.append({"epoch": ep, "train_mse": tr, "val_mse": va, "secs": dt})

        improved = va < best_val - 1e-6
        if improved:
            best_val = va
            best_epoch = ep
            bad = 0
            torch.save(model.state_dict(), args.out / "model.pt")
        else:
            bad += 1

        marker = " *" if improved else "  "
        print(f"      {ep:>6d}  {tr:>12.5f}  {va:>12.5f}  "
              f"{dt:>6.1f}  {best_epoch:>6d}  {bad:>4d}/{args.patience:<3d}{marker}")

        if bad >= args.patience:
            print(f"      early stop at epoch {ep} (best epoch {best_epoch})")
            break
    print(f"      total training time: {time.time()-t_start:.1f}s")

    print(f"\n[4/4] reloading best (epoch {best_epoch}) and scoring test set ...")
    scalers.save(args.out / "scalers.joblib")
    model.load_state_dict(torch.load(args.out / "model.pt"))
    test_loss = epoch(model, test_loader, optim, device, train=False)
    test_mae = per_output_metrics(model, test_loader, scalers, device)

    summary = {
        "best_val_mse": best_val,
        "best_epoch": best_epoch,
        "test_mse_scaled": test_loss,
        "test_mae_per_output": test_mae,
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2))
    (args.out / "history.json").write_text(json.dumps(history, indent=2))
    print(f"      test MSE (scaled): {test_loss:.5f}")
    print("\nTest MAE (original units):")
    for k, v in test_mae.items():
        print(f"  {k:35s} {v:,.3f}")

    # Auto-run evaluation: parity plot + per-output R^2 / RMSE / MAE
    print("\nrunning evaluate ...")
    from .evaluate import evaluate
    evaluate(args.out, args.csv, seed=args.seed)


if __name__ == "__main__":
    main()
