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
        'ginko:@container/card-header ginko:grid ginko:auto-rows-min ginko:items-start ginko:gap-1 ginko:px-(--card-spacing) ginko:has-data-[slot=card-action]:grid-cols-[1fr_auto] ginko:has-data-[slot=card-description]:grid-rows-[auto_auto] ginko:[.border-b]:pb-(--card-spacing)',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
