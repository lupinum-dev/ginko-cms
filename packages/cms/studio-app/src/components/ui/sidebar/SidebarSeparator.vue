<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Separator } from '../separator'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Separator
    data-slot="sidebar-separator"
    data-sidebar="separator"
    :class="cn('ginko:bg-sidebar-border ginko:mx-2 ginko:w-auto', props.class)"
  >
    <slot />
  </Separator>
</template>
