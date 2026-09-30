<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    maxlength?: number
    autofocus?: boolean
  }>(),
  { label: undefined, placeholder: undefined, maxlength: undefined, autofocus: false },
)
const model = defineModel<string>({ default: '' })
</script>

<template>
  <label class="field">
    <span v-if="label" class="label">{{ label }}</span>
    <input
      v-model="model"
      class="input"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :autofocus="autofocus"
    />
  </label>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}
.label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
}
.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  transition: border-color var(--motion-fast) var(--motion-ease);
}
.input:focus-visible {
  border-color: var(--color-accent);
}
.input::placeholder {
  color: var(--color-text-faint);
}
</style>
