# Panacea

[https://panacea-40a16.web.app](https://panacea-40a16.web.app/)

## Overview

Panacea is a **neural-surrogate epidemic scenario explorer**. It lets a user pick a disease preset and a set of intervention parameters (mask compliance, vaccination rate, contact reduction, intervention timing, etc.) and see a full 365-day outbreak trajectory — along with uncertainty bounds and which parameters matter most — in well under a second.

Under the hood, a full agent-based model (ABM) of an outbreak is expensive to run: simulating tens of thousands of individual agents over a year takes real compute time, which makes it impractical to explore "what if" scenarios interactively. Panacea solves this by running the expensive simulation offline across thousands of parameter combinations, then training a neural network to approximate ("surrogate") the simulator's output. At runtime, the app queries the trained surrogate instead of the simulator itself, which is roughly **300,000x faster** than the original ABM, making real-time, interactive scenario exploration possible.

Panacea was built in 24 hours at **HackDavis 2026**, where it won **Most Technically Challenging Project**.

## Target audience

Panacea is aimed at:

- **Public health students, researchers, and educators** who want an intuitive, interactive way to build intuition for how interventions (masking, vaccination, contact reduction, timing) affect outbreak trajectories, without needing to run or understand an ABM themselves.
- **Hackathon judges / technical reviewers** evaluating the project's methodology — the README's architecture section below is written for this audience specifically.
- **Developers extending or forking the project** who need to understand how the ABM, sampling, surrogate, uncertainty quantification, and frontend components fit together before modifying any one of them.

It is not intended as a production epidemiological forecasting tool — the underlying SEIRD model makes simplifying assumptions (see Limitations below) appropriate for rapid scenario comparison, not real-world policy decisions.

## Architecture

Panacea has two halves: an **offline training pipeline** (Python) that produces a trained surrogate model, and an **online serving stack** (FastAPI backend + React frontend) that lets users query it interactively.

```
┌─────────────────────────── OFFLINE (run once, ahead of time) ───────────────────────────┐
│                                                                                            │
│   Mesa SEIRD ABM  ──►  Latin Hypercube Sampling  ──►  5,000 labeled runs  ──►  PyTorch MLP │
│   (30K agents,          (scipy.stats.qmc, 14           (input params →        surrogate     │
│    365-day runs)         input parameters)              365-day trajectory)   (MAE 0.043)   │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                    trained weights saved
                                                ▼
┌─────────────────────────── ONLINE (serves live requests) ────────────────────────────────┐
│                                                                                            │
│   FastAPI backend (Railway)                              React frontend (Firebase)        │
│   ├─ loads trained surrogate at startup                  ├─ deck.gl + MapLibre visualization│
│   ├─ POST /predict → single trajectory (~0.1ms)          ├─ 6 built-in disease presets      │
│   ├─ Monte Carlo UQ (10K surrogate runs → CIs)            ├─ parameter sliders               │
│   ├─ Sobol sensitivity analysis (SALib)                  └─ calls backend over HTTPS/JSON    │
│   └─ decision-tree scenario discovery (interpretable                                        │
│      rules for "what combinations of parameters                                             │
│      lead to outcome X")                                                                     │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Agent-based model (ABM)

Built with **Mesa** (Python ABM framework). Simulates a **SEIRD** compartmental model — agents move through **S**usceptible → **E**xposed → **I**nfected → **R**ecovered/**D**eceased states — across a population of **30,000 agents** over **365 days**, driven by **14 input parameters** (e.g. transmission rate, incubation period, mask compliance, vaccination rate, contact reduction, intervention start day, disease-specific severity/mortality parameters).

This is the ground-truth simulator, but it's too slow to run on every user interaction — a single run takes on the order of seconds to minutes depending on parameters, which is unusable for a slider-driven UI.

### 2. Latin Hypercube Sampling (LHS)

To train a surrogate that generalizes across the parameter space, the ABM needs to be run many times at different parameter combinations. Rather than a grid search (which scales exponentially with the number of parameters) or pure random sampling (which clusters unevenly), Panacea uses **Latin Hypercube Sampling** via `scipy.stats.qmc` to generate **5,000 well-spread parameter combinations** across the 14-dimensional input space, then runs the ABM once per combination to produce 5,000 labeled (parameters → 365-day trajectory) training examples.

### 3. Neural surrogate (PyTorch MLP)

A **multilayer perceptron** is trained on the 5,000 LHS-generated (input parameters → trajectory) pairs to predict the full 365-day outbreak trajectory directly from the 14 input parameters, skipping agent-level simulation entirely.

- **Accuracy:** MAE of 0.043 against held-out ABM ground truth.
- **Speed:** ~0.1ms per inference, versus the ABM's much longer runtime — roughly a **300,000x speedup**.

This speedup is what makes the frontend's slider-based, real-time exploration possible: every parameter change can trigger a fresh surrogate inference cheaply enough to feel instant.

### 4. Uncertainty quantification (Monte Carlo)

Because the surrogate is an approximation, Panacea doesn't just report a single trajectory — it runs **10,000 surrogate inferences** (fast, since each one is ~0.1ms) with small perturbations to quantify a confidence interval around the predicted trajectory, so the frontend can show a plausible range rather than false precision.

### 5. Sensitivity analysis (Sobol)

Using **SALib**, Panacea runs **Sobol sensitivity analysis** over the surrogate to rank which of the 14 input parameters most influence outbreak outcomes for a given scenario. This answers "which lever matters most here?" rather than just "what happens if I pull this lever?"

### 6. Scenario discovery (decision trees)

A decision tree is fit over the surrogate's outputs to extract **interpretable rules** describing which combinations of parameters lead to particular outcome classes (e.g. "outbreak contained" vs. "outbreak escapes containment"), so the tool can surface human-readable takeaways rather than only raw numbers.

### 7. Backend (FastAPI, deployed on Railway)

The backend loads the trained surrogate at startup and exposes it over HTTP. It also runs the Monte Carlo UQ, Sobol analysis, and scenario discovery logic server-side (these are compute-heavier than a single surrogate call, so they stay off the client). It integrates with the Gemini and ElevenLabs APIs for supplementary narrative/voice features in the frontend experience.

> Note: the backend was originally deployed on Render but moved to Railway after Render's 512MB memory limit caused out-of-memory crashes during Monte Carlo/Sobol computation.

### 8. Frontend (React + deck.gl + MapLibre, deployed on Firebase)

The UI lives in **`frontend/`** — **Vite** + **React** + **TypeScript**. HTML entry: [`frontend/index.html`](frontend/index.html); React mounts on `#root` via [`frontend/src/main.tsx`](frontend/src/main.tsx). It uses **deck.gl** and **MapLibre** for the outbreak visualization layer, offers **6 built-in disease presets** (e.g. COVID-19, Influenza, Ebola, Measles, HIV/AIDS, Bubonic Plague), and exposes parameter sliders that call the backend and re-render as responses come back.

## API

The backend exposes a small JSON/HTTP API. Base URL is the Railway deployment (see deployment section).

### `POST /predict`

Runs the trained surrogate on a set of scenario parameters and returns a predicted outbreak trajectory.

**Request body** (`application/json`):

```json
{
  "disease_preset": "covid_wuhan",
  "intervention_day": 30,
  "mask_compliance": 0.5,
  "vaccination_rate": 0.005,
  "contact_reduction": 0.4,
  "symptomatic_contact_multiplier": 0.3
}
```

| Field | Type | Description |
|---|---|---|
| `disease_preset` | string | Selects baseline disease-specific parameters (one of the 6 built-in presets). |
| `intervention_day` | int | Day (0–365) at which interventions take effect. |
| `mask_compliance` | float (0–1) | Fraction of the population complying with masking. |
| `vaccination_rate` | float (0–1) | Daily/effective vaccination rate. |
| `contact_reduction` | float (0–1) | Overall reduction in contact rate. |
| `symptomatic_contact_multiplier` | float (0–1) | Contact-rate multiplier applied to symptomatic agents. |

**Response:** the predicted 365-day S/E/I/R/D trajectory (and, depending on the request, Monte Carlo confidence bounds).

### `GET /presets`

Returns the list of built-in disease presets and their baseline parameters, used to populate the frontend's preset selector.

### CORS

The backend enables CORS for the deployed frontend origin (and `localhost` during development) so the browser-based frontend can call it directly.

> Documentation gap: the exact shape of `/predict`'s full response payload (field names, confidence-interval structure) and any additional endpoints for Sobol/scenario-discovery results should be filled in directly from `backend/app.py` — this section reflects the endpoints and request shape confirmed during development, not an exhaustive OpenAPI spec. Consider running the backend locally and hitting `/docs` (FastAPI's auto-generated Swagger UI) to get the full, always-current schema.

