<script setup lang="ts">
import { watch } from 'vue'

const props = withDefaults(defineProps<{ title?: string; closable?: boolean }>(), {
  title: undefined,
  closable: true,
})
const open = defineModel<boolean>({ default: false })

function close(): void {
  if (props.closable) open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const stop = watch(open, (v) => {
      if (!v) {
        window.removeEventListener('keydown', onKey)
        stop()
      }
    })
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="overlay" @click.self="close">
        <div class="dialog" role="dialog" aria-modal="true" :aria-label="title">
          <header v-if="title" class="header">
            <h3 class="title">{{ title }}</h3>
            <button v-if="closable" class="close" aria-label="Close" @click="close">×</button>
          </header>
          <div class="body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 100;
}
.dialog {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow: auto;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5) 0;
}
.title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}
.close {
  border: none;
  background: transparent;
  font-size: var(--font-size-xl);
  color: var(--color-text-faint);
  cursor: pointer;
  line-height: 1;
}
.close:hover {
  color: var(--color-text);
}
.body {
  padding: var(--space-5);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--motion-normal) var(--motion-ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
