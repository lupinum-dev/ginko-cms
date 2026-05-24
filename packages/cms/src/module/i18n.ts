import type { LocaleConfig, ModuleOptions } from './options.js'

interface I18nLocaleOption {
  code: string
  iso?: string
  name?: string
  label?: string
}

export interface I18nModuleOptions {
  locales?: I18nLocaleOption[]
  strategy?: string
  defaultLocale?: string
  fallbackLocale?: string
  autoDetectLanguage?: boolean
  localeCookie?: string | null
}

export interface ResolvedLocaleSettings {
  defaultLocale: string
  locales: LocaleConfig[]
}

export function resolveLocaleSettings(options: ModuleOptions): ResolvedLocaleSettings {
  const requestedDefaultLocale = options.defaultLocale.trim() || 'en'
  const normalizedLocales = options.locales
    .map((locale) => ({
      ...locale,
      code: locale.code.trim(),
    }))
    .filter((locale) => locale.code.length > 0)

  const locales =
    normalizedLocales.length > 0
      ? normalizedLocales
      : [{ code: requestedDefaultLocale, isDefault: true }]

  const localeCodes = new Set(locales.map((locale) => locale.code))
  if (!localeCodes.has(requestedDefaultLocale)) {
    throw new Error(
      `[ginko-cms] ginkoCms.defaultLocale "${requestedDefaultLocale}" must exist in ginkoCms.locales.`,
    )
  }

  return {
    defaultLocale: requestedDefaultLocale,
    locales: locales.map((locale) => ({
      ...locale,
      isDefault: locale.code === requestedDefaultLocale,
    })),
  }
}

export function assertI18nCompatibility(
  i18nOptions: I18nModuleOptions,
  localeSettings: ResolvedLocaleSettings,
) {
  if (!Array.isArray(i18nOptions.locales) || i18nOptions.locales.length === 0) {
    return
  }

  const i18nLocaleCodes = new Set(
    i18nOptions.locales
      .map((locale) => locale.code?.trim())
      .filter((code): code is string => Boolean(code)),
  )

  for (const locale of localeSettings.locales) {
    if (!i18nLocaleCodes.has(locale.code)) {
      throw new Error(
        `[ginko-cms] ginkoCms.locales and i18n.locales disagree. Missing locale "${locale.code}" in i18n.locales.`,
      )
    }
  }

  if (i18nOptions.defaultLocale && i18nOptions.defaultLocale !== localeSettings.defaultLocale) {
    throw new Error(
      `[ginko-cms] ginkoCms.defaultLocale "${localeSettings.defaultLocale}" does not match i18n.defaultLocale "${i18nOptions.defaultLocale}".`,
    )
  }
}

export function hasConfiguredI18nLocales(i18nOptions: I18nModuleOptions): boolean {
  return Array.isArray(i18nOptions.locales) && i18nOptions.locales.length > 0
}

export function syncConfiguredI18nDefaults(
  i18nOptions: I18nModuleOptions,
  localeSettings: ResolvedLocaleSettings,
) {
  if (!hasConfiguredI18nLocales(i18nOptions)) {
    return
  }

  i18nOptions.defaultLocale ??= localeSettings.defaultLocale
  i18nOptions.fallbackLocale ??= localeSettings.defaultLocale
}
