<script setup lang="ts">
import { useToastsStore } from './stores/toasts'

const toasts = useToastsStore()
</script>

<template>
  <RouterView />
  <div class="toasts" aria-live="assertive">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts.toasts" :key="toast.id" class="toast" :class="toast.kind">
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 200;
  align-items: center;
}
.toast {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-text);
  color: var(--color-surface);
  font-size: var(--font-size-sm);
  box-shadow: var(--shadow-md);
}
.toast.error {
  background: var(--color-danger);
  color: var(--color-on-accent);
}
.toast.success {
  background: var(--color-success);
  color: var(--color-on-accent);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-normal) var(--motion-ease),
    transform var(--motion-normal) var(--motion-ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
