import { useEffect, useRef, useState } from "react";
import type { FC } from "react";
import { createPortal } from "react-dom";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type SobolExplainContext = {
  paramKey: string;
  paramLabel: string;
  ST: number;
  S1: number;
  outcomeLabel: string;
};

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  history: number[];
  agents: any[];
  total: number;
  virusLabel: string;
  /** Top parameter from Sobol (already sorted by |ST|). Null if surrogate not run. */
  sobolContext: SobolExplainContext | null;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

function formatIdx(v: number): string {
  return v.toFixed(4);
}

async function fetchGeminiSummary(p: {
  total: number;
  peakInfected: number;
  finalInfected: number;
  finalRecovered: number;
  finalSusceptible: number;
  virusLabel: string;
  sobolContext: SobolExplainContext | null;
}): Promise<string> {
  if (!API_KEY) {
    return "Add VITE_GEMINI_API_KEY to frontend/.env.local to enable AI-generated summaries.";
  }

  const peakPct = ((p.peakInfected / p.total) * 100).toFixed(1);
  const recoveredPct = ((p.finalRecovered / p.total) * 100).toFixed(1);

  let sensitivityBlock = "";
  if (p.sobolContext) {
    const c = p.sobolContext;
    sensitivityBlock = `

Global sensitivity (Sobol analysis on the neural surrogate, same disease preset):
- Outcome metric: ${c.outcomeLabel}
- Strongest driver of variance among uncertain disease parameters: ${c.paramLabel} (total-order index ST ≈ ${formatIdx(c.ST)}, first-order S1 ≈ ${formatIdx(c.S1)})
Briefly mention this driver in your answer where it helps interpret scale or uncertainty — do not invent other rankings.`;
  }

  const prompt = `You are summarizing an epidemic simulation for a general audience.

Simulation facts:
- Disease: ${p.virusLabel}
- Population: ${p.total.toLocaleString()} agents in a single suburb
- Duration: 365 simulated days
- Peak simultaneous infections: ${p.peakInfected.toLocaleString()} (${peakPct}% of the population)
- End state: ${p.finalInfected.toLocaleString()} still infected, ${p.finalRecovered.toLocaleString()} recovered (${recoveredPct}%), ${p.finalSusceptible.toLocaleString()} never infected
${sensitivityBlock}

Write exactly 3 short paragraphs separated by blank lines:
(1) What happened over the year in plain language.
(2) What the peak and final counts imply.
(3) If sensitivity data was provided, one paragraph on the most impactful uncertain parameter and how it relates to epidemic severity; if no sensitivity block was provided, instead ask the user to run the surrogate forecast to see Sobol rankings — one sentence only.

Rules: no bullet points, no markdown headers, scientific but accessible tone. Start the first paragraph with "Over the course of 365 days,".`;

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: 400, temperature: 0.55 },
  });
  const result = await model.generateContent(prompt);
  return result.response.text().trim() || "Summary unavailable.";
}

const SimExplainer: FC<Props> = ({
  open,
  onOpen,
  onClose,
  history,
  agents,
  total,
  virusLabel,
  sobolContext,
}) => {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const peakInfected = Math.max(...history, 0);
  const finalInfected = agents.filter((a) => a.state === "I").length;
  const finalRecovered = agents.filter((a) => a.state === "R").length;
  const finalSusceptible = agents.filter((a) => a.state === "S").length;

  const snapshotRef = useRef({
    total,
    peakInfected,
    finalInfected,
    finalRecovered,
    finalSusceptible,
    virusLabel,
    sobolContext,
  });
  snapshotRef.current = {
    total,
    peakInfected,
    finalInfected,
    finalRecovered,
    finalSusceptible,
    virusLabel,
    sobolContext,
  };

  useEffect(() => {
    if (!open) {
      setSummary("");
      return;
    }
    let alive = true;
    setLoading(true);
    fetchGeminiSummary(snapshotRef.current)
      .then((t) => {
        if (alive) setSummary(t);
      })
      .catch((err: Error) => {
        if (!alive) return;
        setSummary(
          err.message.includes("429")
            ? "Rate limit reached — wait a minute and open Explain again."
            : "Unable to generate summary. Check VITE_GEMINI_API_KEY in .env.local.",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        className="explain-btn"
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <span className="explain-btn__icon" aria-hidden>
          ✦
        </span>
        Explain simulation
      </button>

      {open &&
        createPortal(
          <div
            className="explain-modal-root"
            role="presentation"
            aria-hidden={!open}
          >
            <button
              type="button"
              className="explain-modal-backdrop"
              aria-label="Close explanation"
              onClick={onClose}
            />
            <div
              className="explain-modal-card explain-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="explain-modal-title"
            >
              <div className="explain-panel__header">
                <div className="explain-panel__header-text">
                  <p className="explain-panel__eyebrow">
                    <span className="explain-panel__eyebrow-dot" aria-hidden />
                    Simulation complete · 365 days
                  </p>
                  <h2 id="explain-modal-title" className="explain-panel__title">
                    What happened?
                  </h2>
                </div>
                <button
                  type="button"
                  className="explain-panel__minimize"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="explain-panel__section">
                <p className="explain-panel__section-label">AI summary (Gemini)</p>
                {loading ? (
                  <p className="explain-panel__loading">Generating summary…</p>
                ) : (
                  <div className="explain-panel__body explain-panel__body--paragraphs">
                    {summary.split(/\n\n+/).map((para, i) => (
                      <p key={i} className="explain-panel__para">
                        {para.trim()}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="explain-panel__section">
                <p className="explain-panel__section-label">
                  Most impactful factor (Sobol)
                </p>
                {sobolContext ? (
                  <>
                    <div className="explain-panel__factor-card">
                      <span className="explain-panel__factor-rank">#1</span>
                      <div className="explain-panel__factor-info">
                        <span className="explain-panel__factor-name">
                          {sobolContext.paramLabel}
                        </span>
                        <span className="explain-panel__factor-tag">
                          Total-order ST {formatIdx(sobolContext.ST)} · S1{" "}
                          {formatIdx(sobolContext.S1)} · for{" "}
                          {sobolContext.outcomeLabel}
                        </span>
                      </div>
                    </div>
                    <p className="explain-panel__factor-desc">
                      Among uncertain disease parameters in the surrogate model,
                      this input explains the largest share of variance in{" "}
                      <strong>{sobolContext.outcomeLabel}</strong> (global
                      sensitivity analysis).
                    </p>
                  </>
                ) : (
                  <p className="explain-panel__factor-desc">
                    Run <strong>surrogate (MC + Sobol)</strong> in the controls
                    panel to compute Sobol indices; then open this explanation
                    again to see the ranked driver for the surrogate outcome.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default SimExplainer;