## Component integration

1. **Offline (once, or whenever the model is retrained):** `Mesa ABM → LHS sampling script → training dataset → PyTorch training script → saved model weights.` These weights are what the backend loads at startup.
2. **Backend startup:** FastAPI app loads the saved surrogate weights into memory once, so each request only pays for a fast forward pass, not a fresh model load.
3. **Runtime request flow:** Frontend slider/preset change → `fetch()` POST to `/predict` → backend runs surrogate (+ optionally Monte Carlo/Sobol) → JSON response → frontend re-renders the deck.gl visualization and stat panels.
4. **Narrative/voice features:** backend calls out to Gemini and ElevenLabs APIs server-side (keeping API keys off the client) when those features are invoked.

## Limitations

- The SEIRD ABM makes simplifying epidemiological assumptions (homogeneous-ish mixing within the agent population, fixed disease-preset baselines) — it's built for fast, comparative scenario exploration, not calibrated real-world forecasting.
- The surrogate's accuracy (MAE 0.043) is bounded by the diversity of the 5,000 LHS training runs; parameter combinations far outside that sampled range may extrapolate poorly.

## Testing

Panacea has automated tests covering the ABM, LHS sampling, the surrogate model, and the backend API, plus a frontend test suite — **40 backend tests and 10 frontend tests, all passing.**

