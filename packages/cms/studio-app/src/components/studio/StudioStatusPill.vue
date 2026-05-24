<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'

import type { BadgeVariants } from '../ui/badge'

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    label: string
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  }>(),
  {
    tone: 'neutral',
  },
)

const variant = computed<BadgeVariants['variant']>(() => {
  switch (props.tone) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'destructive'
    case 'info':
      return 'secondary'
    default:
      return 'soft'
  }
})
</script>

<template>
  <Badge :variant="variant" :class="['studio-motion-base', $props.class]">
    <span
      aria-hidden="true"
      class="ginko:size-1.5 ginko:shrink-0 ginko:rounded-full ginko:bg-current ginko:opacity-80"
    />
    <span class="ginko:truncate">{{ label }}</span>
  </Badge>
</template>
