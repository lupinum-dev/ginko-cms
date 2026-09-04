import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { getCollectionDefaultLocale } from '../lib/collections.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { getRoutingLocales } from '../lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import {
  deriveDirtyLocales,
  getCollectionForEntry,
  getEntryOrThrow,
  readStudioDraftView,
} from './context.js'
import { inspectInboundEntryRelations } from './inboundRelations.js'
import { stableHash } from './workflow/hashing.js'
import { publicPathForEntry } from './workflow/publicTree.js'

type PublicRoutePreview = {
  entryId: string
  locale: string
  path: string
  href: string
}

// The certified greenfield envelope is 1,500 entries across three locales.
// A parent can therefore make at most 1,499 * 3 descendant routes unreachable.
// Reject larger contracts explicitly instead of returning a partial destructive
// preview or allowing an unbounded component query.
const MAX_SUPPORTED_ENTRIES = 1_500
const MAX_PUBLIC_DESCENDANT_ROUTE_PREVIEW = MAX_SUPPORTED_ENTRIES * 3

function studioEntryStatus(entry: EntryDoc) {
  if (entry.lifecycle === 'archived') return 'archived' as const
  return entry.activePublications.length > 0 ? ('published' as const) : ('draft' as const)
}

async function publicRoutePreview(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  row: Doc<'publicEntries'>,
  routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>,
): Promise<PublicRoutePreview | null> {
  const path = await publicPathForEntry(ctx, row, {
    pathPrefix: pathPrefixForLocale(collection, row.locale),
    rootSlug: rootSlugForLocale(collection, row.locale),
  })
  if (!path) return null
  return {
    entryId: toStringId(row.entryId),
    locale: row.locale,
    path,
    href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
  }
}

