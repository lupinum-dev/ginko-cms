<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'
import { cardVariants, type CardVariants } from './card-variants'

const props = defineProps<{
  class?: HTMLAttributes['class']
  size?: CardVariants['size']
  variant?: CardVariants['variant']
}>()
</script>

<template>
  <div
    data-slot="card"
    :data-size="props.size"
    :class="cn(cardVariants({ variant: props.variant, size: props.size }), props.class)"
  >
    <slot />
  </div>
</template>
