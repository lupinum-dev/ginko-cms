<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <kbd
    :class="
      cn(
        'ginko:bg-muted ginko:text-muted-foreground ginko:pointer-events-none ginko:inline-flex ginko:h-5 ginko:w-fit ginko:min-w-5 ginko:items-center ginko:justify-center ginko:gap-1 ginko:rounded-sm ginko:px-1 ginko:font-sans ginko:text-xs ginko:font-medium ginko:select-none',
        'ginko:[&_svg:not([class*=\'size-\'])]:size-3',
        'ginko:[[data-slot=tooltip-content]_&]:bg-background/20 ginko:[[data-slot=tooltip-content]_&]:text-background ginko:dark:[[data-slot=tooltip-content]_&]:bg-background/10',
        props.class,
      )
    "
  >
    <slot />
  </kbd>
</template>
