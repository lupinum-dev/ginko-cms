<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { state, toggleSidebar } = useSidebar()
</script>

<template>
  <button
    type="button"
    data-sidebar="rail"
    data-slot="sidebar-rail"
    :aria-label="state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'"
    :tabindex="-1"
    :class="
      cn(
        'ginko:absolute ginko:inset-y-0 ginko:z-20 ginko:hidden ginko:w-4 ginko:-translate-x-1/2 ginko:cursor-pointer ginko:outline-none ginko:group-data-[side=left]:-right-4 ginko:group-data-[side=right]:left-0 ginko:sm:flex',
        'ginko:after:bg-sidebar-border ginko:after:absolute ginko:after:inset-y-3 ginko:after:left-1/2 ginko:after:w-[3px] ginko:after:-translate-x-1/2 ginko:after:scale-y-75 ginko:after:rounded-full ginko:after:opacity-0 ginko:after:transition-[opacity,scale] ginko:after:duration-150 ginko:after:ease-[cubic-bezier(0.2,0,0,1)]',
        'ginko:hover:after:scale-y-100 ginko:hover:after:opacity-100 ginko:focus-visible:after:scale-y-100 ginko:focus-visible:after:opacity-100 ginko:active:after:scale-y-95',
        'ginko:hover:group-data-[collapsible=offcanvas]:bg-sidebar ginko:group-data-[collapsible=offcanvas]:translate-x-0 ginko:group-data-[collapsible=offcanvas]:after:left-full',
        'ginko:[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        'ginko:[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        props.class,
      )
    "
    @click="toggleSidebar"
  >
    <slot />
  </button>
</template>
