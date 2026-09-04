<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Separator data-slot="item-separator" :class="cn('ginko:my-0', props.class)" />
</template>
