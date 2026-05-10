import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════ DISEASE DATA ══ */
const DISEASES = [
  {
    id: "covid", name: "COVID-19", pathogen: "SARS-CoV-2", type: "Coronavirus",
    r0: "2.5–5.7", ifr: "~1.8%", transmission: "Airborne / Droplet",
    color: "#F97316", spikes: 12,
    desc: "A novel respiratory pathogen that emerged in 2019 and triggered a global pandemic. SARS-CoV-2 spreads through microscopic aerosols, infecting cells via ACE2 receptors. Symptoms range from mild fever to acute respiratory failure.",
    params: { rate: 0.038, recovery: 320, speed: 1.4, pop: 200, init: 3 },
  },
  {
    id: "influenza", name: "Influenza", pathogen: "Influenza A/B", type: "Orthomyxovirus",
    r0: "1.2–1.4", ifr: "~0.1%", transmission: "Droplet / Contact",
    color: "#60A5FA", spikes: 8,
    desc: "Seasonal influenza viruses continuously evolve, requiring annual vaccine reformulation. While typically mild, pandemic strains like the 1918 Spanish Flu demonstrated catastrophic potential, killing tens of millions worldwide.",
    params: { rate: 0.026, recovery: 180, speed: 1.9, pop: 200, init: 3 },
  },
  {
    id: "ebola", name: "Ebola", pathogen: "Ebolavirus", type: "Filovirus",
    r0: "1.5–2.5", ifr: "25–90%", transmission: "Direct contact / Fluids",
    color: "#8B5CF6", spikes: 6,
    desc: "Ebola hemorrhagic fever disrupts the vascular system, causing severe internal bleeding. Its high fatality rate and transmission through bodily fluids make outbreaks in Central Africa devastating and difficult to contain.",
    params: { rate: 0.055, recovery: 580, speed: 0.9, pop: 200, init: 2 },
  },
  {
    id: "measles", name: "Measles", pathogen: "Measles Morbillivirus", type: "Paramyxovirus",
    r0: "12–18", ifr: "~0.15%", transmission: "Airborne (highly)",
    color: "#EF4444", spikes: 16,
    desc: "Among the most contagious diseases ever documented. A single infected person can spread measles to 12–18 unvaccinated contacts. Despite an effective vaccine, measles remains a leading cause of childhood mortality globally.",
    params: { rate: 0.09, recovery: 260, speed: 1.7, pop: 200, init: 2 },
  },
  {
    id: "hiv", name: "HIV / AIDS", pathogen: "HIV-1 / HIV-2", type: "Lentivirus",
    r0: "2.0–5.0", ifr: "High (untreated)", transmission: "Bodily fluids",
    color: "#10B981", spikes: 10,
    desc: "HIV progressively dismantles the immune system by targeting CD4+ T cells. Without treatment it leads to AIDS. Modern antiretroviral therapy suppresses viral load to undetectable levels, transforming HIV into a manageable chronic condition.",
    params: { rate: 0.012, recovery: 1500, speed: 1.0, pop: 200, init: 3 },
  },
  {
    id: "plague", name: "Bubonic Plague", pathogen: "Yersinia pestis", type: "Gammaproteobacterium",
    r0: "1.3–3.3", ifr: "30–60% (untreated)", transmission: "Flea bites / Aerosol",
    color: "#FBBF24", spikes: 14,
    desc: "The Black Death wiped out a third of Europe in the 14th century. Caused by the bacterium Yersinia pestis, it produces distinctive swollen lymph nodes, fever, and septicemia. Now treatable with antibiotics if caught early.",
    params: { rate: 0.048, recovery: 480, speed: 1.2, pop: 200, init: 2 },
  },
];

