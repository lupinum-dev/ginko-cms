<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <th
    data-slot="table-head"
    :class="
      cn(
        'ginko:text-muted-foreground ginko:h-10 ginko:px-2 ginko:text-left ginko:align-middle ginko:font-medium ginko:whitespace-nowrap ginko:[&:has([role=checkbox])]:pr-0 ginko:[&>[role=checkbox]]:translate-y-[2px]',
        props.class,
      )
    "
  >
    <slot />
  </th>
</template>
