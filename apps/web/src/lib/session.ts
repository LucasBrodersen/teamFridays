export interface StoredSession {
  sessionId: string
  participantId: string
  name: string
}

const key = (roomCode: string) => `team-fridays:${roomCode}`

export function saveSession(roomCode: string, session: StoredSession): void {
  localStorage.setItem(key(roomCode), JSON.stringify(session))
}

export function loadSession(roomCode: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(key(roomCode))
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function clearSession(roomCode: string): void {
  localStorage.removeItem(key(roomCode))
}
