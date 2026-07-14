<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <kbd
    data-slot="kbd-group"
    :class="cn('ginko:inline-flex ginko:items-center ginko:gap-1', props.class)"
  >
    <slot />
  </kbd>
</template>
