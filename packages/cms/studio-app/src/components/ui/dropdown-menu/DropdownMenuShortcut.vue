<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span
    data-slot="dropdown-menu-shortcut"
    :class="
      cn(
        'ginko:text-muted-foreground ginko:ml-auto ginko:text-xs ginko:tracking-widest',
        props.class,
      )
    "
  >
    <slot />
  </span>
</template>
