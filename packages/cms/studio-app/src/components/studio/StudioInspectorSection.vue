<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../ui/utils'

defineProps<{
  class?: HTMLAttributes['class']
  title?: string
}>()
</script>

<template>
  <section
    :class="
      cn(
        'studio-inspector-section ginko:border-b ginko:border-border/40 ginko:py-5 ginko:last:border-b-0',
        $props.class,
      )
    "
  >
    <div
      v-if="title || $slots.action"
      class="ginko:mb-3 ginko:flex ginko:items-center ginko:justify-between ginko:gap-3"
    >
      <div
        v-if="title"
        class="ginko:flex ginko:min-w-0 ginko:items-center ginko:gap-2 studio-text-title ginko:text-foreground"
      >
        <slot name="icon" />
        <span class="ginko:truncate">{{ title }}</span>
      </div>
      <div v-if="$slots.action" class="ginko:shrink-0">
        <slot name="action" />
      </div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.studio-inspector-section {
  box-shadow: none;
}
</style>
