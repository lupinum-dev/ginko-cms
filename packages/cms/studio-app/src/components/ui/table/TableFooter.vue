<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <tfoot
    data-slot="table-footer"
    :class="
      cn('ginko:bg-muted/50 ginko:border-t ginko:font-medium ginko:[&>tr]:last:border-b-0', props.class)
    "
  >
    <slot />
  </tfoot>
</template>
