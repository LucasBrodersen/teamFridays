<script setup lang="ts">
import { useRoomStore } from '../../stores/room'

const room = useRoomStore()
</script>

<template>
  <div class="overlay" aria-hidden="true">
    <div
      v-for="r in room.reactions"
      :key="r.id"
      class="float"
      :style="{ left: `${r.x}%` }"
    >
      <span class="emoji">{{ r.emoji }}</span>
      <span class="who">{{ r.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 50;
}
.float {
  position: absolute;
  bottom: 10%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  animation: rise 2.5s var(--motion-ease) forwards;
}
.emoji {
  font-size: var(--font-size-3xl);
}
.who {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-radius: var(--radius-full);
  padding: 0 var(--space-2);
  box-shadow: var(--shadow-sm);
}
@keyframes rise {
  0% {
    transform: translateY(0) scale(0.8);
    opacity: 0;
  }
  15% {
    opacity: 1;
    transform: translateY(-8vh) scale(1);
  }
  100% {
    transform: translateY(-55vh) scale(1.05);
    opacity: 0;
  }
}
</style>
