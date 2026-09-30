import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@team-fridays/shared'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null

export function getSocket(): AppSocket {
  if (!socket) {
    // Dev runs web (5173) and server (3001) separately; in production the
    // server serves the built frontend, so the socket targets the same origin.
    const url = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : undefined)
    socket = url
      ? io(url, { transports: ['websocket', 'polling'] })
      : io({ transports: ['websocket', 'polling'] })
  }
  return socket
}
