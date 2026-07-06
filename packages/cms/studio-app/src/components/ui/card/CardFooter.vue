<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="card-footer"
    :class="
      cn(
        'ginko:flex ginko:items-center ginko:px-(--card-spacing) ginko:[.border-t]:pt-(--card-spacing)',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
