<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number; max: number; label?: string }>(), {
  label: undefined,
})
const percent = computed(() => (props.max > 0 ? (props.value / props.max) * 100 : 0))
</script>

<template>
  <div class="progress">
    <div v-if="label" class="row">
      <span class="label">{{ label }}</span>
      <span class="count">{{ value }} / {{ max }}</span>
    </div>
    <div
      class="track"
      role="progressbar"
      :aria-valuenow="value"
      :aria-valuemin="0"
      :aria-valuemax="max"
    >
      <div class="fill" :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}
.row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
}
.label {
  color: var(--color-text-muted);
}
.count {
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.track {
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-full);
  transition: width var(--motion-slow) var(--motion-ease);
}
</style>
