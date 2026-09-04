import type { ResolvedLocaleSettings } from './i18n.js'
import type { ResolvedModuleOptions } from './options.js'

type PublicRuntimeCollection = {
  label: ResolvedModuleOptions['collections'][string]['label'] | string
  icon: ResolvedModuleOptions['collections'][string]['icon']
  type: ResolvedModuleOptions['collections'][string]['type']
  routing: ResolvedModuleOptions['collections'][string]['routing']
  locales: string[]
  fields: NonNullable<ResolvedModuleOptions['collections'][string]['fields']>
  settings: ResolvedModuleOptions['collections'][string]['settings']
}

export type PublicRuntimeCollections = Record<string, PublicRuntimeCollection>

export function buildPublicRuntimeCollections(
  options: ResolvedModuleOptions,
  localeSettings: ResolvedLocaleSettings,
): PublicRuntimeCollections {
  return Object.fromEntries(
    Object.entries(options.collections).map(([slug, collection]) => [
      slug,
      {
        label: collection.label ?? slug,
        icon: collection.icon,
        type: collection.type,
        routing: collection.routing,
        locales: collection.locales?.length
          ? collection.locales
          : localeSettings.locales.map((locale) => locale.code),
        fields: collection.fields ?? [],
        settings: collection.settings ?? {},
      },
    ]),
  )
}
