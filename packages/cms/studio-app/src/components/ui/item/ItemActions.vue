<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="item-actions"
    :class="cn('ginko:flex ginko:shrink-0 ginko:items-center ginko:gap-2', props.class)"
  >
    <slot />
  </div>
</template>
