import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { parseMdcBody, type ParseMdcBodyResult } from '@lupinum/ginko-content/cms-contract'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { getCollectionDefaultLocale } from '../../lib/collections.js'
import { resolveEntryDescription, resolveEntryTitle } from '../../lib/fields.js'
import { buildPublicSearchText, filterPublicData } from '../../lib/publicData.js'
import type { CmsCollection, CmsField, QueryOrMutationCtx } from '../../lib/types.js'
import { buildPublicAssetFacts } from '../../publicAssets.js'
import { collectRelationReferences } from '../relations.js'
import {
  extractAssetRefsFromValues,
  extractPublicBodyAssetRefs,
  extractPublicFieldAssetRefs,
  uniqueAssetRefs,
} from './assetRefs.js'
import type { PublicProjectionInput } from './projection.js'
import { assertPublicBodySafe } from './renderSafety.js'
import type { RevisionLocaleSnapshot } from './revisions.js'

type MarkdownRoot = ParseMdcBodyResult['body']
type Toc = NonNullable<ParseMdcBodyResult['toc']>

export type PublicProjectionBuildResult = {
  input: PublicProjectionInput
  assetRefs: ReturnType<typeof uniqueAssetRefs>
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function localizedText(value: unknown, locale: string, defaultLocale: string): string | null {
  if (typeof value === 'string') return value
  if (!isJsonObject(value)) return null
  const direct = value[locale]
  if (typeof direct === 'string' && direct.trim()) return direct
  const fallback = value[defaultLocale]
  if (typeof fallback === 'string' && fallback.trim()) return fallback
  return null
}

async function imageWithAssetMetadataFallback(
  ctx: QueryOrMutationCtx,
  value: unknown,
  locale: string,
  defaultLocale: string,
): Promise<JsonValue> {
  if (typeof value === 'string') return value
  if (!isJsonObject(value)) return value as JsonValue

  const src = value.src
  if (typeof src !== 'string' || !src) return value

  const next: JsonObject = { ...value }
  const hasAlt = typeof next.alt === 'string' && next.alt.trim().length > 0
  const hasCaption = typeof next.caption === 'string' && next.caption.trim().length > 0
  if (hasAlt && hasCaption) return next

  const assetId = ctx.db.normalizeId('assets', src)
  if (!assetId) return next
  const asset = await ctx.db.get(assetId)
  if (!asset || asset.deletedAt) return next

  if (!hasAlt) {
    const alt = localizedText(asset.alt, locale, defaultLocale)
    if (alt) next.alt = alt
  }
  if (!hasCaption) {
    const caption = localizedText(asset.caption, locale, defaultLocale)
    if (caption) next.caption = caption
  }
  return next
}

async function applyPublicImageMetadataFallbacks(
  ctx: QueryOrMutationCtx,
  fields: CmsField[],
  data: JsonObject,
  locale: string,
  defaultLocale: string,
): Promise<JsonObject> {
  const next: JsonObject = { ...data }
  for (const field of fields) {
    const key = field.key
    if (!key || !(key in next)) continue
    const value = next[key]
    if (field.type === 'object' && Array.isArray(field.fields) && isJsonObject(value)) {
      const srcField = field.fields.find(
        (child) => child.key === 'src' && (child.type === 'image' || child.type === 'file'),
      )
      if (srcField) {
        next[key] = await imageWithAssetMetadataFallback(ctx, value, locale, defaultLocale)
        continue
      }
      next[key] = await applyPublicImageMetadataFallbacks(
        ctx,
        field.fields,
        value,
        locale,
        defaultLocale,
      )
      continue
    }
    if (field.type === 'image' || field.type === 'file') {
      next[key] = await imageWithAssetMetadataFallback(ctx, value, locale, defaultLocale)
    }
  }
  return next
}

async function projectionBodyFromSnapshot(
  ctx: QueryOrMutationCtx,
  localeSnapshot: RevisionLocaleSnapshot,
  collection: CmsCollection,
): Promise<{ bodyAst: MarkdownRoot; searchText: string; toc: Toc | null }> {
  const parsed = await parseMdcBody(localeSnapshot.bodyMdc ?? '')
  await assertPublicBodySafe(ctx, parsed.body, collection)
  return {
    bodyAst: parsed.body,
    searchText: parsed.searchText,
    toc: parsed.toc ?? null,
  }
}

export async function readPublicBodyFromRevision(
  ctx: QueryOrMutationCtx,
  row: Doc<'publicEntries'>,
  collection: CmsCollection,
) {
  const revision = await ctx.db.get(row.revisionId)
  const snapshot = revision?.snapshots[row.locale]
  if (
    !revision ||
    revision.entryId !== row.entryId ||
    revision.collection !== row.collection ||
    !snapshot
  ) {
    return throwCmsError(
      'PUBLIC_PROJECTION_REBUILD_REQUIRED',
      'Published body source is missing or does not match its active structural projection.',
      {
        entryId: String(row.entryId),
        locale: row.locale,
        revisionId: String(row.revisionId),
      },
    )
  }
  const body = await projectionBodyFromSnapshot(ctx, snapshot, collection)
  return {
    bodyAst: body.bodyAst as unknown as JsonValue,
    searchText: body.searchText,
    toc: (body.toc as unknown as JsonValue | null) ?? null,
  }
}

function buildWorkflowPublicCacheTags(args: {
  collection: CmsCollection
  entry: Doc<'entries'>
  locale: string
  path: string
  data: JsonObject
  fields: CmsField[]
  navIncluded?: boolean
  searchIncluded?: boolean
  sitemapIncluded?: boolean
}) {
  const publicEntryKey = args.entry.stableId ?? String(args.entry._id)
  const assetRefs = extractAssetRefsFromValues(args.data, {
    fieldPathPrefix: 'data',
    locale: args.locale,
  })
  const relationRefs = collectRelationReferences({ fields: args.fields, data: args.data })
    .filter((ref) => ref.targetCollectionSlug)
    .map((ref) => ({ collection: ref.targetCollectionSlug!, targetId: ref.targetId }))
  return uniqueContentTags([
    contentTags.collection(args.collection.slug),
    contentTags.entry(args.collection.slug, publicEntryKey),
    contentTags.entry(args.collection.slug, publicEntryKey, args.locale),
    contentTags.route(args.path),
    args.navIncluded === false ? null : contentTags.nav(args.collection.slug, args.locale),
    args.searchIncluded === false ? null : contentTags.search(args.locale),
    args.sitemapIncluded === false ? null : contentTags.sitemap(),
    ...assetRefs.map((ref) => contentTags.asset(ref.assetId)),
    ...relationRefs.flatMap((ref) => [
      contentTags.entry(ref.collection, ref.targetId),
      contentTags.entry(ref.collection, ref.targetId, args.locale),
    ]),
  ])
}

function publicInclusionFlag(data: JsonObject, key: 'navigation' | 'search' | 'sitemap') {
  const publicFlags = data.public
  if (!publicFlags || typeof publicFlags !== 'object' || Array.isArray(publicFlags)) return true
  const value = (publicFlags as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : true
}

export async function buildPublicProjectionFromRevisionSnapshot(
  ctx: QueryOrMutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    revisionId: Id<'entryRevisions'>
    locale: string
    localeSnapshot: RevisionLocaleSnapshot
    publicPath: string
    firstPublishedAt?: number
    now: number
  },
): Promise<PublicProjectionBuildResult> {
  const path = args.publicPath
  const materialized = materializeFieldData(
    args.collection.fields,
    args.localeSnapshot.shared,
    args.localeSnapshot.values,
  )
  const body = await projectionBodyFromSnapshot(ctx, args.localeSnapshot, args.collection)
  const publicData = await applyPublicImageMetadataFallbacks(
    ctx,
    args.collection.fields,
    filterPublicData(args.collection.fields, materialized),
    args.locale,
    getCollectionDefaultLocale(args.collection, args.locale),
  )
  const title =
    resolveEntryTitle(publicData, args.collection.fields, args.collection.settings) ??
    args.localeSnapshot.slug
  const description =
    resolveEntryDescription(publicData, args.collection.fields, args.collection.settings) ??
    resolveEntryDescription(materialized, args.collection.fields, args.collection.settings)
  const navIncluded = publicInclusionFlag(materialized, 'navigation')
  const searchIncluded = publicInclusionFlag(materialized, 'search')
  const sitemapIncluded = publicInclusionFlag(materialized, 'sitemap')

  const existingPublic = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id).eq('locale', args.locale))
    .first()
  const firstPublishedAt = args.firstPublishedAt ?? existingPublic?.firstPublishedAt ?? args.now
  const assetRefs = uniqueAssetRefs([
    ...extractPublicFieldAssetRefs(publicData, args.collection.fields, {
      fieldPathPrefix: 'data',
      locale: args.locale,
    }),
    ...extractPublicBodyAssetRefs(body.bodyAst as unknown as JsonObject, {
      locale: args.locale,
    }),
  ])
  const assetFacts = await buildPublicAssetFacts(ctx, assetRefs)

  return {
    input: {
      entryId: args.entry._id,
      collection: args.entry.collection,
      locale: args.locale,
      revisionId: args.revisionId,
      stableId: args.entry.stableId,
      parentEntryId: args.localeSnapshot.parentEntryId,
      orderKey: args.localeSnapshot.orderRank,
      slug: args.localeSnapshot.slug,
      title,
      description,
      data: publicData,
      searchText: searchIncluded
        ? uniqueContentTags([
            buildPublicSearchText({ values: publicData, fields: args.collection.fields }),
            body.searchText,
          ])
            .join(' ')
            .trim()
        : '',
      cacheTags: uniqueContentTags([
        ...buildWorkflowPublicCacheTags({
          collection: args.collection,
          entry: args.entry,
          locale: args.locale,
          path,
          data: publicData,
          fields: args.collection.fields,
          navIncluded,
          searchIncluded,
          sitemapIncluded,
        }),
        ...assetFacts.map((fact) => contentTags.asset(fact.assetId)),
      ]),
      assetFacts,
      navIncluded,
      sitemapIncluded,
      searchIncluded,
      entryCreatedAt: args.entry.createdAt,
      firstPublishedAt,
      lastPublishedAt: args.now,
    },
    assetRefs,
  }
}
