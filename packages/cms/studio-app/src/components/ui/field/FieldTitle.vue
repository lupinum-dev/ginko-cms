<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="field-label"
    :class="
      cn(
        'ginko:flex ginko:w-fit ginko:items-center ginko:gap-2 ginko:text-sm ginko:leading-snug ginko:font-medium ginko:group-data-[disabled=true]/field:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
