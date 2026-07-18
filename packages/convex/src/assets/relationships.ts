import type { Doc, Id } from '../_generated/dataModel.js'
import { createDraftEntryTitleResolver } from '../entries/labels.js'
import { getCollection, getCollectionDefaultLocale } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { resolveLocaleText } from '../lib/locale.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'

type AssetDoc = Doc<'assets'>
type AssetRefDoc = Doc<'contentAssetRefs'>

export type AssetRefUsage = {
  sourceKind: AssetRefDoc['sourceKind']
  sourceId: string
  entryId: string
  entryTitle: string
  fieldPath: string
  locale: string
  collection: string
  collectionLabel: string
}

export type EntryMeta = {
  title: string
  collection: string
  collectionLabel: string
}

export type CollectionMeta = {
  slug: string
  label: string
}

export type AssetOwnerMetadata = {
  collectionBySlug: Map<string, CollectionMeta>
  entryById: Map<string, EntryMeta>
}

export async function loadAssetCollectionMetadata(
  ctx: QueryOrMutationCtx,
  assets: Array<Pick<AssetDoc, 'collection'>>,
) {
  const collectionKeys = assets.flatMap((asset) => (asset.collection ? [asset.collection] : []))
  return (await loadCollectionMetadata(ctx, collectionKeys)).collectionBySlug
}

type EntryMetadataRequest = {
  entryId: Id<'entries'>
  collection: string
  locale: string
}

export function assetOwnerPathFromMeta(
  asset: Pick<AssetDoc, 'scope'>,
  collectionMeta: CollectionMeta | null | undefined,
  entryMeta: EntryMeta | null | undefined,
): string[] {
  if (asset.scope === 'global') return ['Global']
  const collectionLabel =
    collectionMeta?.label ?? entryMeta?.collectionLabel ?? 'Unknown collection'
  if (asset.scope === 'collection') return ['Global', collectionLabel]
  return ['Global', collectionLabel, entryMeta?.title ?? 'Unknown entry']
}

/**
 * Resolve only canonical owner metadata for a bounded asset page. Reference
 * rows are intentionally absent: list queries expose an indexed boolean and
 * the detail surface loads reference pages separately.
 */
export async function loadAssetOwnerMetadata(
  ctx: QueryOrMutationCtx,
  assets: AssetDoc[],
): Promise<AssetOwnerMetadata> {
  const entryIds = new Map<string, Id<'entries'>>()
  for (const asset of assets) {
    if (asset.entryId) entryIds.set(toStringId(asset.entryId), asset.entryId)
  }
  const entries = (
    await Promise.all([...entryIds.values()].map((entryId) => ctx.db.get(entryId)))
  ).filter((entry): entry is Doc<'entries'> => entry !== null)
  const entriesById = new Map(entries.map((entry) => [toStringId(entry._id), entry]))
  const collectionKeys = new Set<string>()
  for (const entry of entries) collectionKeys.add(entry.collection)
  for (const asset of assets) {
    if (asset.collection) collectionKeys.add(asset.collection)
  }
  const { collections, collectionBySlug } = await loadCollectionMetadata(ctx, collectionKeys)
  const requests: EntryMetadataRequest[] = []
  for (const entry of entries) {
    const collection = collections.get(entry.collection)
    requests.push({
      entryId: entry._id,
      collection: entry.collection,
      locale: collection ? getCollectionDefaultLocale(collection) : 'en',
    })
  }
  const resolved = await resolveEntryMetadata(ctx, requests, {
    collections,
    collectionBySlug,
    entriesById,
  })
  return {
    collectionBySlug,
    entryById: new Map(
      entries.flatMap((entry) => {
        const collection = collections.get(entry.collection)
        const locale = collection ? getCollectionDefaultLocale(collection) : 'en'
        const metadata = resolved.get(metadataKey(entry._id, locale))
        return metadata ? [[toStringId(entry._id), metadata] as const] : []
      }),
    ),
  }
}

