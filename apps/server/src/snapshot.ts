import type { RoomSnapshot } from '@team-fridays/shared'
import { activityRegistry } from './activities/registry'
import type { RoomService } from './roomService'
import type { Room } from './types'

export function buildSnapshot(svc: RoomService, room: Room, viewerId: string): RoomSnapshot {
  const viewer = room.participants.find((p) => p.id === viewerId)
  return {
    code: room.code,
    you: {
      participantId: viewerId,
      isHost: viewer?.isHost ?? false,
      spectator: viewer?.spectator ?? false,
    },
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      spectator: p.spectator,
    })),
    activity: room.activity
      ? activityRegistry[room.activity.type].view(
          room.activity.state as never,
          viewerId,
          svc.activityCtx(room),
        )
      : null,
  }
}
