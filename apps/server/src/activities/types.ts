import type { ActivityAction, ActivityConfig, ActivityType, ActivityView } from '@team-fridays/shared'

export interface Actor {
  id: string
  isHost: boolean
  spectator: boolean
}

export interface ActivityCtx {
  /** Ids of participants who may interact (spectators excluded). */
  activeIds: string[]
}

export interface ActivityDefinition<S = unknown, V extends ActivityView = ActivityView> {
  type: ActivityType
  create(config: ActivityConfig, ctx: ActivityCtx): S
  /** Mutates state. Throws ActivityError on invalid actions. */
  action(state: S, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void
  /**
   * The only data that ever reaches a client. Must redact anything the viewer
   * is not allowed to see yet (unrevealed answers, the lie, live votes).
   */
  view(state: S, viewerId: string | null, ctx: ActivityCtx): V
  /**
   * Optional real-time hook. When present, the room engine calls it every
   * `tickIntervalMs` while the activity runs and broadcasts fresh snapshots
   * whenever it returns true. Turn-based activities simply omit it.
   */
  tick?(state: S, ctx: ActivityCtx): boolean
  tickIntervalMs?: number
}

export class ActivityError extends Error {}

export function requireHost(actor: Actor): void {
  if (!actor.isHost) throw new ActivityError('Only the host can do that')
}

export function requireActive(actor: Actor, ctx: ActivityCtx): void {
  if (actor.spectator || !ctx.activeIds.includes(actor.id))
    throw new ActivityError('You joined mid-activity — you can participate from the next one')
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j] as T, result[i] as T]
  }
  return result
}
