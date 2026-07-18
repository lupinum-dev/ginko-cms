import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { mapActivePublicEntryRow } from '../entries/projections.js'
import { readPublicBodyFromRevision } from '../entries/workflow/projectionBuild.js'
import { publicPathForEntry } from '../entries/workflow/publicTree.js'
import { readRouteGeneration } from '../entries/workflow/routeGeneration.js'
import { throwCmsError } from '../errors.js'
import { getCollectionDefaultLocale } from '../lib/collections.js'
import { getRoutingLocales } from '../lib/locale.js'
import { normalizePathPrefix, pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { QueryCtx } from '../lib/types.js'
import { paginatePublicSubtree } from '../publicPagination.js'
import { readTranslationsByEntryId } from '../publicProjectionReads.js'
import type { PublicProjectionEntry, PublicTranslationSummary } from '../publicReadAdapter.js'
import type { CollectionDoc, PublicExplicitSortField, PublicSortField } from './validation.js'

export type PublicEntryRow = Doc<'publicEntries'>

type PublicEntryCursor = {
  v: 1
  kind: 'publicEntries'
  field: PublicSortField
  direction: 'asc' | 'desc'
  value: string | number
  entryId: string
}

export async function paginatePublicEntriesForCollection(
  ctx: QueryCtx,
  args: {
    collection: CollectionDoc
    locale: string
    limit: number
    cursor?: string | null
    sortField?: PublicSortField
    direction?: 'asc' | 'desc'
    pathPrefix?: string | null
    include?: (row: PublicEntryRow) => boolean
  },
) {
  const sortField = args.pathPrefix ? 'path' : (args.sortField ?? 'orderKey')
  const direction = args.direction ?? 'asc'
  if (args.pathPrefix) {
    return await paginatePublicSubtree(ctx, {
      collection: args.collection,
      locale: args.locale,
      pathPrefix: normalizePathPrefix(args.pathPrefix) || '/',
      limit: args.limit,
      cursor: args.cursor,
      generation: await readRouteGeneration(ctx, args.collection.slug, args.locale),
      include: args.include,
    })
  }

  if (sortField === 'path') {
    return throwCmsError('INVALID_SORT', 'Path order is available only with pathPrefix.')
  }
  const cursor = parsePublicEntryCursor(
    args.cursor,
    sortField,
    direction,
    'Invalid pagination cursor.',
  )
  const rawRows = await readIndexedPublicEntryPage(ctx, {
    collection: args.collection.slug,
    locale: args.locale,
    limit: args.limit,
    cursor,
    sortField,
    direction,
  })
  const batch = rawRows.slice(0, args.limit)
  const pathPairs: Array<readonly [string, string | null]> = []
  for (let start = 0; start < batch.length; start += 100) {
    pathPairs.push(
      ...(await Promise.all(
        batch.slice(start, start + 100).map(
          async (row) =>
            [
              String(row.entryId),
              await publicPathForEntry(ctx, row, {
                pathPrefix: pathPrefixForLocale(args.collection, args.locale),
                rootSlug: rootSlugForLocale(args.collection, args.locale),
              }),
            ] as const,
        ),
      )),
    )
  }
  const paths = new Map(pathPairs.filter((pair): pair is readonly [string, string] => !!pair[1]))
  const page = batch
    .filter((row) => paths.has(String(row.entryId)))
    .filter((row) => args.include?.(row) ?? true)
  const isDone = rawRows.length <= args.limit
  return {
    page,
    paths,
    isDone,
    continueCursor:
      isDone || batch.length === 0
        ? null
        : encodePublicEntryCursor(batch[batch.length - 1]!, sortField, direction),
  }
}

async function readIndexedPublicEntryPage(
  ctx: QueryCtx,
  args: {
    collection: string
    locale: string
    limit: number
    cursor: PublicEntryCursor | null
    sortField: PublicExplicitSortField
    direction: 'asc' | 'desc'
  },
): Promise<PublicEntryRow[]> {
  if (args.sortField === 'orderKey') {
    return await readStringTuplePage(ctx, {
      ...args,
      index: 'by_collection_locale_orderKey_entry',
      field: 'orderKey',
    })
  }
  if (args.sortField === 'entryCreatedAt') {
    return await readNumberTuplePage(ctx, {
      ...args,
      index: 'by_collection_locale_entryCreatedAt_entry',
      field: 'entryCreatedAt',
    })
  }
  if (args.sortField === 'firstPublishedAt') {
    return await readNumberTuplePage(ctx, {
      ...args,
      index: 'by_collection_locale_firstPublishedAt_entry',
      field: 'firstPublishedAt',
    })
  }
  return await readNumberTuplePage(ctx, {
    ...args,
    index: 'by_collection_locale_lastPublishedAt_entry',
    field: 'lastPublishedAt',
  })
}

function cursorEntryId(
  ctx: QueryCtx,
  cursor: PublicEntryCursor,
  invalidCursorMessage: string,
): Id<'entries'> {
  const entryId = ctx.db.normalizeId('entries', cursor.entryId)
  if (!entryId) {
    return throwCmsError('INVALID_CURSOR', invalidCursorMessage, { entryId: cursor.entryId })
  }
  return entryId
}

async function readStringTuplePage(
  ctx: QueryCtx,
  args: {
    collection: string
    locale: string
    limit: number
    cursor: PublicEntryCursor | null
    direction: 'asc' | 'desc'
    index: 'by_collection_locale_orderKey_entry'
    field: 'orderKey'
  },
) {
  if (!args.cursor) {
    return await ctx.db
      .query('publicEntries')
      .withIndex(args.index, (query) =>
        query.eq('collection', args.collection).eq('locale', args.locale),
      )
      .order(args.direction)
      .take(args.limit + 1)
  }
  const value = String(args.cursor.value)
  const entryId = cursorEntryId(ctx, args.cursor, 'Invalid pagination cursor.')
  const sameValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (query) => {
      const scope = query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq(args.field, value)
      return args.direction === 'asc' ? scope.gt('entryId', entryId) : scope.lt('entryId', entryId)
    })
    .order(args.direction)
    .take(args.limit + 1)
  if (sameValueRows.length > args.limit) return sameValueRows
  const remaining = args.limit + 1 - sameValueRows.length
  const nextValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (query) => {
      const scope = query.eq('collection', args.collection).eq('locale', args.locale)
      return args.direction === 'asc' ? scope.gt(args.field, value) : scope.lt(args.field, value)
    })
    .order(args.direction)
    .take(remaining)
  return [...sameValueRows, ...nextValueRows]
}

