<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'neutral' | 'accent' | 'success' | 'danger' }>(), {
  variant: 'neutral',
})
</script>

<template>
  <span class="badge" :class="variant"><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  height: 20px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  line-height: 1;
}
.neutral {
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
}
.accent {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.success {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
