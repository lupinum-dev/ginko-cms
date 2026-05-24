<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

interface SkeletonProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<SkeletonProps>()
</script>

<template>
  <div
    data-slot="skeleton"
    :class="cn('ginko:animate-pulse ginko:rounded-md ginko:bg-primary/10', props.class)"
  />
</template>
