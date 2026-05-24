import de from '@public/locales/de'
import en from '@public/locales/en'
import { computed, ref } from 'vue'

// SPA-internal i18n that mirrors the public useCmsI18n shape so studio code
// can move into the SPA without touching its useCmsI18n() call sites.
//
// Differences from the public composable:
// - No nuxt-i18n-micro / Nuxt host integration. The SPA owns its own dict.
// - Locale persists via localStorage instead of Nuxt's useCookie.
// - dateLocale, studioLocales, switchLocale, setStudioLocale match.

const dictionaries = { en, de } as const
type LocaleCode = keyof typeof dictionaries

const STORAGE_KEY = 'ginko-cms-studio-locale'

function readStoredLocale(): LocaleCode {
  if (typeof localStorage === 'undefined') return 'en'
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'de' ? 'de' : 'en'
}

const currentLocaleRef = ref<LocaleCode>(readStoredLocale())

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[segment]
  }, source)
}

function interpolate(template: string, params?: Record<string, unknown>) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value == null ? '' : String(value)
  })
}

const studioLocaleMeta: Record<LocaleCode, { label: string; flag: string }> = {
  en: { label: 'English', flag: 'circle-flags:gb' },
  de: { label: 'Deutsch', flag: 'circle-flags:de' },
}

export function useCmsI18n() {
  const currentLocale = computed<LocaleCode>(() => currentLocaleRef.value)
  const dateLocale = computed(() => (currentLocale.value === 'de' ? 'de-DE' : 'en-US'))

  const availableLocales = computed(() =>
    (Object.keys(dictionaries) as LocaleCode[]).map((code) => ({
      code,
      label: studioLocaleMeta[code].label,
    })),
  )

  const studioLocales = computed(() =>
    (Object.keys(dictionaries) as LocaleCode[]).map((code) => ({
      code,
      ...studioLocaleMeta[code],
    })),
  )

  function t(key: string, params?: Record<string, unknown>, defaultValue?: string): string {
    const localized =
      getByPath(dictionaries[currentLocale.value], key) ??
      getByPath(dictionaries.en, key) ??
      defaultValue ??
      key
    return typeof localized === 'string' ? interpolate(localized, params) : String(localized)
  }

  function setStudioLocale(locale: string) {
    if (locale !== 'en' && locale !== 'de') return
    currentLocaleRef.value = locale
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, locale)
    }
  }

  function switchLocale(locale: string) {
    setStudioLocale(locale)
  }

  return {
    t,
    currentLocale,
    dateLocale,
    availableLocales,
    studioLocales,
    switchLocale,
    setStudioLocale,
  }
}