/* ═══════════════════════════════════════ HELPERS ═══════ */
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ═══════════════════════════════════════ VIRUS SVG ═════ */
function VirusMolecule({ disease }) {
  const { color, spikes } = disease;
  const cx = 160, cy = 160, coreR = 58, outerR = 108;
  const angles = Array.from({ length: spikes }, (_, i) => (i / spikes) * Math.PI * 2);
  return (
    <svg viewBox="0 0 320 320" width="100%" style={{ maxWidth: 340, display: "block" }}>
      <defs>
        <radialGradient id={`rg-${disease.id}`} cx="38%" cy="32%">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="65%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0.15" />
        </radialGradient>
        <filter id="fg">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="cg">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <style>{`
          @keyframes vspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          @keyframes vpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
          .vspike{transform-origin:${cx}px ${cy}px;animation:vspin 20s linear infinite}
          .vcore{transform-origin:${cx}px ${cy}px;animation:vpulse 3.5s ease-in-out infinite}
        `}</style>
      </defs>
      <circle cx={cx} cy={cy} r={outerR+26} fill={color} opacity="0.04"/>
      <circle cx={cx} cy={cy} r={outerR+12} fill={color} opacity="0.06"/>
      <g className="vspike">
        {angles.map((a, i) => {
          const x1 = cx + Math.cos(a)*(coreR+6), y1 = cy + Math.sin(a)*(coreR+6);
          const x2 = cx + Math.cos(a)*(outerR-7), y2 = cy + Math.sin(a)*(outerR-7);
          const bx = cx + Math.cos(a)*outerR, by = cy + Math.sin(a)*outerR;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.8" opacity="0.55"/>
              <circle cx={bx} cy={by} r="5.5" fill={color} opacity="0.9" filter="url(#fg)"/>
            </g>
          );
        })}
      </g>
      <circle className="vcore" cx={cx} cy={cy} r={coreR} fill={`url(#rg-${disease.id})`} filter="url(#cg)"/>
      <circle cx={cx} cy={cy} r={coreR} fill="none" stroke={color} strokeWidth="1.2" opacity="0.3"/>
      {[0,1,2,3].map(i => (
        <circle key={i} cx={cx+Math.cos(i*1.57+0.4)*20} cy={cy+Math.sin(i*1.57+0.4)*20} r="7" fill={color} opacity="0.18"/>
      ))}
      <circle cx={cx} cy={cy} r="11" fill={color} opacity="0.28"/>
    </svg>
  );
}

