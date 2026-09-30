<script setup lang="ts">
import { computed } from 'vue'
import { avatarColor, initials } from '../../lib/avatar'

const props = withDefaults(
  defineProps<{ name: string; size?: 'sm' | 'md' | 'lg'; muted?: boolean }>(),
  { size: 'md', muted: false },
)
const bg = computed(() => avatarColor(props.name))
const text = computed(() => initials(props.name))
</script>

<template>
  <span
    class="avatar"
    :class="[size, { muted }]"
    :style="{ background: bg }"
    :aria-label="name"
    role="img"
  >
    {{ text }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  color: #fff;
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
  user-select: none;
}
.sm {
  width: 24px;
  height: 24px;
  font-size: 10px;
}
.md {
  width: 34px;
  height: 34px;
  font-size: var(--font-size-xs);
}
.lg {
  width: 48px;
  height: 48px;
  font-size: var(--font-size-md);
}
.muted {
  opacity: 0.4;
}
</style>
