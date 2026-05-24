<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="card-footer"
    :class="cn('ginko:flex ginko:items-center ginko:px-6 ginko:[.border-t]:pt-6', props.class)"
  >
    <slot />
  </div>
</template>
