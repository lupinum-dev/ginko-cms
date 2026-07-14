<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ul
    data-slot="sidebar-menu-sub"
    data-sidebar="menu-badge"
    :class="
      cn(
        'ginko:border-sidebar-border ginko:mx-3.5 ginko:flex ginko:min-w-0 ginko:translate-x-px ginko:flex-col ginko:gap-1 ginko:border-l ginko:px-2.5 ginko:py-0.5',
        'ginko:group-data-[collapsible=icon]:hidden',
        props.class,
      )
    "
  >
    <slot />
  </ul>
</template>
