<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="dialog-header"
    :class="cn('ginko:flex ginko:flex-col ginko:gap-1.5', props.class)"
  >
    <slot />
  </div>
</template>
