<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ul
    data-slot="sidebar-menu"
    data-sidebar="menu"
    :class="cn('ginko:flex ginko:w-full ginko:min-w-0 ginko:flex-col ginko:gap-1', props.class)"
  >
    <slot />
  </ul>
</template>
