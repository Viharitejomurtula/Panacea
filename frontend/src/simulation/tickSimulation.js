const CELL_SIZE = 25;
const INFECTION_RADIUS_SQ = 22 * 22;
const MASK_EFFECTIVENESS = 0.65;
const TICKS_PER_DAY = 4;

// Per-virus disease parameters (mirrors abm_simulator/simulator.py DISEASE_PRESETS).
// These calibrate the spatial sim to roughly match the surrogate's predictions.
// covid_wuhan is the reference: R0=2.5, infectious_period=10d → P=0.0012, 480 ticks.
const REF_R0 = 2.5;
const REF_INFECTIOUS = 10;
const REF_INFECTION_PROB = 0.0012;
const REF_RECOVERY_TICKS = 480;

const VIRUS_PARAMS = {
  covid_wuhan:           { r0: 2.5, infectious_period: 10, mortality: 0.005 },
  hantavirus_andes:      { r0: 1.3, infectious_period: 10, mortality: 0.35 },
  h1n1_swine_flu:        { r0: 1.6, infectious_period: 7,  mortality: 0.00015 },
  human_metapneumovirus: { r0: 2.5, infectious_period: 8,  mortality: 0.004 },
  influenza_a_h3n2:      { r0: 1.4, infectious_period: 6,  mortality: 0.001 },
  spanish_flu:           { r0: 2.2, infectious_period: 7,  mortality: 0.013 },
};
const DEFAULT_VIRUS = VIRUS_PARAMS.covid_wuhan;

export function tickSimulation(agents, world, intervention = {}, tickCount = 0, virusId = null) {
  const {
    intervention_day = 0,
    mask_compliance = 0,
    contact_reduction = 0,
    vaccination_rate = 0,
  } = intervention;

  const vp = (virusId && VIRUS_PARAMS[virusId]) || DEFAULT_VIRUS;

  // Calibrate base infection probability to virus R0 (relative to covid_wuhan).
  // Recovery ticks scale with infectious_period.
  const baseInfectionProb = REF_INFECTION_PROB * (vp.r0 / REF_R0);
  const recoveryTicks = REF_RECOVERY_TICKS * (vp.infectious_period / REF_INFECTIOUS);

  const currentDay = Math.floor(tickCount / TICKS_PER_DAY);
  const active = currentDay >= intervention_day;

  let infectionProb = baseInfectionProb;
  if (active) {
    const maskMult = 1 - mask_compliance * MASK_EFFECTIVENESS * 0.5;
    infectionProb *= maskMult * maskMult;
    infectionProb *= (1 - contact_reduction);
  }

  // Vaccination: per-tick probability a susceptible becomes immune
  const vaccTickProb = active ? vaccination_rate / TICKS_PER_DAY : 0;

  const gridW = Math.ceil(world.W / CELL_SIZE);
  const gridH = Math.ceil(world.H / CELL_SIZE);
  const grid = new Array(gridW * gridH).fill(null).map(() => []);

  for (const p of agents) {
    if (p.state === 'D') continue;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x <= 0 || p.x >= world.W) { p.vx *= -1; p.x = Math.max(0, Math.min(world.W, p.x)); }
    if (p.y <= 0 || p.y >= world.H) { p.vy *= -1; p.y = Math.max(0, Math.min(world.H, p.y)); }

    const cx = Math.min(Math.floor(p.x / CELL_SIZE), gridW - 1);
    const cy = Math.min(Math.floor(p.y / CELL_SIZE), gridH - 1);
    grid[cy * gridW + cx].push(p);
  }

  for (const p of agents) {
    if (p.state === 'S' && vaccTickProb > 0 && Math.random() < vaccTickProb) {
      p.state = 'R';
      continue;
    }

    if (p.state !== 'I') continue;

    p.ticksInfected = (p.ticksInfected ?? 0) + 1;
    if (p.ticksInfected >= recoveryTicks) {
      p.state = Math.random() < vp.mortality ? 'D' : 'R';
      if (p.state === 'D') {
        p.vx = 0;
        p.vy = 0;
      }
      continue;
    }

    const cx = Math.min(Math.floor(p.x / CELL_SIZE), gridW - 1);
    const cy = Math.min(Math.floor(p.y / CELL_SIZE), gridH - 1);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        for (const other of grid[ny * gridW + nx]) {
          if (other.state !== 'S') continue;
          const d2 = (p.x - other.x) ** 2 + (p.y - other.y) ** 2;
          if (d2 < INFECTION_RADIUS_SQ && Math.random() < infectionProb) {
            other.state = 'I';
            other.ticksInfected = 0;
          }
        }
      }
    }
  }

  return agents;
}
