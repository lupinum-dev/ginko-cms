<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <p
    data-slot="card-description"
    :class="cn('ginko:text-muted-foreground ginko:text-sm', props.class)"
  >
    <slot />
  </p>
</template>
