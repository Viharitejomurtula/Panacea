"""Sobol sensitivity (SALib) over the same uncertain inputs as Monte Carlo.

Saltelli sampling + surrogate batch inference + variance decomposition for one
summary metric at a time (``OUTPUT_COLS``).
"""
from __future__ import annotations

from typing import Any, Mapping

import numpy as np

from .monte_carlo import (
    DELTA_ASYMPTOMATIC,
    DELTA_INFECTIOUS_DAYS,
    DELTA_R0,
    DELTA_VACCINATION_EFFECTIVENESS,
    INCUBATION_RANGE,
    MORTALITY_RANGE,
    build_nominal_row,
)
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

# Same six uncertain knobs as ``monte_carlo.sample_input_matrix`` (fixed order for SALib).
SOBOL_PARAM_NAMES = [
    "r0",
    "incubation_period",
    "infectious_period",
    "mortality_rate",
    "asymptomatic_fraction",
    "vaccination_effectiveness",
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
    """Bounds per ``SOBOL_PARAM_NAMES``, aligned with MC uncertainty ranges."""
    inc_lo, inc_hi = INCUBATION_RANGE[virus_id]
    mort_lo, mort_hi = MORTALITY_RANGE[virus_id]
    r0_b, r1 = INPUT_RANGES["r0"]
    ip_b, ip1 = INPUT_RANGES["infectious_period"]
    asym_b, asym1 = INPUT_RANGES["asymptomatic_fraction"]
    vacc_b, vacc1 = INPUT_RANGES["vaccination_effectiveness"]
    inc_r_lo, inc_r_hi = INPUT_RANGES["incubation_period"]
    mort_r_lo, mort_r_hi = INPUT_RANGES["mortality_rate"]

    r0_lo, r0_hi = _safe_span(
        _clip(float(nominal["r0"]) - DELTA_R0, r0_b, r1),
        _clip(float(nominal["r0"]) + DELTA_R0, r0_b, r1),
    )
    inc_lo_c, inc_hi_c = _safe_span(
        _clip(inc_lo, inc_r_lo, inc_r_hi),
        _clip(inc_hi, inc_r_lo, inc_r_hi),
    )
    ip_nom = float(nominal["infectious_period"])
    ip_lo_c, ip_hi_c = _safe_span(
        _clip(ip_nom - DELTA_INFECTIOUS_DAYS, ip_b, ip1),
        _clip(ip_nom + DELTA_INFECTIOUS_DAYS, ip_b, ip1),
    )
    mort_lo_c, mort_hi_c = _safe_span(
        _clip(mort_lo, mort_r_lo, mort_r_hi),
        _clip(mort_hi, mort_r_lo, mort_r_hi),
    )
    asym_nom = float(nominal["asymptomatic_fraction"])
    asym_lo_c, asym_hi_c = _safe_span(
        _clip(asym_nom - DELTA_ASYMPTOMATIC, asym_b, asym1),
        _clip(asym_nom + DELTA_ASYMPTOMATIC, asym_b, asym1),
    )
    vacc_nom = float(nominal["vaccination_effectiveness"])
    vacc_lo_c, vacc_hi_c = _safe_span(
        _clip(vacc_nom - DELTA_VACCINATION_EFFECTIVENESS, vacc_b, vacc1),
        _clip(vacc_nom + DELTA_VACCINATION_EFFECTIVENESS, vacc_b, vacc1),
    )

    return [
        (r0_lo, r0_hi),
        (inc_lo_c, inc_hi_c),
        (ip_lo_c, ip_hi_c),
        (mort_lo_c, mort_hi_c),
        (asym_lo_c, asym_hi_c),
        (vacc_lo_c, vacc_hi_c),
    ]


def sobol_params_to_input_matrix(
    param_values: np.ndarray,
    virus_id: str,
    intervention: Mapping[str, float],
) -> np.ndarray:
    """Map Saltelli matrix ``(n, 6)`` to full surrogate inputs ``(n, len(INPUT_COLS))``."""
    nominal = build_nominal_row(virus_id, intervention)
    idx = {n: i for i, n in enumerate(SOBOL_PARAM_NAMES)}
    n = param_values.shape[0]
    rows = np.empty((n, len(INPUT_COLS)), dtype=np.float32)
    for i in range(n):
        row = dict(nominal)
        pv = param_values[i]
        row["r0"] = float(pv[idx["r0"]])
        row["incubation_period"] = float(pv[idx["incubation_period"]])
        row["infectious_period"] = float(pv[idx["infectious_period"]])
        row["mortality_rate"] = float(pv[idx["mortality_rate"]])
        row["asymptomatic_fraction"] = float(pv[idx["asymptomatic_fraction"]])
        row["vaccination_effectiveness"] = float(pv[idx["vaccination_effectiveness"]])
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
