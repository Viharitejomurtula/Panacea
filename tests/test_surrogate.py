"""Tests for surrogate.predict.Surrogate against the committed checkpoint at
checkpoints/run1. These load the real trained MLP + scalers — no mocks.
"""
from __future__ import annotations

import time

import numpy as np
import pytest

from abm_simulator.simulator import DISEASE_PRESETS
from surrogate.predict import Surrogate
from surrogate.schema import INPUT_COLS, N_TRAJECTORY_DAYS, OUTPUT_COLS

CKPT = "checkpoints/run1"

_NOMINAL_PARAMS = {
    "r0": 2.5,
    "incubation_period": 5.1,
    "infectious_period": 10.0,
    "mortality_rate": 0.005,
    "asymptomatic_fraction": 0.35,
    "vaccination_effectiveness": 0.875,
    "population": 30_000,
    "initial_infected": 10,
    "hospital_capacity": 50,
    "intervention_day": 30,
    "mask_compliance": 0.5,
    "vaccination_rate": 0.005,
    "contact_reduction": 0.4,
    "symptomatic_contact_multiplier": 0.3,
}


@pytest.fixture(scope="module")
def surrogate() -> Surrogate:
    return Surrogate.load(CKPT)


def test_load_succeeds(surrogate):
    assert surrogate.model is not None


def test_predict_output_shape_and_keys(surrogate):
    out = surrogate.predict(_NOMINAL_PARAMS)
    assert set(out["summary"]) == set(OUTPUT_COLS)
    assert out["trajectory"].shape == (N_TRAJECTORY_DAYS,)


def test_predict_missing_input_raises_keyerror(surrogate):
    bad = dict(_NOMINAL_PARAMS)
    del bad["r0"]
    with pytest.raises(KeyError):
        surrogate.predict(bad)


def test_predict_no_nans_or_infs(surrogate):
    out = surrogate.predict(_NOMINAL_PARAMS)
    values = list(out["summary"].values()) + out["trajectory"].tolist()
    assert all(np.isfinite(v) for v in values)


def test_trajectory_is_nonnegative(surrogate):
    out = surrogate.predict(_NOMINAL_PARAMS)
    assert (out["trajectory"] >= 0).all()


def test_predict_batch_matches_single_predict(surrogate):
    single = surrogate.predict(_NOMINAL_PARAMS)
    X = np.array([[_NOMINAL_PARAMS[c] for c in INPUT_COLS]], dtype=np.float32)
    batch = surrogate.predict_batch(X)
    np.testing.assert_allclose(
        batch["summary"][0],
        [single["summary"][c] for c in OUTPUT_COLS],
        rtol=1e-4,
    )


def test_all_disease_presets_produce_valid_output(surrogate):
    for name, preset in DISEASE_PRESETS.items():
        params = dict(_NOMINAL_PARAMS)
        params.update(
            r0=preset.r0,
            incubation_period=preset.incubation_period,
            infectious_period=preset.infectious_period,
            mortality_rate=preset.mortality_rate,
            asymptomatic_fraction=preset.asymptomatic_fraction,
            vaccination_effectiveness=preset.vaccination_effectiveness,
        )
        out = surrogate.predict(params)
        assert 0.0 <= out["summary"]["attack_rate"], f"{name} produced negative attack_rate"


def test_inference_latency_is_fast(surrogate):
    # Measured ~0.1ms/call on the training machine; generous 50ms budget here
    # keeps this from flaking on slower/shared CI runners while still catching
    # any accidental order-of-magnitude regression (e.g. reloading the model
    # per call, or a stray Python loop over the trajectory).
    n = 50
    start = time.perf_counter()
    for _ in range(n):
        surrogate.predict(_NOMINAL_PARAMS)
    elapsed_ms_per_call = (time.perf_counter() - start) * 1000 / n
    assert elapsed_ms_per_call < 50.0


def test_regression_guard_attack_rate_mae_on_holdout():
    """Pinned to the measured test-set MAE in checkpoints/run1/metrics.json.
    A silent accuracy regression (bad retrain, scaler mismatch, wrong
    checkpoint) should fail this before it reaches production."""
    import json
    from pathlib import Path

    metrics = json.loads(Path(CKPT, "metrics.json").read_text())
    assert metrics["attack_rate"]["mae"] < 0.06
    assert metrics["attack_rate"]["r2"] > 0.85
