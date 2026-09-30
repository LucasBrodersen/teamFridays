import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  Ack,
  ActivityAction,
  ActivityConfig,
  JoinResult,
  PublicParticipant,
  RoomSnapshot,
} from '@team-fridays/shared'
import { getSocket, type AppSocket } from '../lib/socket'
import { clearSession, loadSession, saveSession } from '../lib/session'
import { useToastsStore } from './toasts'

export interface FloatingReaction {
  id: number
  emoji: string
  name: string
  x: number
}

let reactionId = 1

export const useRoomStore = defineStore('room', () => {
  const snapshot = ref<RoomSnapshot | null>(null)
  const connected = ref(false)
  const roomClosed = ref(false)
  const reactions = ref<FloatingReaction[]>([])
  const wheelWinnerId = ref<string | null>(null)

  const you = computed(() => snapshot.value?.you ?? null)
  const isHost = computed(() => you.value?.isHost ?? false)
  const participants = computed(() => snapshot.value?.participants ?? [])
  const participantById = computed(() => {
    const map = new Map<string, PublicParticipant>()
    for (const p of participants.value) map.set(p.id, p)
    return map
  })

  function nameOf(participantId: string): string {
    return participantById.value.get(participantId)?.name ?? 'Someone who left'
  }

  let bound = false
  function socket(): AppSocket {
    const s = getSocket()
    if (!bound) {
      bound = true
      s.on('connect', () => {
        connected.value = true
        // Silent re-attach after a drop: the server keeps our participant
        // during the grace period, we just need to claim it again.
        const code = snapshot.value?.code
        if (code) {
          const session = loadSession(code)
          if (session)
            s.emit('room:rejoin', { roomCode: code, sessionId: session.sessionId }, () => {})
        }
      })
      s.on('disconnect', () => {
        connected.value = false
      })
      s.on('room:state', (snap) => {
        snapshot.value = snap
      })
      s.on('room:closed', () => {
        const code = snapshot.value?.code
        if (code) clearSession(code)
        snapshot.value = null
        roomClosed.value = true
      })
      s.on('reaction', ({ participantId, emoji }) => {
        const item: FloatingReaction = {
          id: reactionId++,
          emoji,
          name: nameOf(participantId),
          x: 10 + Math.random() * 80,
        }
        reactions.value.push(item)
        setTimeout(() => {
          reactions.value = reactions.value.filter((r) => r.id !== item.id)
        }, 2600)
      })
      s.on('wheel:result', ({ participantId }) => {
        wheelWinnerId.value = participantId
      })
    }
    return s
  }

  function emitAck<TPayload, TResult>(
    event: string,
    payload: TPayload | undefined,
  ): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const s = socket() as unknown as {
        emit: (event: string, ...args: unknown[]) => void
      }
      const cb = (res: Ack<TResult>) => {
        if (res.ok) resolve(res.data)
        else reject(new Error(res.error))
      }
      if (payload === undefined) s.emit(event, cb)
      else s.emit(event, payload, cb)
    })
  }

  async function createRoom(name: string): Promise<string> {
    const result = await emitAck<{ name: string }, JoinResult>('room:create', { name })
    saveSession(result.roomCode, { ...result, name })
    roomClosed.value = false
    return result.roomCode
  }

  async function join(roomCode: string, name: string): Promise<void> {
    const result = await emitAck<{ roomCode: string; name: string }, JoinResult>('room:join', {
      roomCode,
      name,
    })
    saveSession(result.roomCode, { ...result, name })
    roomClosed.value = false
  }

  /** Returns false when there is no stored session or it is no longer valid. */
  async function tryRejoin(roomCode: string): Promise<boolean> {
    const session = loadSession(roomCode)
    if (!session) return false
    try {
      await emitAck<{ roomCode: string; sessionId: string }, JoinResult>('room:rejoin', {
        roomCode,
        sessionId: session.sessionId,
      })
      roomClosed.value = false
      return true
    } catch {
      clearSession(roomCode)
      return false
    }
  }

  async function leave(): Promise<void> {
    const code = snapshot.value?.code
    try {
      await emitAck('room:leave', undefined)
    } catch {
      // Leaving a dead room is fine.
    }
    if (code) clearSession(code)
    snapshot.value = null
  }

  const toasts = useToastsStore()

  async function guarded(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn()
    } catch (err) {
      toasts.push(err instanceof Error ? err.message : 'Something went wrong', 'error')
    }
  }

  const closeRoom = () => guarded(() => emitAck('room:close', undefined))
  const transferHost = (toParticipantId: string) =>
    guarded(() => emitAck('host:transfer', { toParticipantId }))
  const startActivity = (config: ActivityConfig) =>
    guarded(() => emitAck('activity:start', config))
  const sendAction = (action: ActivityAction) => guarded(() => emitAck('activity:action', action))
  const endActivity = () => guarded(() => emitAck('activity:end', undefined))
  const spinWheel = () => guarded(() => emitAck('wheel:spin', undefined))

  function react(emoji: string): void {
    socket().emit('reaction:send', { emoji })
  }

  function clearWheel(): void {
    wheelWinnerId.value = null
  }

  return {
    snapshot,
    connected,
    roomClosed,
    reactions,
    wheelWinnerId,
    you,
    isHost,
    participants,
    nameOf,
    createRoom,
    join,
    tryRejoin,
    leave,
    closeRoom,
    transferHost,
    startActivity,
    sendAction,
    endActivity,
    spinWheel,
    react,
    clearWheel,
  }
})
