import { useEventListener, useMediaQuery, useStorage, useWindowSize } from '@vueuse/core'
import {
  computed,
  inject,
  markRaw,
  onScopeDispose,
  provide,
  ref,
  shallowRef,
  type Component,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from 'vue'
import { useRoute } from 'vue-router'

// SPA port of the template's `app/composables/useRightSidebar.ts` (RFC D3).
// The controller API (registerPanel, useRightSidebarPanel, widthVars, tiered
// resize, Cmd/Ctrl+.) is kept identical to the template so future template
// updates diff cleanly. Three Nuxt-isms are shimmed:
//   - useCookie(...)          -> useStorage (VueUse, localStorage)
//   - route.meta.rightSidebar -> vue-router meta (API-identical)
//   - the Nuxt client build flag -> a plain `typeof document` client guard
// The Studio is client-only, so the template's SSR/hydration caveats do not
// apply — but the tri-state open preference, the null-means-responsive-default
// size semantics, and the registration-disposal race guard are all preserved.

// localStorage keys (were useCookie names in the template).
const OPEN_STORAGE_KEY = 'ginko-studio-right-sidebar-state' // boolean | null (null = "no preference yet")
const SIZE_STORAGE_KEY = 'ginko-studio-right-sidebar-size' // number (rem) | null (null = responsive default)

// Explicit serializers preserve the tri-state semantics through localStorage.
// VueUse's default serializer for a `null` init is the "any" serializer, which
// only String()s values on write and returns the raw string on read — that
// would turn a stored `false` into the truthy string "false" and a stored
// number into a non-finite string. These JSON-shaped serializers round-trip
// true / false / null and finite numbers / null faithfully, and never throw on
// corrupt storage (falling back to null = "no preference").
const OPEN_PREF_SERIALIZER = {
  read: (raw: string): boolean | null => (raw === 'true' ? true : raw === 'false' ? false : null),
  write: (value: boolean | null): string => String(value),
}
const SIZE_PREF_SERIALIZER = {
  read: (raw: string): number | null => {
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : null
  },
  write: (value: number | null): string => (value === null ? '' : String(value)),
}
// Cmd/Ctrl+Period — the right-hand counterpart to the left sidebar's Cmd+B.
const RIGHT_SIDEBAR_KEYBOARD_SHORTCUT = '.'

// Width is viewport-tiered. On laptop-class screens (< 1536px) the panel is a
// real split-view workspace: default ~57.5vw (≈747px on a 1300px screen),
// resizable up to 65vw capped at 900px. On wide screens (≥ 1536px) it is a
// compact side panel with the classic 320px default / 480px max. When the user
// has no stored preference the width comes from pure CSS (clamp + 2xl
// breakpoint) so the layout never has to guess the viewport.
export const RIGHT_SIDEBAR_MIN_REM = 17.5 // 280px — absolute minimum, all tiers
export const RIGHT_SIDEBAR_ABS_MAX_REM = 56.25 // 900px — absolute maximum (laptop tier cap)
export const RIGHT_SIDEBAR_WIDE_DEFAULT_REM = 20 // 320px — default on ≥1536px screens
export const RIGHT_SIDEBAR_WIDE_MAX_REM = 30 // 480px — max on ≥1536px screens
// The panel must never crush the rest of the app: --rsw-reserve holds the
// space kept free for the left sidebar (when expanded) plus a 24rem minimum
// for the main content. RightSidebar.vue sets it via a :has() variant so it
// tracks the left sidebar's collapsed state live, in pure CSS.
const LAPTOP_DEFAULT_CSS = 'min(clamp(30rem, 57.5vw, 50rem), calc(100vw - var(--rsw-reserve)))'
const LAPTOP_MAX_CSS = 'min(65vw, 56.25rem, calc(100vw - var(--rsw-reserve)))'
const WIDE_BREAKPOINT_PX = 1536 // Tailwind 2xl
// Main-content floor for the panel's drag/keyboard resize cap. This is ONLY the
// main column's minimum — the left sidebar's real rendered width is measured and
// added on top by reservePx() (SIDEBAR_WIDTH = 16rem expanded, --sidebar-width-icon
// = 3rem when icon-collapsed), so it must not be baked in here.
//
// Tuned for the Studio's actual shell (visual-parity pass). The Studio runs the
// left rail in the template's `inset` variant with `collapsible=icon`: the
// SidebarInset floats as a rounded card with an `m-2` gutter around it. So the
// main-content floor is the 24rem minimum plus that ~2rem inset-margin term =
// 26rem = 416px. (The CSS mirror of this floor lives in RightSidebar.vue's
// `--rsw-reserve`, which starts from the same 26rem term and adds the left
// rail's rendered width via a :has() variant.)
export const MAIN_CONTENT_RESERVE_PX = 416

export function clampRightSidebarSize(
  rem: number,
  min: number = RIGHT_SIDEBAR_MIN_REM,
  max: number = RIGHT_SIDEBAR_ABS_MAX_REM,
): number | null {
  if (!Number.isFinite(rem)) {
    return null
  }
  return Math.min(max, Math.max(min, rem))
}

/** True when the keystroke originated inside a text-editing surface. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true
}

/**
 * Pure predicate for the Cmd/Ctrl+. panel toggle, extracted so the gating is
 * unit-testable. The panel only ever toggles with a command modifier held, so
 * a bare `.` — including one typed into an <input>, <textarea>, or a
 * contenteditable (TipTap) — always falls through as normal text and never
 * shadows the command palette or editor keymaps. The editable-target check is
 * kept explicit (RFC Phase 4 step 4): if the modifier requirement is ever
 * relaxed, typing `.` in an editor must still not toggle the panel.
 */
export function shouldToggleRightSidebar(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'> & {
    target?: EventTarget | null
  },
): boolean {
  if (event.key !== RIGHT_SIDEBAR_KEYBOARD_SHORTCUT) {
    return false
  }
  const hasModifier = event.metaKey || event.ctrlKey
  if (isEditableTarget(event.target ?? null) && !hasModifier) {
    return false
  }
  return hasModifier
}

