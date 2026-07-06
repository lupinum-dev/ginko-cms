<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div data-slot="field-title" :class="cn('ginko:text-sm ginko:font-medium', props.class)">
    <slot />
  </div>
</template>
