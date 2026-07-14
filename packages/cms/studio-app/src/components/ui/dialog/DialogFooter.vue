<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="dialog-footer"
    :class="
      cn('ginko:flex ginko:flex-col-reverse ginko:gap-2 ginko:sm:flex-row ginko:sm:justify-end', props.class)
    "
  >
    <slot />
  </div>
</template>
