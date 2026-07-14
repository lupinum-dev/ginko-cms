<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <p
    role="alert"
    data-slot="field-error"
    :class="cn('ginko:text-sm ginko:text-destructive-fg', props.class)"
  >
    <slot />
  </p>
</template>
