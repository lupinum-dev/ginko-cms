<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <td
    data-slot="table-cell"
    :class="
      cn(
        'ginko:p-2 ginko:align-middle ginko:whitespace-nowrap ginko:[&:has([role=checkbox])]:pr-0 ginko:[&>[role=checkbox]]:translate-y-[2px]',
        props.class,
      )
    "
  >
    <slot />
  </td>
</template>
