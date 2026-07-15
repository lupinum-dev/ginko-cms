<script setup lang="ts">
import { computed, nextTick, toValue } from 'vue'

import { useRightSidebar } from '../../composables/useRightSidebar'
import { cn } from '../ui/utils'

// SPA port of the template's `app/components/layout/RightSidebar.vue` (RFC D3).
// The template read the surface style (`flush` vs `card`) from `useAppSettings`,
// which the Studio shell does not port. The Studio uses the flush surface, so
// the card-style branch is elided; the markup is otherwise kept verbatim so
// future template pulls diff cleanly. The Sheet's close control and the toggle
// labels carry the user-facing copy; this component has no literal strings.
const {
  panel,
  open,
  available,
  isMobile,
  openMobile,
  setOpen,
  setOpenMobile,
  widthVars,
} = useRightSidebar()

const headerClass =
  'ginko:border-b ginko:h-(--header-height) ginko:flex ginko:flex-col ginko:justify-center ginko:px-4 ginko:mt-[9px]'

const panelClass = computed(() => {
  // Zero-width (not unmounted) when unavailable: the aside must stay in the
  // flex row so its margin-right:auto keeps the ultra-wide clamp symmetric
  // (see panelStyle) on routes without a detail panel.
  if (!available.value || !open.value) {
    return 'w-0 opacity-0 pointer-events-none'
  }

  return cn(
    // Width comes from per-tier CSS vars (set below) so the responsive default
    // and clamping resolve in pure CSS — the layout never guesses the viewport.
    'ginko:opacity-100 ginko:md:w-(--rsw-laptop) ginko:2xl:w-(--rsw-wide)',
    // --rsw-reserve = space the panel must leave free: a 26rem main-content
    // term (24rem minimum + the inset card's ~2rem m-2 gutter) plus the left
    // sidebar while it is expanded (16rem → 42rem). The :has() variant tracks
    // the left sidebar's state live, so collapsing it to the 3rem icon rail
    // frees width down to the 29rem floor.
    'ginko:[--rsw-reserve:42rem] ginko:group-has-[[data-side=left][data-state=collapsed]]/sidebar-wrapper:[--rsw-reserve:29rem]',
    'ginko:bg-sidebar ginko:text-sidebar-foreground ginko:md:top-0 ginko:md:h-svh',
  )
})

const panelStyle = computed(() => ({
  '--rsw-laptop': widthVars.value.laptop,
  '--rsw-wide': widthVars.value.wide,
  // Ultra-wide clamp counterpart to SidebarInset's margin-left:auto (see
  // Layout.vue): free canvas space splits evenly around the card/panel pair.
  // Resolves to 0 when the viewport is fully used, so narrow layouts are
  // unchanged.
  marginRight: 'auto',
}))

function onEscape() {
  setOpen(false)
  nextTick(() => {
    document
      .querySelector<HTMLElement>('[data-slot="right-sidebar-trigger"]')
      ?.focus()
  })
}
</script>

<template>
  <aside
    id="right-sidebar"
    data-slot="right-sidebar"
    :aria-hidden="!open || !available"
    :inert="!open || !available || undefined"
    class="ginko:relative ginko:hidden ginko:shrink-0 ginko:overflow-hidden ginko:md:sticky ginko:md:self-start ginko:md:flex ginko:md:flex-col ginko:md:transition-[width,opacity] ginko:md:duration-[240ms] ginko:md:ease-[cubic-bezier(0.2,0,0,1)]"
    :class="panelClass"
    :style="panelStyle"
    @keydown.escape="onEscape"
  >
    <div v-if="open && panel" class="ginko:flex ginko:min-h-0 ginko:flex-1 ginko:flex-col">
      <div :class="headerClass">
        <h2 class="ginko:text-sm ginko:font-semibold">
          {{ toValue(panel.title) }}
        </h2>
      </div>
      <div class="ginko:min-h-0 ginko:flex-1 ginko:overflow-auto ginko:p-4">
        <p
          v-if="toValue(panel.description)"
          class="ginko:text-muted-foreground ginko:mb-4 ginko:text-sm ginko:leading-5"
        >
          {{ toValue(panel.description) }}
        </p>
        <component :is="panel.component" v-bind="toValue(panel.props)" />
      </div>
    </div>
  </aside>

  <Sheet
    v-if="available && isMobile"
    :open="openMobile"
    @update:open="setOpenMobile"
  >
    <SheetContent side="right" class="ginko:w-[86vw] ginko:sm:max-w-sm">
      <SheetHeader class="ginko:border-b ginko:pr-10">
        <SheetTitle>{{ toValue(panel?.title) }}</SheetTitle>
        <SheetDescription v-if="toValue(panel?.description)">
          {{ toValue(panel?.description) }}
        </SheetDescription>
      </SheetHeader>
      <div class="ginko:min-h-0 ginko:flex-1 ginko:overflow-auto ginko:px-4 ginko:pb-4">
        <component
          :is="panel.component"
          v-if="panel"
          v-bind="toValue(panel.props)"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>
