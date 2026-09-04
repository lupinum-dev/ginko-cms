<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useSlots } from 'vue'

import { cn } from '../ui/utils'

// No eyebrow: the shell breadcrumb + H1 already locate the page twice; a
// third uppercase label was pure repetition (design review A7).
defineProps<{
  class?: HTMLAttributes['class']
  description?: string
  title: string
}>()

const slots = useSlots()
</script>

<template>
  <header
    :class="
      cn(
        // Page-intro rhythm (RFC Phase 6, double-header reconciliation). The
        // global StudioHeader owns navigation chrome (breadcrumbs + panel
        // toggle); this block is the in-content page intro and must NOT read as
        // a second toolbar. So it carries no border, no card fill, and no fixed
        // toolbar height — just the title/description/actions row on the
        // content padding rhythm (p-4 lg:p-6, matching StudioPageBody).
        'studio-page-header ginko:shrink-0 ginko:px-4 ginko:pt-4 ginko:pb-2 ginko:lg:px-6 ginko:lg:pt-6',
        $props.class,
      )
    "
  >
    <div
      class="studio-page-content ginko:flex ginko:flex-wrap ginko:items-start ginko:justify-between ginko:gap-4"
    >
      <div class="ginko:min-w-0 ginko:flex-1">
        <slot name="breadcrumb" />
        <div class="ginko:flex ginko:flex-wrap ginko:items-center ginko:gap-2">
          <h1
            class="ginko:truncate ginko:text-2xl ginko:font-bold ginko:tracking-tight ginko:text-foreground"
          >
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
