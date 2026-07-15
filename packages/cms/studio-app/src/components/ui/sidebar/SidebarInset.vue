<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <main
    data-slot="sidebar-inset"
    :class="
      cn(
        'ginko:bg-background ginko:relative ginko:flex ginko:w-full ginko:flex-1 ginko:flex-col',
        'ginko:md:transition-[margin] ginko:md:duration-(--motion-panel) ginko:md:ease-(--motion-ease-panel)',
        'ginko:md:peer-data-[variant=inset]:m-2 ginko:md:peer-data-[variant=inset]:ml-0 ginko:md:peer-data-[variant=inset]:rounded-xl ginko:md:peer-data-[variant=inset]:border ginko:md:peer-data-[variant=inset]:shadow-sm ginko:md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        props.class,
      )
    "
  >
    <slot />
  </main>
</template>