export async function previewDestructiveEntryOperation(
  ctx: HandlerQueryCtx,
  entryId: string,
  options: { locales?: string[] } = {},
) {
  const entry = await getEntryOrThrow(ctx, entryId)
  const collection = await getCollectionForEntry(ctx, entry)
  const scopedLocales = options.locales
    ? [...new Set(options.locales)].sort()
    : [...collection.locales].sort()
  const inboundRelations = await inspectInboundEntryRelations(ctx, entry)
  const draftView = await readStudioDraftView(ctx, entry, collection)
  const primaryLocale = draftView.locales[0]
  const primaryTitle =
    primaryLocale?.data && typeof primaryLocale.data.title === 'string'
      ? primaryLocale.data.title
      : null
  const publicRows = (
    await Promise.all(
      scopedLocales.map(async (locale) =>
        ctx.db
          .query('publicEntries')
          .withIndex('by_entry_locale', (query) =>
            query.eq('entryId', entry._id).eq('locale', locale),
          )
          .unique(),
      ),
    )
  ).filter((row): row is Doc<'publicEntries'> => row !== null)
  if (publicRows.length > scopedLocales.length) {
    throwCmsError(
      'PUBLIC_PROJECTION_INVALID',
      'An entry has more public locale rows than the installed collection contract.',
      { entryId, collection: collection.slug },
    )
  }
  const routingLocales = await getRoutingLocales(
    ctx,
    collection.locales,
    getCollectionDefaultLocale(collection),
  )
  const publicRoutes = (
    await Promise.all(
      publicRows.map((row) => publicRoutePreview(ctx, collection, row, routingLocales)),
    )
  ).filter((route): route is PublicRoutePreview => route !== null)
  const publicDescendantRoutes = await readPublicDescendantRoutes(ctx, {
    collection,
    rootEntryId: entry._id,
    routingLocales,
    locales: scopedLocales,
  })
  const publicRevisionIdsByLocale = Object.fromEntries(
    publicRows
      .map((row): [string, Id<'entryRevisions'>] => [row.locale, row.revisionId])
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  const currentAssetRefSources = [
    { kind: 'draft' as const, sourceId: `${String(entry._id)}:shared` },
    ...draftView.locales.map((locale) => ({
      kind: 'draft' as const,
      sourceId: `${String(entry._id)}:${locale.locale}`,
    })),
    ...publicRows.map((row) => ({
      kind: 'public' as const,
      sourceId: `${String(entry._id)}:${row.locale}`,
    })),
  ]
  const assetRefPages = await Promise.all(
    currentAssetRefSources.map(async (source) =>
      ctx.db
        .query('contentAssetRefs')
        .withIndex('by_source', (query) =>
          query.eq('sourceKind', source.kind).eq('sourceId', source.sourceId),
        )
        .take(101),
    ),
  )
  const assetRefTruncated = assetRefPages.some((rows) => rows.length > 100)
  const assetIds = [
    ...new Set(assetRefPages.flatMap((rows) => rows.slice(0, 100).map((row) => row.assetId))),
  ].sort()
  const [activeRedirectPages, publicSearchRows] = await Promise.all([
    Promise.all(
      scopedLocales.map(async (locale) =>
        ctx.db
          .query('redirects')
          .withIndex('by_target', (query) =>
            query.eq('targetEntryId', entry._id).eq('state', 'active'),
          )
          .filter((query) => query.eq(query.field('locale'), locale))
          .take(101),
      ),
    ),
    Promise.all(
      publicRows.map(async (row) =>
        ctx.db
          .query('publicSearchEntries')
          .withIndex('by_entry_locale', (query) =>
            query.eq('entryId', entry._id).eq('locale', row.locale),
          )
          .unique(),
      ),
    ),
  ])
  const activeRedirects = activeRedirectPages.flat()
  const revalidationTags = [...new Set(publicRows.flatMap((row) => row.cacheTags))].sort()
  return {
    entryId: toStringId(entry._id),
    baseSlug: entry.slug,
    displayLabel: primaryTitle ?? primaryLocale?.draftSlug ?? draftView.baseSlug ?? entry.slug,
    status: studioEntryStatus(entry),
    draftVersion: entry.draftVersion,
    dirtyLocales: deriveDirtyLocales(
      entry,
      new Map(draftView.locales.map((locale) => [locale.locale, locale.draftVersion])),
    ),
    publicRevisionIdsByLocale,
    publishedLocales: publicRoutes.map((route) => route.locale).sort(),
    publicRoutes: publicRoutes.sort((left, right) =>
      `${left.locale}:${left.path}`.localeCompare(`${right.locale}:${right.path}`),
    ),
    publicDescendantRoutes,
    inboundRelations,
    assetImpact: {
      count: assetRefTruncated ? null : assetIds.length,
      minimumCount: assetIds.length,
      listedAssetIds: assetIds.slice(0, 25),
      hasMore: assetRefTruncated || assetIds.length > 25,
      fence: stableHash(
        assetRefPages.flatMap((rows) =>
          rows.slice(0, 100).map((row) => ({
            assetId: row.assetId,
            sourceKind: row.sourceKind,
            sourceId: row.sourceId,
            fieldPath: row.fieldPath,
            locale: row.locale ?? null,
          })),
        ),
      ),
    },
    discoveryImpact: {
      navigationLocales: publicRows
        .filter((row) => row.navIncluded)
        .map((row) => row.locale)
        .sort(),
      sitemapLocales: publicRows
        .filter((row) => row.sitemapIncluded)
        .map((row) => row.locale)
        .sort(),
      searchLocales: publicSearchRows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map((row) => row.locale)
        .sort(),
    },
    redirects: {
      count: activeRedirects.length > 100 ? null : activeRedirects.length,
      minimumCount: Math.min(activeRedirects.length, 100),
      hasMore: activeRedirects.length > 100,
      listed: activeRedirects.slice(0, 25).map((redirect) => ({
        redirectId: redirect.redirectId,
        locale: redirect.locale,
        fromPath: redirect.fromPath,
        kind: redirect.kind,
      })),
      fence: stableHash(
        activeRedirects.slice(0, 100).map((redirect) => ({
          redirectId: redirect.redirectId,
          locale: redirect.locale,
          fromPath: redirect.fromPath,
          kind: redirect.kind,
          updatedAt: redirect.updatedAt,
        })),
      ),
    },
    revalidation: {
      eventCount: publicRows.length > 0 || publicDescendantRoutes.length > 0 ? 1 : 0,
      tagCount: revalidationTags.length,
      listedTags: revalidationTags.slice(0, 25),
      hasMore: revalidationTags.length > 25,
      fence: stableHash(revalidationTags),
    },
  }
}

async function readPublicDescendantRoutes(
  ctx: HandlerQueryCtx,
  args: {
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    rootEntryId: Id<'entries'>
    routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>
    locales: string[]
  },
): Promise<PublicRoutePreview[]> {
  const descendants: PublicRoutePreview[] = []
  const queue = args.locales.map((locale) => ({
    locale,
    parentEntryId: args.rootEntryId,
  }))
  const seen = new Set<string>()
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const next = queue[queueIndex]!
    const remaining = MAX_PUBLIC_DESCENDANT_ROUTE_PREVIEW - descendants.length
    const perParentReadLimit = Math.min(remaining + 1, MAX_SUPPORTED_ENTRIES)
    const rows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey', (query) =>
        query
          .eq('collection', args.collection.slug)
          .eq('locale', next.locale)
          .eq('parentEntryId', next.parentEntryId),
      )
      .take(perParentReadLimit)
    if (rows.length > remaining || rows.length >= MAX_SUPPORTED_ENTRIES) {
      throwCmsError(
        'CMS_SCALE_LIMIT_EXCEEDED',
        'Destructive preview exceeds the certified 1,500-entry, three-locale route envelope.',
        {
          maxPublicDescendantRoutes: MAX_PUBLIC_DESCENDANT_ROUTE_PREVIEW,
          collection: args.collection.slug,
          entryId: toStringId(args.rootEntryId),
        },
      )
    }
    for (const row of rows) {
      const key = `${row.locale}:${toStringId(row.entryId)}`
      if (seen.has(key)) continue
      seen.add(key)
      const route = await publicRoutePreview(ctx, args.collection, row, args.routingLocales)
      if (route) descendants.push(route)
      queue.push({ locale: row.locale, parentEntryId: row.entryId })
    }
  }
  return descendants.sort((left, right) =>
    `${left.locale}:${left.path}:${left.entryId}`.localeCompare(
      `${right.locale}:${right.path}:${right.entryId}`,
    ),
  )
}
