<script setup lang="ts">
import { REACTION_EMOJIS } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'

const room = useRoomStore()
</script>

<template>
  <div class="bar" aria-label="Send a reaction">
    <button
      v-for="emoji in REACTION_EMOJIS"
      :key="emoji"
      class="emoji"
      :aria-label="`React with ${emoji}`"
      @click="room.react(emoji)"
    >
      {{ emoji }}
    </button>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.emoji {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-full);
  width: 36px;
  height: 36px;
  font-size: var(--font-size-md);
  cursor: pointer;
  transition: transform var(--motion-fast) var(--motion-ease);
}
.emoji:hover {
  transform: scale(1.15);
  border-color: var(--color-border-strong);
}
</style>
