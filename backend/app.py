"""FastAPI backend for the Panacea surrogate.

Endpoints:
  GET  /health            — server alive
  GET  /presets           — list disease preset names
  GET  /preset/{name}     — full disease params for a preset
  POST /predict           — 14 inputs → 6 summaries + 365-day trajectory
  POST /parse             — natural language → 14 input values (Gemini)
  POST /predict_nl        — natural language → predictions (parse + predict)

Serves a static test page from /static.

Run locally:
    pip install fastapi uvicorn google-genai
    uvicorn backend.app:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from abm_simulator.simulator import DISEASE_PRESETS
from surrogate.predict import Surrogate
from surrogate.schema import INPUT_COLS, INPUT_RANGES

# ── Surrogate (loaded once at startup) ────────────────────────────────────────

CHECKPOINT_DIR = Path(__file__).parent.parent / "checkpoints" / "run1"
SURROGATE = Surrogate.load(CHECKPOINT_DIR)

# ── Gemini client (optional — only needed for /parse and /predict_nl) ─────────

_gemini_client = None
def gemini():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")
        _gemini_client = genai.Client(api_key=key)
    return _gemini_client


# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Panacea API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    """14 input parameters. Use a `disease_preset` to fill the 6 disease fields."""
    disease_preset: Optional[str] = None
    # Disease (filled from preset if disease_preset is provided)
    r0: Optional[float] = None
    incubation_period: Optional[float] = None
    infectious_period: Optional[float] = None
    mortality_rate: Optional[float] = None
    asymptomatic_fraction: Optional[float] = None
    vaccination_effectiveness: Optional[float] = None
    # Community
    population: int = 30000
    initial_infected: int = 10
    hospital_capacity: int = 30
    # Sliders
    intervention_day: int = Field(30, ge=0, le=60)
    mask_compliance: float = Field(0.5, ge=0.0, le=1.0)
    vaccination_rate: float = Field(0.005, ge=0.0, le=1.0)
    contact_reduction: float = Field(0.4, ge=0.0, le=0.9)
    symptomatic_contact_multiplier: float = Field(0.3, ge=0.0, le=1.0)


class Summary(BaseModel):
    peak_cases: float
    peak_day: float
    total_cases: float
    total_deaths: float
    days_over_hospital_capacity: float
    attack_rate: float


class PredictResponse(BaseModel):
    summary: Summary
    trajectory: list[float]


class ParseRequest(BaseModel):
    prompt: str
    disease_preset: Optional[str] = "covid_wuhan"


# ── Helpers ───────────────────────────────────────────────────────────────────

def resolve_params(req: PredictRequest) -> dict:
    """Apply preset + defaults → full INPUT_COLS dict."""
    p = req.dict()
    if req.disease_preset:
        if req.disease_preset not in DISEASE_PRESETS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown preset '{req.disease_preset}'. "
                       f"Options: {list(DISEASE_PRESETS.keys())}",
            )
        preset = DISEASE_PRESETS[req.disease_preset]
        for f in ("r0", "incubation_period", "infectious_period",
                  "mortality_rate", "asymptomatic_fraction",
                  "vaccination_effectiveness"):
            p[f] = getattr(preset, f)
    p.pop("disease_preset", None)

    missing = [c for c in INPUT_COLS if p.get(c) is None]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing inputs: {missing}. Provide a disease_preset or fill them.",
        )
    return {c: p[c] for c in INPUT_COLS}


def clamp_to_ranges(params: dict) -> dict:
    """Clip every input to its INPUT_RANGES min/max."""
    out = dict(params)
    for k, v in params.items():
        if k in INPUT_RANGES:
            lo, hi = INPUT_RANGES[k]
            out[k] = max(lo, min(hi, v))
    return out


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "checkpoint": str(CHECKPOINT_DIR)}


@app.get("/presets")
def presets():
    return list(DISEASE_PRESETS.keys())


@app.get("/preset/{name}")
def preset(name: str):
    if name not in DISEASE_PRESETS:
        raise HTTPException(status_code=404, detail=f"Unknown preset '{name}'")
    p = DISEASE_PRESETS[name]
    return {
        "r0": p.r0,
        "incubation_period": p.incubation_period,
        "infectious_period": p.infectious_period,
        "mortality_rate": p.mortality_rate,
        "asymptomatic_fraction": p.asymptomatic_fraction,
        "vaccination_effectiveness": p.vaccination_effectiveness,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    params = clamp_to_ranges(resolve_params(req))
    out = SURROGATE.predict(params)
    summary = {k: max(0.0, float(v)) for k, v in out["summary"].items()}
    summary["attack_rate"] = max(0.0, min(1.0, summary["attack_rate"]))
    return {
        "summary": summary,
        "trajectory": out["trajectory"].tolist(),
    }


@app.post("/parse")
def parse_nl(req: ParseRequest):
    """Use Gemini to convert a natural-language scenario into slider values."""
    schema_hint = {
        "intervention_day": "int 0–60, day intervention starts (0 = immediate)",
        "mask_compliance": "float 0.0–1.0, fraction of people wearing masks",
        "vaccination_rate": "float 0.0–1.0, daily probability per agent",
        "contact_reduction": "float 0.0–0.9, fraction of normal contacts removed (lockdown)",
        "symptomatic_contact_multiplier": "float 0.0–1.0, how much symptomatic isolate (lower = more isolation)",
    }
    sys_prompt = (
        "Extract these 5 epidemic-response slider values from the user's prompt. "
        "Return ONLY a compact JSON object with these keys: "
        + ", ".join(schema_hint.keys())
        + ". Use these meanings: " + json.dumps(schema_hint)
        + ". If a value isn't mentioned, use a reasonable default (mask 0.5, vacc 0.005, "
          "contact 0.4, intervention day 30, sym mult 0.3)."
    )
    response = gemini().models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{sys_prompt}\n\nUser: {req.prompt}",
    )
    raw = response.text.strip()
    # Strip markdown code fences if Gemini added them
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON: {raw[:200]}")
    return parsed


@app.post("/predict_nl")
def predict_nl(req: ParseRequest):
    """Natural language → slider values → predictions, in one call."""
    sliders = parse_nl(req)
    return predict(PredictRequest(disease_preset=req.disease_preset, **sliders))


# ── Static test page (mounted last so / catches anything not above) ───────────

STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
