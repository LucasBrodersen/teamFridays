import type { ActivityAction, ActivityConfig, RoomSnapshot } from './types'

export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: string }

export interface JoinResult {
  roomCode: string
  sessionId: string
  participantId: string
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void
  'room:closed': () => void
  reaction: (payload: { participantId: string; emoji: string }) => void
  'wheel:result': (payload: { participantId: string }) => void
}

export interface ClientToServerEvents {
  'room:create': (payload: { name: string }, cb: (res: Ack<JoinResult>) => void) => void
  'room:join': (
    payload: { roomCode: string; name: string },
    cb: (res: Ack<JoinResult>) => void,
  ) => void
  'room:rejoin': (
    payload: { roomCode: string; sessionId: string },
    cb: (res: Ack<JoinResult>) => void,
  ) => void
  'room:leave': (cb: (res: Ack) => void) => void
  'room:close': (cb: (res: Ack) => void) => void
  'host:transfer': (payload: { toParticipantId: string }, cb: (res: Ack) => void) => void
  'activity:start': (config: ActivityConfig, cb: (res: Ack) => void) => void
  'activity:action': (action: ActivityAction, cb: (res: Ack) => void) => void
  'activity:end': (cb: (res: Ack) => void) => void
  'wheel:spin': (cb: (res: Ack) => void) => void
  'reaction:send': (payload: { emoji: string }) => void
}
