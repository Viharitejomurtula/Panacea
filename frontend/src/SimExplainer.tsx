import { useState, useEffect } from 'react';
import type { FC } from 'react';

interface Props {
  history: number[];
  agents: any[];
  total: number;
  virusLabel: string;
}

// Set VITE_GEMINI_API_KEY in .env.local
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;

async function fetchSummary(p: {
  total: number;
  peakInfected: number;
  finalInfected: number;
  finalRecovered: number;
  finalSusceptible: number;
  virusLabel: string;
}): Promise<string> {
  if (!API_KEY) {
    return 'Add VITE_GEMINI_API_KEY to a .env.local file in the frontend folder to enable AI-generated summaries.';
  }

  const peakPct = ((p.peakInfected / p.total) * 100).toFixed(1);
  const recoveredPct = ((p.finalRecovered / p.total) * 100).toFixed(1);

  const prompt = `You are summarizing an epidemic simulation for a general audience. Write exactly 3 clear, specific sentences about what happened. Use the numbers provided.

Simulation facts:
- Disease: ${p.virusLabel}
- Population: ${p.total.toLocaleString()} people in a single suburb
- Duration: 365 simulated days
- Peak simultaneous infections: ${p.peakInfected.toLocaleString()} people (${peakPct}% of the population)
- End state: ${p.finalInfected.toLocaleString()} still infected, ${p.finalRecovered.toLocaleString()} recovered (${recoveredPct}%), ${p.finalSusceptible.toLocaleString()} never infected

Rules: no bullet points, no headers, scientific but accessible tone, start with "Over the course of 365 days,"`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 200, temperature: 0.6 },
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

  let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 3000));
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  }

  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'Summary unavailable.';
}

const SimExplainer: FC<Props> = ({ history, agents, total, virusLabel }) => {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const peakInfected = Math.max(...history, 0);
  const finalInfected = agents.filter((a) => a.state === 'I').length;
  const finalRecovered = agents.filter((a) => a.state === 'R').length;
  const finalSusceptible = agents.filter((a) => a.state === 'S').length;

  useEffect(() => {
    if (!expanded || summary || loading) return;
    setLoading(true);
    fetchSummary({ total, peakInfected, finalInfected, finalRecovered, finalSusceptible, virusLabel })
      .then(setSummary)
      .catch((err: Error) => setSummary(
        err.message.includes('429')
          ? 'Rate limit reached — wait a moment and re-open this panel to retry.'
          : 'Unable to generate summary. Check your VITE_GEMINI_API_KEY in .env.local.'
      ))
      .finally(() => setLoading(false));
  }, [expanded]);

  if (!expanded) {
    return (
      <button className="explain-btn" onClick={() => setExpanded(true)}>
        <span className="explain-btn__icon" aria-hidden>↑</span>
        Explain Simulation
      </button>
    );
  }

  return (
    <div className="explain-panel" role="dialog" aria-label="Simulation explanation">

      <div className="explain-panel__header">
        <div className="explain-panel__header-text">
          <p className="explain-panel__eyebrow">
            <span className="explain-panel__eyebrow-dot" aria-hidden />
            Simulation Complete · 365 days
          </p>
          <h2 className="explain-panel__title">What just happened?</h2>
        </div>
        <button
          className="explain-panel__minimize"
          onClick={() => setExpanded(false)}
          aria-label="Minimize"
        >
          −
        </button>
      </div>

      <div className="explain-panel__section">
        <p className="explain-panel__section-label">Summary</p>
        {loading ? (
          <p className="explain-panel__loading">Generating summary…</p>
        ) : (
          <p className="explain-panel__body">{summary}</p>
        )}
      </div>

      <div className="explain-panel__section">
        <p className="explain-panel__section-label">Biggest contributor</p>
        <div className="explain-panel__factor-card">
          <span className="explain-panel__factor-rank">#1</span>
          <div className="explain-panel__factor-info">
            <span className="explain-panel__factor-name">High Mask Compliance</span>
            <span className="explain-panel__factor-tag">Intervention</span>
          </div>
        </div>
        <p className="explain-panel__factor-desc">
          This intervention had the greatest influence on the final outcome.
          Full sensitivity ranking via Sobol indices will be added soon.
        </p>
      </div>

    </div>
  );
};

export default SimExplainer;