export interface RightSidebarPanelDef {
  title: MaybeRefOrGetter<string>
  description?: MaybeRefOrGetter<string | undefined>
  component: Component
  props?: MaybeRefOrGetter<Record<string, unknown>>
  /** applied only while the open preference is still null (no preference yet) */
  defaultOpen?: boolean
  /**
   * Compact panels (metadata/detail lists — assets, reviews, collection
   * status) use the wide-tier 320px default even on laptop viewports, instead
   * of the split-view 57.5vw workspace width that only content-heavy panels
   * (the entry editor) earn. Studio-specific extension of the template API.
   * A user drag preference still overrides this.
   */
  compact?: boolean
}

export interface RightSidebarController {
  open: Ref<boolean>
  setOpen: (value: boolean) => void
  toggle: () => void
  isMobile: Ref<boolean>
  openMobile: Ref<boolean>
  setOpenMobile: (value: boolean) => void
  state: ComputedRef<'expanded' | 'collapsed'>
  panel: Readonly<ShallowRef<RightSidebarPanelDef | null>>
  available: ComputedRef<boolean>
  registerPanel: (def: RightSidebarPanelDef) => () => void
  /** stored width preference in rem; null = responsive CSS default */
  sizePref: ComputedRef<number | null>
  /** CSS width values for the open panel, one per viewport tier */
  widthVars: ComputedRef<{ laptop: string; wide: string }>
  /** resize bounds for the CURRENT viewport tier (client-side; rem) */
  tierMinRem: ComputedRef<number>
  /** function, not computed: it measures the left sidebar's rendered width,
   *  which Vue reactivity cannot track — a fresh read per call keeps the drag
   *  cap correct right after the left sidebar collapses or expands */
  tierMaxRem: () => number
  setSize: (rem: number) => void
  resetSize: () => void
}

const rightSidebarKey: InjectionKey<RightSidebarController> = Symbol('right-sidebar')

