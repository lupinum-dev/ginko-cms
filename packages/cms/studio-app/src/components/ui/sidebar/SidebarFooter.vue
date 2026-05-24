<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="sidebar-footer"
    data-sidebar="footer"
    :class="cn('ginko:flex ginko:flex-col ginko:gap-2 ginko:p-2', props.class)"
  >
    <slot />
  </div>
</template>
