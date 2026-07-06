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
        'ginko:mb-1.5 ginko:font-medium ginko:data-[variant=label]:text-sm ginko:data-[variant=legend]:text-base',
        props.class,
      )
    "
  >
    <slot />
  </legend>
</template>
