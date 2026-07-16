<script setup lang="ts">
import { PanelLeft } from '@lucide/vue'
import type { HTMLAttributes } from 'vue'

import { Button } from '../button'
import { cn } from '../utils'
import { useSidebar } from './utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
</script>

<template>
  <Button
    data-sidebar="trigger"
    data-slot="sidebar-trigger"
    variant="ghost"
    size="icon"
    :class="
      cn(
        'ginko:size-9 ginko:transition-transform ginko:duration-150 ginko:ease-out ginko:active:scale-[0.96]',
        props.class,
      )
    "
    @click="toggleSidebar"
  >
    <slot>
      <PanelLeft />
    </slot>
    <span class="ginko:sr-only">Toggle Sidebar</span>
  </Button>
</template>
