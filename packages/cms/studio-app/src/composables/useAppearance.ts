import { useStorage } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Studio accent controller.
 *
 * The accent is a browser-local presentation preference. `Layout.vue` binds
 * the derived class to the Studio root, so it remains scoped to Studio and
 * survives access-state branch changes without imperative DOM mutation. Theme
 * mode is owned separately by `useColorMode`.
 */

export type AppearanceColor = 'default' | 'blue' | 'amber' | 'green' | 'violet'

export interface AppearanceState {
  color: AppearanceColor
}

export const APPEARANCE_COLORS: AppearanceColor[] = ['default', 'blue', 'amber', 'green', 'violet']

export const APPEARANCE_STORAGE_KEY = 'ginko-studio-appearance'

const DEFAULT_APPEARANCE: AppearanceState = { color: 'default' }

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
      state.value = { color: value }
    },
  })

  const appearanceClasses = computed<string[]>(() =>
    color.value === 'default' ? [] : [`color-${color.value}`],
  )

  function setColor(value: AppearanceColor) {
    color.value = value
  }

  function reset() {
    state.value = { ...DEFAULT_APPEARANCE }
  }

  return {
    state,
    color,
    appearanceClasses,
    setColor,
    reset,
    COLORS: APPEARANCE_COLORS,
  }
}

export function useAppearance() {
  if (!store) store = createAppearanceStore()
  return store
}
