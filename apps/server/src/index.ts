import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { Server, type Socket } from 'socket.io'
import {
  activityActionSchema,
  activityConfigSchema,
  createRoomSchema,
  joinRoomSchema,
  reactionSchema,
  rejoinRoomSchema,
  transferHostSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@team-fridays/shared'
import { z } from 'zod'
import { activityRegistry } from './activities/registry'
import { config } from './config'
import { RoomService } from './roomService'
import { buildSnapshot } from './snapshot'
import { InMemoryRoomStore } from './store'
import { RoomError, type Participant, type Room } from './types'

interface SocketData {
  roomCode?: string
  participantId?: string
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<never, never>, SocketData>

const app = express()
const httpServer = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<never, never>, SocketData>(
  httpServer,
  { cors: { origin: config.corsOrigin } },
)

const store = new InMemoryRoomStore()
const svc = new RoomService(store, { graceMs: config.graceMs, roomTtlMs: config.roomTtlMs })

/** Sockets currently attached to each room, for personalized broadcasts. */
const connections = new Map<string, Set<AppSocket>>()

function roomSockets(code: string): Set<AppSocket> {
  let set = connections.get(code)
  if (!set) {
    set = new Set()
    connections.set(code, set)
  }
  return set
}

function broadcast(room: Room): void {
  for (const socket of roomSockets(room.code)) {
    if (socket.data.participantId)
      socket.emit('room:state', buildSnapshot(svc, room, socket.data.participantId))
  }
}

function closeRoomSockets(code: string): void {
  stopTicker(code)
  for (const socket of roomSockets(code)) {
    socket.emit('room:closed')
    socket.data.roomCode = undefined
    socket.data.participantId = undefined
  }
  connections.delete(code)
}

/**
 * Server loops for real-time activities (those with a tick hook). One interval
 * per room, started on activity:start and stopped whenever the activity or the
 * room goes away.
 */
const tickers = new Map<string, NodeJS.Timeout>()

function startTicker(room: Room): void {
  if (!room.activity || tickers.has(room.code)) return
  const def = activityRegistry[room.activity.type]
  if (!def.tick) return
  tickers.set(
    room.code,
    setInterval(() => {
      const current = store.get(room.code)
      if (!current?.activity) {
        stopTicker(room.code)
        return
      }
      if (svc.tickActivity(current)) broadcast(current)
    }, def.tickIntervalMs ?? 50),
  )
}

function stopTicker(code: string): void {
  const timer = tickers.get(code)
  if (timer) clearInterval(timer)
  tickers.delete(code)
}

function attach(socket: AppSocket, room: Room, participant: Participant): void {
  socket.data.roomCode = room.code
  socket.data.participantId = participant.id
  roomSockets(room.code).add(socket)
}

function detach(socket: AppSocket): void {
  if (socket.data.roomCode) connections.get(socket.data.roomCode)?.delete(socket)
  socket.data.roomCode = undefined
  socket.data.participantId = undefined
}

function errorMessage(err: unknown): string {
  if (err instanceof RoomError) return err.message
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? 'Invalid input'
  console.error(err)
  return 'Something went wrong'
}

function ack<T>(cb: ((res: Ack<T>) => void) | undefined, fn: () => T): void {
  try {
    const data = fn()
    cb?.({ ok: true, data })
  } catch (err) {
    cb?.({ ok: false, error: errorMessage(err) })
  }
}

/** Resolve the socket's current room + participant or throw. */
function located(socket: AppSocket): { room: Room; participantId: string } {
  const { roomCode, participantId } = socket.data
  if (!roomCode || !participantId) throw new RoomError('You are not in a room')
  return { room: svc.getRoom(roomCode), participantId }
}

io.on('connection', (socket: AppSocket) => {
  socket.on('room:create', (payload, cb) =>
    ack(cb, () => {
      const { name } = createRoomSchema.parse(payload)
      const { room, participant } = svc.createRoom(name)
      attach(socket, room, participant)
      broadcast(room)
      return { roomCode: room.code, sessionId: participant.sessionId, participantId: participant.id }
    }),
  )

  socket.on('room:join', (payload, cb) =>
    ack(cb, () => {
      const { roomCode, name } = joinRoomSchema.parse(payload)
      const { room, participant } = svc.join(roomCode, name)
      attach(socket, room, participant)
      broadcast(room)
      return { roomCode: room.code, sessionId: participant.sessionId, participantId: participant.id }
    }),
  )

  socket.on('room:rejoin', (payload, cb) =>
    ack(cb, () => {
      const { roomCode, sessionId } = rejoinRoomSchema.parse(payload)
      const { room, participant } = svc.rejoin(roomCode, sessionId)
      attach(socket, room, participant)
      broadcast(room)
      return { roomCode: room.code, sessionId: participant.sessionId, participantId: participant.id }
    }),
  )

  socket.on('room:leave', (cb) =>
    ack(cb, () => {
      const { room, participantId } = located(socket)
      svc.leave(room, participantId)
      detach(socket)
      if (room.participants.length === 0) {
        store.delete(room.code)
        connections.delete(room.code)
        stopTicker(room.code)
      } else {
        broadcast(room)
      }
      return null
    }),
  )

  socket.on('room:close', (cb) =>
    ack(cb, () => {
      const { room, participantId } = located(socket)
      svc.closeRoom(room, participantId)
      closeRoomSockets(room.code)
      return null
    }),
  )

  socket.on('host:transfer', (payload, cb) =>
    ack(cb, () => {
      const { toParticipantId } = transferHostSchema.parse(payload)
      const { room, participantId } = located(socket)
      svc.transferHost(room, participantId, toParticipantId)
      broadcast(room)
      return null
    }),
  )

  socket.on('activity:start', (payload, cb) =>
    ack(cb, () => {
      const parsed = activityConfigSchema.parse(payload)
      const { room, participantId } = located(socket)
      svc.startActivity(room, parsed, participantId)
      startTicker(room)
      broadcast(room)
      return null
    }),
  )

  socket.on('activity:action', (payload, cb) =>
    ack(cb, () => {
      const action = activityActionSchema.parse(payload)
      const { room, participantId } = located(socket)
      svc.applyActivityAction(room, action, participantId)
      broadcast(room)
      return null
    }),
  )

  socket.on('activity:end', (cb) =>
    ack(cb, () => {
      const { room, participantId } = located(socket)
      svc.endActivity(room, participantId)
      stopTicker(room.code)
      broadcast(room)
      return null
    }),
  )

  socket.on('wheel:spin', (cb) =>
    ack(cb, () => {
      const { room, participantId } = located(socket)
      const winner = svc.pickWheelWinner(room, participantId)
      for (const s of roomSockets(room.code)) s.emit('wheel:result', { participantId: winner.id })
      return null
    }),
  )

  socket.on('reaction:send', (payload) => {
    try {
      const { emoji } = reactionSchema.parse(payload)
      const { room, participantId } = located(socket)
      svc.touch(room)
      for (const s of roomSockets(room.code)) s.emit('reaction', { participantId, emoji })
    } catch {
      // Reactions are fire-and-forget; ignore invalid ones.
    }
  })

  socket.on('disconnect', () => {
    const { roomCode, participantId } = socket.data
    detach(socket)
    if (!roomCode || !participantId) return
    const room = store.get(roomCode)
    if (!room) return
    // The same participant may hold several sockets (extra tab, refresh race);
    // only mark them disconnected when the last one is gone.
    const stillConnected = [...roomSockets(roomCode)].some(
      (s) => s.data.participantId === participantId,
    )
    if (stillConnected) return
    svc.markDisconnected(room, participantId)
    broadcast(room)
  })
})

setInterval(() => {
  const { changed, closedCodes } = svc.sweep()
  for (const code of closedCodes) closeRoomSockets(code)
  for (const room of changed) broadcast(room)
}, config.sweepIntervalMs)

// In production the server also serves the built frontend (single process).
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist')
if (existsSync(webDist)) {
  app.use(express.static(webDist))
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')))
} else {
  app.get('/', (_req, res) => res.json({ ok: true, service: 'team-fridays' }))
}

httpServer.listen(config.port, () => {
  console.log(`Team Fridays server listening on http://localhost:${config.port}`)
})
