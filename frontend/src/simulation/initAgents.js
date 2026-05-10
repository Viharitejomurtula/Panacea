// Initial infected count. Spatial sim plays back the Monte Carlo trajectory,
// so this is just the visible starting state — the playback layer overrides it
// to match the surrogate's day-0 prediction once MC results arrive.
const INITIAL_INFECTED = 12;

export function initAgents(count, world) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * world.W,
    y: Math.random() * world.H,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    state: i < INITIAL_INFECTED ? 'I' : 'S',
    ticksInfected: 0,
  }));
}
