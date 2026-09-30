import { randomUUID } from 'node:crypto'
import type { ActivityAction, ActivityConfig } from '@team-fridays/shared'
import { activityRegistry } from './activities/registry'
import { ActivityError, type ActivityCtx, type Actor } from './activities/types'
import type { RoomStore } from './store'
import { RoomError, type Participant, type Room } from './types'

// No ambiguous characters (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface RoomServiceOptions {
  graceMs: number
  roomTtlMs: number
}

export interface SweepResult {
  changed: Room[]
  closedCodes: string[]
}

export class RoomService {
  constructor(
    private store: RoomStore,
    private opts: RoomServiceOptions,
  ) {}

  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let suffix = ''
      for (let i = 0; i < 4; i++)
        suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      const code = `FRI-${suffix}`
      if (!this.store.get(code)) return code
    }
    throw new RoomError('Could not allocate a room code')
  }

  private makeParticipant(name: string, isHost: boolean, spectator: boolean): Participant {
    return {
      id: randomUUID(),
      sessionId: randomUUID(),
      name,
      isHost,
      connected: true,
      disconnectedAt: null,
      joinedAt: Date.now(),
      spectator,
    }
  }

  getRoom(code: string): Room {
    const room = this.store.get(code)
    if (!room) throw new RoomError('Room not found — it may have been closed')
    return room
  }

  touch(room: Room): void {
    room.lastTouchedAt = Date.now()
  }

  createRoom(hostName: string): { room: Room; participant: Participant } {
    const participant = this.makeParticipant(hostName, true, false)
    const room: Room = {
      code: this.generateCode(),
      participants: [participant],
      activity: null,
      createdAt: Date.now(),
      lastTouchedAt: Date.now(),
    }
    this.store.create(room)
    return { room, participant }
  }

  join(code: string, name: string): { room: Room; participant: Participant } {
    const room = this.getRoom(code)
    const taken = room.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())
    if (taken) throw new RoomError('That name is already taken in this room')
    const participant = this.makeParticipant(name, false, room.activity !== null)
    room.participants.push(participant)
    this.touch(room)
    return { room, participant }
  }

  rejoin(code: string, sessionId: string): { room: Room; participant: Participant } {
    const room = this.getRoom(code)
    const participant = room.participants.find((p) => p.sessionId === sessionId)
    if (!participant) throw new RoomError('Session expired — join again with your name')
    participant.connected = true
    participant.disconnectedAt = null
    this.touch(room)
    return { room, participant }
  }

  markDisconnected(room: Room, participantId: string): void {
    const participant = room.participants.find((p) => p.id === participantId)
    if (!participant) return
    participant.connected = false
    participant.disconnectedAt = Date.now()
  }

  leave(room: Room, participantId: string): void {
    const leaving = room.participants.find((p) => p.id === participantId)
    room.participants = room.participants.filter((p) => p.id !== participantId)
    if (leaving?.isHost) this.promoteFallbackHost(room)
    this.touch(room)
  }

  transferHost(room: Room, byId: string, toId: string): void {
    const from = room.participants.find((p) => p.id === byId)
    if (!from?.isHost) throw new RoomError('Only the host can transfer the host role')
    const to = room.participants.find((p) => p.id === toId)
    if (!to) throw new RoomError('Participant not found')
    if (to.id === from.id) return
    from.isHost = false
    to.isHost = true
    this.touch(room)
  }

  closeRoom(room: Room, byId: string): void {
    const by = room.participants.find((p) => p.id === byId)
    if (!by?.isHost) throw new RoomError('Only the host can close the room')
    this.store.delete(room.code)
  }

  private promoteFallbackHost(room: Room): boolean {
    if (room.participants.some((p) => p.isHost)) return false
    const candidate = room.participants
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0]
    if (!candidate) return false
    candidate.isHost = true
    return true
  }

  /**
   * Periodic maintenance: promote a new host if the host has been gone past the
   * grace period, drop long-disconnected participants (lobby only, so running
   * activities keep name resolution intact), and close empty or expired rooms.
   */
  sweep(now: number = Date.now()): SweepResult {
    const changed: Room[] = []
    const closedCodes: string[] = []
    for (const room of this.store.all()) {
      let dirty = false

      const host = room.participants.find((p) => p.isHost)
      if (
        host &&
        !host.connected &&
        host.disconnectedAt !== null &&
        now - host.disconnectedAt > this.opts.graceMs
      ) {
        const candidate = room.participants
          .filter((p) => p.connected)
          .sort((a, b) => a.joinedAt - b.joinedAt)[0]
        if (candidate) {
          host.isHost = false
          candidate.isHost = true
          dirty = true
        }
      }

      if (room.activity === null) {
        const before = room.participants.length
        room.participants = room.participants.filter(
          (p) =>
            p.connected ||
            p.disconnectedAt === null ||
            now - p.disconnectedAt <= this.opts.graceMs,
        )
        if (room.participants.length !== before) {
          this.promoteFallbackHost(room)
          dirty = true
        }
      }

      const allGone =
        room.participants.length === 0 ||
        room.participants.every(
          (p) =>
            !p.connected &&
            p.disconnectedAt !== null &&
            now - p.disconnectedAt > this.opts.graceMs,
        )
      const expired = now - room.lastTouchedAt > this.opts.roomTtlMs
      if (allGone || expired) {
        this.store.delete(room.code)
        closedCodes.push(room.code)
        continue
      }

      if (dirty) changed.push(room)
    }
    return { changed, closedCodes }
  }

  // ---------- Activities ----------

  activityCtx(room: Room): ActivityCtx {
    return { activeIds: room.participants.filter((p) => !p.spectator).map((p) => p.id) }
  }

  private actor(room: Room, participantId: string): Actor {
    const p = room.participants.find((x) => x.id === participantId)
    if (!p) throw new RoomError('You are not in this room')
    return { id: p.id, isHost: p.isHost, spectator: p.spectator }
  }

  startActivity(room: Room, config: ActivityConfig, byId: string): void {
    const actor = this.actor(room, byId)
    if (!actor.isHost) throw new RoomError('Only the host can start an activity')
    if (room.activity) throw new RoomError('End the current activity first')
    const def = activityRegistry[config.type]
    if (!def) throw new RoomError('Unknown activity')
    room.activity = { type: config.type, state: def.create(config, this.activityCtx(room)) }
    this.touch(room)
  }

  applyActivityAction(room: Room, action: ActivityAction, byId: string): void {
    if (!room.activity) throw new RoomError('No activity is running')
    const def = activityRegistry[room.activity.type]
    try {
      def.action(room.activity.state as never, action, this.actor(room, byId), this.activityCtx(room))
    } catch (err) {
      if (err instanceof ActivityError) throw new RoomError(err.message)
      throw err
    }
    this.touch(room)
  }

  /** Advances a real-time activity one step. Returns whether clients need an update. */
  tickActivity(room: Room): boolean {
    if (!room.activity) return false
    const def = activityRegistry[room.activity.type]
    if (!def.tick) return false
    return def.tick(room.activity.state as never, this.activityCtx(room))
  }

  endActivity(room: Room, byId: string): void {
    const actor = this.actor(room, byId)
    if (!actor.isHost) throw new RoomError('Only the host can end an activity')
    room.activity = null
    // Mid-activity joiners become full participants for the next activity.
    for (const p of room.participants) p.spectator = false
    this.touch(room)
  }

  pickWheelWinner(room: Room, byId: string): Participant {
    const actor = this.actor(room, byId)
    if (!actor.isHost) throw new RoomError('Only the host can spin the wheel')
    const candidates = room.participants.filter((p) => p.connected && !p.spectator)
    if (candidates.length === 0) throw new RoomError('Nobody to pick from')
    const winner = candidates[Math.floor(Math.random() * candidates.length)]
    this.touch(room)
    return winner as Participant
  }
}
