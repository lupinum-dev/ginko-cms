import { computed, ref, useCookie, useNuxtApp, watch } from '#imports'
/**
 * CMS module i18n composable.
 *
 * Strategy:
 * - The CMS module bundles its own UI translation dictionaries (one file per
 *   language in `src/runtime/locales/`). These are used for all studio UI
 *   strings so the module works out of the box without host-app configuration.
 * - If the host app provides nuxt-i18n-micro, this composable checks there
 *   first (`$has` / `$t`). This lets integrators override any CMS string via
 *   their own i18n files.
 * - Fallback chain: host-app i18n -> current locale dictionary -> English
 *   dictionary -> raw key.
 *
 * Adding a new language:
 *   1. Create a new file in `src/runtime/locales/<code>.ts` (copy `en.ts`).
 *   2. Add it to the `dictionaries` map below.
 *   3. Extend the `normalizeLocale` function if the code needs special handling.
 */

import de from '../locales/de'
import en from '../locales/en'

const dictionaries = {
  en,
  de,
} as const

type LocaleCode = keyof typeof dictionaries

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

/** Shape of the nuxt-i18n-micro plugin injected into the Nuxt app instance. */
interface NuxtI18nMicroPlugin {
  $getLocale?: () => string
  $getLocales?: () => Array<{
    code?: string
    iso?: string
    name?: string
    label?: string
  }>
  $has?: (key: string) => boolean
  $t?: (key: string, params?: Record<string, unknown>, defaultValue?: string | null) => string
  $switchLocale?: (locale: string) => unknown
}

function normalizeLocale(locale?: string | null): LocaleCode {
  const normalized = locale?.toLowerCase().slice(0, 2)
  if (normalized === 'de') return 'de'
  return 'en'
}

const COOKIE_KEY = 'ginko-cms-studio-locale'

const studioLocaleOverride = ref<string | null>(null)
let initialized = false

export function useCmsI18n() {
  if (!initialized) {
    const cookie = useCookie<string | null>(COOKIE_KEY, {
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
    })

    studioLocaleOverride.value = cookie.value ?? null

    watch(studioLocaleOverride, (value) => {
      cookie.value = value ?? null
    })
    initialized = true
  }

  const i18n = useNuxtApp() as unknown as NuxtI18nMicroPlugin
  const currentLocale = computed<LocaleCode>(() =>
    normalizeLocale(studioLocaleOverride.value ?? i18n.$getLocale?.()),
  )
  const dateLocale = computed(() => (currentLocale.value === 'de' ? 'de-DE' : 'en-US'))
  const availableLocales = computed(() => {
    const locales = i18n.$getLocales?.() ?? [
      { code: 'en', iso: 'en-US' },
      { code: 'de', iso: 'de-DE' },
    ]

    return locales.map((locale: { code?: string; name?: string; label?: string }) => {
      const code = typeof locale.code === 'string' ? locale.code : String(locale.code ?? '')
      return {
        code,
        label:
          typeof locale.name === 'string'
            ? locale.name
            : typeof locale.label === 'string'
              ? locale.label
              : code.toUpperCase(),
      }
    })
  })

  function t(key: string, params?: Record<string, unknown>, defaultValue?: string) {
    if (i18n.$has?.(key) && i18n.$t) {
      return i18n.$t(key, params, defaultValue ?? null)
    }

    const localized =
      getByPath(dictionaries[currentLocale.value], key) ??
      getByPath(dictionaries.en, key) ??
      defaultValue ??
      key

    return typeof localized === 'string' ? interpolate(localized, params) : String(localized)
  }

  function switchLocale(locale: string) {
    return i18n.$switchLocale?.(locale)
  }

  function setStudioLocale(locale: string) {
    studioLocaleOverride.value = locale
  }

  const studioLocaleMeta: Record<LocaleCode, { label: string; flag: string }> = {
    en: { label: 'English', flag: 'circle-flags:gb' },
    de: { label: 'Deutsch', flag: 'circle-flags:de' },
  }

  const studioLocales = computed(() =>
    (Object.keys(dictionaries) as LocaleCode[]).map((code) => ({
      code,
      ...studioLocaleMeta[code],
    })),
  )

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
