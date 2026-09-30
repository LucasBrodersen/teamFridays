import type { ActivityType } from '@team-fridays/shared'

export interface Participant {
  id: string
  sessionId: string
  name: string
  isHost: boolean
  connected: boolean
  disconnectedAt: number | null
  joinedAt: number
  /** Joined while an activity was running; watches but cannot participate until the next one. */
  spectator: boolean
}

export interface ActiveActivity {
  type: ActivityType
  state: unknown
}

export interface Room {
  code: string
  participants: Participant[]
  activity: ActiveActivity | null
  createdAt: number
  lastTouchedAt: number
}

/** User-facing error: its message is safe to send back in an ack. */
export class RoomError extends Error {}
