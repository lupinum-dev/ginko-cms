<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span
    data-slot="breadcrumb-page"
    role="link"
    aria-disabled="true"
    aria-current="page"
    :class="cn('ginko:text-foreground ginko:font-normal', props.class)"
  >
    <slot />
  </span>
</template>
