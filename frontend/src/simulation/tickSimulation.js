const CELL_SIZE = 25;
const INFECTION_RADIUS_SQ = 22 * 22;
const INFECTION_PROB = 0.0012;
const RECOVERY_TICKS = 480;

export function tickSimulation(agents, world) {
  const gridW = Math.ceil(world.W / CELL_SIZE);
  const gridH = Math.ceil(world.H / CELL_SIZE);
  const grid = new Array(gridW * gridH).fill(null).map(() => []);

  for (const p of agents) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x <= 0 || p.x >= world.W) { p.vx *= -1; p.x = Math.max(0, Math.min(world.W, p.x)); }
    if (p.y <= 0 || p.y >= world.H) { p.vy *= -1; p.y = Math.max(0, Math.min(world.H, p.y)); }

    const cx = Math.min(Math.floor(p.x / CELL_SIZE), gridW - 1);
    const cy = Math.min(Math.floor(p.y / CELL_SIZE), gridH - 1);
    grid[cy * gridW + cx].push(p);
  }

  for (const p of agents) {
    if (p.state !== 'I') continue;

    p.ticksInfected = (p.ticksInfected ?? 0) + 1;
    if (p.ticksInfected >= RECOVERY_TICKS) {
      p.state = 'R';
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
          if (d2 < INFECTION_RADIUS_SQ && Math.random() < INFECTION_PROB) {
            other.state = 'I';
            other.ticksInfected = 0;
          }
        }
      }
    }
  }

  return agents;
}
