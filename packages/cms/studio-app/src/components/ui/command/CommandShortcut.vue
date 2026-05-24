<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <span
    data-slot="command-shortcut"
    :class="
      cn(
        'ginko:ml-auto ginko:text-xs ginko:tracking-widest ginko:text-muted-foreground',
        props.class,
      )
    "
  >
    <slot />
  </span>
</template>
