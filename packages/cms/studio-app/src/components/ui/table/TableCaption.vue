<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <caption
    data-slot="table-caption"
    :class="cn('ginko:text-muted-foreground ginko:mt-4 ginko:text-sm', props.class)"
  >
    <slot />
  </caption>
</template>
