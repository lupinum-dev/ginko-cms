<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="field-content"
    :class="
      cn(
        'ginko:group/field-content ginko:flex ginko:flex-1 ginko:flex-col ginko:gap-1.5 ginko:leading-snug',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
