import type { FC } from 'react';

interface Props {
  history: number[];
  total: number;
  day: number;
}

const GW = 216;
const GH = 70;

const InfectionGraph: FC<Props> = ({ history, total, day }) => {
  if (history.length < 2) return null;

  const current = history[history.length - 1];
  const peak = Math.max(...history, 1);
  const pct = ((current / total) * 100).toFixed(1);
  const peakPct = ((peak / total) * 100).toFixed(1);

  const pts = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * GW;
      const y = GH - (v / peak) * GH * 0.92;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

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
      </svg>
      <div className="infection-graph__footer">
        <span>Day {day}</span>
        <span>peak {peakPct}%</span>
      </div>
    </div>
  );
};

export default InfectionGraph;
