<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="command-empty"
    :class="
      cn('ginko:py-6 ginko:text-center ginko:text-sm ginko:text-muted-foreground', props.class)
    "
  >
    <slot />
  </div>
</template>
