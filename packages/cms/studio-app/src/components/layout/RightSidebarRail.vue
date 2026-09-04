<script setup lang="ts">
import { GripVertical } from '@lucide/vue'
import { useTextDirection } from '@vueuse/core'
import type { HTMLAttributes } from 'vue'
import { computed, ref } from 'vue'

import { useCmsI18n } from '../../composables/useCmsI18n'
import { useRightSidebar } from '../../composables/useRightSidebar'
import { cn } from '../ui/utils'

// SPA port of the template's `app/components/layout/RightSidebarRail.vue`
// (RFC D3). The template read the main-area style from `useAppSettings`
// (`sidebar.variant === 'inset'`); the Studio shell runs the left sidebar in
// the `sidebar` variant, so `isMainInsetStyle` is a constant `false` here.
// User-facing aria labels go through useCmsI18n; behaviour is verbatim.
const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { t } = useCmsI18n()
const { available, open, toggle, setSize, tierMinRem, tierMaxRem } = useRightSidebar()

// Studio left sidebar is the `sidebar` variant, not `inset`.
const isMainInsetStyle = false

// One strip, two intents: a press that stays within the threshold is a click
// (toggle); anything further is a drag (resize). A completed drag suppresses
// the click event that natively follows pointerup.
const CLICK_DRAG_THRESHOLD_PX = 4

const direction = useTextDirection()
const isRtl = computed(() => direction.value === 'rtl')

const dragging = ref(false)
let startX = 0
let startWidthPx = 0
let maxDeltaPx = 0
let suppressClick = false

function panelWidthPx(): number {
  return document.getElementById('right-sidebar')?.offsetWidth ?? 0
}

function onPointerdown(event: PointerEvent) {
  if (!open.value) return
  event.preventDefault()
  dragging.value = true
  startX = event.clientX
  startWidthPx = panelWidthPx()
  maxDeltaPx = 0
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is best-effort: the pointer may already be gone.
  }
}

function onPointermove(event: PointerEvent) {
  if (!dragging.value) return
  const dir = isRtl.value ? -1 : 1
  const deltaPx = (startX - event.clientX) * dir
  maxDeltaPx = Math.max(maxDeltaPx, Math.abs(deltaPx))
  if (maxDeltaPx > CLICK_DRAG_THRESHOLD_PX) {
    setSize((startWidthPx + deltaPx) / 16)
  }
}

function onPointerup(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  // Decide click-vs-drag BEFORE releasing capture — release can throw when the
  // pointer is already gone, and a drag must never fall through to a toggle.
  suppressClick = maxDeltaPx > CLICK_DRAG_THRESHOLD_PX
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  } catch {
    // Already released.
  }
}

function onClick() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  toggle()
}

// Enter/Space keep their native button semantics (click → toggle); the arrows
// resize relative to the panel's currently rendered width.
function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  const growKey = isRtl.value ? 'ArrowRight' : 'ArrowLeft'
  const shrinkKey = isRtl.value ? 'ArrowLeft' : 'ArrowRight'
  const step = event.shiftKey ? 4 : 1

  switch (event.key) {
    case growKey:
      event.preventDefault()
      setSize(panelWidthPx() / 16 + step)
      break
    case shrinkKey:
      event.preventDefault()
      setSize(panelWidthPx() / 16 - step)
      break
    case 'Home':
      event.preventDefault()
      setSize(tierMinRem.value)
      break
    case 'End':
      event.preventDefault()
      setSize(tierMaxRem())
      break
  }
}
</script>

<template>
  <button
    v-if="available"
    type="button"
    data-sidebar="rail"
    data-slot="right-sidebar-rail"
    aria-controls="right-sidebar"
    :aria-expanded="open"
    :aria-label="
      open
        ? t('ginkoCms.studio.rightSidebar.closeResizable')
        : t('ginkoCms.studio.rightSidebar.open')
    "
    :class="
      cn(
        'ginko:group ginko:absolute ginko:right-0 ginko:z-20 ginko:hidden ginko:w-4 ginko:translate-x-1/2 ginko:outline-none ginko:sm:flex',
        open ? 'ginko:cursor-col-resize ginko:touch-none' : 'ginko:cursor-pointer',
        isMainInsetStyle ? 'ginko:-top-[9px] ginko:h-svh' : 'ginko:inset-y-0 ginko:h-svh',
        'ginko:after:bg-sidebar-border ginko:after:absolute ginko:after:inset-y-3 ginko:after:left-1/2 ginko:after:w-[3px] ginko:after:-translate-x-1/2 ginko:after:scale-y-75 ginko:after:rounded-full ginko:after:opacity-0 ginko:after:transition-[opacity,scale] ginko:after:duration-(--motion-fast) ginko:after:ease-(--motion-ease-panel)',
        'ginko:hover:after:scale-y-100 ginko:hover:after:opacity-100 ginko:focus-visible:after:scale-y-100 ginko:focus-visible:after:opacity-100 ginko:active:after:scale-y-95',
        props.class,
      )
    "
    @pointerdown="onPointerdown"
    @pointermove="onPointermove"
    @pointerup="onPointerup"
    @pointercancel="onPointerup"
    @keydown="onKeydown"
    @click="onClick"
  >
    <span
      v-if="open"
      aria-hidden="true"
      class="ginko:bg-background ginko:z-20 ginko:text-muted-foreground ginko:pointer-events-none ginko:absolute ginko:top-1/2 ginko:left-1/2 ginko:-translate-x-1/2 ginko:-translate-y-1/2 ginko:rounded-sm ginko:border ginko:p-0.5 ginko:opacity-0 ginko:shadow-sm ginko:transition-opacity ginko:duration-(--motion-fast) ginko:group-hover:opacity-100 ginko:group-focus-visible:opacity-100"
    >
      <GripVertical class="ginko:size-3" />
    </span>
  </button>
</template>