async function readNumberTuplePage(
  ctx: QueryCtx,
  args:
    | {
        collection: string
        locale: string
        limit: number
        cursor: PublicEntryCursor | null
        direction: 'asc' | 'desc'
        index: 'by_collection_locale_entryCreatedAt_entry'
        field: 'entryCreatedAt'
      }
    | {
        collection: string
        locale: string
        limit: number
        cursor: PublicEntryCursor | null
        direction: 'asc' | 'desc'
        index: 'by_collection_locale_firstPublishedAt_entry'
        field: 'firstPublishedAt'
      }
    | {
        collection: string
        locale: string
        limit: number
        cursor: PublicEntryCursor | null
        direction: 'asc' | 'desc'
        index: 'by_collection_locale_lastPublishedAt_entry'
        field: 'lastPublishedAt'
      },
) {
  if (!args.cursor) {
    return await ctx.db
      .query('publicEntries')
      .withIndex(args.index, (query) =>
        query.eq('collection', args.collection).eq('locale', args.locale),
      )
      .order(args.direction)
      .take(args.limit + 1)
  }
  const value = Number(args.cursor.value)
  const entryId = cursorEntryId(ctx, args.cursor, 'Invalid pagination cursor.')
  const sameValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (query) => {
      const scope = query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq(args.field, value)
      return args.direction === 'asc' ? scope.gt('entryId', entryId) : scope.lt('entryId', entryId)
    })
    .order(args.direction)
    .take(args.limit + 1)
  if (sameValueRows.length > args.limit) return sameValueRows
  const remaining = args.limit + 1 - sameValueRows.length
  const nextValueRows = await ctx.db
    .query('publicEntries')
    .withIndex(args.index, (query) => {
      const scope = query.eq('collection', args.collection).eq('locale', args.locale)
      return args.direction === 'asc' ? scope.gt(args.field, value) : scope.lt(args.field, value)
    })
    .order(args.direction)
    .take(remaining)
  return [...sameValueRows, ...nextValueRows]
}

function publicEntrySortValue(row: PublicEntryRow, field: PublicSortField): string | number {
  return field === 'path' ? row.stableId : row[field]
}

