<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'
import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <li
    data-slot="breadcrumb-item"
    :class="cn('ginko:inline-flex ginko:items-center ginko:gap-1.5', props.class)"
  >
    <slot />
  </li>
</template>
