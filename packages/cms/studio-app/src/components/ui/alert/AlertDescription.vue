<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="alert-description"
    :class="
      cn(
        'ginko:col-start-2 ginko:grid ginko:justify-items-start ginko:gap-1 ginko:text-sm ginko:text-muted-foreground ginko:[&_p]:leading-relaxed',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
