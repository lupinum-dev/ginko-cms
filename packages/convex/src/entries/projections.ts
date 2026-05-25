import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { getCollection } from '../lib/collections.js'
import { compareOrderRank } from '../lib/ordering.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { decodePublicBodyAst } from './bodyAstStorage.js'
import type { EntryDoc } from './context.js'
import {
  deleteEntryAssetRefsBySourceKind,
  extractAssetRefsFromText,
  extractAssetRefsFromValues,
  replaceAssetRefs,
  uniqueAssetRefs,
} from './workflow/assetRefs.js'

type CollectionDoc = Awaited<ReturnType<typeof getCollectionOrThrow>>
type PublicEntryDoc = Doc<'publicEntries'>

function collectionSlug(collection?: CollectionDoc | null) {
  return collection?.slug ?? ''
}

export function mapActivePublicEntryRow(row: PublicEntryDoc, collection?: CollectionDoc | null) {
  return {
    _id: String(row.entryId),
    collection: collectionSlug(collection) || String(row.collectionId),
    slug: row.slug,
    path: row.path,
    href: row.href,
    locale: row.locale,
    resolvedLocale: row.locale,
    title: row.title,
    data: {
      ...((row.data ?? {}) as JsonMap),
      ...(typeof row.description === 'string' ? { description: row.description } : {}),
    },
    bodyAst: decodePublicBodyAst(row.bodyAst),
    toc: row.toc,
    publishedAt: row.lastPublishedAt,
    stableId: row.stableId ?? String(row.entryId),
  }
}

export async function clearEntryProjectionRows(ctx: MutationCtx, entryId: Id<'entries'>) {
  for (const table of ['publicEntries', 'publicRoutes'] as const) {
    let deleted = 0
    do {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
        .take(100)
      deleted = rows.length
      for (const row of rows) {
        await ctx.db.delete(row._id)
      }
    } while (deleted === 100)
  }

  let contentRowsDeleted = 0
  do {
    const contentRows = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .take(100)
    contentRowsDeleted = contentRows.length
    for (const row of contentRows) {
      await ctx.db.delete(row._id)
    }
  } while (contentRowsDeleted === 100)
}

export async function rebuildContentAssetRefsForEntry(
  ctx: MutationCtx,
  entryId: Id<'entries'>,
  _collection: CollectionDoc,
) {
  const entry = await ctx.db.get(entryId)
  if (!entry) return
  await deleteEntryAssetRefsBySourceKind(ctx, {
    entryId: entry._id,
    sourceKind: 'revision',
  })
  await deleteEntryAssetRefsBySourceKind(ctx, {
    entryId: entry._id,
    sourceKind: 'public',
  })
  await refreshDraftAssetRefsForEntry(ctx, entry)
  await refreshRevisionAssetRefsForEntry(ctx, entry)
  await refreshPublicAssetRefsForEntry(ctx, entry)
}

async function refreshDraftAssetRefsForEntry(ctx: MutationCtx, entry: EntryDoc) {
  await deleteEntryAssetRefsBySourceKind(ctx, {
    entryId: entry._id,
    sourceKind: 'draft',
  })

  const draftRows = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
    .collect()
  for (const draft of draftRows) {
    const refs = uniqueAssetRefs([
      ...extractAssetRefsFromValues(draft.shared, { locale: draft.locale ?? null }),
      ...extractAssetRefsFromValues(draft.values, { locale: draft.locale ?? null }),
      ...extractAssetRefsFromText(draft.bodyMdc, {
        fieldPath: 'bodyMdc',
        locale: draft.locale ?? null,
      }),
    ])
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: draft.locale
        ? `${String(entry._id)}:${draft.locale}`
        : `${String(entry._id)}:shared`,
      entryId: entry._id,
      collectionId: entry.collectionId,
      refs,
      now: entry.updatedAt,
    })
  }
}

