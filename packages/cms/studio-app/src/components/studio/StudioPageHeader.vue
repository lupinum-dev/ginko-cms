<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useSlots } from 'vue'

import { cn } from '../ui/utils'

defineProps<{
  class?: HTMLAttributes['class']
  description?: string
  eyebrow?: string
  title: string
}>()

const slots = useSlots()
</script>

<template>
  <header
    :class="
      cn(
        'studio-page-header ginko:min-h-14 ginko:shrink-0 ginko:border-b ginko:border-border/40 ginko:bg-card ginko:px-6 ginko:py-3',
        $props.class,
      )
    "
  >
    <div
      class="studio-page-content ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-4"
    >
      <div class="ginko:min-w-0 ginko:flex-1">
        <slot name="breadcrumb" />
        <div
          v-if="eyebrow || slots.eyebrow"
          class="studio-text-eyebrow ginko:mb-1 ginko:truncate ginko:text-muted-foreground/70"
        >
          <slot name="eyebrow">{{ eyebrow }}</slot>
        </div>
        <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
          <h1 class="studio-text-page-title ginko:truncate ginko:text-foreground">
            {{ title }}
          </h1>
          <slot name="badges" />
        </div>
        <p
          v-if="description || slots.description"
          class="ginko:mt-1 ginko:line-clamp-2 ginko:text-sm ginko:leading-snug ginko:text-muted-foreground/80"
        >
          <slot name="description">{{ description }}</slot>
        </p>
      </div>
      <div
        v-if="slots.actions"
        class="ginko:flex ginko:max-w-full ginko:flex-wrap ginko:items-center ginko:justify-end ginko:gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
