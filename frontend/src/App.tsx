import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
// @ts-ignore — JS module, no types
import SimCanvas from "./components/SimCanvas.jsx";
// @ts-ignore
import { WORLD, TICKS_PER_DAY } from "./simulation/constant";
// @ts-ignore
import { initAgents } from "./simulation/initAgents";
// @ts-ignore
import { tickSimulation } from "./simulation/tickSimulation";
import InfectionGraph from "./InfectionGraph";
import SimExplainer from "./SimExplainer";
import "./App.css";
import {
  DEFAULT_USER_INTERVENTION,
  FIXED_SYMPTOMATIC_CONTACT_MULTIPLIER,
  INTERVENTION_SLIDERS,
  type SliderKey,
} from "./interventionSliders";
import { IntroVirusGraphic } from "./IntroVirusGraphic";
import {
  fetchPredict,
  type PredictMcResponse,
} from "./predict";
import { VIRUS_LANDING } from "./virusLanding";
import type { VirusId } from "./viruses";
import { VIRUS_OPTIONS } from "./viruses";

const MC_N_RUNS = 10_000;
const SOBOL_BASE_N = 512;

const SUMMARY_LABELS: Record<string, string> = {
  peak_cases: "Peak cases",
  peak_day: "Peak day",
  total_cases: "Total cases",
  total_deaths: "Total deaths",
  days_over_hospital_capacity: "Days over hospital capacity",
  attack_rate: "Attack rate",
};

