"""Surrogate inference. The UI / Sobol code calls Surrogate.predict(params).

Example:
    from surrogate.predict import Surrogate
    s = Surrogate.load("checkpoints/run1")
    out = s.predict({"r0": 2.5, "incubation_period": 5.0, ...})
    out["summary"]      # dict with the 6 OUTPUT_COLS
    out["trajectory"]   # ndarray (N_TRAJECTORY_DAYS,) of active-infected per day

    s.predict_batch(df_or_2d_array)  # returns {"summary": (n,6), "trajectory": (n,365)}
"""
from __future__ import annotations

from pathlib import Path
from typing import Mapping

import numpy as np
import torch

from .data import Scalers
from .model import SurrogateMLP
from .schema import (
    ALL_OUTPUT_COLS,
    INPUT_COLS,
    N_OUTPUTS,
    N_TRAJECTORY_DAYS,
    OUTPUT_COLS,
)


class Surrogate:
    def __init__(self, model: SurrogateMLP, scalers: Scalers, device: str = "cpu") -> None:
        self.model = model.to(device).eval()
        self.scalers = scalers
        self.device = device

    @classmethod
    def load(cls, run_dir: Path | str, device: str = "cpu") -> "Surrogate":
        run_dir = Path(run_dir)
        model = SurrogateMLP()
        model.load_state_dict(torch.load(run_dir / "model.pt", map_location=device))
        scalers = Scalers.load(run_dir / "scalers.joblib")
        return cls(model, scalers, device)

    def predict(self, params: Mapping[str, float]) -> dict:
        missing = [c for c in INPUT_COLS if c not in params]
        if missing:
            raise KeyError(f"missing input parameters: {missing}")
        x = np.array([[params[c] for c in INPUT_COLS]], dtype=np.float32)
        y = self._forward(x)[0]
        summary = {c: float(v) for c, v in zip(OUTPUT_COLS, y[:N_OUTPUTS])}
        trajectory = np.clip(y[N_OUTPUTS:], 0.0, None)
        return {"summary": summary, "trajectory": trajectory}

    def predict_batch(self, X) -> dict:
        """X: ndarray of shape (n, N_INPUTS) with columns in INPUT_COLS order,
        OR a pandas DataFrame containing INPUT_COLS.

        Returns dict with:
            "summary":    (n, N_OUTPUTS)
            "trajectory": (n, N_TRAJECTORY_DAYS)
        """
        if hasattr(X, "loc"):  # DataFrame
            X = X[INPUT_COLS].to_numpy(dtype=np.float32)
        else:
            X = np.asarray(X, dtype=np.float32)
            if X.ndim != 2 or X.shape[1] != len(INPUT_COLS):
                raise ValueError(
                    f"expected shape (n, {len(INPUT_COLS)}), got {X.shape}"
                )
        y = self._forward(X)
        return {
            "summary": y[:, :N_OUTPUTS],
            "trajectory": np.clip(y[:, N_OUTPUTS:], 0.0, None),
        }

    def predict_full(self, X) -> np.ndarray:
        """Like predict_batch but returns the raw (n, len(ALL_OUTPUT_COLS)) array
        in original units. Used by evaluate.py."""
        if hasattr(X, "loc"):
            X = X[INPUT_COLS].to_numpy(dtype=np.float32)
        else:
            X = np.asarray(X, dtype=np.float32)
        return self._forward(X)

    def _forward(self, X_raw: np.ndarray) -> np.ndarray:
        Xs = self.scalers.x.transform(X_raw).astype(np.float32)
        with torch.no_grad():
            preds_scaled = self.model(torch.from_numpy(Xs).to(self.device)).cpu().numpy()
        return self.scalers.inverse_y(preds_scaled)
