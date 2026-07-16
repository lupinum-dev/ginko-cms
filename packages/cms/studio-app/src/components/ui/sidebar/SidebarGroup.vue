<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="sidebar-group"
    data-sidebar="group"
    :class="
      cn(
        'ginko:relative ginko:flex ginko:w-full ginko:min-w-0 ginko:flex-col ginko:p-2',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
