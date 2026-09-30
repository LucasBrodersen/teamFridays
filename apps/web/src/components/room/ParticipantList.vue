<script setup lang="ts">
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'

const room = useRoomStore()
</script>

<template>
  <div class="list">
    <h3 class="heading">Participants ({{ room.participants.length }})</h3>
    <ul class="items" aria-live="polite">
      <li v-for="p in room.participants" :key="p.id" class="item">
        <UiAvatar :name="p.name" size="sm" :muted="!p.connected" />
        <span class="name" :class="{ offline: !p.connected }">
          {{ p.name }}<template v-if="p.id === room.you?.participantId"> (you)</template>
        </span>
        <span class="tags">
          <UiBadge v-if="p.isHost" variant="accent">Host</UiBadge>
          <UiBadge v-if="p.spectator" variant="neutral">Next round</UiBadge>
          <UiBadge v-if="!p.connected" variant="danger">Offline</UiBadge>
        </span>
        <button
          v-if="room.isHost && !p.isHost && p.connected"
          class="transfer"
          :title="`Make ${p.name} the host`"
          @click="room.transferHost(p.id)"
        >
          Make host
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.heading {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 28px;
}
.name {
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.offline {
  color: var(--color-text-faint);
}
.tags {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
}
.transfer {
  border: none;
  background: transparent;
  color: var(--color-text-faint);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: 0;
}
.item:hover .transfer {
  color: var(--color-accent);
}
</style>
