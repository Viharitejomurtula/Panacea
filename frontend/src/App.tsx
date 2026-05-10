import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
// @ts-ignore — JS module, no types
import SimCanvas from "./components/SimCanvas.jsx";
// @ts-ignore
import { WORLD, TICKS_PER_DAY } from "./simulation/constant";
// @ts-ignore
import { initAgents } from "./simulation/initAgents";
// @ts-ignore
import { scriptedTick } from "./simulation/tickSimulation";
import InfectionGraph from "./InfectionGraph";
import SimExplainer, { type SobolExplainContext } from "./SimExplainer";
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

// Surrogate trains on a 30k population; the spatial sim shows 3k.
// Scale person-count metrics by 0.1 so forecast values match the visual sim.
const FORECAST_SCALE = 0.1;
const SCALED_SUMMARY_KEYS = new Set([
  "peak_cases",
  "total_cases",
  "total_deaths",
]);

function scaleMcResult(out: PredictMcResponse): PredictMcResponse {
  const mc = out.monte_carlo;
  const scaledSummary: typeof mc.summary_percentiles = {};
  for (const [key, v] of Object.entries(mc.summary_percentiles)) {
    if (SCALED_SUMMARY_KEYS.has(key)) {
      scaledSummary[key] = {
        p5: v.p5 * FORECAST_SCALE,
        p50: v.p50 * FORECAST_SCALE,
        p95: v.p95 * FORECAST_SCALE,
        mean: v.mean * FORECAST_SCALE,
      };
    } else {
      scaledSummary[key] = v;
    }
  }
  return {
    ...out,
    monte_carlo: {
      ...mc,
      summary_percentiles: scaledSummary,
      trajectory_percentiles: {
        p5: mc.trajectory_percentiles.p5.map((v) => v * FORECAST_SCALE),
        p50: mc.trajectory_percentiles.p50.map((v) => v * FORECAST_SCALE),
        p95: mc.trajectory_percentiles.p95.map((v) => v * FORECAST_SCALE),
      },
    },
  };
}

