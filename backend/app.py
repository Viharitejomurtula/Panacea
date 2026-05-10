"""Panacea API — combined surrogate inference, Monte Carlo, Sobol, NL parsing, chat, and narration.

Endpoints:
  GET  /health              — server alive
  GET  /presets             — list disease preset names
  GET  /preset/{name}       — disease params for a preset
  POST /predict             — 14 inputs (or disease_preset) → summary + 365-day trajectory
  POST /parse               — NL prompt → slider values via Gemini
  POST /predict_nl          — NL → predictions in one call
  POST /api/predict         — virus_id + 4 sliders → point or MC+Sobol (used by frontend)
  POST /api/monte-carlo     — virus_id + 4 sliders → MC distribution
  POST /chat                — conversational Q&A grounded in simulation context
  POST /narrate             — text → MP3 audio via ElevenLabs

Run:
    uvicorn backend.app:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Literal, Optional

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Auto-load API keys from .env.local at the project root
try:
    from dotenv import load_dotenv
    load_dotenv(_ROOT / ".env.local")
    load_dotenv(_ROOT / ".env")
except ImportError:
    pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from abm_simulator.simulator import DISEASE_PRESETS
from surrogate.combined_run import run_mc_with_sobol, run_point_predict
from surrogate.monte_carlo import run_monte_carlo
from surrogate.predict import Surrogate
from surrogate.schema import INPUT_COLS, INPUT_RANGES, OUTPUT_COLS

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Panacea API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Surrogate (lazy-loaded, cached) ───────────────────────────────────────────

_DEFAULT_CKPT = _ROOT / "checkpoints" / "run1"
_SURROGATE_DIR = Path(os.environ.get("PANACEA_SURROGATE_DIR", _DEFAULT_CKPT))
_surrogate: Surrogate | None = None


def get_surrogate() -> Surrogate:
    global _surrogate
    if _surrogate is None:
        if not _SURROGATE_DIR.is_dir():
            raise RuntimeError(
                f"Surrogate checkpoint not found at {_SURROGATE_DIR}. "
                "Train a model into checkpoints/run1 first."
            )
        _surrogate = Surrogate.load(_SURROGATE_DIR)
    return _surrogate


@app.on_event("startup")
def _startup() -> None:
    try:
        get_surrogate()
        print(f"[Panacea] Surrogate loaded from {_SURROGATE_DIR}")
    except Exception as e:
        print(f"[Panacea] Surrogate not loaded at startup: {e}")


# ── Gemini client (lazy, only needed for /parse and /predict_nl) ──────────────

_gemini_client = None


def _gemini():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")
        _gemini_client = genai.Client(api_key=key)
    return _gemini_client


# ── Pydantic models ───────────────────────────────────────────────────────────

class InterventionBody(BaseModel):
    intervention_day: float = Field(ge=0, le=60)
    mask_compliance: float = Field(ge=0, le=1)
    vaccination_rate: float = Field(ge=0, le=1)
    contact_reduction: float = Field(ge=0, le=0.9)


class PredictRequest(BaseModel):
    """Full 14-input point prediction. Provide disease_preset to fill disease fields."""
    disease_preset: Optional[str] = None
    r0: Optional[float] = None
    incubation_period: Optional[float] = None
    infectious_period: Optional[float] = None
    mortality_rate: Optional[float] = None
    asymptomatic_fraction: Optional[float] = None
    vaccination_effectiveness: Optional[float] = None
    population: int = 30_000
    initial_infected: int = 10
    hospital_capacity: int = 50
    intervention_day: int = Field(30, ge=0, le=60)
    mask_compliance: float = Field(0.5, ge=0.0, le=1.0)
    vaccination_rate: float = Field(0.005, ge=0.0, le=1.0)
    contact_reduction: float = Field(0.4, ge=0.0, le=0.9)
    symptomatic_contact_multiplier: float = Field(0.3, ge=0.0, le=1.0)


class ApiPredictRequest(BaseModel):
    """Virus preset + 4 sliders → point or MC+Sobol (matches frontend predict.ts)."""
    virus_id: str
    intervention: InterventionBody
    distribution: Literal["point", "mc"] = "mc"
    n_runs: int = Field(default=10_000, ge=100, le=50_000)
    sobol_base_n: int = Field(default=512, ge=64, le=4096)
    sensitivity_output: str = Field(default="total_deaths")
    seed: Optional[int] = None

    @field_validator("sensitivity_output")
    @classmethod
    def _valid_output(cls, v: str) -> str:
        if v not in OUTPUT_COLS:
            raise ValueError(f"sensitivity_output must be one of {OUTPUT_COLS}")
        return v


class MonteCarloRequest(BaseModel):
    virus_id: str
    intervention: InterventionBody
    n_runs: int = Field(default=10_000, ge=100, le=50_000)
    seed: Optional[int] = None


class ParseRequest(BaseModel):
    prompt: str
    disease_preset: Optional[str] = "covid_wuhan"


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    context: Optional[dict] = None


class NarrateRequest(BaseModel):
    text: str
    voice_id: str = "JBFqnCBsd6RMkjVDRZzb"  # ElevenLabs "George" default


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_params(req: PredictRequest) -> dict:
    p = req.model_dump()
    if req.disease_preset:
        if req.disease_preset not in DISEASE_PRESETS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown preset '{req.disease_preset}'. Options: {list(DISEASE_PRESETS)}",
            )
        preset = DISEASE_PRESETS[req.disease_preset]
        for f in ("r0", "incubation_period", "infectious_period",
                  "mortality_rate", "asymptomatic_fraction", "vaccination_effectiveness"):
            p[f] = getattr(preset, f)
    p.pop("disease_preset", None)
    missing = [c for c in INPUT_COLS if p.get(c) is None]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing inputs: {missing}")
    return {c: p[c] for c in INPUT_COLS}


def _clamp(params: dict) -> dict:
    out = dict(params)
    for k in list(out):
        if k in INPUT_RANGES:
            lo, hi = INPUT_RANGES[k]
            out[k] = max(lo, min(hi, out[k]))
    return out


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "checkpoint": str(_SURROGATE_DIR)}


@app.get("/presets")
def presets() -> list[str]:
    return list(DISEASE_PRESETS.keys())


@app.get("/preset/{name}")
def preset(name: str) -> dict:
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


@app.post("/predict")
def predict(req: PredictRequest) -> dict:
    try:
        s = get_surrogate()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    params = _clamp(_resolve_params(req))
    out = s.predict(params)
    summary = {k: max(0.0, float(v)) for k, v in out["summary"].items()}
    summary["attack_rate"] = max(0.0, min(1.0, summary["attack_rate"]))
    return {"summary": summary, "trajectory": out["trajectory"].tolist()}


@app.post("/parse")
def parse_nl(req: ParseRequest) -> dict:
    schema_hint = {
        "intervention_day": "int 0–60, day intervention starts (0 = immediate)",
        "mask_compliance": "float 0.0–1.0, fraction of people wearing masks",
        "vaccination_rate": "float 0.0–1.0, daily vaccination probability per agent",
        "contact_reduction": "float 0.0–0.9, fraction of normal contacts removed (lockdown)",
        "symptomatic_contact_multiplier": "float 0.0–1.0, how much symptomatic people isolate (lower = more isolation)",
    }
    sys_prompt = (
        "Extract these 5 epidemic-response slider values from the user's prompt. "
        "Return ONLY a compact JSON object with these keys: "
        + ", ".join(schema_hint.keys())
        + ". Use these meanings: " + json.dumps(schema_hint)
        + ". Defaults if not mentioned: mask 0.5, vacc 0.005, contact 0.4, "
          "intervention_day 30, symptomatic_contact_multiplier 0.3."
    )
    response = _gemini().models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{sys_prompt}\n\nUser: {req.prompt}",
    )
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").lstrip("json").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON: {raw[:200]}")


@app.post("/predict_nl")
def predict_nl(req: ParseRequest) -> dict:
    sliders = parse_nl(req)
    return predict(PredictRequest(disease_preset=req.disease_preset, **sliders))


# ── Advanced: MC + Sobol (matches frontend predict.ts) ───────────────────────

@app.post("/api/predict")
def api_predict(body: ApiPredictRequest) -> dict:
    try:
        s = get_surrogate()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    intr = body.intervention.model_dump()
    try:
        if body.distribution == "point":
            return run_point_predict(s, body.virus_id, intr)
        return run_mc_with_sobol(
            s, body.virus_id, intr,
            body.n_runs, body.sobol_base_n, body.sensitivity_output,
            seed=body.seed,
        )
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@app.post("/api/monte-carlo")
def api_monte_carlo(body: MonteCarloRequest) -> dict:
    try:
        s = get_surrogate()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    try:
        return run_monte_carlo(
            s, body.virus_id, body.intervention.model_dump(),
            body.n_runs, seed=body.seed,
        )
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ── Chat & narration ──────────────────────────────────────────────────────────

@app.post("/chat")
def chat(req: ChatRequest) -> dict:
    system = (
        "You are an epidemiology assistant for the Panacea simulator. "
        "The user runs disease simulations and asks questions about them. "
        "Be concise (2-4 sentences). Use the simulation context below if relevant. "
        "If they ask about specific numbers, refer to the context. "
        "Don't make up numbers that aren't in the context."
    )
    parts = [system]
    if req.context:
        parts.append("Current simulation:\n" + json.dumps(req.context, indent=2))
    for m in req.history[-8:]:
        parts.append(f"{m.role.capitalize()}: {m.content}")
    parts.append(f"User: {req.message}\nAssistant:")
    response = _gemini().models.generate_content(
        model="gemini-2.5-flash",
        contents="\n\n".join(parts),
    )
    return {"reply": response.text.strip()}


@app.post("/narrate")
def narrate(req: NarrateRequest) -> Response:
    from elevenlabs.client import ElevenLabs
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="ELEVENLABS_API_KEY not set")
    client = ElevenLabs(api_key=key)
    audio_iter = client.text_to_speech.convert(
        text=req.text[:1000],
        voice_id=req.voice_id,
        model_id="eleven_turbo_v2_5",
        output_format="mp3_44100_128",
    )
    audio_bytes = b"".join(audio_iter)
    return Response(content=audio_bytes, media_type="audio/mpeg")


# ── Static test page ──────────────────────────────────────────────────────────

_STATIC = Path(__file__).parent / "static"
if _STATIC.is_dir():
    app.mount("/", StaticFiles(directory=_STATIC, html=True), name="static")
