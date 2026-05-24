<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="card-action"
    :class="
      cn(
        'ginko:col-start-2 ginko:row-span-2 ginko:row-start-1 ginko:self-start ginko:justify-self-end',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
