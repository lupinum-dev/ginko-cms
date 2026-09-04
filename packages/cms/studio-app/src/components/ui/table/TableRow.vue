<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="
      cn(
        'ginko:hover:bg-muted/50 ginko:data-[state=selected]:bg-muted ginko:border-b ginko:transition-colors',
        props.class,
      )
    "
  >
    <slot />
  </tr>
</template>
