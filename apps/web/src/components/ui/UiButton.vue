<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', disabled: false, type: 'button' },
)
</script>

<template>
  <button :type="type" class="btn" :class="[variant, size]" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
  white-space: nowrap;
}
.btn:active:not(:disabled) {
  transform: translateY(1px);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sm {
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
}
.md {
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
}
.lg {
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-md);
}

.primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
}
.primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}
.secondary {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text);
}
.secondary:hover:not(:disabled) {
  border-color: var(--color-text-faint);
}
.ghost {
  background: transparent;
  color: var(--color-text-muted);
}
.ghost:hover:not(:disabled) {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.danger:hover:not(:disabled) {
  background: var(--color-danger);
  color: var(--color-on-accent);
}
</style>