function formatMetric(key: string, v: number): string {
  if (key === "peak_day" || key === "days_over_hospital_capacity") {
    return String(Math.round(v));
  }
  if (key === "attack_rate") {
    return v.toFixed(4);
  }
  if (key === "total_deaths" || key === "total_cases" || key === "peak_cases") {
    return Math.round(v).toLocaleString();
  }
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const SOBOL_PARAM_LABELS: Record<string, string> = {
  r0: "R₀",
  incubation_period: "Incubation (days)",
  infectious_period: "Infectious period (days)",
  mortality_rate: "Mortality rate",
  asymptomatic_fraction: "Asymptomatic fraction",
  vaccination_effectiveness: "Vaccine effectiveness",
};

function formatSobolIndex(v: number): string {
  return v.toFixed(4);
}

/**
 * Panacea UI shell — map, controls, and API wiring can be added incrementally.
 */
type IntroPhase = "visible" | "leaving" | "gone";

const INTRO_EXIT_MS = 520;

export default function App() {
  const [introPhase, setIntroPhase] = useState<IntroPhase>("visible");
  const [virus, setVirus] = useState<VirusId>("covid_wuhan");
  const [intervention, setIntervention] = useState(() => ({
    ...DEFAULT_USER_INTERVENTION,
  }));
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [predictResult, setPredictResult] = useState<PredictMcResponse | null>(
    null,
  );

  const runSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      const out = await fetchPredict(virus, intervention, {
        distribution: "mc",
        nRuns: MC_N_RUNS,
        sobolBaseN: SOBOL_BASE_N,
      });
      if (out.distribution !== "mc") {
        setPredictResult(null);
        setSimError("Expected Monte Carlo response");
        return;
      }
      setPredictResult(out);
    } catch (e) {
      setPredictResult(null);
      setSimError(e instanceof Error ? e.message : String(e));
    } finally {
      setSimLoading(false);
    }
  };

  const [agents, setAgents] = useState(() => initAgents(3000, WORLD));
  const agentsRef = useRef(agents);
  const rafRef = useRef<number | null>(null);
  const tickCountRef = useRef(0);
  const [history, setHistory] = useState<number[]>([12]);
  const [day, setDay] = useState(0);

  const tick = useCallback(() => {
    const pts = agentsRef.current;
    tickSimulation(pts, WORLD);
    tickSimulation(pts, WORLD);
    agentsRef.current = [...pts];
    tickCountRef.current += 2;

    const currentDay = Math.floor(tickCountRef.current / TICKS_PER_DAY);

    setAgents(agentsRef.current);
    if (tickCountRef.current % 8 === 0) {
      const infected = (agentsRef.current as any[]).filter((a) => a.state === 'I').length;
      setDay(currentDay);
      setHistory((prev) => {
        const next = [...prev, infected];
        return next.length > 300 ? next.slice(-300) : next;
      });
    }

    if (currentDay >= 365) {
      setDay(365);
      setIsRunning(false);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRunning, tick]);

  useEffect(() => {
    if (introPhase !== "leaving") return;
    const id = window.setTimeout(() => setIntroPhase("gone"), INTRO_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [introPhase]);

  useEffect(() => {
    if (introPhase !== "visible") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIntroPhase("leaving");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [introPhase]);

  const beginEnter = () => setIntroPhase("leaving");

  const setSlider = (key: SliderKey, value: number) => {
    setIntervention((prev) => ({ ...prev, [key]: value }));
  };

  const resetSliders = () =>
    setIntervention({ ...DEFAULT_USER_INTERVENTION });

  const introDone = introPhase === "gone";
  const landing = VIRUS_LANDING[virus];
  const mcResult = predictResult?.monte_carlo ?? null;
  const sensitivity = predictResult?.sensitivity ?? null;

  return (
    <div
      className={`app-root ${introDone ? "app-root--intro-done" : ""}`}
    >
      {introPhase !== "gone" && (
        <div
          className={`intro-overlay ${introPhase === "leaving" ? "intro-overlay--exit" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-hero-title"
          style={
            {
              "--intro-accent": landing.accent,
            } as CSSProperties
          }
        >
          <aside className="intro-sidebar" aria-label="Panacea">
            <div className="intro-brand">PANACEA</div>
            <nav className="intro-virus-nav" aria-label="Disease preset">
              {VIRUS_OPTIONS.map(({ id, label }) => {
                const m = VIRUS_LANDING[id];
                const selected = virus === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`intro-virus-btn ${selected ? "intro-virus-btn--active" : ""}`}
                    style={
                      selected
                        ? ({
                            "--virus-accent": m.accent,
                          } as CSSProperties)
                        : undefined
                    }
                    onClick={() => setVirus(id)}
                    aria-pressed={selected}
                    aria-label={label}
                  >
                    <span className="intro-virus-btn__glyph" aria-hidden />
                    <span className="intro-virus-btn__label">{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="intro-main">
            <div className="intro-main-inner">
              <div className="intro-copy" key={virus}>
                <p className="intro-category">
                  <span className="intro-category__dot" aria-hidden />
                  {landing.category}
                </p>
                <h1 id="intro-hero-title" className="intro-hero-title">
                  {landing.heroTitle}
                </h1>
                <p className="intro-scientific">{landing.scientificName}</p>
                <p className="intro-description">{landing.description}</p>
                <dl className="intro-stats">
                  <div className="intro-stats__row">
                    <dt>Basic R₀</dt>
                    <dd>
                      <strong>{landing.r0Label}</strong>
                    </dd>
                  </div>
                  <div className="intro-stats__row">
                    <dt>Infection fatality</dt>
                    <dd>{landing.fatalityLabel}</dd>
                  </div>
                  <div className="intro-stats__row">
                    <dt>Transmission</dt>
                    <dd>{landing.transmission}</dd>
                  </div>
                </dl>
              </div>
              <div className="intro-visual">
                <IntroVirusGraphic
                  accent={landing.accent}
                  variant={
                    virus === "covid_wuhan"
                      ? "corona"
                      : virus === "hantavirus_andes"
                        ? "hantavirus"
                        : virus === "human_metapneumovirus"
                          ? "hmpv"
                          : virus === "h1n1_swine_flu"
                            ? "h1n1"
                            : virus === "influenza_a_h3n2"
                              ? "h3n2"
                              : "sphere"
                  }
                />
              </div>
            </div>
          </div>

          <footer className="intro-footer">
            <button
              type="button"
              className="intro-simulation-cta"
              onClick={beginEnter}
            >
              <span className="intro-simulation-cta__label">Simulation</span>
              <span className="intro-simulation-cta__circle" aria-hidden>
                <span className="intro-simulation-cta__arrow">↓</span>
              </span>
            </button>
            <p className="intro-hint">Enter workspace · Esc to skip</p>
          </footer>
        </div>
      )}

      <div className="app-shell">
        <header>
          <h1>Panacea</h1>
        </header>

        <main>
          <section className="controls-panel">
            <p className="panel-heading">Controls</p>

            <fieldset className="virus-fieldset">
              <legend className="virus-legend">Virus</legend>
              <div className="virus-grid" role="radiogroup" aria-label="Disease preset">
                {VIRUS_OPTIONS.map(({ id, label }) => (
                  <label
                    key={id}
                    className={`virus-option ${virus === id ? "virus-option--selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="virus"
                      value={id}
                      checked={virus === id}
                      onChange={() => setVirus(id)}
                    />
                    <span className="virus-option-label">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="slider-fieldset">
              <legend className="slider-legend">Interventions</legend>
              <div className="slider-stack">
                {INTERVENTION_SLIDERS.map(
                  ({ key, label, min, max, step, format }) => (
                    <div key={key} className="slider-row">
                      <div className="slider-row-header">
                        <span className="slider-label">{label}</span>
                        <span className="slider-value">
                          {format(intervention[key])}
                        </span>
                      </div>
                      <input
                        type="range"
                        className="slider-input"
                        min={min}
                        max={max}
                        step={step}
                        value={intervention[key]}
                        onChange={(e) =>
                          setSlider(key, Number(e.target.value))
                        }
                        aria-valuemin={min}
                        aria-valuemax={max}
                        aria-valuenow={intervention[key]}
                      />
                    </div>
                  ),
                )}
              </div>
              <p className="slider-fixed-param">
                Symptomatic contact mult. fixed at{" "}
                <strong>{FIXED_SYMPTOMATIC_CONTACT_MULTIPLIER.toFixed(2)}</strong>{" "}
                (model default — not adjustable).
              </p>
              <button
                type="button"
                className="btn-reset-sliders"
                onClick={resetSliders}
              >
                Reset
              </button>
            </fieldset>

            <fieldset className="mc-fieldset">
              <legend className="mc-legend">Surrogate forecast</legend>
              <p className="mc-blurb">
                <strong>POST /api/predict</strong> with{" "}
                <code className="mc-code">distribution: &quot;mc&quot;</code> runs
                Monte Carlo ({MC_N_RUNS.toLocaleString()} surrogate forwards) and
                Sobol sensitivity (Saltelli base {SOBOL_BASE_N}). Uncertainty:
                incubation & mortality bands per virus, ±1 day infectious period,
                ±0.0005 asymptomatic & vaccine effectiveness, ±0.2 R₀. Start the
                API:{" "}
                <code className="mc-code">
                  uvicorn api.main:app --reload
                </code>
              </p>
              <button
                type="button"
                className="btn-monte-carlo"
                disabled={simLoading}
                onClick={runSimulation}
              >
                {simLoading
                  ? "Running…"
                  : `Run surrogate (MC + Sobol)`}
              </button>
              {simError && (
                <p className="mc-error" role="alert">
                  {simError}
                </p>
              )}
            </fieldset>

            <p className="controls-hint">
              Preset: <code>{virus}</code> · Surrogate inputs match{" "}
              <code>surrogate/schema.py</code>.
            </p>
          </section>

          <section className="viz-panel">
            <SimCanvas
              agents={agents}
              diseaseColor={[248, 113, 113, 220]}
            />
            <InfectionGraph history={history} total={3000} day={day} />
            {day >= 365 && (
              <SimExplainer
                history={history}
                agents={agents}
                total={3000}
                virusLabel={VIRUS_OPTIONS.find((v) => v.id === virus)?.label ?? virus}
              />
            )}
            {!isRunning && day === 0 && (
              <div className="sim-overlay">
                <button
                  type="button"
                  className="sim-start-btn"
                  onClick={() => setIsRunning(true)}
                >
                  Start Simulation
                </button>
              </div>
            )}
          </section>

          <section className="forecast-panel panel panel--viz">
            <h2>Forecast &amp; sensitivity</h2>
            {!mcResult && !simError && (
              <div className="canvas-placeholder">
                Run surrogate forecast to see Monte Carlo percentiles (p5 / p50 /
                p95) and Sobol indices for uncertain disease parameters.
              </div>
            )}
            {mcResult && (
              <div className="mc-results">
                <h3 className="mc-subheading">Monte Carlo distribution</h3>
                <p className="mc-results-meta">
                  <strong>{mcResult.n_runs.toLocaleString()}</strong> samples ·{" "}
                  <code>{mcResult.virus_id}</code>
                </p>
                <div className="mc-table-wrap">
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>p5</th>
                        <th>p50</th>
                        <th>p95</th>
                        <th>Mean</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(mcResult.summary_percentiles).map(
                        ([key, v]) => (
                          <tr key={key}>
                            <td>{SUMMARY_LABELS[key] ?? key}</td>
                            <td>{formatMetric(key, v.p5)}</td>
                            <td>{formatMetric(key, v.p50)}</td>
                            <td>{formatMetric(key, v.p95)}</td>
                            <td>{formatMetric(key, v.mean)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mc-trajectory-note">
                  Infected trajectory: {mcResult.trajectory_days} days × p5/p50/p95
                  returned for charting (console / plot hookup next).
                </p>

                {sensitivity && (
                  <div className="sobol-block">
                    <h3 className="mc-subheading">Sobol sensitivity</h3>
                    <p className="mc-results-meta">
                      Outcome:{" "}
                      <strong>
                        {SUMMARY_LABELS[sensitivity.output_metric] ??
                          sensitivity.output_metric}
                      </strong>
                      · Saltelli base <strong>{sensitivity.saltelli_base_n}</strong>{" "}
                      · <strong>{sensitivity.n_model_evals.toLocaleString()}</strong>{" "}
                      model evaluations
                    </p>
                    <div className="mc-table-wrap">
                      <table className="mc-table mc-table--sobol">
                        <thead>
                          <tr>
                            <th>Parameter</th>
                            <th>S1 (first-order)</th>
                            <th>ST (total)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sensitivity.parameters.map((row) => (
                            <tr key={row.name}>
                              <td>
                                {SOBOL_PARAM_LABELS[row.name] ?? row.name}
                              </td>
                              <td>
                                {formatSobolIndex(row.S1)}{" "}
                                <span className="sobol-conf">
                                  ± {formatSobolIndex(row.S1_conf)}
                                </span>
                              </td>
                              <td>
                                {formatSobolIndex(row.ST)}{" "}
                                <span className="sobol-conf">
                                  ± {formatSobolIndex(row.ST_conf)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
