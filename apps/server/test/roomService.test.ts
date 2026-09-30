import { describe, expect, it } from 'vitest'
import { RoomService } from '../src/roomService'
import { InMemoryRoomStore } from '../src/store'
import { RoomError } from '../src/types'

const GRACE = 120_000
const TTL = 2 * 60 * 60_000

function setup() {
  const store = new InMemoryRoomStore()
  const svc = new RoomService(store, { graceMs: GRACE, roomTtlMs: TTL })
  return { store, svc }
}

describe('room lifecycle', () => {
  it('creates a room with a valid code and a connected host', () => {
    const { svc } = setup()
    const { room, participant } = svc.createRoom('Lucas')
    expect(room.code).toMatch(/^FRI-[A-Z2-9]{4}$/)
    expect(participant.isHost).toBe(true)
    expect(participant.connected).toBe(true)
  })

  it('rejects duplicate names case-insensitively', () => {
    const { svc } = setup()
    const { room } = svc.createRoom('Lucas')
    svc.join(room.code, 'Ana')
    expect(() => svc.join(room.code, 'ana')).toThrow(RoomError)
  })

  it('restores the same participant (and host role) on rejoin', () => {
    const { svc } = setup()
    const { room, participant } = svc.createRoom('Lucas')
    svc.markDisconnected(room, participant.id)
    const { participant: restored } = svc.rejoin(room.code, participant.sessionId)
    expect(restored.id).toBe(participant.id)
    expect(restored.isHost).toBe(true)
    expect(restored.connected).toBe(true)
  })

  it('rejects rejoin with an unknown session', () => {
    const { svc } = setup()
    const { room } = svc.createRoom('Lucas')
    expect(() => svc.rejoin(room.code, 'not-a-real-session-id')).toThrow(RoomError)
  })

  it('marks participants spectator when joining mid-activity, cleared on activity end', () => {
    const { svc } = setup()
    const { room, participant: host } = svc.createRoom('Lucas')
    svc.join(room.code, 'Ana')
    svc.startActivity(room, { type: 'icebreaker' }, host.id)
    const { participant: late } = svc.join(room.code, 'Ben')
    expect(late.spectator).toBe(true)
    svc.endActivity(room, host.id)
    expect(room.participants.find((p) => p.id === late.id)?.spectator).toBe(false)
  })
})

describe('sweep', () => {
  it('keeps disconnected participants during the grace period', () => {
    const { svc } = setup()
    const { room } = svc.createRoom('Lucas')
    const { participant: ana } = svc.join(room.code, 'Ana')
    svc.markDisconnected(room, ana.id)
    svc.sweep(Date.now() + GRACE - 1000)
    expect(room.participants).toHaveLength(2)
  })

  it('removes participants after the grace period in the lobby', () => {
    const { svc } = setup()
    const { room } = svc.createRoom('Lucas')
    const { participant: ana } = svc.join(room.code, 'Ana')
    svc.markDisconnected(room, ana.id)
    svc.sweep(Date.now() + GRACE + 1000)
    expect(room.participants.map((p) => p.name)).toEqual(['Lucas'])
  })

  it('does NOT remove disconnected participants while an activity is running', () => {
    const { svc } = setup()
    const { room, participant: host } = svc.createRoom('Lucas')
    const { participant: ana } = svc.join(room.code, 'Ana')
    svc.startActivity(room, { type: 'icebreaker' }, host.id)
    svc.markDisconnected(room, ana.id)
    svc.sweep(Date.now() + GRACE + 1000)
    expect(room.participants).toHaveLength(2)
  })

  it('promotes the earliest-joined connected participant when the host is gone past grace', () => {
    const { svc } = setup()
    const { room, participant: host } = svc.createRoom('Lucas')
    const { participant: ana } = svc.join(room.code, 'Ana')
    svc.join(room.code, 'Ben')
    svc.markDisconnected(room, host.id)
    svc.sweep(Date.now() + GRACE + 1000)
    const newHost = room.participants.find((p) => p.isHost)
    expect(newHost?.id).toBe(ana.id)
  })

  it('closes rooms when everyone is gone past grace', () => {
    const { store, svc } = setup()
    const { room, participant } = svc.createRoom('Lucas')
    svc.markDisconnected(room, participant.id)
    const { closedCodes } = svc.sweep(Date.now() + GRACE + 1000)
    expect(closedCodes).toContain(room.code)
    expect(store.get(room.code)).toBeUndefined()
  })

  it('closes rooms idle past the TTL', () => {
    const { store, svc } = setup()
    const { room } = svc.createRoom('Lucas')
    svc.sweep(Date.now() + TTL + 1000)
    expect(store.get(room.code)).toBeUndefined()
  })
})

describe('host controls', () => {
  it('allows manual host transfer, host-only', () => {
    const { svc } = setup()
    const { room, participant: host } = svc.createRoom('Lucas')
    const { participant: ana } = svc.join(room.code, 'Ana')
    expect(() => svc.transferHost(room, ana.id, ana.id)).toThrow(RoomError)
    svc.transferHost(room, host.id, ana.id)
    expect(room.participants.find((p) => p.isHost)?.id).toBe(ana.id)
  })

  it('only the host can start, end, and close', () => {
    const { svc } = setup()
    const { room, participant: host } = svc.createRoom('Lucas')
    const { participant: ana } = svc.join(room.code, 'Ana')
    expect(() =>
      svc.startActivity(room, { type: 'icebreaker' }, ana.id),
    ).toThrow(RoomError)
    svc.startActivity(room, { type: 'icebreaker' }, host.id)
    expect(() => svc.endActivity(room, ana.id)).toThrow(RoomError)
    expect(() => svc.closeRoom(room, ana.id)).toThrow(RoomError)
  })

  it('refuses to start an activity while one is running', () => {
    const { svc } = setup()
    const { room, participant: host } = svc.createRoom('Lucas')
    svc.startActivity(room, { type: 'icebreaker' }, host.id)
    expect(() => svc.startActivity(room, { type: 'two-truths' }, host.id)).toThrow(RoomError)
  })
})