/* ═══════════════════════════════════════ CSS ═══════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:#080C14;color:#D4DEFF;font-family:'Space Grotesk',sans-serif;font-weight:300;-webkit-font-smoothing:antialiased;overflow-x:hidden}

  @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes pulse-ring{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.15;transform:scale(1.08)}}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}

  .fu{opacity:0;animation:fadeUp .75s cubic-bezier(.16,1,.3,1) forwards}
  .fi{opacity:0;animation:fadeIn .8s ease forwards}
  .d1{animation-delay:.15s}.d2{animation-delay:.3s}.d3{animation-delay:.45s}
  .d4{animation-delay:.6s}.d5{animation-delay:.75s}.d6{animation-delay:.9s}

  /* ── SIDEBAR ── */
  .sidebar{
    position:fixed;top:0;left:0;bottom:0;width:68px;
    background:#06090F;border-right:1px solid #0F1929;
    display:flex;flex-direction:column;align-items:center;
    padding:1.5rem 0;z-index:50;gap:6px;
  }
  .sidebar-logo{
    font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.15em;
    text-transform:uppercase;color:#1E3A5F;writing-mode:vertical-rl;
    transform:rotate(180deg);margin-bottom:1rem;font-weight:700;
  }
  .d-btn{
    width:44px;height:44px;border-radius:8px;border:1px solid #0F1929;
    background:transparent;cursor:pointer;display:flex;align-items:center;
    justify-content:center;transition:all .2s ease;position:relative;
    flex-direction:column;gap:3px;
  }
  .d-btn:hover{background:#0D1829;border-color:#1E3A6A}
  .d-btn.active{border-color:var(--dc);background:color-mix(in srgb,var(--dc) 12%,transparent)}
  .d-btn-dot{width:8px;height:8px;border-radius:50%;background:var(--dc);flex-shrink:0}
  .d-btn.active .d-btn-dot{box-shadow:0 0 6px var(--dc)}
  .d-btn-label{font-family:'Space Mono',monospace;font-size:6px;letter-spacing:.08em;
    text-transform:uppercase;color:#2A4070;text-align:center;line-height:1.2}
  .d-btn.active .d-btn-label{color:var(--dc)}

  /* ── HERO SECTION ── */
  .hero{
    min-height:100vh;margin-left:68px;
    display:flex;align-items:center;justify-content:center;
    position:relative;overflow:hidden;padding:4rem 3rem 6rem;
  }
  .hero-bg{
    position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse 70% 60% at 60% 50%, color-mix(in srgb,var(--dc) 7%,transparent),transparent 65%);
    transition:background .6s ease;
  }
  .hero-grid{
    position:absolute;inset:0;
    background-image:linear-gradient(rgba(20,40,80,.25) 1px,transparent 1px),
      linear-gradient(90deg,rgba(20,40,80,.25) 1px,transparent 1px);
    background-size:48px 48px;pointer-events:none;
  }
  .hero-inner{
    position:relative;z-index:1;max-width:1000px;width:100%;
    display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:center;
  }

  .hero-tag{
    font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.2em;
    text-transform:uppercase;color:var(--dc);margin-bottom:1.5rem;
    display:flex;align-items:center;gap:8px;
    transition:color .4s ease;
  }
  .hero-tag-dot{width:5px;height:5px;border-radius:50%;background:var(--dc);
    box-shadow:0 0 8px var(--dc);transition:background .4s,box-shadow .4s}

  .hero-name{
    font-size:clamp(2.6rem,5vw,4.2rem);font-weight:600;letter-spacing:-.02em;
    color:#EEF2FF;line-height:1.08;margin-bottom:.75rem;
    transition:all .4s ease;
  }
  .hero-pathogen{
    font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:#2A4070;margin-bottom:2rem;
  }
  .hero-desc{
    font-size:1rem;line-height:1.82;color:#5A7AAA;font-weight:300;
    max-width:42ch;margin-bottom:2.5rem;transition:color .4s;
  }
  .hero-stats{
    display:flex;flex-direction:column;gap:0;
    border:1px solid #0F1929;border-radius:6px;overflow:hidden;
    background:rgba(8,12,20,.7);
  }
  .hero-stat{
    display:flex;justify-content:space-between;align-items:center;
    padding:.9rem 1.25rem;border-bottom:1px solid #0F1929;transition:background .2s;
  }
  .hero-stat:last-child{border-bottom:none}
  .hero-stat:hover{background:rgba(20,40,80,.3)}
  .hs-label{font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.12em;
    text-transform:uppercase;color:#1E3050}
  .hs-val{font-size:1rem;font-weight:600;color:#CCD6F6}
  .hs-val.accent{color:var(--dc);transition:color .4s}

  .scroll-arrow-wrap{
    position:absolute;bottom:2.5rem;left:50%;transform:translateX(-50%);
    display:flex;flex-direction:column;align-items:center;gap:8px;
    cursor:pointer;animation:bob 2.5s ease-in-out infinite;z-index:2;
  }
  .scroll-arrow-wrap:hover{animation:none}
  .scroll-arrow-label{font-family:'Space Mono',monospace;font-size:9px;
    letter-spacing:.18em;text-transform:uppercase;color:#1E3050}
  .scroll-arrow-icon{width:32px;height:32px;border:1px solid #0F1929;border-radius:50%;
    display:flex;align-items:center;justify-content:center;color:#1E3A6A}

  /* ── TRANSITION ── */
  .fade-bridge{
    height:140px;margin-left:68px;
    background:linear-gradient(to bottom,#080C14,transparent);
    position:relative;z-index:2;pointer-events:none;margin-bottom:-2px;
  }

  /* ── SIM SECTION ── */
  .sim-section{margin-left:68px;height:100vh;display:flex;flex-direction:column;
    background:#060A10}
  .sim-top{display:flex;flex:1;overflow:hidden;min-height:0}
  .sim-canvas-wrap{flex:1;position:relative;overflow:hidden}
  .sim-canvas-wrap canvas{display:block;width:100%;height:100%}
  .sim-graph-panel{
    width:290px;flex-shrink:0;border-left:1px solid #0C1525;
    display:flex;flex-direction:column;background:#060A10;
  }
  .sgp-title{
    font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:#1E3050;padding:1rem 1rem .75rem;
    border-bottom:1px solid #0C1525;
  }
  .sgp-canvas-wrap{flex:1;position:relative;min-height:0}
  .sgp-canvas-wrap canvas{display:block;width:100%;height:100%}
  .sgp-legend{
    display:flex;flex-direction:column;gap:6px;
    padding:.75rem 1rem;border-top:1px solid #0C1525;
  }
  .sgp-legend-item{display:flex;align-items:center;gap:8px}
  .sgp-legend-line{width:18px;height:2px;border-radius:1px}
  .sgp-legend-label{font-family:'Space Mono',monospace;font-size:9px;
    letter-spacing:.1em;text-transform:uppercase}

  /* ── SLIDERS ── */
  .sim-sliders{
    height:110px;border-top:1px solid #0C1525;
    display:flex;align-items:center;gap:0;padding:0;
    background:#06090F;flex-shrink:0;overflow-x:auto;
  }
  .slider-col{
    display:flex;flex-direction:column;gap:6px;
    padding:0 1.5rem;border-right:1px solid #0C1525;
    flex:1;min-width:140px;
  }
  .slider-col:last-child{border-right:none}
  .slider-label{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.12em;
    text-transform:uppercase;color:#1E3050;display:flex;justify-content:space-between}
  .slider-val{color:var(--dc);transition:color .4s}
  input[type=range]{
    -webkit-appearance:none;appearance:none;width:100%;height:2px;
    background:#0F1929;border-radius:1px;outline:none;cursor:pointer;
  }
  input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none;appearance:none;
    width:12px;height:12px;border-radius:50%;
    background:var(--dc);cursor:pointer;
    box-shadow:0 0 6px var(--dc);transition:background .4s,box-shadow .4s;
  }
  .sim-controls{
    display:flex;flex-direction:column;gap:6px;
    padding:0 1.5rem;flex-shrink:0;
  }
  .ctrl-btn{
    font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.12em;
    text-transform:uppercase;padding:6px 14px;border-radius:4px;
    border:1px solid #0F1929;background:transparent;color:#2A5090;
    cursor:pointer;transition:all .2s;white-space:nowrap;
  }
  .ctrl-btn:hover{background:#0D1829;color:var(--dc);border-color:var(--dc)}

  /* ── SIM HEADER ── */
  .sim-header{
    display:flex;align-items:center;justify-content:space-between;
    padding:.6rem 1rem;border-bottom:1px solid #0C1525;flex-shrink:0;
  }
  .sim-header-title{font-family:'Space Mono',monospace;font-size:9.5px;
    letter-spacing:.18em;text-transform:uppercase;color:#1E3050}
  .sim-counts{display:flex;gap:1.5rem}
  .sim-count{display:flex;align-items:center;gap:6px;font-family:'Space Mono',monospace;
    font-size:10px;letter-spacing:.08em}
  .sc-dot{width:7px;height:7px;border-radius:50%}
  .sc-val{font-weight:700}

  @media(max-width:900px){
    .sidebar{width:48px}.hero{margin-left:48px}.fade-bridge{margin-left:48px}
    .sim-section{margin-left:48px}.hero-inner{grid-template-columns:1fr;gap:3rem}
    .sim-graph-panel{width:200px}
  }
`;

/* ═══════════════════════════════════════ APP ═══════════ */
export default function App() {
  const [di, setDi] = useState(0);
  const disease = DISEASES[di];

  const [rate, setRate]         = useState(disease.params.rate);
  const [recovery, setRecovery] = useState(disease.params.recovery);
  const [speed, setSpeed]       = useState(disease.params.speed);

  const simRef        = useRef(null);
  const canvasRef     = useRef(null);
  const graphRef      = useRef(null);
  const particlesRef  = useRef([]);
  const historyRef    = useRef([]);
  const rafRef        = useRef(null);
  const tickRef       = useRef(0);
  const liveRef       = useRef({ rate, recovery, speed, di });
  const countsRef     = useRef({ S: 0, I: 0, R: 0 });
  const [counts, setCounts] = useState({ S: 0, I: 0, R: 0 });

  // Sync liveRef
  useEffect(() => { liveRef.current = { rate, recovery, speed, di }; }, [rate, recovery, speed, di]);

  // When disease switches, update sliders
  useEffect(() => {
    const p = DISEASES[di].params;
    setRate(p.rate); setRecovery(p.recovery); setSpeed(p.speed);
  }, [di]);

  /* ── CANVAS SIZE ── */
  const sizeCanvas = (canvas, container) => {
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth, H = container.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  };

  /* ── INIT PARTICLES ── */
  const initParticles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const { di: dIdx, speed: spd } = liveRef.current;
    const d = DISEASES[dIdx];
    const count = d.params.pop, initInf = d.params.init;
    particlesRef.current = Array.from({ length: count }, (_, i) => ({
      x: 12 + Math.random() * (W - 24),
      y: 12 + Math.random() * (H - 24),
      vx: (Math.random() - 0.5) * spd * 2.4,
      vy: (Math.random() - 0.5) * spd * 2.4,
      state: i < initInf ? "I" : "S",
      infectedAt: i < initInf ? 0 : null,
    }));
    historyRef.current = [];
    tickRef.current = 0;
  };

  /* ── MAIN LOOP ── */
  const loop = () => {
    const canvas = canvasRef.current;
    const gCanvas = graphRef.current;
    if (!canvas || !gCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const GW = gCanvas.width / dpr, GH = gCanvas.height / dpr;
    const ctx = canvas.getContext("2d");
    const gctx = gCanvas.getContext("2d");
    const { rate: r, recovery: rec, di: dIdx } = liveRef.current;
    const dColor = DISEASES[dIdx].color;
    const pts = particlesRef.current;
    const tick = tickRef.current;
    const IR = 16, IR2 = IR * IR;

    // Move + bounce
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 8)    { p.x = 8;    p.vx = Math.abs(p.vx); }
      if (p.x > W-8)  { p.x = W-8;  p.vx = -Math.abs(p.vx); }
      if (p.y < 8)    { p.y = 8;    p.vy = Math.abs(p.vy); }
      if (p.y > H-8)  { p.y = H-8;  p.vy = -Math.abs(p.vy); }
      if (p.state === "I" && tick - p.infectedAt > rec) p.state = "R";
    }

    // Spread infection
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].state !== "I") continue;
      for (let j = 0; j < pts.length; j++) {
        if (pts[j].state !== "S") continue;
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        if (dx*dx + dy*dy < IR2 && Math.random() < r) {
          pts[j].state = "I"; pts[j].infectedAt = tick;
        }
      }
    }
    tickRef.current++;

    // Count
    let S = 0, I = 0, R = 0;
    for (const p of pts) { if (p.state==="S") S++; else if (p.state==="I") I++; else R++; }
    historyRef.current.push({ S, I, R });
    if (historyRef.current.length > GW) historyRef.current.shift();
    countsRef.current = { S, I, R };
    if (tick % 8 === 0) setCounts({ S, I, R });

    // ── DRAW SIM ──
    ctx.fillStyle = "#060A10";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(20,50,100,.18)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    for (const p of pts) {
      const col = p.state === "S" ? "rgba(147,197,253,.8)" : p.state === "I" ? dColor : "rgba(50,60,80,.65)";
      if (p.state === "I") {
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI*2);
        ctx.fillStyle = hexToRgba(dColor, 0.14); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.state === "I" ? 5.5 : 4.5, 0, Math.PI*2);
      ctx.fillStyle = col; ctx.fill();
    }

    // ── DRAW GRAPH ──
    gctx.fillStyle = "#060A10";
    gctx.fillRect(0, 0, GW, GH);
    const pad = { l:36, r:8, t:10, b:24 };
    const gW = GW - pad.l - pad.r, gH = GH - pad.t - pad.b;
    const total = pts.length || 1;
    const hist = historyRef.current;

    // grid
    gctx.strokeStyle = "rgba(20,50,100,.3)"; gctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yp = pad.t + gH * (1 - i/4);
      gctx.beginPath(); gctx.moveTo(pad.l, yp); gctx.lineTo(pad.l+gW, yp); gctx.stroke();
      gctx.fillStyle = "rgba(40,70,130,.5)"; gctx.font = "9px monospace";
      gctx.fillText(Math.round(total*i/4), 2, yp+3);
    }

    if (hist.length > 1) {
      const xS = gW / (hist.length - 1);
      const drawLine = (key, color, alpha=1) => {
        gctx.beginPath();
        gctx.strokeStyle = color; gctx.lineWidth = 1.8; gctx.lineJoin = "round";
        hist.forEach((d, i) => {
          const x = pad.l + i * xS, y = pad.t + gH * (1 - d[key]/total);
          i === 0 ? gctx.moveTo(x,y) : gctx.lineTo(x,y);
        });
        gctx.stroke();
      };
      drawLine("S", "rgba(147,197,253,.85)");
      drawLine("R", "rgba(74,222,128,.85)");
      drawLine("I", dColor);
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  /* ── START / STOP via IntersectionObserver ── */
  useEffect(() => {
    const simEl = simRef.current;
    let started = false;

    const start = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const simWrap = canvasRef.current?.parentElement;
      const gWrap   = graphRef.current?.parentElement;
      sizeCanvas(canvasRef.current, simWrap);
      sizeCanvas(graphRef.current, gWrap);
      initParticles();
      loop();
      started = true;
    };

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started) start();
      else if (!e.isIntersecting && started) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        started = false;
      }
    }, { threshold: 0.2 });

    if (simEl) obs.observe(simEl);
    return () => { obs.disconnect(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  /* ── Restart when disease changes ── */
  useEffect(() => {
    if (!canvasRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    initParticles();
    loop();
  }, [di]);

  const handleReset = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    initParticles(); loop();
  };

  const cssVars = { "--dc": disease.color };

  return (
    <>
      <style>{CSS}</style>

      {/* ── SIDEBAR ── */}
      <nav className="sidebar fi d1" style={cssVars}>
        <span className="sidebar-logo">Panacea</span>
        {DISEASES.map((d, i) => (
          <button
            key={d.id}
            className={`d-btn ${i===di?"active":""}`}
            style={{ "--dc": d.color }}
            onClick={() => setDi(i)}
            title={d.name}
          >
            <span className="d-btn-dot"/>
            <span className="d-btn-label">{d.name.split(" ")[0]}</span>
          </button>
        ))}
      </nav>

      {/* ── HERO ── */}
      <section className="hero" style={cssVars}>
        <div className="hero-bg" style={{ "--dc": disease.color }}/>
        <div className="hero-grid"/>

        <div className="hero-inner">
          {/* LEFT: info */}
          <div>
            <p className="hero-tag fu d2">
              <span className="hero-tag-dot" style={{ background: disease.color, boxShadow:`0 0 8px ${disease.color}` }}/>
              {disease.type}
            </p>
            <h1 className="hero-name fu d3" style={{ color: "#EEF2FF" }}>{disease.name}</h1>
            <p className="hero-pathogen fu d3">{disease.pathogen}</p>
            <p className="hero-desc fu d4">{disease.desc}</p>

            <div className="hero-stats fu d4">
              {[
                ["Basic R₀", disease.r0, true],
                ["Infection fatality", disease.ifr, false],
                ["Transmission", disease.transmission, false],
              ].map(([l, v, accent]) => (
                <div className="hero-stat" key={l}>
                  <span className="hs-label">{l}</span>
                  <span className={`hs-val${accent?" accent":""}`} style={accent?{color:disease.color}:{}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: molecule */}
          <div className="fu d3" style={{ display:"flex", justifyContent:"center" }}>
            <VirusMolecule disease={disease}/>
          </div>
        </div>

        {/* Down arrow */}
        <div className="scroll-arrow-wrap" onClick={() => simRef.current?.scrollIntoView({ behavior:"smooth" })}>
          <span className="scroll-arrow-label">Simulation</span>
          <span className="scroll-arrow-icon">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </section>

      {/* ── TRANSITION ── */}
      <div className="fade-bridge"/>

      {/* ── SIMULATION ── */}
      <section className="sim-section" ref={simRef} style={cssVars}>
        {/* header bar */}
        <div className="sim-header">
          <span className="sim-header-title">SIR Particle Simulation — {disease.name}</span>
          <div className="sim-counts">
            {[
              { label:"Susceptible", col:"rgba(147,197,253,.8)", val: counts.S },
              { label:"Infected",    col: disease.color,         val: counts.I },
              { label:"Recovered",   col:"rgba(74,222,128,.8)",  val: counts.R },
            ].map(({ label, col, val }) => (
              <div className="sim-count" key={label}>
                <span className="sc-dot" style={{ background: col }}/>
                <span className="sc-val" style={{ color: col }}>{val}</span>
                <span style={{ color:"#1E3050", fontFamily:"'Space Mono',monospace", fontSize:"9px", letterSpacing:".08em" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sim-top">
          {/* main canvas */}
          <div className="sim-canvas-wrap">
            <canvas ref={canvasRef}/>
          </div>

          {/* graph panel */}
          <div className="sim-graph-panel">
            <div className="sgp-title">SIR Curve — real-time</div>
            <div className="sgp-canvas-wrap">
              <canvas ref={graphRef}/>
            </div>
            <div className="sgp-legend">
              {[
                { label:"Susceptible", col:"rgba(147,197,253,.8)" },
                { label:"Infected",    col: disease.color },
                { label:"Recovered",   col:"rgba(74,222,128,.8)" },
              ].map(({ label, col }) => (
                <div className="sgp-legend-item" key={label}>
                  <span className="sgp-legend-line" style={{ background: col }}/>
                  <span className="sgp-legend-label" style={{ color: col, fontSize:"9px", letterSpacing:".1em" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* sliders */}
        <div className="sim-sliders">
          {[
            { label:"Transmission Rate", val:rate, min:.005, max:.12, step:.001, set:setRate, fmt: v=>(v*100).toFixed(1)+"%" },
            { label:"Recovery Time (ticks)", val:recovery, min:60, max:1200, step:10, set:setRecovery, fmt: v=>Math.round(v) },
            { label:"Movement Speed", val:speed, min:.3, max:3.5, step:.05, set:setSpeed, fmt: v=>v.toFixed(2) },
          ].map(({ label, val, min, max, step, set, fmt }) => (
            <div className="slider-col" key={label}>
              <label className="slider-label">
                <span>{label}</span>
                <span className="slider-val" style={{ color: disease.color }}>{fmt(val)}</span>
              </label>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => set(parseFloat(e.target.value))}
                style={{ "--dc": disease.color }}
              />
            </div>
          ))}
          <div className="sim-controls">
            <button className="ctrl-btn" onClick={handleReset} style={{ "--dc": disease.color }}>↺ Reset</button>
          </div>
        </div>
      </section>
    </>
  );
}