export function provideRightSidebar(): RightSidebarController {
  const route = useRoute()
  const panel = shallowRef<RightSidebarPanelDef | null>(null)
  const activeRegistration = shallowRef<symbol | null>(null)

  // Availability comes from `route.meta.rightSidebar` OR a live registration:
  // the layout header renders BEFORE the page's setup registers its panel, so
  // the route-meta signal keeps the header trigger visible from the first frame.
  const available = computed(() => route.meta.rightSidebar === true || panel.value !== null)

  const isMobile = useMediaQuery('(max-width: 767px)')
  // openMobile is intentionally NOT persisted: it always starts false so a
  // desktop-open preference can never pop the mobile Sheet open on load.
  const openMobile = ref(false)

  // Tri-state open preference: true / false / null (no preference yet).
  const openPref = useStorage<boolean | null>(OPEN_STORAGE_KEY, null, undefined, {
    serializer: OPEN_PREF_SERIALIZER,
  })

  const open = computed<boolean>({
    get: () => openPref.value ?? panel.value?.defaultOpen ?? false,
    // Persist the preference unconditionally. Visibility is gated at render time
    // by `available`; the setter never destroys the preference when unavailable.
    set: (value) => {
      openPref.value = value
    },
  })

  function setOpen(value: boolean) {
    open.value = value
  }

  function setOpenMobile(value: boolean) {
    openMobile.value = value
  }

  function toggle() {
    if (isMobile.value) {
      openMobile.value = !openMobile.value
    } else {
      open.value = !open.value
    }
  }

  useEventListener('keydown', (event: KeyboardEvent) => {
    if (!shouldToggleRightSidebar(event)) {
      return
    }
    event.preventDefault()
    if (available.value) {
      toggle()
    }
  })

  const state = computed(() => (open.value ? 'expanded' : 'collapsed'))

  const sizeStorage = useStorage<number | null>(SIZE_STORAGE_KEY, null, undefined, {
    serializer: SIZE_PREF_SERIALIZER,
  })
  const sizePref = computed(() =>
    sizeStorage.value === null ? null : clampRightSidebarSize(sizeStorage.value),
  )

  // A stored preference is still clamped by the active tier VIA CSS, so a
  // 750px laptop preference degrades gracefully to 480px on a wide screen and
  // comes back untouched when the viewport shrinks again.
  const widthVars = computed(() => {
    const pref = sizePref.value
    if (pref === null) {
      return {
        laptop: panel.value?.compact ? `${RIGHT_SIDEBAR_WIDE_DEFAULT_REM}rem` : LAPTOP_DEFAULT_CSS,
        wide: `${RIGHT_SIDEBAR_WIDE_DEFAULT_REM}rem`,
      }
    }
    return {
      laptop: `clamp(${RIGHT_SIDEBAR_MIN_REM}rem, ${pref}rem, ${LAPTOP_MAX_CSS})`,
      wide: `clamp(${RIGHT_SIDEBAR_MIN_REM}rem, ${pref}rem, ${RIGHT_SIDEBAR_WIDE_MAX_REM}rem)`,
    }
  })

  // Client-side bounds for keyboard/drag resizing on the current viewport.
  const { width: viewportPx } = useWindowSize()
  const isWideTier = computed(() => viewportPx.value >= WIDE_BREAKPOINT_PX)
  const tierMinRem = computed(() => RIGHT_SIDEBAR_MIN_REM)

  function reservePx(): number {
    // Mirror of --rsw-reserve: main-content minimum plus the left sidebar's
    // rendered width (0 when collapsed/offcanvas).
    const leftSidebar = document.querySelector<HTMLElement>(
      '[data-slot="sidebar"][data-side="left"]',
    )
    return MAIN_CONTENT_RESERVE_PX + (leftSidebar?.offsetWidth ?? 0)
  }

  function tierMaxRem(): number {
    if (isWideTier.value) {
      return RIGHT_SIDEBAR_WIDE_MAX_REM
    }
    const capPx = Math.min(
      viewportPx.value * 0.65,
      RIGHT_SIDEBAR_ABS_MAX_REM * 16,
      viewportPx.value - (typeof document !== 'undefined' ? reservePx() : 0),
    )
    return Math.max(RIGHT_SIDEBAR_MIN_REM, capPx / 16)
  }

  function setSize(rem: number) {
    sizeStorage.value = clampRightSidebarSize(rem, tierMinRem.value, tierMaxRem())
  }

  function resetSize() {
    sizeStorage.value = null
  }

  function registerPanel(def: RightSidebarPanelDef): () => void {
    const registration = Symbol('right-sidebar-registration')
    activeRegistration.value = registration
    // markRaw the component so Vue never reactivity-wraps a component definition.
    panel.value = { ...def, component: markRaw(def.component) }

    // Disposer only clears if this is still the active registration — safe when
    // a page transition mounts the new page before the old one unmounts.
    return () => {
      if (activeRegistration.value === registration) {
        panel.value = null
        activeRegistration.value = null
      }
    }
  }

  const controller: RightSidebarController = {
    open,
    setOpen,
    toggle,
    isMobile,
    openMobile,
    setOpenMobile,
    state,
    panel,
    available,
    registerPanel,
    sizePref,
    widthVars,
    tierMinRem,
    tierMaxRem,
    setSize,
    resetSize,
  }

  provide(rightSidebarKey, controller)
  return controller
}

export function useRightSidebar(): RightSidebarController {
  const controller = inject(rightSidebarKey)
  if (!controller) {
    throw new Error('useRightSidebar() is only available inside the Studio layout')
  }
  return controller
}

export function useRightSidebarPanel(def: RightSidebarPanelDef): void {
  const { registerPanel } = useRightSidebar()
  const dispose = registerPanel(def)
  onScopeDispose(dispose)
}
