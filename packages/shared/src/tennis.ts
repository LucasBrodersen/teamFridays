// Shared constants for the Tennis activity. Left half = red, right half = blue.
export const TENNIS = {
  COURT_WIDTH: 800,
  COURT_HEIGHT: 500,
  TICK_MS: 50,
  PLAYER_RADIUS: 14,
  /** Units per second. */
  PLAYER_SPEED: 240,
  BALL_RADIUS: 7,
  /** Units per second. */
  BALL_SPEED: 390,
  /** How close the ball must be to swing at it. */
  HIT_REACH: 90,
  HIT_COOLDOWN_TICKS: 5,
  /** Players cannot cross closer than this to the net. */
  NET_MARGIN: 30,
  MAX_PLAYERS: 4,
  GAMES_TO_WIN: 2,
  COUNTDOWN_SECONDS: 3,
  /** A held serve launches itself after this long. */
  AUTO_SERVE_SECONDS: 5,
  /** Freeze between points while the banner shows. */
  POINT_PAUSE_SECONDS: 2,
} as const

export const TENNIS_POINT_LABELS = ['0', '15', '30', '40'] as const
