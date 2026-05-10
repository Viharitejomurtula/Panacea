"""FastAPI app: surrogate inference, Monte Carlo, and Sobol sensitivity."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Literal

# Repo root on path when launched as `uvicorn api.main:app` from project root
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from surrogate.combined_run import run_mc_with_sobol, run_point_predict
from surrogate.monte_carlo import run_monte_carlo
from surrogate.predict import Surrogate
from surrogate.schema import OUTPUT_COLS

_DEFAULT_CKPT = _ROOT / "checkpoints" / "run1"
_SURROGATE_DIR = Path(os.environ.get("PANACEA_SURROGATE_DIR", _DEFAULT_CKPT))

app = FastAPI(title="Panacea API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_surrogate: Surrogate | None = None


def get_surrogate() -> Surrogate:
    global _surrogate
    if _surrogate is None:
        if not _SURROGATE_DIR.is_dir():
            raise RuntimeError(
                f"Surrogate checkpoint not found at {_SURROGATE_DIR}. "
                "Set PANACEA_SURROGATE_DIR or train a model into checkpoints/run1."
            )
        _surrogate = Surrogate.load(_SURROGATE_DIR)
    return _surrogate


@app.on_event("startup")
def startup_load_surrogate() -> None:
    try:
        get_surrogate()
    except Exception as e:
        print(f"[Panacea API] Surrogate not loaded at startup: {e}")


class InterventionBody(BaseModel):
    intervention_day: float = Field(ge=0, le=60)
    mask_compliance: float = Field(ge=0, le=1)
    vaccination_rate: float = Field(ge=0, le=1)
    contact_reduction: float = Field(ge=0, le=0.9)


class PredictRequest(BaseModel):
    virus_id: str
    intervention: InterventionBody
    distribution: Literal["point", "mc"] = "mc"
    n_runs: int = Field(default=10_000, ge=100, le=50_000)
    sobol_base_n: int = Field(default=512, ge=64, le=4096)
    sensitivity_output: str = Field(default="total_deaths")
    seed: int | None = None

    @field_validator("sensitivity_output")
    @classmethod
    def _output_metric(cls, v: str) -> str:
        if v not in OUTPUT_COLS:
            raise ValueError(
                f"sensitivity_output must be one of {OUTPUT_COLS}, got {v!r}"
            )
        return v


class MonteCarloRequest(BaseModel):
    virus_id: str
    intervention: InterventionBody
    n_runs: int = Field(default=10_000, ge=100, le=50_000)
    seed: int | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/predict")
def predict_endpoint(body: PredictRequest) -> dict:
    try:
        s = get_surrogate()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    intr = body.intervention.model_dump()

    try:
        if body.distribution == "point":
            return run_point_predict(s, body.virus_id, intr)

        return run_mc_with_sobol(
            s,
            body.virus_id,
            intr,
            body.n_runs,
            body.sobol_base_n,
            body.sensitivity_output,
            seed=body.seed,
        )
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.post("/api/monte-carlo")
def monte_carlo_endpoint(body: MonteCarloRequest) -> dict:
    try:
        s = get_surrogate()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    try:
        return run_monte_carlo(
            s,
            body.virus_id,
            body.intervention.model_dump(),
            body.n_runs,
            seed=body.seed,
        )
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
