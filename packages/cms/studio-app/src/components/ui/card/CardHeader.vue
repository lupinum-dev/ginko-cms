<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="card-header"
    :class="
      cn(
        'ginko:@container/card-header ginko:grid ginko:auto-rows-min ginko:grid-rows-[auto_auto] ginko:items-start ginko:gap-1.5 ginko:px-6 ginko:has-data-[slot=card-action]:grid-cols-[1fr_auto] ginko:[.border-b]:pb-6',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
