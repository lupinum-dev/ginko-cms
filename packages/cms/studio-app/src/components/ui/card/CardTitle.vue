<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <h2 data-slot="card-title" :class="cn('ginko:leading-none ginko:font-semibold', props.class)">
    <slot />
  </h2>
</template>
