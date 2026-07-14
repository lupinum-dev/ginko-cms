<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { Skeleton } from '../skeleton'
import { cn } from '../utils'

const props = defineProps<{
  showIcon?: boolean
  class?: HTMLAttributes['class']
}>()

const width = computed(() => {
  return `${Math.floor(Math.random() * 40) + 50}%`
})
</script>

<template>
  <div
    data-slot="sidebar-menu-skeleton"
    data-sidebar="menu-skeleton"
    :class="cn('ginko:flex ginko:h-8 ginko:items-center ginko:gap-2 ginko:rounded-md ginko:px-2', props.class)"
  >
    <Skeleton
      v-if="showIcon"
      class="ginko:size-4 ginko:rounded-md"
      data-sidebar="menu-skeleton-icon"
    />

    <Skeleton
      class="ginko:h-4 ginko:max-w-(--skeleton-width) ginko:flex-1"
      data-sidebar="menu-skeleton-text"
      :style="{ '--skeleton-width': width }"
    />
  </div>
</template>
