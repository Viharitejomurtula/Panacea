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
    sensitivityBlock = `

Most impactful choice: ${p.sobolContext.paramLabel} (this slider made the biggest difference to the final outcome). Mention it briefly and naturally in your explanation when describing what mattered most. Do not invent other rankings or use any technical terms.`;
  }

  const prompt = `You are explaining an epidemic simulation to someone with no scientific background. Use simple, everyday language a high-schooler could understand.

What happened in the simulation:
- Disease: ${p.virusLabel}
- Town size: ${p.total.toLocaleString()} people
- Time: about one year
- Worst day: ${p.peakInfected.toLocaleString()} people sick at the same time (${peakPct}% of the town)
- A year later: ${p.finalRecovered.toLocaleString()} had been sick and recovered (${recoveredPct}%), ${p.finalInfected.toLocaleString()} were still sick, and ${p.finalSusceptible.toLocaleString()} never caught it
${sensitivityBlock}

Write exactly 4 to 5 complete sentences total (no more, no less), as ONE single paragraph (no blank lines, no extra paragraphs).

What to cover in those 4-5 sentences:
- Sentence 1: How the outbreak began and started spreading.
- Sentence 2: When it peaked and what the peak looked like (use the actual peak number and percentage).
- Sentence 3: How it faded and the final state of the town (mention recovered count or percentage and how many never caught it).
- Sentence 4 (and optional 5): If a "most impactful choice" was provided, name it and briefly say why that one choice mattered most. If no choice was provided, end with one sentence inviting the reader to try the sliders.

Strict rules:
- Absolutely no technical terms. Banned words: "Sobol", "sensitivity", "variance", "index", "surrogate", "ST", "S1", "first-order", "total-order", "Monte Carlo", "uncertainty", "parameter", "metric", "compute", "model", "agent", "simulation".
- No bullet points, no headers, no markdown, no lists.
- Every sentence must be complete with proper punctuation. NEVER stop mid-thought.
- Friendly, conversational, hopeful but realistic.
- Start the answer with "Over the year,".
- Stay between 4 and 5 sentences total. Do not exceed 5. Do not write fewer than 4.`;

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      maxOutputTokens: 600,
      temperature: 0.55,
      // gemini-2.5-flash uses internal "thinking" tokens that count against
      // the budget; raising the cap and disabling thinking ensures the visible
      // answer isn't truncated.
      thinkingConfig: { thinkingBudget: 0 },
    } as any,
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
  const [narrating, setNarrating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setNarrating(false);
  };

  const narrate = async () => {
    if (!summary || loading) return;
    if (audioRef.current) {
      stopAudio();
      return;
    }
    setNarrating(true);
    try {
      const res = await fetch("/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
      if (!res.ok) {
        const msg = await res.text();
        console.error("narrate failed:", msg);
        setNarrating(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setNarrating(false);
      });
      audio.addEventListener("error", () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setNarrating(false);
      });
      await audio.play();
    } catch (e) {
      console.error("narrate error:", e);
      setNarrating(false);
    }
  };

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
      stopAudio();
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
        const msg = err?.message ?? String(err);
        console.error("[SimExplainer] Gemini error:", err);
        if (msg.includes("429")) {
          setSummary("Rate limit reached — wait a minute and open Explain again.");
        } else if (msg.includes("API_KEY") || msg.includes("API key")) {
          setSummary("API key missing or invalid. Check VITE_GEMINI_API_KEY in frontend/.env.local and restart Vite.");
        } else if (msg.includes("404") || msg.includes("not found")) {
          setSummary("Model not available on this account. Try a different Gemini model.");
        } else {
          setSummary(`Summary failed: ${msg.slice(0, 200)}`);
        }
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
                <div className="explain-panel__section-header">
                  <p className="explain-panel__section-label">AI summary</p>
                  <button
                    type="button"
                    className="explain-narrate-btn"
                    onClick={narrate}
                    disabled={loading || !summary}
                    aria-label={narrating ? "Stop narration" : "Narrate summary"}
                    title={narrating ? "Stop narration" : "Narrate summary"}
                  >
                    {narrating ? "⏹ Stop" : "🔊 Listen"}
                  </button>
                </div>
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
                  What made the biggest difference
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
                          The choice that shaped {sobolContext.outcomeLabel.toLowerCase()} the most
                        </span>
                      </div>
                    </div>
                    <p className="explain-panel__factor-desc">
                      Out of all the actions you can take, adjusting{" "}
                      <strong>{sobolContext.paramLabel.toLowerCase()}</strong>{" "}
                      had the biggest impact on{" "}
                      <strong>{sobolContext.outcomeLabel.toLowerCase()}</strong>.
                      Try sliding it to see how much it changes the outbreak.
                    </p>
                  </>
                ) : (
                  <p className="explain-panel__factor-desc">
                    The forecast is still running. Once it finishes, this section
                    will show which choice mattered most.
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