function encodePublicEntryCursor(
  row: PublicEntryRow,
  field: PublicSortField,
  direction: 'asc' | 'desc',
) {
  return JSON.stringify({
    v: 1,
    kind: 'publicEntries',
    field,
    direction,
    value: publicEntrySortValue(row, field),
    entryId: String(row.entryId),
  } satisfies PublicEntryCursor)
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function parsePublicEntryCursor(
  cursor: string | null | undefined,
  field: PublicSortField,
  direction: 'asc' | 'desc',
  invalidCursorMessage: string,
): PublicEntryCursor | null {
  if (!cursor) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(cursor)
  } catch {
    return throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  const record = objectRecord(parsed)
  if (
    !record ||
    record.v !== 1 ||
    record.kind !== 'publicEntries' ||
    record.field !== field ||
    record.direction !== direction
  ) {
    return throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  const value = record.value
  if (field === 'orderKey' || field === 'path') {
    if (typeof value !== 'string') {
      return throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
    }
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    return throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  if (typeof record.entryId !== 'string' || !record.entryId) {
    return throwCmsError('INVALID_CURSOR', invalidCursorMessage, { cursor })
  }
  return {
    v: 1,
    kind: 'publicEntries',
    field,
    direction,
    value,
    entryId: record.entryId,
  }
}

export async function mapPublicEntry(
  ctx: QueryCtx,
  row: PublicEntryRow,
  collection: CollectionDoc,
): Promise<PublicProjectionEntry> {
  return await mapActivePublicEntryRow(ctx, row, collection)
}

export async function mapPublicEntryAtKnownPath(
  ctx: QueryCtx,
  row: PublicEntryRow,
  path: string,
  routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>,
): Promise<PublicProjectionEntry> {
  return {
    _id: String(row.entryId),
    collection: row.collection,
    slug: row.slug,
    path,
    href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
    locale: row.locale,
    resolvedLocale: row.locale,
    title: row.title,
    data: {
      ...(row.data as JsonMap),
      ...(typeof row.description === 'string' ? { description: row.description } : {}),
    },
    publishedAt: row.lastPublishedAt,
    stableId: row.stableId,
    assetFacts: row.assetFacts,
  }
}

export async function mapPublicPageEntryAtKnownPath(
  ctx: QueryCtx,
  row: PublicEntryRow,
  path: string,
  routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>,
  collection: CollectionDoc,
): Promise<PublicProjectionEntry> {
  const [entry, body] = await Promise.all([
    mapPublicEntryAtKnownPath(ctx, row, path, routingLocales),
    readPublicBodyFromRevision(ctx, row, collection),
  ])
  return { ...entry, bodyAst: body.bodyAst, toc: body.toc }
}

export function mapPublicEntrySummaryAtKnownPath(
  row: PublicEntryRow,
  path: string,
  routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>,
): PublicProjectionEntry {
  return {
    _id: String(row.entryId),
    collection: row.collection,
    slug: row.slug,
    path,
    href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
    locale: row.locale,
    resolvedLocale: row.locale,
    title: row.title,
    data: typeof row.description === 'string' ? { description: row.description } : {},
    publishedAt: row.lastPublishedAt,
    stableId: row.stableId,
    assetFacts: [],
  }
}

export async function routingLocalesForCollection(ctx: QueryCtx, collection: CollectionDoc) {
  return await getRoutingLocales(ctx, collection.locales, getCollectionDefaultLocale(collection))
}

export function publicFlag(row: PublicEntryRow, key: 'navigation' | 'search' | 'sitemap') {
  if (key === 'navigation') return row.navIncluded
  if (key === 'sitemap') return row.sitemapIncluded
  return true
}

export async function getTranslationsForEntry(
  ctx: QueryCtx,
  collection: string,
  entryId: Id<'entries'>,
): Promise<PublicTranslationSummary[]> {
  return (
    (await readTranslationsByEntryId(ctx, collection, [{ entryId }])).get(String(entryId)) ?? []
  )
}

export function requireProjectedPath(row: PublicEntryRow, paths: Map<string, string>) {
  const path = paths.get(String(row.entryId))
  if (!path) {
    return throwCmsError('PUBLIC_TREE_INVALID', 'Published entry has no reachable public path.', {
      entryId: String(row.entryId),
      locale: row.locale,
    })
  }
  return path
}
