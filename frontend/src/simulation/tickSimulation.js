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

// Realism layers added on top of the MC playback:
//   • WANING_RATE_PER_TICK — chance each tick a recovered agent loses immunity
//     and goes back to S (immune waning + variant reinfection).
//     0.002/day ≈ ~50% loss of immunity over a year.
//   • EXTERNAL_IMPORT_PROB — chance per tick that an outsider arrives infected
//     (travel, animal reservoir, unmasked pocket). Creates sporadic post-wave
//     spikes WITHOUT swamping the MC wave shape.
//     0.1/day → about 1 import every 10 days on average.
const WANING_RATE_PER_TICK = 0.002 / TICKS_PER_DAY;
const EXTERNAL_IMPORT_PROB = 0.1 / TICKS_PER_DAY;

// COVID's 10-day infectious period scaled to ticks. Used as a default recovery
// clock for I agents — they actually stay sick for ~10 simulated days before
// recovering, instead of being instantly flipped by cumulative reconciliation.
const DEFAULT_RECOVERY_TICKS = 10 * TICKS_PER_DAY;

/**
 * Playback tick — agents follow these rules:
 *   1. Move (skip dead)
 *   2. Each I agent's recovery clock advances; once reached, transition to R
 *      (deaths handled separately via cumulative D target)
 *   3. Random R → S immune waning
 *   4. Random external import: outsider arrives infected (capped so curI never
 *      exceeds `importCeiling` — keeps post-wave noise below the actual peak)
 *   5. Cumulative D target reconciled (matches MC's predicted total deaths)
 *   6. S → I to bring active count UP to MC target.I (never down — natural
 *      recovery in step 2 handles the wave's downside)
 *
 * The wave shape comes from the MC trajectory. Imports + waning provide the
 * post-wave realism (sporadic cases, gradual reinfection).
 *
 * @param {Array} agents
 * @param {{W:number, H:number}} world
 * @param {{I:number, R:number, D:number}} target
 * @param {number} [importCeiling=Infinity]  active-I count above which imports
 *   are skipped — typically 80% of MC peak so post-wave noise can't approach
 *   the actual peak.
 */
export function scriptedTick(agents, world, target, importCeiling = Infinity) {
  // 1) Movement
  for (const p of agents) {
    if (p.state === 'D') continue;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x <= 0 || p.x >= world.W) { p.vx *= -1; p.x = Math.max(0, Math.min(world.W, p.x)); }
    if (p.y <= 0 || p.y >= world.H) { p.vy *= -1; p.y = Math.max(0, Math.min(world.H, p.y)); }
  }

  // 2) Recovery clocks — I → R after the infectious period
  for (const p of agents) {
    if (p.state !== 'I') continue;
    p.ticksInfected = (p.ticksInfected ?? 0) + 1;
    if (p.ticksInfected >= DEFAULT_RECOVERY_TICKS) {
      p.state = 'R';
    }
  }

  // 3) Immune waning — small chance R → S each tick
  if (WANING_RATE_PER_TICK > 0) {
    for (const p of agents) {
      if (p.state === 'R' && Math.random() < WANING_RATE_PER_TICK) {
        p.state = 'S';
        p.ticksInfected = 0;
      }
    }
  }

  // 4) External imports — random outsider arrivals, capped at importCeiling so
  // post-wave noise can't push us back near the actual peak.
  if (EXTERNAL_IMPORT_PROB > 0 && Math.random() < EXTERNAL_IMPORT_PROB) {
    let curI = 0;
    for (const p of agents) if (p.state === 'I') curI++;
    if (curI < importCeiling) {
      const susceptibleIdxs = [];
      for (let i = 0; i < agents.length; i++) {
        if (agents[i].state === 'S') susceptibleIdxs.push(i);
      }
      if (susceptibleIdxs.length > 0) {
        const pick = susceptibleIdxs[Math.floor(Math.random() * susceptibleIdxs.length)];
        agents[pick].state = 'I';
        agents[pick].ticksInfected = 0;
      }
    }
  }

  // 5) Cumulative D target (only grows). Prefer turning existing I → D.
  let curD = 0, curI = 0;
  for (const p of agents) {
    if (p.state === 'D') curD++;
    else if (p.state === 'I') curI++;
  }
  const tgtD = Math.max(0, Math.round(target.D));
  let needD = Math.max(0, tgtD - curD);
  if (needD > 0) {
    for (const p of agents) {
      if (needD <= 0) break;
      if (p.state === 'I') {
        p.state = 'D'; p.vx = 0; p.vy = 0;
        needD--; curI--;
      }
    }
    for (const p of agents) {
      if (needD <= 0) break;
      if (p.state === 'R') {
        p.state = 'D'; p.vx = 0; p.vy = 0;
        needD--;
      }
    }
  }

  // 6) S → I if active count is below the MC target. We DO NOT drop excess I —
  // natural recovery (step 2) handles the wave's downside, and imports persist.
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
