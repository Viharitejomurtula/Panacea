import { useId } from "react";

type Props = {
  accent: string;
  /** Rough visual style — spike crown reads best for coronavirus presets. */
  variant?: "corona" | "sphere" | "hantavirus" | "h1n1" | "hmpv" | "h3n2";
};

/** Biomimetic palette for hantavirus (envelope + surface glycoprotein clusters), still flat SVG. */
const HANTA_CORE_HI = "#e45796";
const HANTA_CORE_LO = "#8f1748";
const HANTA_TEAL = "#32cfc4";
const HANTA_TEAL_HI = "#9af7ee";

/** Influenza-style: purple emissive core + translucent blue HA/NA spikes (simplified). */
const H1N1_CORE_HI = "#c084fc";
const H1N1_CORE_MID = "#7c3aed";
const H1N1_CORE_LO = "#4c1d95";
const H1N1_SPIKE = "#38bdf8";
const H1N1_SPIKE_DIM = "#1d4ed8";
const H1N1_TIP_HI = "#e0f2fe";

/** Human metapneumovirus: dark purple core + dense blue (F) vs magenta (G) peplomers, simplified. */
const HMPV_CORE_HI = "#7e69c8";
const HMPV_CORE_MID = "#4c2b8a";
const HMPV_CORE_LO = "#2e1067";
const HMPV_SPIKE_BLUE = "#38bdf8";
const HMPV_SPIKE_BLUE_TIP = "#bae6fd";
const HMPV_SPIKE_MAG = "#e879f9";
const HMPV_SPIKE_MAG_DIM = "#c026d3";

/** Influenza A H3N2: same stem+knob layout as coronavirus preset; stem ~9% shorter. */
const H3N2_CORONA_STEM_SCALE = 0.91;

/**
 * Decorative hero graphic: glowing core + spikes (corona) or soft orb (other).
 */
