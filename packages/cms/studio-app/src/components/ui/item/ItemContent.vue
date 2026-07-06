<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="item-content"
    :class="cn('ginko:flex ginko:min-w-0 ginko:flex-1 ginko:flex-col ginko:gap-1', props.class)"
  >
    <slot />
  </div>
</template>
