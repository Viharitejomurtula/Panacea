export const WORLD = { W: 1000, H: 600 };

// 4 ticks per simulated day, run 2 steps/frame → 365 days ≈ 12 seconds real time
export const TICKS_PER_DAY = 4;

// Chandler, AZ — flat landlocked suburb with grid streets, no water features
export const MAP_BOUNDS = {
  lonMin: -111.95,
  lonMax: -111.73,
  latMin: 33.24,
  latMax: 33.38,
};

export const INITIAL_VIEW = {
  longitude: -111.84,
  latitude: 33.31,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};
