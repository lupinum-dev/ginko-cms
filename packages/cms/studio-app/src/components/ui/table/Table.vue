<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div data-slot="table-container" class="ginko:relative ginko:w-full ginko:overflow-auto">
    <table
      data-slot="table"
      :class="cn('ginko:w-full ginko:caption-bottom ginko:text-sm', props.class)"
    >
      <slot />
    </table>
  </div>
</template>
