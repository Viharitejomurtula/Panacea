"""Sobol sensitivity (SALib) over the user-controllable intervention sliders.

Saltelli sampling + surrogate batch inference + variance decomposition for one
summary metric at a time (``OUTPUT_COLS``). Asks: "across the full slider space,
which intervention drives the most variance in the chosen outcome?"
"""
from __future__ import annotations

from typing import Any, Mapping

import numpy as np

from .monte_carlo import build_nominal_row
from .predict import Surrogate
from .schema import INPUT_COLS, INPUT_RANGES, OUTPUT_COLS

try:
    from SALib.analyze.sobol import analyze as salib_sobol_analyze
    from SALib.sample.saltelli import sample as saltelli_sample
except ImportError as e:  # pragma: no cover
    salib_sobol_analyze = None  # type: ignore[misc, assignment]
    saltelli_sample = None  # type: ignore[misc, assignment]
    _SALIB_IMPORT_ERROR = e
else:
    _SALIB_IMPORT_ERROR = None

# The four user-controllable sliders. Sobol asks: across the full range of these
# four, which matters most for the chosen outcome?
SOBOL_PARAM_NAMES = [
    "intervention_day",
    "mask_compliance",
    "vaccination_rate",
    "contact_reduction",
]


def _ensure_salib() -> None:
    if saltelli_sample is None or salib_sobol_analyze is None:
        raise RuntimeError(
            "SALib is required for Sobol sensitivity. Install with: pip install SALib"
        ) from _SALIB_IMPORT_ERROR


def _clip(x: float, lo: float, hi: float) -> float:
    return float(np.clip(x, lo, hi))


def _safe_span(lo: float, hi: float) -> tuple[float, float]:
    lo, hi = float(lo), float(hi)
    if lo > hi:
        lo, hi = hi, lo
    if hi - lo < 1e-12:
        hi = lo + 1e-9
    return lo, hi


def sobol_bounds_for_virus(
    virus_id: str,
    nominal: Mapping[str, float],
) -> list[tuple[float, float]]:
    """Full slider ranges per ``SOBOL_PARAM_NAMES``.

    ``virus_id`` and ``nominal`` are unused here (kept for API stability with
    callers); slider bounds come straight from ``INPUT_RANGES``.
    """
    bounds: list[tuple[float, float]] = []
    for name in SOBOL_PARAM_NAMES:
        lo, hi = INPUT_RANGES[name]
        bounds.append(_safe_span(float(lo), float(hi)))
    return bounds


def sobol_params_to_input_matrix(
    param_values: np.ndarray,
    virus_id: str,
    intervention: Mapping[str, float],
) -> np.ndarray:
    """Map Saltelli matrix ``(n, 4)`` to full surrogate inputs ``(n, len(INPUT_COLS))``.

    Disease and community params come from the virus preset + ``intervention``;
    the four sliders are overridden with the Saltelli samples.
    """
    nominal = build_nominal_row(virus_id, intervention)
    idx = {n: i for i, n in enumerate(SOBOL_PARAM_NAMES)}
    n = param_values.shape[0]
    rows = np.empty((n, len(INPUT_COLS)), dtype=np.float32)
    for i in range(n):
        row = dict(nominal)
        pv = param_values[i]
        for name in SOBOL_PARAM_NAMES:
            row[name] = float(pv[idx[name]])
        # intervention_day must be an integer day count
        row["intervention_day"] = int(round(row["intervention_day"]))
        rows[i] = [row[c] for c in INPUT_COLS]
    return rows


def run_sobol(
    surrogate: Surrogate,
    virus_id: str,
    intervention: Mapping[str, float],
    output_metric: str,
    base_sample_n: int,
    seed: int | None = None,
) -> dict[str, Any]:
    """Variance-based Sobol indices for one scalar summary output."""
    _ensure_salib()
    assert saltelli_sample is not None and salib_sobol_analyze is not None

    if output_metric not in OUTPUT_COLS:
        raise KeyError(
            f"unknown sensitivity_output {output_metric!r}; "
            f"expected one of {OUTPUT_COLS}"
        )

    nominal = build_nominal_row(virus_id, intervention)
    bounds = sobol_bounds_for_virus(virus_id, nominal)
    problem = {
        "num_vars": len(SOBOL_PARAM_NAMES),
        "names": SOBOL_PARAM_NAMES,
        "bounds": bounds,
    }

    # Saltelli sequence uses global numpy RNG; isolate from other callers.
    if seed is not None:
        np.random.seed(int(seed) + 900_001)

    param_values = saltelli_sample(
        problem, base_sample_n, calc_second_order=False
    )
    X = sobol_params_to_input_matrix(param_values, virus_id, intervention)
    batch = surrogate.predict_batch(X)
    out_idx = OUTPUT_COLS.index(output_metric)
    y = np.asarray(batch["summary"][:, out_idx], dtype=np.float64)

    if seed is not None:
        np.random.seed(int(seed) + 900_002)

    si = salib_sobol_analyze(
        problem,
        y,
        calc_second_order=False,
        print_to_console=False,
        seed=seed,
    )

    params_out: list[dict[str, float]] = []
    for j, name in enumerate(SOBOL_PARAM_NAMES):
        params_out.append(
            {
                "name": name,
                "S1": float(si["S1"][j]),
                "ST": float(si["ST"][j]),
                "S1_conf": float(si["S1_conf"][j]),
                "ST_conf": float(si["ST_conf"][j]),
            }
        )

    params_out.sort(key=lambda row: -abs(row["ST"]))

    return {
        "output_metric": output_metric,
        "saltelli_base_n": base_sample_n,
        "n_model_evals": int(param_values.shape[0]),
        "parameters": params_out,
    }
