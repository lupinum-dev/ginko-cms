<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div data-slot="field-separator" :class="cn('ginko:relative ginko:-my-2 ginko:h-5', props.class)">
    <Separator class="ginko:absolute ginko:inset-x-0 ginko:top-1/2" />
  </div>
</template>
