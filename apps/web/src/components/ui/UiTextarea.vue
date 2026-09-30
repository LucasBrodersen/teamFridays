<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    maxlength?: number
    rows?: number
  }>(),
  { label: undefined, placeholder: undefined, maxlength: undefined, rows: 3 },
)
const model = defineModel<string>({ default: '' })
</script>

<template>
  <label class="field">
    <span v-if="label" class="label">{{ label }}</span>
    <textarea
      v-model="model"
      class="textarea"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :rows="rows"
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
.textarea {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  resize: vertical;
  transition: border-color var(--motion-fast) var(--motion-ease);
}
.textarea:focus-visible {
  border-color: var(--color-accent);
}
.textarea::placeholder {
  color: var(--color-text-faint);
}
</style>
