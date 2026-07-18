import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// SPA replacement for Nuxt's useColorMode composable. Studio code only uses
// `colorMode.preference` (read + write 'system' | 'light' | 'dark'), so this
// stub just persists that preference in localStorage and applies / removes
// the `dark` class on <html>.
//
// In Nuxt the consumer's color-mode setup also drives this class via SSR;
// when the SPA is embedded in stage 5 the host page will have already set
// the right class before the SPA boots, so the SPA only needs to keep itself
// in sync with subsequent toggles.

type ColorPreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'ginko-cms-studio-color-mode'

function readStoredPreference(): ColorPreference {
  if (typeof localStorage === 'undefined') return 'system'
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'system'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

const preferenceRef = ref<ColorPreference>(readStoredPreference())

function effectiveValue(pref: ColorPreference): 'light' | 'dark' {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref
}

function applyToDocument(value: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', value === 'dark')
}

export function useColorMode() {
  let systemMediaQuery: MediaQueryList | null = null
  const applySystemPreference = () => {
    if (preferenceRef.value === 'system') {
      applyToDocument(systemPrefersDark() ? 'dark' : 'light')
    }
  }

  onMounted(() => {
    systemMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    systemMediaQuery?.addEventListener?.('change', applySystemPreference)
    applyToDocument(effectiveValue(preferenceRef.value))
  })

  onBeforeUnmount(() => {
    systemMediaQuery?.removeEventListener?.('change', applySystemPreference)
  })

  return {
    get preference(): ColorPreference {
      return preferenceRef.value
    },
    set preference(next: ColorPreference) {
      preferenceRef.value = next
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next)
      }
      applyToDocument(effectiveValue(next))
    },
    value: computed(() => effectiveValue(preferenceRef.value)),
    unknown: computed(() => false),
  }
}
