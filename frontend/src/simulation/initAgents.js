export function initAgents(count, world) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * world.W,
    y: Math.random() * world.H,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    state: i < 12 ? 'I' : 'S',
    ticksInfected: i < 12 ? 0 : 0,
  }));
}
