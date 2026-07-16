<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="sheet-footer"
    :class="cn('ginko:mt-auto ginko:flex ginko:flex-col ginko:gap-2 ginko:p-4', props.class)"
  >
    <slot />
  </div>
</template>
