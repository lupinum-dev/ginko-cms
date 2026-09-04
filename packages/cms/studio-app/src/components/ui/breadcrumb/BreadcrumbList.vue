<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ol
    data-slot="breadcrumb-list"
    :class="
      cn(
        'ginko:text-muted-foreground ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-1.5 ginko:text-sm ginko:break-words ginko:sm:gap-2.5',
        props.class,
      )
    "
  >
    <slot />
  </ol>
</template>
