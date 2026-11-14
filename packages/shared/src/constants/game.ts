export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const MAX_PLAYERS_PER_RACE = 4;

export const ROAD = {
  laneWidth: 3.6,
  laneCount: 4,
  /** Half width of the paved driving lanes. */
  halfWidth: 7.2,
  /** Half width including the paved shoulder. */
  shoulderHalfWidth: 8.8,
  /** Lateral offset of the guard rails. */
  barrierOffset: 9.4,
} as const;

/** Lane centers, left to right. Lanes 0-1 carry oncoming traffic, 2-3 flow with the race. */
export const LANE_CENTERS = [-5.4, -1.8, 1.8, 5.4] as const;
export const LANE_DIRECTION = [-1, -1, 1, 1] as const;

export const BIKE_SIZE = { length: 2.1, width: 0.8 } as const;

export const PHYSICS = {
  gravity: 9.81,
  coastDrag: 1.2,
  airDrag: 0.0004,
  /** Fraction of centripetal acceleration that pushes the bike to the outside of a curve. */
  curveDrift: 0.22,
  offroadSpeedFactor: 0.55,
  offroadDrag: 6,
  nitroBurnRate: 28,
  nitroRegenRate: 1.5,
  nitroAcceleration: 9,
  nitroTopSpeedMultiplier: 1.28,
  startingNitro: 50,
  maxHealth: 100,
  crashDuration: 3,
  respawnInvulnerability: 2,
  hitInvulnerability: 0.6,
  nearMissMaxGap: 1.3,
  nearMissMinRelativeSpeed: 12,
  nearMissNitroBonus: 8,
  nearMissScore: 100,
  comboWindow: 4,
  maxCombo: 8,
} as const;

export const TRAFFIC_DENSITY = {
  low: 18,
  medium: 30,
  high: 44,
} as const;

export type TrafficDensity = keyof typeof TRAFFIC_DENSITY;
