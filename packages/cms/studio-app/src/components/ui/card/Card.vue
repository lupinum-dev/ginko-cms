<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'
import { cardVariants, type CardVariants } from './card-variants'

const props = defineProps<{
  class?: HTMLAttributes['class']
  variant?: CardVariants['variant']
}>()
</script>

<template>
  <div data-slot="card" :class="cn(cardVariants({ variant: props.variant }), props.class)">
    <slot />
  </div>
</template>
