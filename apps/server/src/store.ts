import type { Room } from './types'

export interface RoomStore {
  create(room: Room): void
  get(code: string): Room | undefined
  delete(code: string): void
  all(): Room[]
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>()

  create(room: Room): void {
    this.rooms.set(room.code, room)
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  delete(code: string): void {
    this.rooms.delete(code)
  }

  all(): Room[] {
    return [...this.rooms.values()]
  }
}
