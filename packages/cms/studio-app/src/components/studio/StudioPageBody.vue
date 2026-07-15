<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '../ui/utils'

/**
 * StudioPageBody — the Studio's document-flow content wrapper (RFC Phase 6,
 * content padding rhythm).
 *
 * The Studio keeps the fixed-pane scroll model (see Layout.vue): the global
 * SidebarInset is `overflow-hidden` at full height and each page owns its
 * internal scroll container. So the template's `@container/main p-4 lg:p-6`
 * page padding is applied HERE — inside the page's scroll region — rather than
 * on the inset. This is the single source of the content padding rhythm:
 *
 *   ginko:@container/main   → enables the page's container-query breakpoints
 *                             (`@xl/main:`, `@5xl/main:` …) so cards/grids can
 *                             respond to the CONTENT width, not the viewport
 *   ginko:p-4 ginko:lg:p-6  → the content padding rhythm, matching the page
 *                             intro (StudioPageHeader) so title and body align
 *
 * `width` mirrors the `.studio-page-content` max-width tiers so a page can opt
 * into the centered reading column ('default'), the wide dashboard column
 * ('wide'), or full-bleed ('bleed').
 */
defineProps<{
  class?: HTMLAttributes['class']
  width?: 'default' | 'wide' | 'bleed'
}>()
</script>

<template>
  <div
    :class="
      cn(
        'ginko:@container/main ginko:min-w-0 ginko:p-4 ginko:lg:p-6',
        width !== 'bleed' && 'studio-page-content',
        width === 'wide' && 'studio-page-content--wide',
        $props.class,
      )
    "
  >
    <slot />
  </div>
</template>
