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

const InfectionGraph: FC<Props> = ({
  history,
  deathHistory,
  deaths = 0,
  total,
  day,
}) => {
  if (history.length < 2) return null;

  const current = history[history.length - 1];
  const peak = Math.max(...history, 1);
  const pct = ((current / total) * 100).toFixed(1);
  const peakPct = ((peak / total) * 100).toFixed(1);
  const deathPct = ((deaths / total) * 100).toFixed(2);

  const pts = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * GW;
      const y = GH - (v / peak) * GH * 0.92;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Plot cumulative deaths on the same vertical scale as active infections so
  // the curve stays readable even when deaths are small.
  const deathPts = deathHistory && deathHistory.length === history.length
    ? deathHistory
        .map((v, i) => {
          const x = (i / (deathHistory.length - 1)) * GW;
          const y = GH - (v / peak) * GH * 0.92;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ')
    : null;

  return (
    <div className="infection-graph">
      <div className="infection-graph__header">
        <span className="infection-graph__title">Active infections</span>
        <span className="infection-graph__pct">{pct}%</span>
      </div>
      <svg
        className="infection-graph__svg"
        viewBox={`0 0 ${GW} ${GH}`}
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={0} y1={GH * t}
            x2={GW} y2={GH * t}
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
      <div className="infection-graph__footer">
        <span>Day {day}</span>
        <span className="infection-graph__deaths">
          deaths {deaths.toLocaleString()} ({deathPct}%)
        </span>
        <span>peak {peakPct}%</span>
      </div>
    </div>
  );
};

export default InfectionGraph;
