import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { getCollectionDefaultLocale, type getCollectionOrThrow } from '../lib/collections.js'
import { getRoutingLocales } from '../lib/locale.js'
import { compareOrderRank } from '../lib/ordering.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { decodePublicBodyAst } from './bodyAstStorage.js'
import type { EntryDoc } from './context.js'
import {
  deleteEntryAssetRefsBySourceKind,
  extractAssetRefsFromText,
  extractAssetRefsFromValues,
  extractPublicBodyAssetRefs,
  extractPublicFieldAssetRefs,
  replaceAssetRefs,
  uniqueAssetRefs,
} from './workflow/assetRefs.js'
import { publicPathForEntry, resolvePublicRoute } from './workflow/publicTree.js'

type CollectionDoc = Awaited<ReturnType<typeof getCollectionOrThrow>>
type PublicEntryDoc = Doc<'publicEntries'>

export async function mapActivePublicEntryRow(
  ctx: QueryOrMutationCtx,
  row: PublicEntryDoc,
  collection: CollectionDoc,
) {
  const path = await publicPathForEntry(ctx, row, {
    pathPrefix: pathPrefixForLocale(collection, row.locale),
    rootSlug: rootSlugForLocale(collection, row.locale),
  })
  if (!path) throw new Error(`Published entry ${row.entryId} is unreachable from its public tree`)
  const routingLocales = await getRoutingLocales(
    ctx,
    collection.locales,
    getCollectionDefaultLocale(collection),
  )
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
    bodyAst: decodePublicBodyAst(row.bodyAst),
    toc: row.toc,
    publishedAt: row.lastPublishedAt,
    stableId: row.stableId,
  }
}

export async function clearEntryProjectionRows(ctx: MutationCtx, entryId: Id<'entries'>) {
  let deleted = 0
  do {
    const rows = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
      .take(100)
    deleted = rows.length
    for (const row of rows) await ctx.db.delete(row._id)
  } while (deleted === 100)

  let refsDeleted = 0
  do {
    const rows = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .take(100)
    refsDeleted = rows.length
    for (const row of rows) await ctx.db.delete(row._id)
  } while (refsDeleted === 100)
}

export async function rebuildContentAssetRefsForEntry(
  ctx: MutationCtx,
  entryId: Id<'entries'>,
  collection: CollectionDoc,
) {
  const entry = await ctx.db.get(entryId)
  if (!entry) return
  for (const sourceKind of ['draft', 'revision', 'public'] as const) {
    await deleteEntryAssetRefsBySourceKind(ctx, { entryId, sourceKind })
  }
  await refreshDraftAssetRefsForEntry(ctx, entry)
  await refreshRevisionAssetRefsForEntry(ctx, entry)
  await refreshPublicAssetRefsForEntry(ctx, entry, collection)
}

async function refreshDraftAssetRefsForEntry(ctx: MutationCtx, entry: EntryDoc) {
  await replaceAssetRefs(ctx, {
    sourceKind: 'draft',
    sourceId: `${String(entry._id)}:shared`,
    entryId: entry._id,
    collection: entry.collection,
    refs: extractAssetRefsFromValues(entry.shared, { locale: null }),
    now: entry.updatedAt,
  })
  const rows = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
    .collect()
  for (const row of rows) {
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: `${String(entry._id)}:${row.locale}`,
      entryId: entry._id,
      collection: entry.collection,
      refs: uniqueAssetRefs([
        ...extractAssetRefsFromValues(row.values, { locale: row.locale }),
        ...extractAssetRefsFromText(row.bodyMdc, { fieldPath: 'bodyMdc', locale: row.locale }),
      ]),
      now: row.updatedAt,
    })
  }
}

async function refreshRevisionAssetRefsForEntry(ctx: MutationCtx, entry: EntryDoc) {
  const revisions = await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entry._id))
    .collect()
  for (const revision of revisions) {
    for (const [locale, snapshot] of Object.entries(revision.snapshots)) {
      await replaceAssetRefs(ctx, {
        sourceKind: 'revision',
        sourceId: `${String(revision._id)}:${locale}`,
        entryId: entry._id,
        collection: entry.collection,
        refs: uniqueAssetRefs([
          ...extractAssetRefsFromValues(snapshot.shared, { locale: null }),
          ...extractAssetRefsFromValues(snapshot.values, { locale }),
          ...extractAssetRefsFromText(snapshot.bodyMdc, { fieldPath: 'bodyMdc', locale }),
        ]),
        now: revision.createdAt,
      })
    }
  }
}

async function refreshPublicAssetRefsForEntry(
  ctx: MutationCtx,
  entry: EntryDoc,
  collection: CollectionDoc,
) {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
    .collect()
  for (const row of rows) {
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${String(entry._id)}:${row.locale}`,
      entryId: entry._id,
      collection: entry.collection,
      refs: uniqueAssetRefs([
        ...extractPublicFieldAssetRefs(row.data, collection.fields, {
          fieldPathPrefix: 'data',
          locale: row.locale,
        }),
        ...extractPublicBodyAssetRefs(decodePublicBodyAst(row.bodyAst), { locale: row.locale }),
      ]),
      now: row.lastPublishedAt,
    })
  }
}

export async function refreshDraftAssetRefsForEntrySubtree(
  ctx: MutationCtx,
  args: { collection?: CollectionDoc; entryId: Id<'entries'>; includeSubtree?: boolean },
) {
  const entry = await ctx.db.get(args.entryId)
  if (!entry) return
  await refreshDraftAssetRefsForEntry(ctx, entry)
  if (!args.includeSubtree) return
  const children = await ctx.db
    .query('entries')
    .withIndex('by_parent', (q) =>
      q.eq('collection', entry.collection).eq('parentEntryId', entry._id),
    )
    .collect()
  children.sort((left, right) => {
    const rank = compareOrderRank(left.orderRank, right.orderRank)
    return rank || String(left._id).localeCompare(String(right._id))
  })
  for (const child of children) {
    await refreshDraftAssetRefsForEntrySubtree(ctx, { ...args, entryId: child._id })
  }
}

export async function getActivePublicPageByPath(
  ctx: QueryOrMutationCtx,
  collection: CollectionDoc,
  locale: string,
  path: string,
) {
  const route = await resolvePublicRoute(ctx, {
    collection: collection.slug,
    locale,
    path,
    options: {
      pathPrefix: pathPrefixForLocale(collection, locale),
      rootSlug: rootSlugForLocale(collection, locale),
    },
  })
  return route.kind === 'entry' ? route.row : null
}

export async function getActivePublicPageByStableId(
  ctx: QueryOrMutationCtx,
  collection: string,
  locale: string,
  stableId: string,
) {
  return await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_stableId', (q) =>
      q.eq('collection', collection).eq('locale', locale).eq('stableId', stableId),
    )
    .first()
}
