"""Panacea API — FastAPI app served as a Vercel Python serverless function.

Endpoints:
  GET  /api/health          sanity check
  GET  /api/schema          returns INPUT_COLS, OUTPUT_COLS, INPUT_RANGES
  POST /api/predict         single-param inference (placeholder until model wired)
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, model_validator

# ---------------------------------------------------------------------------
# Schema constants (mirrors surrogate/schema.py — kept in sync manually)
# ---------------------------------------------------------------------------

INPUT_COLS: list[str] = [
    "r0",
    "incubation_period",
    "infectious_period",
    "mortality_rate",
    "asymptomatic_fraction",
    "vaccination_effectiveness",
    "population",
    "initial_infected",
    "hospital_capacity",
    "intervention_day",
    "mask_compliance",
    "vaccination_rate",
    "contact_reduction",
    "symptomatic_contact_multiplier",
]

OUTPUT_COLS: list[str] = [
    "peak_cases",
    "peak_day",
    "total_cases",
    "total_deaths",
    "days_over_hospital_capacity",
    "attack_rate",
]

N_TRAJECTORY_DAYS = 365

INPUT_RANGES: dict[str, tuple[float, float]] = {
    "r0": (0.8, 6.0),
    "incubation_period": (1.0, 21.0),
    "infectious_period": (3.0, 14.0),
    "mortality_rate": (0.0, 0.40),
    "asymptomatic_fraction": (0.0, 0.6),
    "vaccination_effectiveness": (0.0, 0.95),
    "population": (30_000, 30_000),
    "initial_infected": (1, 50),
    "hospital_capacity": (10, 50),
    "intervention_day": (0, 60),
    "mask_compliance": (0.0, 1.0),
    "vaccination_rate": (0.0, 1.0),
    "contact_reduction": (0.0, 0.9),
    "symptomatic_contact_multiplier": (0.0, 1.0),
}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Panacea API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    params: dict[str, float]

    @model_validator(mode="after")
    def check_params(self) -> "PredictRequest":
        missing = [c for c in INPUT_COLS if c not in self.params]
        if missing:
            raise ValueError(f"missing input parameters: {missing}")
        return self


class PredictResponse(BaseModel):
    summary: dict[str, float]
    trajectory: list[float]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/schema")
def get_schema() -> dict[str, Any]:
    return {
        "input_cols": INPUT_COLS,
        "output_cols": OUTPUT_COLS,
        "n_trajectory_days": N_TRAJECTORY_DAYS,
        "input_ranges": {k: list(v) for k, v in INPUT_RANGES.items()},
    }


handler = Mangum(app, lifespan="off")


@app.post("/api/predict", response_model=PredictResponse)
def predict(body: PredictRequest) -> PredictResponse:
    # TODO: replace with ONNX inference once model is ready
    #   from onnxruntime import InferenceSession
    #   sess = InferenceSession("checkpoints/run1/model.onnx")
    #   out = sess.run(None, {"input": np.array([[body.params[c] for c in INPUT_COLS]], dtype=np.float32)})
    raise HTTPException(status_code=503, detail="Model not yet deployed — training in progress.")


