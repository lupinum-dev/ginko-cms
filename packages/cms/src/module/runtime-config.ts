import type { ResolvedLocaleSettings } from './i18n.js'
import type { ModuleOptions } from './options.js'

type PublicRuntimeCollection = {
  label: ModuleOptions['collections'][string]['label'] | string
  icon: ModuleOptions['collections'][string]['icon']
  type: ModuleOptions['collections'][string]['type']
  routing: ModuleOptions['collections'][string]['routing']
  locales: string[]
  fields: NonNullable<ModuleOptions['collections'][string]['fields']>
  settings: ModuleOptions['collections'][string]['settings']
}

export type PublicRuntimeCollections = Record<string, PublicRuntimeCollection>

export function buildPublicRuntimeCollections(
  options: ModuleOptions,
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