export function IntroVirusGraphic({ accent, variant = "sphere" }: Props) {
  const gid = useId().replace(/:/g, "");

  if (variant === "hmpv") {
    const coreGradId = `intro-v-hmpv-core-${gid}`;
    const magTipGradId = `intro-v-hmpv-mag-tip-${gid}`;
    const cx = 100;
    const cy = 100;
    const coreR = 40;
    const nSpikes = 30;

    type SpikeKind = "blue" | "magenta";
    type Spike = { a: number; len: number; kind: SpikeKind };
    const spikes: Spike[] = [];
    for (let i = 0; i < nSpikes; i++) {
      const a = (i / nSpikes) * Math.PI * 2 + 0.14;
      const len = 17 + (i % 6) * 1.15 + (i % 4) * 0.9;
      const kind: SpikeKind = i % 2 === 0 ? "blue" : "magenta";
      spikes.push({ a, len, kind });
    }

    /** Granular surface hint — subtle cyan / amber flecks on the envelope */
    const speckles: [number, number, string][] = [];
    for (let i = 0; i < 22; i++) {
      const sa = (i / 22) * Math.PI * 2 + 0.55;
      const jitter = (i % 5) * 0.4;
      const sr = coreR - 5 - jitter * 0.35;
      speckles.push([
        cx + Math.cos(sa) * sr,
        cy + Math.sin(sa) * sr,
        i % 3 === 0 ? "#fbbf24" : "#67e8f9",
      ]);
    }

    return (
      <div
        className="intro-virus-graphic intro-virus-graphic--hmpv"
        style={{ color: accent }}
      >
        <div className="intro-virus-graphic__glow" aria-hidden />
        <svg
          className="intro-virus-graphic__svg"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id={coreGradId} cx="38%" cy="30%" r="64%">
              <stop offset="0%" stopColor={HMPV_CORE_HI} stopOpacity="1" />
              <stop offset="48%" stopColor={HMPV_CORE_MID} stopOpacity="1" />
              <stop offset="100%" stopColor={HMPV_CORE_LO} stopOpacity="1" />
            </radialGradient>
            <radialGradient id={magTipGradId} cx="35%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#fbcfe8" stopOpacity="0.98" />
              <stop offset="45%" stopColor={HMPV_SPIKE_MAG} stopOpacity="0.95" />
              <stop offset="100%" stopColor={HMPV_SPIKE_MAG_DIM} stopOpacity="0.92" />
            </radialGradient>
          </defs>

          <circle
            cx={cx}
            cy={cy}
            r={coreR}
            fill={`url(#${coreGradId})`}
            opacity={0.98}
          />

          <g opacity={0.42}>
            {speckles.map(([sx, sy, fill], i) => (
              <circle key={`s-${i}`} cx={sx} cy={sy} r={i % 4 === 0 ? 1.35 : 1.05} fill={fill} />
            ))}
          </g>

          {spikes.map(({ a, len, kind }, i) => {
            const x0 = cx + Math.cos(a) * (coreR - 0.5);
            const y0 = cy + Math.sin(a) * (coreR - 0.5);
            const x1 = cx + Math.cos(a) * (coreR + len);
            const y1 = cy + Math.sin(a) * (coreR + len);

            if (kind === "blue") {
              return (
                <g key={i}>
                  <line
                    x1={x0}
                    y1={y0}
                    x2={x1}
                    y2={y1}
                    stroke={HMPV_SPIKE_BLUE}
                    strokeOpacity={0.78}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={x1}
                    cy={y1}
                    r={3.35}
                    fill={HMPV_SPIKE_BLUE_TIP}
                    stroke={HMPV_SPIKE_BLUE}
                    strokeOpacity={0.55}
                    strokeWidth={0.75}
                    opacity={0.96}
                  />
                </g>
              );
            }

            /* Magenta: thicker stalk + tri-lobe crown (G glycoprotein hint) */
            const hubX = x1 + Math.cos(a) * 2.35;
            const hubY = y1 + Math.sin(a) * 2.35;
            return (
              <g key={i}>
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  stroke={HMPV_SPIKE_MAG}
                  strokeOpacity={0.82}
                  strokeWidth={2.55}
                  strokeLinecap="round"
                />
                <circle
                  cx={hubX}
                  cy={hubY}
                  r={2.35}
                  fill={`url(#${magTipGradId})`}
                  opacity={0.94}
                />
                {[0, 1, 2].map((k) => {
                  const ang = a + Math.PI / 2 + (k * 2 * Math.PI) / 3;
                  return (
                    <circle
                      key={k}
                      cx={hubX + Math.cos(ang) * 4.25}
                      cy={hubY + Math.sin(ang) * 4.25}
                      r={2.65}
                      fill={HMPV_SPIKE_MAG}
                      opacity={0.93}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  if (variant === "h1n1") {
    const coreGradId = `intro-v-h1n1-core-${gid}`;
    const tipGradId = `intro-v-h1n1-tip-${gid}`;
    const cx = 100;
    const cy = 100;
    const coreR = 38;
    const nSpikes = 26;

    type Spike = { a: number; len: number; thick: number };
    const spikes: Spike[] = [];
    for (let i = 0; i < nSpikes; i++) {
      const a = (i / nSpikes) * Math.PI * 2 + 0.08;
      const len = 20 + (i % 7) * 1.25 + (i % 3) * 0.8;
      const thick = i % 4 === 0 ? 2.4 : 1.85;
      spikes.push({ a, len, thick });
    }

    return (
      <div
        className="intro-virus-graphic intro-virus-graphic--h1n1"
        style={{ color: accent }}
      >
        <div className="intro-virus-graphic__glow" aria-hidden />
        <svg
          className="intro-virus-graphic__svg"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id={coreGradId} cx="42%" cy="35%" r="62%">
              <stop offset="0%" stopColor={H1N1_CORE_HI} stopOpacity="1" />
              <stop offset="45%" stopColor={H1N1_CORE_MID} stopOpacity="1" />
              <stop offset="100%" stopColor={H1N1_CORE_LO} stopOpacity="1" />
            </radialGradient>
            <radialGradient id={tipGradId} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor={H1N1_TIP_HI} stopOpacity="0.98" />
              <stop offset="55%" stopColor={H1N1_SPIKE} stopOpacity="0.92" />
              <stop offset="100%" stopColor={H1N1_SPIKE_DIM} stopOpacity="0.85" />
            </radialGradient>
          </defs>

          {/* Orbital rings (minimal “atom” frame like reference) */}
          <g className="intro-virus-graphic__h1n1-rings" opacity={0.42}>
            <ellipse
              cx={cx}
              cy={cy}
              rx={76}
              ry={27}
              stroke="#60a5fa"
              strokeOpacity={0.55}
              strokeWidth={1.1}
              transform={`rotate(-24 ${cx} ${cy})`}
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={62}
              ry={74}
              stroke="#818cf8"
              strokeOpacity={0.45}
              strokeWidth={0.95}
              transform={`rotate(38 ${cx} ${cy})`}
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={74}
              ry={58}
              stroke="#38bdf8"
              strokeOpacity={0.4}
              strokeWidth={0.85}
              transform={`rotate(-58 ${cx} ${cy})`}
            />
          </g>

          <circle
            cx={cx}
            cy={cy}
            r={coreR}
            fill={`url(#${coreGradId})`}
            opacity={0.98}
          />

          {spikes.map(({ a, len, thick }, i) => {
            const x0 = cx + Math.cos(a) * (coreR - 1);
            const y0 = cy + Math.sin(a) * (coreR - 1);
            const x1 = cx + Math.cos(a) * (coreR + len);
            const y1 = cy + Math.sin(a) * (coreR + len);
            const deg = (a * 180) / Math.PI;
            return (
              <g key={i}>
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  stroke={H1N1_SPIKE}
                  strokeOpacity={0.52}
                  strokeWidth={thick}
                  strokeLinecap="round"
                />
                {/* Cup-like tip: flattened ellipse along spike axis */}
                <ellipse
                  cx={x1}
                  cy={y1}
                  rx={5.4}
                  ry={3.1}
                  fill={`url(#${tipGradId})`}
                  opacity={0.92}
                  transform={`rotate(${deg} ${x1} ${y1})`}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  if (variant === "h3n2") {
    const coreGradId = `intro-v-h3n2-core-${gid}`;
    const cx = 100;
    const cy = 100;
    /* Match COVID (`corona`) geometry: r=52, stem to 92 — shorten proportionally. */
    const coreR = 52;
    const coronaStem = 92 - 52;
    const stemLen = coronaStem * H3N2_CORONA_STEM_SCALE;
    const outerR = coreR + stemLen;
    const knobR = 5 * H3N2_CORONA_STEM_SCALE;
    const strokeW = 5 * H3N2_CORONA_STEM_SCALE;

    const grain: [number, number, number][] = [];
    for (let g = 0; g < 48; g++) {
      const ga = g * 0.71 + (g % 7) * 0.29;
      const gr = coreR - 1.2 - (g % 9) * 0.55;
      grain.push([
        cx + Math.cos(ga) * gr,
        cy + Math.sin(ga) * gr,
        0.22 + (g % 5) * 0.1,
      ]);
    }

    return (
      <div
        className="intro-virus-graphic intro-virus-graphic--h3n2"
        style={{ color: accent }}
      >
        <div className="intro-virus-graphic__glow" aria-hidden />
        <svg
          className="intro-virus-graphic__svg"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id={coreGradId} cx="28%" cy="18%" r="82%">
              <stop offset="0%" stopColor="#c5eef6" stopOpacity="1" />
              <stop offset="26%" stopColor="#6fb8cc" stopOpacity="1" />
              <stop offset="55%" stopColor="#356678" stopOpacity="1" />
              <stop offset="100%" stopColor="#03080c" stopOpacity="1" />
            </radialGradient>
          </defs>

          <circle
            cx={cx}
            cy={cy}
            r={coreR}
            fill={`url(#${coreGradId})`}
            opacity={0.96}
          />

          <g opacity={0.22} className="intro-virus-graphic__h3n2-grain">
            {grain.map(([gx, gy, gr], i) => (
              <circle
                key={`g-${i}`}
                cx={gx}
                cy={gy}
                r={gr}
                fill="#9fd4e3"
                opacity={0.5}
              />
            ))}
          </g>

          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const x1 = cx + Math.cos(a) * coreR;
            const y1 = cy + Math.sin(a) * coreR;
            const x2 = cx + Math.cos(a) * outerR;
            const y2 = cy + Math.sin(a) * outerR;
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={accent}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  opacity={0.88}
                />
                <circle
                  cx={x2}
                  cy={y2}
                  r={knobR}
                  fill={accent}
                  opacity={0.95}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  if (variant === "hantavirus") {
    const coreGradId = `intro-v-hanta-core-${gid}`;
    const tealGradId = `intro-v-hanta-teal-${gid}`;
    const cx = 100;
    const cy = 100;
    const envelopeR = 48;
    const clusterRingR = 51;
    const nClusters = 11;
    const quadSpread = 5.2;

    const tealClusters: [number, number][][] = [];
    for (let i = 0; i < nClusters; i++) {
      const a = (i / nClusters) * Math.PI * 2 + 0.31;
      const bx = cx + Math.cos(a) * clusterRingR;
      const by = cy + Math.sin(a) * clusterRingR;
      const tx = -Math.sin(a);
      const ty = Math.cos(a);
      const rdx = Math.cos(a);
      const rdy = Math.sin(a);
      const q = quadSpread;
      tealClusters.push([
        [bx + tx * q + rdx * 1.8, by + ty * q + rdy * 1.8],
        [bx + tx * q - rdx * 1.8, by + ty * q - rdy * 1.8],
        [bx - tx * q + rdx * 1.8, by - ty * q + rdy * 1.8],
        [bx - tx * q - rdx * 1.8, by - ty * q - rdy * 1.8],
      ]);
    }

    return (
      <div
        className="intro-virus-graphic intro-virus-graphic--hantavirus"
        style={{ color: accent }}
      >
        <div className="intro-virus-graphic__glow" aria-hidden />
        <svg
          className="intro-virus-graphic__svg"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id={coreGradId} cx="38%" cy="32%" r="68%">
              <stop offset="0%" stopColor={HANTA_CORE_HI} stopOpacity="1" />
              <stop offset="55%" stopColor="#c9266a" stopOpacity="1" />
              <stop offset="100%" stopColor={HANTA_CORE_LO} stopOpacity="1" />
            </radialGradient>
            <radialGradient id={tealGradId} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={HANTA_TEAL_HI} stopOpacity="0.98" />
              <stop offset="70%" stopColor={HANTA_TEAL} stopOpacity="0.95" />
              <stop offset="100%" stopColor="#1a9e94" stopOpacity="0.9" />
            </radialGradient>
          </defs>

          <circle
            cx={cx}
            cy={cy}
            r={envelopeR}
            fill={`url(#${coreGradId})`}
            opacity="0.97"
          />

          {/* Simplified tri-segment RNA hint inside the envelope */}
          <path
            d="M 74 102 C 82 88 92 94 100 98 C 108 102 114 96 118 104"
            stroke={HANTA_TEAL}
            strokeOpacity={0.22}
            strokeWidth={1.15}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 78 108 C 92 118 98 112 108 106 C 114 102 122 108 128 100"
            stroke={HANTA_CORE_HI}
            strokeOpacity={0.18}
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 88 94 C 98 108 104 100 112 96"
            stroke="#f0b8d4"
            strokeOpacity={0.2}
            strokeWidth={0.95}
            strokeLinecap="round"
            fill="none"
          />

          {tealClusters.map((quad, ci) =>
            quad.map(([px, py], di) => (
              <circle
                key={`${ci}-${di}`}
                cx={px}
                cy={py}
                r={3.8}
                fill={`url(#${tealGradId})`}
                opacity={0.94}
              />
            )),
          )}
        </svg>
      </div>
    );
  }

  if (variant === "corona") {
    const coreId = `intro-v-core-${gid}`;
    return (
      <div className="intro-virus-graphic intro-virus-graphic--corona" style={{ color: accent }}>
        <div className="intro-virus-graphic__glow" aria-hidden />
        <svg
          className="intro-virus-graphic__svg"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id={coreId} cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
              <stop offset="70%" stopColor={accent} stopOpacity="0.35" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.08" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="52" fill={`url(#${coreId})`} opacity="0.9" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const x1 = 100 + Math.cos(a) * 52;
            const y1 = 100 + Math.sin(a) * 52;
            const x2 = 100 + Math.cos(a) * 92;
            const y2 = 100 + Math.sin(a) * 92;
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={accent}
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity="0.85"
                />
                <circle cx={x2} cy={y2} r="5" fill={accent} opacity="0.95" />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const sphereId = `intro-v-sphere-${gid}`;
  return (
    <div className="intro-virus-graphic intro-virus-graphic--sphere" style={{ color: accent }}>
      <div className="intro-virus-graphic__glow" aria-hidden />
      <svg
        className="intro-virus-graphic__svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <radialGradient id={sphereId} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
            <stop offset="55%" stopColor={accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.12" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="105" r="58" fill={`url(#${sphereId})`} />
        <ellipse
          cx="100"
          cy="105"
          rx="72"
          ry="28"
          stroke={accent}
          strokeOpacity="0.25"
          strokeWidth="1.5"
          transform="rotate(-18 100 105)"
        />
        <ellipse
          cx="100"
          cy="105"
          rx="52"
          ry="72"
          stroke={accent}
          strokeOpacity="0.15"
          strokeWidth="1"
          transform="rotate(12 100 105)"
        />
      </svg>
    </div>
  );
}
