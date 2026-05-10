"""CSV → torch tensors, with input + output StandardScalers.

Outputs sit on very different scales (peak_day ~ 50 vs total_cases ~ 5e5), so
each output column gets its own scaler. We log1p the strictly-nonneg outputs
first so the network learns over a more even-mannered target space.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

from .schema import ALL_OUTPUT_COLS, INPUT_COLS, OUTPUT_COLS, TRAJECTORY_COLS

# Outputs that should be log1p'd before scaling (counts, durations).
# All trajectory columns are active-infected counts → log1p them too.
LOG_OUTPUTS = {
    "peak_cases",
    "total_cases",
    "total_deaths",
    "days_over_hospital_capacity",
    *TRAJECTORY_COLS,
}


@dataclass
class Scalers:
    x: StandardScaler
    y: StandardScaler
    log_mask: np.ndarray  # bool array over ALL_OUTPUT_COLS — which were log1p'd

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {"x": self.x, "y": self.y, "log_mask": self.log_mask},
            path,
        )

    @classmethod
    def load(cls, path: Path) -> "Scalers":
        d = joblib.load(path)
        return cls(x=d["x"], y=d["y"], log_mask=d["log_mask"])

    def transform_y(self, y_raw: np.ndarray) -> np.ndarray:
        y = y_raw.copy().astype(float)
        y[:, self.log_mask] = np.log1p(np.clip(y[:, self.log_mask], 0, None))
        return self.y.transform(y)

    def inverse_y(self, y_scaled: np.ndarray) -> np.ndarray:
        y = self.y.inverse_transform(y_scaled)
        # Clip log-space values before expm1 to:
        #   1. avoid float overflow on extreme predictions
        #   2. cap predictions at physically plausible counts (population is 30k,
        #      so log1p(30k) ≈ 10.3; allow some headroom up to 13 ≈ 440k).
        logged = np.clip(y[:, self.log_mask], -1.0, 13.0)
        y[:, self.log_mask] = np.clip(np.expm1(logged), 0, None)
        return y


def fit_scalers(X_raw: np.ndarray, Y_raw: np.ndarray) -> Scalers:
    x_scaler = StandardScaler().fit(X_raw)
    log_mask = np.array([c in LOG_OUTPUTS for c in ALL_OUTPUT_COLS], dtype=bool)
    Y_logged = Y_raw.copy().astype(float)
    Y_logged[:, log_mask] = np.log1p(np.clip(Y_logged[:, log_mask], 0, None))
    y_scaler = StandardScaler().fit(Y_logged)
    return Scalers(x=x_scaler, y=y_scaler, log_mask=log_mask)


def load_csv(path: Path) -> tuple[np.ndarray, np.ndarray]:
    df = pd.read_csv(path)
    missing = [c for c in INPUT_COLS + ALL_OUTPUT_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"CSV {path} is missing required columns: {missing}")
    X = df[INPUT_COLS].to_numpy(dtype=np.float32)
    Y = df[ALL_OUTPUT_COLS].to_numpy(dtype=np.float32)
    return X, Y


def split_raw(
    csv_path: Path,
    val_frac: float = 0.15,
    test_frac: float = 0.15,
    seed: int = 0,
) -> dict[str, np.ndarray]:
    """Deterministic train/val/test split on raw (un-scaled) arrays.

    Used by both make_loaders (for training) and evaluate (for parity plots in
    original units). Same seed → identical split, so evaluate.py can read the
    held-out rows the model never saw during training.
    """
    X, Y = load_csv(csv_path)
    X_trainval, X_test, Y_trainval, Y_test = train_test_split(
        X, Y, test_size=test_frac, random_state=seed
    )
    val_size_rel = val_frac / (1.0 - test_frac)
    X_train, X_val, Y_train, Y_val = train_test_split(
        X_trainval, Y_trainval, test_size=val_size_rel, random_state=seed
    )
    return {
        "X_train": X_train, "Y_train": Y_train,
        "X_val":   X_val,   "Y_val":   Y_val,
        "X_test":  X_test,  "Y_test":  Y_test,
    }


def make_loaders(
    csv_path: Path,
    batch_size: int = 64,
    val_frac: float = 0.15,
    test_frac: float = 0.15,
    seed: int = 0,
    scalers: Optional[Scalers] = None,
) -> tuple[DataLoader, DataLoader, DataLoader, Scalers]:
    s = split_raw(csv_path, val_frac=val_frac, test_frac=test_frac, seed=seed)

    if scalers is None:
        scalers = fit_scalers(s["X_train"], s["Y_train"])

    def to_loader(Xa: np.ndarray, Ya: np.ndarray, shuffle: bool) -> DataLoader:
        Xs = scalers.x.transform(Xa).astype(np.float32)
        Ys = scalers.transform_y(Ya).astype(np.float32)
        ds = TensorDataset(torch.from_numpy(Xs), torch.from_numpy(Ys))
        return DataLoader(ds, batch_size=batch_size, shuffle=shuffle)

    return (
        to_loader(s["X_train"], s["Y_train"], shuffle=True),
        to_loader(s["X_val"],   s["Y_val"],   shuffle=False),
        to_loader(s["X_test"],  s["Y_test"],  shuffle=False),
        scalers,
    )
