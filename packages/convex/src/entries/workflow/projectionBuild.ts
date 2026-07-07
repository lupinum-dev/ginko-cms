import { contentTags, uniqueContentTags } from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { parseMdcBody } from '../../lib/cmsContract/index.js'
import type { MarkdownRoot, Toc } from '../../lib/cmsContract/types.js'
import { resolveEntryDescription, resolveEntryTitle } from '../../lib/fields.js'
import { getRoutingLocales } from '../../lib/locale.js'
import { buildPublicSearchText, filterPublicData } from '../../lib/publicData.js'
import type { CmsField, QueryOrMutationCtx } from '../../lib/types.js'
import { collectRelationReferences } from '../relations.js'
import { extractAssetRefsFromValues, uniqueAssetRefs } from './assetRefs.js'
import { publicPathForLocaleSnapshot } from './path.js'
import type { PublicProjectionInput } from './projection.js'
import type { RevisionLocaleSnapshot } from './revisions.js'

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
  localeSnapshot: RevisionLocaleSnapshot,
): Promise<{ bodyAst: MarkdownRoot; searchText: string; toc: Toc | null }> {
  if (localeSnapshot.bodyAst && typeof localeSnapshot.bodyAst === 'object') {
    return {
      bodyAst: localeSnapshot.bodyAst as unknown as MarkdownRoot,
      searchText: localeSnapshot.searchText ?? '',
      toc: (localeSnapshot.toc as unknown as Toc | null) ?? null,
    }
  }

  const parsed = await parseMdcBody(localeSnapshot.bodyMdc ?? '')
  return {
    bodyAst: parsed.body,
    searchText: localeSnapshot.searchText ?? parsed.searchText,
    toc: (localeSnapshot.toc as unknown as Toc | null) ?? parsed.toc ?? null,
  }
}

function buildWorkflowPublicCacheTags(args: {
  collection: Doc<'collections'>
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
  const assetRefs = extractAssetRefsFromValues(args.data, { locale: args.locale })
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
    collection: Doc<'collections'>
    revisionId: Id<'entryRevisions'>
    snapshot: { parentEntryId?: Id<'entries'> | null; orderRank?: string | null }
    locale: string
    localeSnapshot: RevisionLocaleSnapshot
    now: number
  },
): Promise<PublicProjectionBuildResult> {
  const path = publicPathForLocaleSnapshot(args.collection, args.localeSnapshot.path, args.locale)
  const href = renderGinkoHref(
    { locale: args.locale, path },
    await getRoutingLocales(ctx, args.collection.locales),
  )
  const body = await projectionBodyFromSnapshot(args.localeSnapshot)
  const publicData = await applyPublicImageMetadataFallbacks(
    ctx,
    args.collection.fields,
    filterPublicData(args.collection.fields, args.localeSnapshot.values),
    args.locale,
    args.collection.locales[0] ?? args.locale,
  )
  const title =
    resolveEntryTitle(publicData, args.collection.fields, args.collection.settings) ??
    args.localeSnapshot.slug ??
    ''
  const description =
    resolveEntryDescription(publicData, args.collection.fields, args.collection.settings) ??
    resolveEntryDescription(
      args.localeSnapshot.values,
      args.collection.fields,
      args.collection.settings,
    )
  const navIncluded = publicInclusionFlag(args.localeSnapshot.values, 'navigation')
  const searchIncluded = publicInclusionFlag(args.localeSnapshot.values, 'search')
  const sitemapIncluded = publicInclusionFlag(args.localeSnapshot.values, 'sitemap')

  const existingPublic = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id).eq('locale', args.locale))
    .first()
  const firstPublishedAt =
    existingPublic?.firstPublishedAt ?? args.entry.firstPublishedAt ?? args.now
  const assetRefs = uniqueAssetRefs([
    ...extractAssetRefsFromValues((args.localeSnapshot.values as JsonObject) ?? {}, {
      locale: args.locale,
    }),
    ...extractAssetRefsFromValues(body.bodyAst as unknown as JsonObject, {
      fieldPathPrefix: 'bodyAst',
      locale: args.locale,
    }),
  ])

  return {
    input: {
      entryId: args.entry._id,
      collectionId: args.entry.collectionId,
      locale: args.locale,
      revisionId: args.revisionId,
      routeBacked: (args.collection.routing.mode ?? 'route') === 'route',
      stableId: args.entry.stableId ?? null,
      parentEntryId: args.snapshot.parentEntryId ?? null,
      orderKey: args.snapshot.orderRank ?? '',
      slug: args.localeSnapshot.slug ?? '',
      path,
      href,
      title,
      description,
      data: publicData,
      bodyMdc: args.localeSnapshot.bodyMdc ?? '',
      bodyAst: body.bodyAst,
      searchText: searchIncluded
        ? uniqueContentTags([
            buildPublicSearchText({ values: publicData, fields: args.collection.fields }),
            body.searchText,
          ])
            .join(' ')
            .trim()
        : '',
      toc: body.toc,
      cacheTags: buildWorkflowPublicCacheTags({
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
