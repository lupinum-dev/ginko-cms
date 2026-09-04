<script lang="ts" setup>
import { MoreHorizontal } from '@lucide/vue'
import type { HTMLAttributes } from 'vue'

import { cn } from '../utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span
    data-slot="breadcrumb-ellipsis"
    role="presentation"
    aria-hidden="true"
    :class="cn('ginko:flex ginko:size-9 ginko:items-center ginko:justify-center', props.class)"
  >
    <slot>
      <MoreHorizontal class="ginko:size-4" />
    </slot>
    <span class="ginko:sr-only">More</span>
  </span>
</template>