/** Resolve one already-bounded reference page for Studio display. */
export async function mapAssetReferenceUsages(
  ctx: QueryOrMutationCtx,
  rows: AssetRefDoc[],
): Promise<AssetRefUsage[]> {
  const entryIds = new Map<string, Id<'entries'>>()
  const collectionKeys = new Set<string>()
  for (const row of rows) {
    entryIds.set(toStringId(row.entryId), row.entryId)
    collectionKeys.add(row.collection)
  }
  const entries = (
    await Promise.all([...entryIds.values()].map((entryId) => ctx.db.get(entryId)))
  ).filter((entry): entry is Doc<'entries'> => entry !== null)
  const entriesById = new Map(entries.map((entry) => [toStringId(entry._id), entry]))
  const { collections, collectionBySlug } = await loadCollectionMetadata(ctx, collectionKeys)
  const requests = rows.map((row) => {
    const collection = collections.get(row.collection)
    return {
      entryId: row.entryId,
      collection: row.collection,
      locale: row.locale ?? (collection ? getCollectionDefaultLocale(collection) : 'en'),
    }
  })
  const resolved = await resolveEntryMetadata(ctx, requests, {
    collections,
    collectionBySlug,
    entriesById,
  })

  return rows.flatMap((row) => {
    const collection = collections.get(row.collection)
    const locale = row.locale ?? (collection ? getCollectionDefaultLocale(collection) : 'en')
    const entryMeta = resolved.get(metadataKey(row.entryId, locale))
    if (!entryMeta) return []
    return [
      {
        sourceKind: row.sourceKind,
        sourceId: row.sourceId,
        entryId: toStringId(row.entryId),
        entryTitle: entryMeta.title,
        fieldPath: row.fieldPath,
        locale,
        collection: entryMeta.collection,
        collectionLabel: entryMeta.collectionLabel,
      },
    ]
  })
}

export async function hasAssetReferences(ctx: QueryOrMutationCtx, assetId: string) {
  return !!(await ctx.db
    .query('contentAssetRefs')
    .withIndex('by_asset_source', (query) => query.eq('assetId', assetId))
    .first())
}

export async function readAssetReferenceFlags(ctx: QueryOrMutationCtx, assetIds: Iterable<string>) {
  const uniqueIds = [...new Set(assetIds)]
  return new Map(
    await Promise.all(
      uniqueIds.map(async (assetId) => [assetId, await hasAssetReferences(ctx, assetId)] as const),
    ),
  )
}

async function loadCollectionMetadata(ctx: QueryOrMutationCtx, slugs: Iterable<string>) {
  const resolved = await Promise.all(
    [...new Set(slugs)].map(async (slug) => [slug, await getCollection(ctx, slug)] as const),
  )
  const collections = new Map<string, CmsCollection>(
    resolved.filter((entry): entry is readonly [string, CmsCollection] => entry[1] !== null),
  )
  const collectionBySlug = new Map<string, CollectionMeta>()
  for (const [slug, collection] of collections) {
    collectionBySlug.set(slug, {
      slug,
      label: resolveLocaleText(collection.label, getCollectionDefaultLocale(collection)),
    })
  }
  return { collections, collectionBySlug }
}

function metadataKey(entryId: Id<'entries'>, locale: string) {
  return `${toStringId(entryId)}:${locale}`
}

async function resolveEntryMetadata(
  ctx: QueryOrMutationCtx,
  requests: EntryMetadataRequest[],
  context: {
    collections: Map<string, CmsCollection>
    collectionBySlug: Map<string, CollectionMeta>
    entriesById: Map<string, Doc<'entries'>>
  },
) {
  const uniqueRequests = new Map(
    requests.map((request) => [metadataKey(request.entryId, request.locale), request]),
  )
  const draftTitleResolver = createDraftEntryTitleResolver(ctx)
  return new Map(
    await Promise.all(
      [...uniqueRequests.entries()].map(async ([key, request]) => {
        const collection = context.collections.get(request.collection)
        const collectionMeta = context.collectionBySlug.get(request.collection)
        return [
          key,
          await resolveEntryMetaForAssetRef(ctx, {
            ...request,
            collectionMeta,
            collectionRecord: collection,
            entry: context.entriesById.get(toStringId(request.entryId)),
            draftTitleResolver,
          }),
        ] as const
      }),
    ),
  )
}

async function resolveEntryMetaForAssetRef(
  ctx: QueryOrMutationCtx,
  args: EntryMetadataRequest & {
    collectionMeta?: CollectionMeta
    collectionRecord?: CmsCollection
    entry?: Doc<'entries'>
    draftTitleResolver: ReturnType<typeof createDraftEntryTitleResolver>
  },
): Promise<EntryMeta> {
  const collectionLabel = args.collectionMeta?.label ?? args.collection
  const publicRow = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (query) =>
      query.eq('entryId', args.entryId).eq('locale', args.locale),
    )
    .first()
  if (publicRow) {
    return { title: publicRow.title, collection: args.collection, collectionLabel }
  }

  const entry = args.entry ?? (await ctx.db.get(args.entryId))
  if (entry && args.collectionRecord) {
    return {
      title: await args.draftTitleResolver({
        entry,
        collection: args.collectionRecord,
        locale: args.locale,
      }),
      collection: args.collection,
      collectionLabel,
    }
  }
  return {
    title: entry?.slug ?? toStringId(args.entryId),
    collection: args.collection,
    collectionLabel,
  }
}
