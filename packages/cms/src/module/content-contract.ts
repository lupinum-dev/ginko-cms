import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import type {
  ResolvedContentCollectionV1,
  ResolvedContentContractV1,
  ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import { readResolvedContentContract } from '@lupinum/ginko-content/cms-contract/node'
import { createJiti } from 'jiti'

import type { CmsEditorialLayout, CollectionConfig, FieldConfig } from './options.js'

type ContentConfigLike = {
  provider?: string
}

export type ContentRuntimePolicyInput = {
  defaultLocale?: string
  locales?: string[]
  fallback?: Record<string, string[]>
  translatedSlugs?: boolean
}

async function loadContentConfig(rootDir: string): Promise<ContentConfigLike> {
  const configPath = resolve(rootDir, 'content.config.ts')
  if (!existsSync(configPath)) return {}
  const importer = createJiti(import.meta.url, { interopDefault: true })
  const loaded = await importer.import(configPath)
  return ((loaded as { default?: unknown }).default ?? loaded) as ContentConfigLike
}

export async function loadGinkoContentContract(options: {
  rootDir: string
}): Promise<ResolvedContentContractV1> {
  return (await readResolvedContentContract({ root: options.rootDir })).contract
}

export async function loadGinkoContentProviderName(rootDir: string): Promise<string | null> {
  const contentConfig = await loadContentConfig(rootDir)
  return typeof contentConfig.provider === 'string' ? contentConfig.provider : null
}

function titleize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

/**
 * A label that merely restates the field key (ignoring case and separators,
 * e.g. 'BodyMdc' for `bodyMdc`) carries no editorial intent. Omitting it lets
 * Studio derive a properly humanized label ('Body') instead of echoing code.
 */
function isEchoOfKey(label: unknown, key: string): boolean {
  const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return typeof label === 'string' && normalize(label) === normalize(key)
}

function fieldFromContract(
  field: ResolvedContentFieldV1,
  layout: CmsEditorialLayout['collections'][string]['fields'][string] | undefined,
): FieldConfig {
  return {
    key: field.key,
    type: field.type,
    ...(layout?.label !== undefined && !isEchoOfKey(layout.label, field.key)
      ? { label: layout.label }
      : {}),
    required: field.required,
    localized: field.localized,
    searchable: field.searchable,
    sortable: field.sortable,
    ...(layout?.description !== undefined ? { description: layout.description } : {}),
    ...(layout?.hidden !== undefined ? { hidden: layout.hidden } : {}),
    ...(layout?.width !== undefined ? { width: layout.width } : {}),
    ...(field.default.present ? { defaultValue: field.default.value as JsonValue } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.relation
      ? { relation: { collection: field.relation.collection, multiple: field.relation.multiple } }
      : {}),
    ...(field.media
      ? { media: { accept: field.media.mediaTypes, aspectRatio: field.media.aspectRatio } }
      : {}),
    ...(field.fields
      ? { fields: field.fields.map((child) => fieldFromContract(child, undefined)) }
      : {}),
    ...(field.validation
      ? { validation: field.validation as unknown as FieldConfig['validation'] }
      : {}),
    ...(field.min !== null ? { min: field.min } : {}),
    ...(field.max !== null ? { max: field.max } : {}),
    ...(field.step !== null ? { step: field.step } : {}),
    ...(field.slugFrom !== null ? { slugFrom: field.slugFrom } : {}),
    ...(field.language !== null ? { language: field.language } : {}),
  }
}

function collectionSettings(collection: ResolvedContentCollectionV1): JsonValue {
  return {
    defaultLocale: collection.defaultLocale,
    localizedPathPrefixes: collection.routing.localizedPathPrefixes,
    localizedSingletonPaths: collection.routing.localizedSingletonPaths,
    allowMultipleRoots: collection.routing.allowMultipleRoots,
    portable: collection.portable,
    componentPolicy: collection.componentPolicy,
  } as unknown as JsonValue
}

export function projectContractCollections(
  contract: ResolvedContentContractV1,
  layout?: CmsEditorialLayout,
): Record<string, CollectionConfig> {
  validateEditorialLayout(contract, layout)
  return Object.fromEntries(
    Object.entries(contract.collections).map(([id, collection]) => {
      const collectionLayout = layout?.collections[id]
      return [
        id,
        {
          label: collectionLayout?.label ?? titleize(id),
          ...(collectionLayout?.icon ? { icon: collectionLayout.icon } : {}),
          type: collection.structure,
          locales: collection.locales,
          routing: {
            mode: collection.routing.mode,
            pathPrefix: collection.routing.pathPrefix,
            slugMode: collection.routing.slugMode,
            rootSlug: collection.routing.rootSlug,
            singleton: collection.routing.singleton,
          },
          fields: collection.fields.map((field) =>
            fieldFromContract(field, collectionLayout?.fields[field.key]),
          ),
          settings: collectionSettings(collection),
        } satisfies CollectionConfig,
      ]
    }),
  )
}

function validateEditorialLayout(
  contract: ResolvedContentContractV1,
  layout: CmsEditorialLayout | undefined,
): void {
  if (!layout) return
  assertOnlyKeys(layout, ['collections'], 'Editorial layout')
  for (const [collectionSlug, collectionLayout] of Object.entries(layout.collections)) {
    const collection = contract.collections[collectionSlug]
    if (!collection)
      throw new Error(
        `[ginko-cms] Editorial layout references unknown collection "${collectionSlug}".`,
      )
    assertOnlyKeys(
      collectionLayout,
      ['label', 'icon', 'fields'],
      `Editorial layout collection "${collectionSlug}"`,
    )
    const fieldKeys = new Set(collection.fields.map((field) => field.key))
    for (const [fieldKey, fieldLayout] of Object.entries(collectionLayout.fields)) {
      if (!fieldKeys.has(fieldKey)) {
        throw new Error(
          `[ginko-cms] Editorial layout references unknown field "${collectionSlug}.${fieldKey}".`,
        )
      }
      assertOnlyKeys(
        fieldLayout,
        ['label', 'description', 'hidden', 'width'],
        `Editorial layout field "${collectionSlug}.${fieldKey}"`,
      )
    }
  }
}

function assertOnlyKeys(value: object, allowed: string[], path: string): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key))
  if (unknown) throw new Error(`[ginko-cms] ${path} contains unknown key "${unknown}".`)
}
