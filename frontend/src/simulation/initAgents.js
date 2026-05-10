// Spatial sim plays back the Monte Carlo trajectory; day-0 infected count is
// driven by the MC's predicted trajectory[0], so we start with everyone S.
export function initAgents(count, world) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * world.W,
    y: Math.random() * world.H,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    state: 'S',
    ticksInfected: 0,
  }));
}