// Build a per-day schedule of cumulative target counts (I, R, D) for the
// playback layer. Inputs are already scaled to the spatial sim's 3k population.
//
// Cumulative cases at day t are estimated by integrating active infections
// weighted to end at total_cases (each day contributes proportionally to
// active infections that day — close enough for visualization).
function buildPlaybackSchedule(
  trajectory: number[],
  totalCases: number,
  totalDeaths: number,
): Array<{ I: number; R: number; D: number }> {
  const cumActive: number[] = [];
  let acc = 0;
  for (const v of trajectory) {
    acc += Math.max(0, v);
    cumActive.push(acc);
  }
  const totalActive = acc || 1;

  return trajectory.map((active, t) => {
    const fraction = cumActive[t] / totalActive;
    const cumCases = totalCases * fraction;
    const cumD = totalDeaths * fraction;
    const I = Math.max(0, active);
    const cumR = Math.max(0, cumCases - I - cumD);
    return { I, R: cumR, D: cumD };
  });
}

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
  intervention_day: "When intervention starts",
  mask_compliance: "Mask compliance",
  vaccination_rate: "Vaccination rate",
  contact_reduction: "Contact reduction (lockdown)",
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

  const runSimulation = useCallback(async () => {
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
      setPredictResult(scaleMcResult(out));
    } catch (e) {
      setPredictResult(null);
      setSimError(e instanceof Error ? e.message : String(e));
    } finally {
      setSimLoading(false);
    }
  }, [virus, intervention]);

  const [agents, setAgents] = useState(() => initAgents(3000, WORLD));
  const agentsRef = useRef(agents);
  const rafRef = useRef<number | null>(null);
  const tickCountRef = useRef(0);
  const interventionRef = useRef(intervention);
  useEffect(() => { interventionRef.current = intervention; }, [intervention]);
  const virusRef = useRef(virus);
  useEffect(() => { virusRef.current = virus; }, [virus]);
  const [history, setHistory] = useState<number[]>([12]);
  const [deathHistory, setDeathHistory] = useState<number[]>([0]);
  const [deaths, setDeaths] = useState(0);
  const [day, setDay] = useState(0);

  // Per-day schedule of cumulative target counts derived from MC result.
  // schedule[t] = {I, R, D} for day t in 3000-person scaled space.
  const playbackScheduleRef = useRef<Array<{ I: number; R: number; D: number }> | null>(null);
  // Recovery ticks (= virus infectious_period × TICKS_PER_DAY). Updated from MC.
  const recoveryTicksRef = useRef<number>(40);
  // Effective per-recovery mortality, derived as totalDeaths/totalCases from MC.
  // Each I agent rolls this when its recovery clock expires.
  const effMortalityRef = useRef<number>(0);

  // Per-virus infectious period (matches abm_simulator/simulator.py presets).
  const VIRUS_INFECTIOUS_DAYS: Record<string, number> = useMemo(() => ({
    covid_wuhan: 10,
    hantavirus_andes: 10,
    h1n1_swine_flu: 7,
    human_metapneumovirus: 8,
    influenza_a_h3n2: 6,
    spanish_flu: 7,
  }), []);

  // Whenever predictResult changes, build a per-day schedule for the playback layer.
  useEffect(() => {
    if (!predictResult) {
      playbackScheduleRef.current = null;
      return;
    }
    const mc = predictResult.monte_carlo;
    const traj = mc.trajectory_percentiles.p50;
    const totalCases = mc.summary_percentiles.total_cases?.p50 ?? 0;
    const totalDeaths = mc.summary_percentiles.total_deaths?.p50 ?? 0;
    playbackScheduleRef.current = buildPlaybackSchedule(traj, totalCases, totalDeaths);
    const days = VIRUS_INFECTIOUS_DAYS[virus] ?? 10;
    recoveryTicksRef.current = days * TICKS_PER_DAY;
    effMortalityRef.current = totalCases > 0 ? totalDeaths / totalCases : 0;
  }, [predictResult, virus, VIRUS_INFECTIOUS_DAYS]);

  const tick = useCallback(() => {
    const pts = agentsRef.current;
    const schedule = playbackScheduleRef.current;
    const recoveryTicks = recoveryTicksRef.current;
    const effMortality = effMortalityRef.current;
    const tgt = (tickCount: number) =>
      schedule
        ? schedule[Math.min(Math.floor(tickCount / TICKS_PER_DAY), schedule.length - 1)]
        : { I: 0, R: 0, D: 0 };
    scriptedTick(pts, WORLD, tgt(tickCountRef.current), recoveryTicks, effMortality);
    tickCountRef.current += 1;
    scriptedTick(pts, WORLD, tgt(tickCountRef.current), recoveryTicks, effMortality);
    agentsRef.current = [...pts];
    tickCountRef.current += 1;

    const currentDay = Math.floor(tickCountRef.current / TICKS_PER_DAY);

    setAgents(agentsRef.current);
    if (tickCountRef.current % 8 === 0) {
      const infected = (agentsRef.current as any[]).filter((a) => a.state === 'I').length;
      const dead = (agentsRef.current as any[]).filter((a) => a.state === 'D').length;
      setDay(currentDay);
      setDeaths(dead);
      setHistory((prev) => {
        const next = [...prev, infected];
        return next.length > 300 ? next.slice(-300) : next;
      });
      setDeathHistory((prev) => {
        const next = [...prev, dead];
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
  const [explainOpen, setExplainOpen] = useState(false);

  const rerunSpatialSimulation = useCallback(() => {
    const next = initAgents(3000, WORLD);
    agentsRef.current = next;
    setAgents(next);
    tickCountRef.current = 0;
    setHistory([12]);
    setDeathHistory([0]);
    setDeaths(0);
    setDay(0);
    setIsRunning(false);
    setExplainOpen(false);
    setPredictResult(null);
  }, []);

  const returnToLanding = useCallback(() => {
    setExplainOpen(false);
    setIntroPhase("visible");
  }, []);

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

  const sobolExplainContext = useMemo((): SobolExplainContext | null => {
    if (!sensitivity?.parameters?.length) return null;
    const top = sensitivity.parameters[0];
    return {
      paramKey: top.name,
      paramLabel: SOBOL_PARAM_LABELS[top.name] ?? top.name,
      ST: top.ST,
      S1: top.S1,
      outcomeLabel:
        SUMMARY_LABELS[sensitivity.output_metric] ?? sensitivity.output_metric,
    };
  }, [sensitivity]);

  const spatialSimComplete = day >= 365 && !isRunning;

  // MC forecast now runs before the spatial animation (driven by Start
  // Simulation), so the spatial sim plays back the surrogate's prediction.
  // No auto-rerun on completion needed.

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
        <header className="app-header">
          <h1>Panacea</h1>
          {introDone && (
            <button
              type="button"
              className="header-entry-btn"
              onClick={returnToLanding}
              aria-label="Back to landing page"
            >
              Entry page
            </button>
          )}
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
              <legend className="mc-legend">Forecast</legend>
              <p className="mc-blurb">
                {simLoading
                  ? "Running forecast…"
                  : predictResult
                    ? "Forecast ready — see results below."
                    : "Forecast runs automatically when the simulation finishes."}
              </p>
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
            <div className="viz-panel__map">
              <SimCanvas
                agents={agents}
                diseaseColor={[248, 113, 113, 220]}
              />
            </div>
            <div className="viz-panel__hud">
              <InfectionGraph
                history={history}
                deathHistory={deathHistory}
                deaths={deaths}
                total={3000}
                day={day}
              />
              {spatialSimComplete && (
                <>
                  <button
                    type="button"
                    className="sim-rerun-btn"
                    onClick={rerunSpatialSimulation}
                  >
                    Rerun simulation
                  </button>
                  <SimExplainer
                    open={explainOpen}
                    onOpen={() => setExplainOpen(true)}
                    onClose={() => setExplainOpen(false)}
                    history={history}
                    agents={agents}
                    total={3000}
                    virusLabel={
                      VIRUS_OPTIONS.find((v) => v.id === virus)?.label ?? virus
                    }
                    sobolContext={sobolExplainContext}
                  />
                </>
              )}
              {!isRunning && day === 0 && (
                <div className="sim-overlay">
                  <button
                    type="button"
                    className="sim-start-btn"
                    disabled={simLoading}
                    onClick={async () => {
                      // Always re-run Monte Carlo so the playback reflects the
                      // current virus + slider settings.
                      try {
                        await runSimulation();
                      } catch {
                        return;
                      }
                      setIsRunning(true);
                    }}
                  >
                    {simLoading ? "Running forecast…" : "Start Simulation"}
                  </button>
                  {simError && (
                    <p className="mc-error" role="alert" style={{ marginTop: 12 }}>{simError}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="forecast-panel panel panel--viz">
            <h2>Forecast &amp; sensitivity</h2>
            {!mcResult && !simError && (
              <div className="canvas-placeholder">
                Run <strong>surrogate (MC + Sobol)</strong> for percentiles &amp;
                sensitivity.
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
