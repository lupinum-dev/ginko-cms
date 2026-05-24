<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
</script>

<template>
  <button
    data-sidebar="rail"
    data-slot="sidebar-rail"
    aria-label="Toggle Sidebar"
    :tabindex="-1"
    title="Toggle Sidebar"
    :class="
      cn(
        'ginko:hover:after:bg-sidebar-border ginko:absolute ginko:inset-y-0 ginko:z-20 ginko:hidden ginko:w-4 ginko:-translate-x-1/2 ginko:transition-all ginko:ease-linear ginko:group-data-[side=left]:-right-4 ginko:group-data-[side=right]:left-0 ginko:after:absolute ginko:after:inset-y-0 ginko:after:left-1/2 ginko:after:w-[2px] ginko:sm:flex',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
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
