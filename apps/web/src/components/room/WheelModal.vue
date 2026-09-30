<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiButton from '../ui/UiButton.vue'
import UiModal from '../ui/UiModal.vue'

const room = useRoomStore()

const open = ref(false)
const spinning = ref(false)
const displayedName = ref('')
const winnerName = computed(() =>
  room.wheelWinnerId ? room.nameOf(room.wheelWinnerId) : '',
)

// Everyone sees the wheel when the server announces a result.
watch(
  () => room.wheelWinnerId,
  (id) => {
    if (!id) return
    open.value = true
    spinning.value = true
    const names = room.participants.map((p) => p.name)
    let tick = 0
    const total = 22
    const step = () => {
      tick++
      displayedName.value = names[tick % names.length] ?? ''
      if (tick < total) {
        setTimeout(step, 40 + tick * 12)
      } else {
        displayedName.value = winnerName.value
        spinning.value = false
      }
    }
    step()
  },
)

function close(): void {
  open.value = false
  room.clearWheel()
}
</script>

<template>
  <UiModal :model-value="open" title="Wheel of names" @update:model-value="close()">
    <div class="wheel" aria-live="polite">
      <UiAvatar v-if="!spinning && winnerName" :name="winnerName" size="lg" />
      <p class="name" :class="{ spinning }">{{ displayedName }}</p>
      <p v-if="!spinning" class="hint">goes next!</p>
      <UiButton v-if="!spinning" variant="secondary" @click="close()">Done</UiButton>
    </div>
  </UiModal>
</template>

<style scoped>
.wheel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0;
}
.name {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  min-height: 1.4em;
}
.spinning {
  color: var(--color-text-muted);
}
.hint {
  color: var(--color-text-muted);
}
</style>
