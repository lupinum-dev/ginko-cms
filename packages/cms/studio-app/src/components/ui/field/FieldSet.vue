<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <fieldset data-slot="field-set" :class="cn('ginko:flex ginko:flex-col ginko:gap-4', props.class)">
    <slot />
  </fieldset>
</template>