async function refreshRevisionAssetRefsForEntry(ctx: MutationCtx, entry: EntryDoc) {
  const revisions = await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entry._id))
    .collect()
  for (const revision of revisions) {
    const sharedRefs = extractAssetRefsFromValues(revision.snapshot.shared, { locale: null })
    await replaceAssetRefs(ctx, {
      sourceKind: 'revision',
      sourceId: `${revision._id}:shared`,
      entryId: entry._id,
      collectionId: entry.collectionId,
      refs: sharedRefs,
      now: revision.createdAt,
    })
    for (const [locale, localeSnapshot] of Object.entries(revision.snapshot.locales)) {
      if (!localeSnapshot) continue
      const refs = uniqueAssetRefs([
        ...extractAssetRefsFromValues(localeSnapshot.values, { locale }),
        ...extractAssetRefsFromText(localeSnapshot.bodyMdc, {
          fieldPath: 'bodyMdc',
          locale,
        }),
      ])
      await replaceAssetRefs(ctx, {
        sourceKind: 'revision',
        sourceId: `${revision._id}:${locale}`,
        entryId: entry._id,
        collectionId: entry.collectionId,
        refs,
        now: revision.createdAt,
      })
    }
  }
}

async function refreshPublicAssetRefsForEntry(ctx: MutationCtx, entry: EntryDoc) {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
    .collect()
  for (const row of rows) {
    const refs = uniqueAssetRefs([
      ...extractAssetRefsFromValues(row.data, { locale: row.locale }),
      ...extractAssetRefsFromValues(decodePublicBodyAst(row.bodyAst), {
        fieldPathPrefix: 'bodyAst',
        locale: row.locale,
      }),
    ])
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${entry._id}:${row.locale}`,
      entryId: entry._id,
      collectionId: entry.collectionId,
      refs,
      now: row.lastPublishedAt,
    })
  }
}

export async function rebuildEntryProjectionsFromCurrentState(
  ctx: MutationCtx,
  args: { entry: EntryDoc; collection: CollectionDoc; appIdentity?: string },
) {
  void args.collection
  void args.appIdentity
  await refreshDraftAssetRefsForEntry(ctx, args.entry)
  return { entry: args.entry, locales: [], dirtyLocales: args.entry.dirtyLocales, sortCache: {} }
}

export async function refreshEntryReadModelsById(
  ctx: MutationCtx,
  args: { entryId: Id<'entries'>; appIdentity?: string; [key: string]: unknown },
) {
  const entry = await ctx.db.get(args.entryId)
  if (!entry) return undefined
  const collection =
    (args.collection as CollectionDoc | undefined) ?? (await getCollection(ctx, entry.collectionId))
  if (!collection) return undefined

  await refreshDraftAssetRefsForEntry(ctx, entry)

  if (args.includeSubtree === true) {
    const children = await ctx.db
      .query('entries')
      .withIndex('by_parent', (q) =>
        q.eq('collectionId', entry.collectionId).eq('parentEntryId', entry._id),
      )
      .collect()
    children.sort((left, right) => {
      const rank = compareOrderRank(left.orderRank ?? null, right.orderRank ?? null)
      if (rank !== 0) return rank
      return String(left._id).localeCompare(String(right._id))
    })
    for (const child of children) {
      await refreshEntryReadModelsById(ctx, {
        ...args,
        entryId: child._id,
      })
    }
  }

  return { entry, locales: [], dirtyLocales: entry.dirtyLocales, sortCache: {} }
}

export async function getActivePublicRouteByPath(
  ctx: QueryOrMutationCtx,
  collectionId: Id<'collections'>,
  locale: string,
  path: string,
) {
  const row = await ctx.db
    .query('publicRoutes')
    .withIndex('by_locale_path', (q) => q.eq('locale', locale).eq('path', path))
    .first()
  return row && row.collectionId === collectionId ? row : null
}

export async function getActivePublicPageByPath(
  ctx: QueryOrMutationCtx,
  collectionId: Id<'collections'>,
  locale: string,
  path: string,
) {
  const route = await getActivePublicRouteByPath(ctx, collectionId, locale, path)
  if (!route) return null
  return await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', route.entryId).eq('locale', locale))
    .first()
}

export async function getActivePublicPageByStableId(
  ctx: QueryOrMutationCtx,
  collectionId: Id<'collections'>,
  locale: string,
  stableId: string,
) {
  const entries = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q.eq('collectionId', collectionId).eq('stableId', stableId),
    )
    .collect()
  for (const entry of entries) {
    const publicRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', locale))
      .first()
    if (publicRow) return publicRow
  }
  return null
}
