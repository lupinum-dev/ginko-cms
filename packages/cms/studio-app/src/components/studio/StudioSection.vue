<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../ui/utils'

defineProps<{
  badge?: string
  class?: HTMLAttributes['class']
  description?: string
  title: string
}>()
</script>

<template>
  <section
    :class="
      cn(
        'studio-reveal ginko:overflow-hidden ginko:rounded-xl ginko:border ginko:border-border/40 ginko:bg-card',
        $props.class,
      )
    "
  >
    <div
      class="ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-3 ginko:px-6 ginko:pt-5"
    >
      <div class="ginko:min-w-0">
        <h2 class="studio-text-title ginko:truncate ginko:text-foreground">
          {{ title }}
        </h2>
        <p
          v-if="description"
          class="ginko:mt-1 ginko:text-sm ginko:leading-5 ginko:text-muted-foreground/80"
        >
          {{ description }}
        </p>
      </div>
      <Badge v-if="badge" variant="outline" class="ginko:max-w-full">
        {{ badge }}
      </Badge>
    </div>
    <div class="ginko:p-6 ginko:pt-5">
      <slot />
    </div>
  </section>
</template>
