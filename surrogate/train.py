"""Train the MLP surrogate.

Usage:
    python -m surrogate.train --csv data/synthetic.csv --out checkpoints/run1
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam

from .data import make_loaders
from .model import SurrogateMLP
from .schema import OUTPUT_COLS


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
    """Report MAE per output in original (un-scaled, un-logged) units."""
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
    return {col: float(m) for col, m in zip(OUTPUT_COLS, mae)}


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
    train_loader, val_loader, test_loader, scalers = make_loaders(
        args.csv, batch_size=args.batch_size, seed=args.seed
    )

    model = SurrogateMLP().to(device)
    optim = Adam(model.parameters(), lr=args.lr)

    args.out.mkdir(parents=True, exist_ok=True)
    best_val = float("inf")
    best_epoch = -1
    bad = 0
    history = []

    for ep in range(1, args.epochs + 1):
        tr = epoch(model, train_loader, optim, device, train=True)
        va = epoch(model, val_loader, optim, device, train=False)
        history.append({"epoch": ep, "train_mse": tr, "val_mse": va})

        if va < best_val - 1e-6:
            best_val = va
            best_epoch = ep
            bad = 0
            torch.save(model.state_dict(), args.out / "model.pt")
        else:
            bad += 1

        if ep % 10 == 0 or ep == 1:
            print(f"epoch {ep:3d}  train {tr:.4f}  val {va:.4f}  best@{best_epoch}")
        if bad >= args.patience:
            print(f"early stop at epoch {ep} (best epoch {best_epoch})")
            break

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
    print("\nTest MAE (original units):")
    for k, v in test_mae.items():
        print(f"  {k:35s} {v:,.3f}")

    # Auto-run evaluation: parity plot + per-output R^2 / RMSE / MAE
    from .evaluate import evaluate
    evaluate(args.out, args.csv, seed=args.seed)


if __name__ == "__main__":
    main()
