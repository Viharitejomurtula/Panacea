import { useState } from 'react';
import type { FC } from 'react';

const SimExplainer: FC = () => {
  const [expanded, setExpanded] = useState(false);

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
        <p className="explain-panel__body">
          Over the 365-day simulation period, the pathogen spread through the population
          following a classic epidemic curve — slow initial growth, rapid acceleration
          as infectious contacts compounded, a sharp peak, then gradual decline as the
          susceptible pool was depleted through recovery and acquired immunity. A full
          AI-generated narrative will appear here via the Gemini API.
        </p>
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
