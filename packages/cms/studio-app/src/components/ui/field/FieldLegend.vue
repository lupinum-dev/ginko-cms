<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  variant?: 'legend' | 'label'
}>()
</script>

<template>
  <legend
    data-slot="field-legend"
    :data-variant="variant ?? 'legend'"
    :class="
      cn(
        'ginko:mb-3 ginko:font-medium',
        'ginko:data-[variant=legend]:text-base',
        'ginko:data-[variant=label]:text-sm',
        props.class,
      )
    "
  >
    <slot />
  </legend>
</template>
