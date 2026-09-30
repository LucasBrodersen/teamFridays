import 'dotenv/config'

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  port: intEnv('PORT', 3001),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  roomTtlMs: intEnv('ROOM_TTL_MINUTES', 120) * 60_000,
  graceMs: intEnv('GRACE_PERIOD_SECONDS', 120) * 1_000,
  sweepIntervalMs: 15_000,
}