| Suite | What it covers | Command |
|---|---|---|
| `tests/test_abm_simulator.py` | Mesa SEIRD model: population conservation, monotonic R/D, reproducibility | `pytest tests/test_abm_simulator.py` |
| `tests/test_param_sampling.py` | LHS sample shape, bounds, stratified coverage | `pytest tests/test_param_sampling.py` |
| `tests/test_surrogate.py` | Model loading, output shape/validity, inference latency, and a **regression guard** pinned to the measured 0.043 MAE so future changes can't silently regress accuracy | `pytest tests/test_surrogate.py` |
| `backend/tests/test_api.py` | `/predict` and `/presets` endpoints: valid requests, validation errors, CORS, Monte Carlo/Sobol path | `pytest backend/tests/test_api.py` |
| `frontend/src/__tests__/` | Cost estimation and prediction-request logic | `cd frontend && npm run test` |

### Run everything

```bash
# Backend + ABM/surrogate/sampling tests
pip install -r requirements.txt -r requirements-dev.txt
pytest

# Frontend tests
cd frontend
npm install
npm run test
```

### Continuous integration

Both suites run automatically on every push and pull request via GitHub Actions (`.github/workflows/tests.yml`), which also lints the Python code with `ruff` and confirms the frontend still builds. This means a broken test blocks a PR from merging rather than surfacing after deploy.

### Known follow-ups

A few deprecation warnings surface during the run and are tracked for cleanup — none currently fail a test:
- `backend/app.py`: FastAPI's `@app.on_event("startup")` is deprecated in favor of `lifespan` handlers.
- `surrogate/sobol_analysis.py`: SALib's `saltelli_sample` is deprecated in favor of `SALib.sample.sobol`.

`torch.load` in `surrogate/predict.py` has already been pinned to `weights_only=True`, closing off the arbitrary-code-execution risk that comes with loading pickled checkpoints under the old default.

## Frontend (React)

The UI lives in **`frontend/`** — **Vite** + **React** + **TypeScript**. HTML entry: [`frontend/index.html`](frontend/index.html); React mounts on `#root` via [`frontend/src/main.tsx`](frontend/src/main.tsx).

### Run locally
```bash
cd frontend
npm install
npm run dev
```
Then open the URL Vite prints (usually **http://localhost:5173**).

### Production build
```bash
cd frontend
npm run build
```
Static files are written to **`frontend/dist/`** — serve with any static host or put behind nginx/caddy.
