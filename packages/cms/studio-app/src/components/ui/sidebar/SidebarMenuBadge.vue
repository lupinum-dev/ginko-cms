<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="sidebar-menu-badge"
    data-sidebar="menu-badge"
    :class="
      cn(
        'ginko:text-sidebar-foreground ginko:pointer-events-none ginko:absolute ginko:right-1 ginko:flex ginko:h-5 ginko:min-w-5 ginko:items-center ginko:justify-center ginko:rounded-md ginko:px-1 ginko:text-xs ginko:font-medium ginko:tabular-nums ginko:select-none',
        'ginko:peer-hover/menu-button:text-sidebar-accent-foreground ginko:peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        'ginko:peer-data-[size=sm]/menu-button:top-1',
        'ginko:peer-data-[size=default]/menu-button:top-1.5',
        'ginko:peer-data-[size=lg]/menu-button:top-2.5',
        'ginko:group-data-[collapsible=icon]:hidden',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
