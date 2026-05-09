"""MLP surrogate: maps simulation parameters to outbreak outcome metrics."""
from __future__ import annotations

import torch
import torch.nn as nn

from .schema import N_INPUTS, N_OUTPUTS


class SurrogateMLP(nn.Module):
    def __init__(
        self,
        in_dim: int = N_INPUTS,
        out_dim: int = N_OUTPUTS,
        hidden: tuple[int, ...] = (128, 128, 64),
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        prev = in_dim
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, out_dim))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)
