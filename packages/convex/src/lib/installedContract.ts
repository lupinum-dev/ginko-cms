import type { CmsField, JsonValue, LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  type ResolvedContentCollectionV1,
  type ResolvedContentContractV1,
  type ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'

import type { Doc } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { CmsCollection, ReadCtx } from './types.js'

type JsonRecord = Record<string, JsonValue>

export type InstalledCmsContract = {
  record: Doc<'cmsContract'>
  content: ResolvedContentContractV1
}

function isJsonRecord(value: JsonValue | undefined): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function presentationRecord(value: JsonValue, ...path: string[]): JsonRecord | null {
  let current: JsonValue | undefined = value
  for (const segment of path) {
    if (!isJsonRecord(current)) return null
    current = current[segment]
  }
  return isJsonRecord(current) ? current : null
}

function localeText(value: JsonValue | undefined): LocaleText | undefined {
  if (typeof value === 'string') return value
  if (!isJsonRecord(value)) return undefined
  const entries = Object.entries(value)
  if (entries.some(([, label]) => typeof label !== 'string')) return undefined
  return Object.fromEntries(entries) as Record<string, string>
}

function titleize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function projectContentField(
  field: ResolvedContentFieldV1,
  presentation?: JsonRecord | null,
): CmsField {
  const label = localeText(presentation?.label)
  const width = presentation?.width
  return {
    key: field.key,
    type: field.type,
    ...(label !== undefined ? { label } : {}),
    ...(typeof presentation?.description === 'string'
      ? { description: presentation.description }
      : {}),
    ...(typeof presentation?.hidden === 'boolean' ? { hidden: presentation.hidden } : {}),
    ...(width === 'full' || width === 'half' ? { width } : {}),
    required: field.required,
    localized: field.localized,
    searchable: field.searchable,
    sortable: field.sortable,
    ...(field.default.present ? { defaultValue: field.default.value as JsonValue } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.relation
      ? { relation: { collectionId: field.relation.collection, multiple: field.relation.multiple } }
      : {}),
    ...(field.media
      ? { media: { accept: field.media.mediaTypes, aspectRatio: field.media.aspectRatio } }
      : {}),
    ...(field.fields
      ? { fields: field.fields.map((child) => projectContentField(child, null)) }
      : {}),
    ...(field.validation
      ? { validation: field.validation as unknown as CmsField['validation'] }
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

export function projectContentCollection(
  collection: ResolvedContentCollectionV1,
  installed: {
    contentHash: string
    presentation: JsonValue
    installedAt: number
    installedBy: string
  },
): CmsCollection {
  const collectionPresentation = presentationRecord(
    installed.presentation,
    'collections',
    collection.id,
  )
  const fieldPresentation = isJsonRecord(collectionPresentation?.fields)
    ? collectionPresentation.fields
    : null
  const label = localeText(collectionPresentation?.label) ?? titleize(collection.id)
  const icon = collectionPresentation?.icon

  return {
    _id: collection.id,
    slug: collection.id,
    label,
    icon: typeof icon === 'string' ? icon : null,
    type: collection.structure,
    routing: {
      mode: collection.routing.mode,
      pathPrefix: collection.routing.pathPrefix,
      slugMode: collection.routing.slugMode,
      rootSlug: collection.routing.rootSlug,
      singleton: collection.routing.singleton,
    },
    locales: collection.locales,
    fields: collection.fields.map((field) =>
      projectContentField(
        field,
        fieldPresentation && isJsonRecord(fieldPresentation[field.key])
          ? (fieldPresentation[field.key] as JsonRecord)
          : null,
      ),
    ),
    settings: collectionSettings(collection),
    contract: { source: 'code', version: installed.contentHash },
    createdAt: installed.installedAt,
    updatedAt: installed.installedAt,
    updatedBy: installed.installedBy,
  }
}

export async function readInstalledCmsContract(ctx: ReadCtx): Promise<InstalledCmsContract | null> {
  const record = await ctx.db
    .query('cmsContract')
    .withIndex('by_key', (query) => query.eq('key', 'active'))
    .first()
  if (!record) return null
  return { record, content: assertResolvedContentContract(record.content) }
}

/**
 * The single editorial write gate. Contract transitions own the database while
 * locked, so every Studio, MCP, operation, and portability write must pass this
 * guard before touching canonical entry state.
 */
export async function assertCmsContractWritable(ctx: ReadCtx): Promise<InstalledCmsContract> {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) throwCmsError('CMS_CONTRACT_MISSING', 'No CMS contract is installed.')
  if (installed.record.transitionState !== 'ready') {
    throwCmsError(
      'CMS_CONTRACT_TRANSITION_LOCKED',
      'Editorial writes are locked by a contract transition.',
    )
  }
  return installed
}

export async function listInstalledCollections(ctx: ReadCtx): Promise<CmsCollection[]> {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) return []
  return Object.values(installed.content.collections)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((collection) =>
      projectContentCollection(collection, {
        contentHash: installed.record.contentHash,
        presentation: installed.record.presentation,
        installedAt: installed.record.installedAt,
        installedBy: installed.record.installedBy,
      }),
    )
}
