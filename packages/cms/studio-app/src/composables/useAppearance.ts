import { useStorage } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Studio appearance controller (RFC Studio shell-migration, D7).
 *
 * The SPA equivalent of the template's `useAppearance` / `ThemeCustomize`. It
 * persists the chosen color theme, type variant, and (optional) radius in
 * localStorage and derives the set of theme classes that `themes.css` keys off
 * — `.ginko-cms.color-blue`, `.ginko-cms.theme-mono`, `.ginko-cms.theme-scaled`,
 * `.ginko-cms.theme-rounded-*`.
 *
 * APPLICATION MODEL (declarative, not imperative):
 *   The template applies these classes to `<body>` via a watcher in `app.vue`.
 *   In the SPA the `.ginko-cms` root is a Vue-rendered element (Layout's
 *   SidebarProvider / access-state wrapper). Rather than fight Vue's class
 *   patching by mutating `classList` imperatively, `Layout.vue` binds
 *   `appearanceClasses` into the root element's `:class`. That is fully
 *   reactive — changing any appearance value adds/removes the corresponding
 *   `color-*` / `theme-*` class on the `.ginko-cms` root — and it survives the
 *   access-state branch swap (loading → ready) for free, because both branches
 *   bind the same computed. The theme class names are semantic (not Tailwind
 *   utilities), so the ginkoify codemod leaves them untouched.
 *
 * The full setter API (`setColor` / `setType` / `setRadius` / `reset`) plus the
 * option lists are exported for the Phase 6 Settings → Appearance surface.
 */

export type AppearanceColor =
  | 'default'
  | 'blue'
  | 'amber'
  | 'green'
  | 'orange'
  | 'purple'
  | 'red'
  | 'rose'
  | 'teal'
  | 'violet'
  | 'yellow'

export type AppearanceType = 'default' | 'mono' | 'scaled'

export type AppearanceRadius = 'none' | 'small' | 'medium' | 'large' | 'full'

export interface AppearanceState {
  color: AppearanceColor
  type: AppearanceType
  /** Optional. When unset, `--radius` falls back to the token default. */
  radius?: AppearanceRadius
}

/** Selectable color themes (must mirror the `.color-*` rules in themes.css). */
export const APPEARANCE_COLORS: AppearanceColor[] = [
  'default',
  'blue',
  'amber',
  'green',
  'orange',
  'purple',
  'red',
  'rose',
  'teal',
  'violet',
  'yellow',
]

/** Selectable type variants (must mirror the `.theme-*` rules in themes.css). */
export const APPEARANCE_TYPES: AppearanceType[] = ['default', 'mono', 'scaled']

/** Selectable radius variants (must mirror the `.theme-rounded-*` rules). */
export const APPEARANCE_RADII: AppearanceRadius[] = [
  'none',
  'small',
  'medium',
  'large',
  'full',
]

export const APPEARANCE_STORAGE_KEY = 'ginko-studio-appearance'

const DEFAULT_APPEARANCE: AppearanceState = {
  color: 'default',
  type: 'default',
}

// Module-level singleton so every caller (Layout, a future Settings page)
// shares one reactive source of truth and one localStorage binding.
let store: ReturnType<typeof createAppearanceStore> | null = null

function createAppearanceStore() {
  const state = useStorage<AppearanceState>(
    APPEARANCE_STORAGE_KEY,
    { ...DEFAULT_APPEARANCE },
    undefined,
    { mergeDefaults: true },
  )

  const color = computed<AppearanceColor>({
    get: () => state.value.color ?? 'default',
    set: (value) => {
      state.value = { ...state.value, color: value }
    },
  })

  const type = computed<AppearanceType>({
    get: () => state.value.type ?? 'default',
    set: (value) => {
      state.value = { ...state.value, type: value }
    },
  })

  const radius = computed<AppearanceRadius | undefined>({
    get: () => state.value.radius,
    set: (value) => {
      state.value = { ...state.value, radius: value }
    },
  })

  const appearanceClasses = computed<string[]>(() => {
    const classes: string[] = []
    if (color.value && color.value !== 'default') {
      classes.push(`color-${color.value}`)
    }
    if (type.value === 'mono') classes.push('theme-mono')
    else if (type.value === 'scaled') classes.push('theme-scaled')
    if (radius.value) classes.push(`theme-rounded-${radius.value}`)
    return classes
  })

  function setColor(value: AppearanceColor) {
    color.value = value
  }

  function setType(value: AppearanceType) {
    type.value = value
  }

  function setRadius(value: AppearanceRadius | undefined) {
    radius.value = value
  }

  function reset() {
    state.value = { ...DEFAULT_APPEARANCE }
  }

  return {
    state,
    color,
    type,
    radius,
    appearanceClasses,
    setColor,
    setType,
    setRadius,
    reset,
    COLORS: APPEARANCE_COLORS,
    TYPES: APPEARANCE_TYPES,
    RADII: APPEARANCE_RADII,
  }
}

export function useAppearance() {
  if (!store) {
    store = createAppearanceStore()
  }
  return store
}
