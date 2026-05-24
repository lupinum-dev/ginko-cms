<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="command-separator"
    :class="cn('ginko:-mx-1 ginko:h-px ginko:bg-border', props.class)"
  />
</template>
