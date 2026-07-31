"""Tests for backend/app.py using FastAPI's in-process TestClient.

Requires a trained surrogate at checkpoints/run1 (already committed) so
/predict and /api/predict exercise real inference, not mocks.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app import app
from abm_simulator.simulator import DISEASE_PRESETS

client = TestClient(app)


# ── health / presets ──────────────────────────────────────────────────────────

def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_presets_lists_all_diseases():
    r = client.get("/presets")
    assert r.status_code == 200
    assert set(r.json()) == set(DISEASE_PRESETS.keys())


def test_preset_known_name():
    r = client.get("/preset/covid_wuhan")
    assert r.status_code == 200
    body = r.json()
    assert body["r0"] == DISEASE_PRESETS["covid_wuhan"].r0


def test_preset_unknown_name_404():
    r = client.get("/preset/not_a_real_disease")
    assert r.status_code == 404


# ── /predict ──────────────────────────────────────────────────────────────────

def test_predict_with_disease_preset():
    r = client.post("/predict", json={"disease_preset": "covid_wuhan"})
    assert r.status_code == 200
    body = r.json()
    assert set(body["summary"]) == {
        "peak_cases", "peak_day", "total_cases", "total_deaths",
        "days_over_hospital_capacity", "attack_rate",
    }
    assert 0.0 <= body["summary"]["attack_rate"] <= 1.0
    assert len(body["trajectory"]) == 365
    assert all(v >= 0 for v in body["trajectory"])


def test_predict_missing_inputs_without_preset():
    r = client.post("/predict", json={})
    assert r.status_code == 400
    assert "Missing inputs" in r.json()["detail"]


def test_predict_unknown_preset():
    r = client.post("/predict", json={"disease_preset": "made_up_virus"})
    assert r.status_code == 400
    assert "Unknown preset" in r.json()["detail"]


def test_predict_out_of_range_intervention_day_rejected():
    r = client.post(
        "/predict",
        json={"disease_preset": "covid_wuhan", "intervention_day": 999},
    )
    assert r.status_code == 422  # pydantic Field(ge=0, le=60)


def test_predict_malformed_json_body():
    r = client.post(
        "/predict",
        content="not json",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 422


def test_predict_clamps_out_of_range_but_valid_fields():
    # contact_reduction max is 0.9 per schema.INPUT_RANGES; the Pydantic field
    # itself already enforces le=0.9, so this checks the clamp path doesn't
    # error out on boundary values rather than silently 500ing.
    r = client.post(
        "/predict",
        json={"disease_preset": "covid_wuhan", "contact_reduction": 0.9},
    )
    assert r.status_code == 200


# ── surrogate-not-loaded behaves as 503, not a mystery 500 ───────────────────

def test_predict_surrogate_unavailable_is_503_not_500(monkeypatch):
    import backend.app as app_module

    def _boom():
        raise RuntimeError("Surrogate checkpoint not found")

    monkeypatch.setattr(app_module, "get_surrogate", _boom)
    r = client.post("/predict", json={"disease_preset": "covid_wuhan"})
    assert r.status_code == 503
    assert "Surrogate checkpoint not found" in r.json()["detail"]


# ── /api/predict (point + mc) ────────────────────────────────────────────────

_INTERVENTION = {
    "intervention_day": 30,
    "mask_compliance": 0.5,
    "vaccination_rate": 0.005,
    "contact_reduction": 0.4,
}


def test_api_predict_point():
    r = client.post("/api/predict", json={
        "virus_id": "covid_wuhan",
        "intervention": _INTERVENTION,
        "distribution": "point",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["distribution"] == "point"
    assert len(body["trajectory"]) == 365


def test_api_predict_mc_small_run():
    r = client.post("/api/predict", json={
        "virus_id": "covid_wuhan",
        "intervention": _INTERVENTION,
        "distribution": "mc",
        "n_runs": 100,
        "sobol_base_n": 64,
        "sensitivity_output": "total_deaths",
        "seed": 0,
    })
    assert r.status_code == 200
    body = r.json()
    assert "monte_carlo" in body and "sensitivity" in body


def test_api_predict_unknown_virus_id_400():
    r = client.post("/api/predict", json={
        "virus_id": "not_a_virus",
        "intervention": _INTERVENTION,
        "distribution": "point",
    })
    assert r.status_code == 400


def test_api_predict_bad_sensitivity_output_422():
    r = client.post("/api/predict", json={
        "virus_id": "covid_wuhan",
        "intervention": _INTERVENTION,
        "distribution": "mc",
        "sensitivity_output": "not_a_real_output",
    })
    assert r.status_code == 422


def test_api_monte_carlo_endpoint():
    r = client.post("/api/monte-carlo", json={
        "virus_id": "covid_wuhan",
        "intervention": _INTERVENTION,
        "n_runs": 100,
        "seed": 0,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["n_runs"] == 100
    assert "summary_percentiles" in body


# ── CORS ──────────────────────────────────────────────────────────────────────

def test_cors_preflight_allows_any_origin():
    r = client.options(
        "/predict",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "*"
