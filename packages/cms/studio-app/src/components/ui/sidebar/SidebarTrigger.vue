<script setup lang="ts">
import { PanelLeft } from 'lucide-vue-next'
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
    :class="cn('ginko:size-7', props.class)"
    @click="toggleSidebar"
  >
    <slot>
      <PanelLeft class="ginko:size-3.5" />
    </slot>
    <span class="ginko:sr-only">Toggle Sidebar</span>
  </Button>
</template>
