import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildCmsContract,
  type BuildCmsContractInput,
  type CmsCollectionContract,
  type CmsFieldContract,
} from '@lupinum/ginko-content/cms-contract'
import { createJiti } from 'jiti'

import type { CollectionConfig, FieldConfig, LocaleConfig } from './options.js'

type ContentConfigLike = BuildCmsContractInput & {
  collections?: Record<string, ContentCollectionLike>
  provider?: string
}

type ContentCollectionLike = BuildCmsContractInput['collections'][string]

type JsonObjectLike = Record<string, unknown>

type DeriveOptions = {
  rootDir: string
  defaultLocale: string
  locales: LocaleConfig[]
  include?: string[]
  overrides?: Record<string, Partial<CollectionConfig>>
  translatedSlugs?: boolean
}

export async function loadGinkoContentCollections(
  options: DeriveOptions,
): Promise<Record<string, CollectionConfig>> {
  const configPath = resolve(options.rootDir, 'content.config.ts')
  if (!existsSync(configPath)) return {}

  const importer = createJiti(import.meta.url, { interopDefault: true })
  const loaded = await importer.import(configPath)
  const contentConfig = ((loaded as { default?: unknown }).default ?? loaded) as ContentConfigLike
  const collections = applyGlobalTranslatedSlugs(
    contentConfig.collections ?? {},
    options.translatedSlugs === true,
  )
  const contract = buildCmsContract(
    { collections },
    {
      defaultLocale: options.defaultLocale,
      locales: options.locales.map((locale) => locale.code),
      include: options.include,
    },
  )

  const derived: Record<string, CollectionConfig> = {}
  for (const [slug, collection] of Object.entries(contract.collections)) {
    derived[slug] = applyCollectionOverride(
      collectionFromContract(collection),
      options.overrides?.[slug],
    )
  }
  return derived
}

function applyGlobalTranslatedSlugs(
  collections: Record<string, ContentCollectionLike>,
  translatedSlugs: boolean,
): Record<string, ContentCollectionLike> {
  if (!translatedSlugs) return collections
  return Object.fromEntries(
    Object.entries(collections).map(([slug, collection]) => [
      slug,
      collection.i18n && collection.translatedSlugs === undefined
        ? { ...collection, translatedSlugs: true }
        : collection,
    ]),
  )
}

export async function loadGinkoContentProviderName(rootDir: string): Promise<string | null> {
  const configPath = resolve(rootDir, 'content.config.ts')
  if (!existsSync(configPath)) return null

  const importer = createJiti(import.meta.url, { interopDefault: true })
  const loaded = await importer.import(configPath)
  const contentConfig = ((loaded as { default?: unknown }).default ?? loaded) as ContentConfigLike
  return typeof contentConfig.provider === 'string' ? contentConfig.provider : null
}

function collectionFromContract(collection: CmsCollectionContract): CollectionConfig {
  const settings = mergeSettings(routingSettings(collection), {
    ...(collection.settings ?? {}),
    ...(collection.schema ? { cmsSchema: collection.schema } : {}),
  })
  return {
    label: collection.label,
    type: collection.type,
    ...(collection.icon ? { icon: collection.icon } : {}),
    locales: collection.locales,
    routing: {
      mode: collection.routing.mode,
      pathPrefix: collection.routing.pathPrefix,
      slugMode: collection.routing.slugMode,
      ...(collection.routing.rootSlug !== undefined
        ? { rootSlug: collection.routing.rootSlug }
        : {}),
      singleton: collection.routing.singleton,
    },
    fields: collection.fields.map(fieldFromContract),
    ...(settings !== undefined ? { settings } : {}),
  }
}

function fieldFromContract(field: CmsFieldContract): FieldConfig {
  return {
    key: field.key,
    type: field.type,
    label: field.label,
    description: field.description,
    required: field.required,
    localized: field.localized,
    hidden: field.hidden,
    searchable: field.searchable,
    sortable: field.sortable,
    order: field.order,
    width: field.width,
    ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
    ...(field.options !== undefined ? { options: field.options } : {}),
    ...(field.relation !== undefined ? { relation: field.relation } : {}),
    ...(field.media !== undefined ? { media: field.media } : {}),
    ...(field.fields !== undefined && field.fields !== null
      ? { fields: field.fields.map(fieldFromContract) }
      : {}),
    ...(field.validation !== undefined ? { validation: field.validation } : {}),
    ...(field.condition !== undefined ? { condition: field.condition } : {}),
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    ...(field.step !== undefined ? { step: field.step } : {}),
    ...(field.slugFrom !== undefined ? { slugFrom: field.slugFrom } : {}),
    ...(field.language !== undefined ? { language: field.language } : {}),
  }
}

function applyCollectionOverride(
  collection: CollectionConfig,
  override?: Partial<CollectionConfig>,
): CollectionConfig {
  if (!override) return collection
  return {
    ...collection,
    ...override,
    routing: {
      ...collection.routing,
      ...override.routing,
    },
    fields: override.fields ?? collection.fields,
  }
}

function routingSettings(collection: CmsCollectionContract): JsonObjectLike | undefined {
  const localized = collection.routing.singleton
    ? collection.routing.localizedSingletonPaths
    : collection.routing.localizedPathPrefixes
  if (collection.routing.singleton && !localized) {
    return { singletonPath: collection.routing.pathPrefix }
  }
  if (!localized) return undefined
  return collection.routing.singleton
    ? { localizedSingletonPaths: localized }
    : { localizedPathPrefixes: localized }
}

function mergeSettings(
  inferred: JsonObjectLike | undefined,
  explicit: CollectionConfig['settings'] | undefined,
): CollectionConfig['settings'] | undefined {
  if (!inferred) return explicit
  if (explicit === undefined) return inferred as CollectionConfig['settings']
  if (isPlainObject(explicit)) return { ...inferred, ...explicit } as CollectionConfig['settings']
  return explicit
}

function isPlainObject(value: unknown): value is JsonObjectLike {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
