// Shared constants for the Snowball Fight activity. The server simulates with
// these; the client only uses them for rendering and input mapping.
export const SNOWFIGHT = {
  ARENA_WIDTH: 800,
  ARENA_HEIGHT: 500,
  TICK_MS: 50,
  PLAYER_RADIUS: 16,
  /** Units per second. */
  PLAYER_SPEED: 180,
  BALL_RADIUS: 6,
  /** Units per second. */
  BALL_SPEED: 420,
  THROW_COOLDOWN_TICKS: 16,
  MAX_HP: 2,
  ROUND_SECONDS: 120,
  COUNTDOWN_SECONDS: 3,
  BARRIER_BUILD_SECONDS: 5,
  BARRIER_HP: 3,
  BARRIER_WIDTH: 14,
  BARRIER_HEIGHT: 90,
  /** Distance from the builder toward the enemy side. */
  BARRIER_OFFSET: 48,
} as const

export type SnowfightTeam = 'red' | 'blue'
