import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
// @ts-ignore — JS module, no types
import SimCanvas from "./components/SimCanvas.jsx";
// @ts-ignore
import { WORLD } from "./simulation/constant";
// @ts-ignore
import { initAgents } from "./simulation/initAgents";
// @ts-ignore
import { tickSimulation } from "./simulation/tickSimulation";
import InfectionGraph from "./InfectionGraph";
import "./App.css";
import {
  DEFAULT_USER_INTERVENTION,
  FIXED_SYMPTOMATIC_CONTACT_MULTIPLIER,
  INTERVENTION_SLIDERS,
  type SliderKey,
} from "./interventionSliders";
import { IntroVirusGraphic } from "./IntroVirusGraphic";
import { VIRUS_LANDING } from "./virusLanding";
import type { VirusId } from "./viruses";
import { VIRUS_OPTIONS } from "./viruses";

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

  const [agents, setAgents] = useState(() => initAgents(3000, WORLD));
  const agentsRef = useRef(agents);
  const rafRef = useRef<number | null>(null);
  const tickCountRef = useRef(0);
  const [history, setHistory] = useState<number[]>([12]);

  const tick = useCallback(() => {
    const pts = agentsRef.current;
    tickSimulation(pts, WORLD);
    agentsRef.current = [...pts];
    tickCountRef.current += 1;
    setAgents(agentsRef.current);
    if (tickCountRef.current % 8 === 0) {
      const infected = (agentsRef.current as any[]).filter((a) => a.state === 'I').length;
      setHistory((prev) => {
        const next = [...prev, infected];
        return next.length > 300 ? next.slice(-300) : next;
      });
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
              <button
                type="button"
                className="btn-reset-sliders"
                onClick={resetSliders}
              >
                Reset
              </button>
            </fieldset>
          </section>

          <section className="viz-panel">
            <SimCanvas
              agents={agents}
              diseaseColor={[248, 113, 113, 220]}
            />
            <InfectionGraph history={history} total={3000} />
            {!isRunning && (
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
        </main>
      </div>
    </div>
  );
}
