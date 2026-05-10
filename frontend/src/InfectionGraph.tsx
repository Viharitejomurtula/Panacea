import { useEffect, useState } from 'react';
import type { FC } from 'react';

interface Props {
  history: number[];
  deathHistory?: number[];
  deaths?: number;
  total: number;
  day: number;
}

const GW = 216;
const GH = 70;

// History is sampled every 8 ticks at 4 ticks/day, i.e. one entry per ~2 days.
// Convert a history index to its corresponding simulation day for display.
const TICKS_BETWEEN_SAMPLES = 8;
const TICKS_PER_DAY = 4;
const DAYS_PER_SAMPLE = TICKS_BETWEEN_SAMPLES / TICKS_PER_DAY;

const InfectionGraph: FC<Props> = ({
  history,
  deathHistory,
  total,
  day,
}) => {
  // Selected index for the slider. Defaults to the latest sample, and follows
  // the live simulation as new samples arrive — until the user manually scrubs.
  const [selectedIdx, setSelectedIdx] = useState(history.length - 1);
  const [userScrubbed, setUserScrubbed] = useState(false);

  useEffect(() => {
    if (!userScrubbed) {
      setSelectedIdx(history.length - 1);
    } else if (selectedIdx > history.length - 1) {
      setSelectedIdx(history.length - 1);
    }
  }, [history.length, userScrubbed, selectedIdx]);

  if (history.length < 2) return null;

  const peak = Math.max(...history, 1);
  const peakIdx = history.indexOf(peak);
  const peakPct = ((peak / total) * 100).toFixed(1);

  const idx = Math.min(Math.max(selectedIdx, 0), history.length - 1);
  const selectedInfected = history[idx];
  const selectedDeaths = deathHistory?.[idx] ?? 0;
  const selectedPct = ((selectedInfected / total) * 100).toFixed(1);
  const selectedDay = Math.round(idx * DAYS_PER_SAMPLE);

  const x = (i: number) =>
    history.length === 1 ? 0 : (i / (history.length - 1)) * GW;

  const pts = history
    .map((v, i) => `${x(i).toFixed(1)},${(GH - (v / peak) * GH * 0.92).toFixed(1)}`)
    .join(' ');

  const deathPts =
    deathHistory && deathHistory.length === history.length
      ? deathHistory
          .map(
            (v, i) =>
              `${x(i).toFixed(1)},${(GH - (v / peak) * GH * 0.92).toFixed(1)}`,
          )
          .join(' ')
      : null;

  const guideX = x(idx);
  const guideY = GH - (selectedInfected / peak) * GH * 0.92;

  return (
    <div className="infection-graph">
      <div className="infection-graph__header">
        <span className="infection-graph__title">Active infections</span>
        <span className="infection-graph__pct">{selectedPct}%</span>
      </div>
      <svg
        className="infection-graph__svg"
        viewBox={`0 0 ${GW} ${GH}`}
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={0}
            y1={GH * t}
            x2={GW}
            y2={GH * t}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}
        <polygon
          points={`0,${GH} ${pts} ${GW},${GH}`}
          fill="rgba(248,113,113,0.1)"
        />
        <polyline
          points={pts}
          fill="none"
          stroke="#f87171"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {deathPts && (
          <polyline
            points={deathPts}
            fill="none"
            stroke="#a3a3a3"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="3 3"
          />
        )}
        {/* Peak marker */}
        <line
          x1={x(peakIdx)}
          y1={0}
          x2={x(peakIdx)}
          y2={GH}
          stroke="rgba(248, 113, 113, 0.18)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {/* Selected-day guide */}
        <line
          x1={guideX}
          y1={0}
          x2={guideX}
          y2={GH}
          stroke="rgba(251,191,36,0.55)"
          strokeWidth="1"
        />
        <circle
          cx={guideX}
          cy={guideY}
          r={2.2}
          fill="#fbbf24"
          stroke="#0e0e10"
          strokeWidth="1"
        />
      </svg>

      <div className="infection-graph__legend">
        <span className="infection-graph__legend-item">
          <span className="infection-graph__swatch infection-graph__swatch--infected" />
          Infected
        </span>
        <span className="infection-graph__legend-item">
          <span className="infection-graph__swatch infection-graph__swatch--deaths" />
          Deaths
        </span>
      </div>

      <div className="infection-graph__scrubber">
        <input
          type="range"
          min={0}
          max={history.length - 1}
          step={1}
          value={idx}
          onChange={(e) => {
            setSelectedIdx(Number(e.target.value));
            setUserScrubbed(true);
          }}
          onDoubleClick={() => {
            setUserScrubbed(false);
            setSelectedIdx(history.length - 1);
          }}
          aria-label="Day"
        />
        <div className="infection-graph__readout">
          <span>
            Day <strong>{selectedDay}</strong>
          </span>
          <span>
            {selectedInfected.toLocaleString()} infected
          </span>
          <span className="infection-graph__deaths">
            {selectedDeaths.toLocaleString()} deaths
          </span>
        </div>
      </div>

      <div className="infection-graph__footer">
        <span>Day {day}</span>
        <span>peak {peakPct}% (day {Math.round(peakIdx * DAYS_PER_SAMPLE)})</span>
      </div>
    </div>
  );
};

export default InfectionGraph;
