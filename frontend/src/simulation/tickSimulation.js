const CELL_SIZE = 25;
const INFECTION_RADIUS_SQ = 22 * 22;
const MASK_EFFECTIVENESS = 0.65;
const TICKS_PER_DAY = 4;

// Per-virus disease parameters (mirrors abm_simulator/simulator.py DISEASE_PRESETS).
// Calibrated so the collision-based spatial sim reproduces the surrogate's
// Monte Carlo curves as closely as possible while still being a real ABM:
//
//   • Recovery ticks = infectious_period × TICKS_PER_DAY (real time, no scaling)
//   • Infection prob calibrated so β/γ ≈ R0 given typical neighbor density
//     (3000 agents in 1000×600 px world, ~7.6 neighbors per radius-22 circle,
//      4 ticks/day → ~30 candidate-checks/day; infection_prob × 30 ≈ R0/infectious)
//   • Vaccination = vaccination_rate × vaccination_effectiveness (Mesa uses
//     reduced-transmission to vaccinated; we approximate as effective immunity)
//   • Mortality includes population-weighted age multiplier ≈ 1.97 (matches
//     simulator's AGE_MORTALITY_MULTIPLIER × AGE_DISTRIBUTION)
const REF_R0 = 2.5;
const REF_INFECTION_PROB = 0.008;
const AGE_MORTALITY_FACTOR = 1.97;

const VIRUS_PARAMS = {
  covid_wuhan:           { r0: 2.5, infectious_period: 10, mortality: 0.005,   vacc_eff: 0.875 },
  hantavirus_andes:      { r0: 1.3, infectious_period: 10, mortality: 0.35,    vacc_eff: 0.0   },
  h1n1_swine_flu:        { r0: 1.6, infectious_period: 7,  mortality: 0.00015, vacc_eff: 0.7   },
  human_metapneumovirus: { r0: 2.5, infectious_period: 8,  mortality: 0.004,   vacc_eff: 0.0   },
  influenza_a_h3n2:      { r0: 1.4, infectious_period: 6,  mortality: 0.001,   vacc_eff: 0.38  },
  spanish_flu:           { r0: 2.2, infectious_period: 7,  mortality: 0.013,   vacc_eff: 0.0   },
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

  // Calibrate per-tick infection probability so β = R0/infectious_period matches
  // the surrogate's epidemiological model. Both R0 AND infectious_period matter:
  // a 6-day virus needs HIGHER per-tick probability than a 10-day one at the
  // same R0, because there are fewer ticks to spread before recovery.
  //
  //   β_target = R0 / infectious_period (per day)
  //   per-tick prob ∝ β / (TICKS_PER_DAY × avg_neighbors_per_tick)
  //
  // Reference: covid_wuhan (R0=2.5, infectious=10) → REF_INFECTION_PROB.
  const baseInfectionProb =
    REF_INFECTION_PROB
    * (vp.r0 / REF_R0)
    * (REF_INFECTIOUS / vp.infectious_period);
  const recoveryTicks = vp.infectious_period * TICKS_PER_DAY;

  const currentDay = Math.floor(tickCount / TICKS_PER_DAY);
  const active = currentDay >= intervention_day;

  let infectionProb = baseInfectionProb;
  if (active) {
    const maskMult = 1 - mask_compliance * MASK_EFFECTIVENESS * 0.5;
    infectionProb *= maskMult * maskMult;
    infectionProb *= (1 - contact_reduction);
  }

  // Vaccination: effective per-tick immunity rate. Mesa applies vaccination
  // multiplicatively to transmission for vaccinated agents; we approximate by
  // reducing the chance of becoming immune by the disease's vaccine effectiveness.
  const vaccTickProb = active
    ? (vaccination_rate * vp.vacc_eff) / TICKS_PER_DAY
    : 0;

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
      // Effective mortality includes age-weighted multiplier (matches simulator).
      const effMortality = Math.min(1, vp.mortality * AGE_MORTALITY_FACTOR);
      p.state = Math.random() < effMortality ? 'D' : 'R';
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

/**
 * Playback tick — hybrid model:
 *   1. Each infected agent has its own recovery clock (ticksInfected). When the
 *      clock reaches `recoveryTicks` (= infectious_period × ticks/day), the agent
 *      transitions to R or D based on `effectiveMortality` (rolled per-agent).
 *   2. The active-infected COUNT is matched to the MC trajectory by promoting
 *      S → I as needed each tick.
 *
 * This means agents actually stay sick for the full infectious period (visually
 * lingering in the I state), rather than being instantly flipped to R when the
 * cumulative target says so. Cumulative R and D emerge naturally from the
 * recovery process and end up matching the MC totals on average.
 *
 * @param {Array} agents
 * @param {{W:number, H:number}} world
 * @param {{I:number}} target            target active infected for this tick
 * @param {number} recoveryTicks         infectious_period × ticks/day
 * @param {number} effectiveMortality    P(die | recover) — derived from MC totals
 */
export function scriptedTick(agents, world, target, recoveryTicks, effectiveMortality) {
  // 1) Movement (skip dead)
  for (const p of agents) {
    if (p.state === 'D') continue;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x <= 0 || p.x >= world.W) { p.vx *= -1; p.x = Math.max(0, Math.min(world.W, p.x)); }
    if (p.y <= 0 || p.y >= world.H) { p.vy *= -1; p.y = Math.max(0, Math.min(world.H, p.y)); }
  }

  // 2) Each infected agent's recovery clock advances; transition when it hits
  // recoveryTicks. This is what gives the visual "people stay sick for 10 days"
  // rather than instant flip on cumulative target.
  for (const p of agents) {
    if (p.state !== 'I') continue;
    p.ticksInfected = (p.ticksInfected ?? 0) + 1;
    if (p.ticksInfected >= recoveryTicks) {
      const die = Math.random() < (effectiveMortality ?? 0);
      p.state = die ? 'D' : 'R';
      if (die) { p.vx = 0; p.vy = 0; }
    }
  }

  // 3) Reconcile active-infected count to target by adding new infections from S.
  // We don't drop infected — natural recovery handles the downside of the wave.
  let curI = 0;
  for (const p of agents) if (p.state === 'I') curI++;

  const tgtI = Math.max(0, Math.round(target.I));
  if (curI < tgtI) {
    let need = tgtI - curI;
    for (const p of agents) {
      if (need <= 0) break;
      if (p.state === 'S') {
        p.state = 'I';
        p.ticksInfected = 0;
        need--;
      }
    }
  }

  return agents;
}
