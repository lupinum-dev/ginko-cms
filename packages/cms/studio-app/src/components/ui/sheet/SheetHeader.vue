<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="sheet-header"
    :class="cn('ginko:flex ginko:flex-col ginko:gap-1.5 ginko:p-4', props.class)"
  >
    <slot />
  </div>
</template>
