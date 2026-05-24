<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="alert-title"
    :class="
      cn(
        'ginko:col-start-2 ginko:line-clamp-1 ginko:min-h-4 ginko:font-medium ginko:tracking-tight',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
