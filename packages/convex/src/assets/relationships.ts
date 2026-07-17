import type { Doc, Id } from '../_generated/dataModel.js'
import { createDraftEntryTitleResolver } from '../entries/labels.js'
import { getCollection, getCollectionDefaultLocale } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { resolveLocaleText } from '../lib/locale.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'

type AssetDoc = Doc<'assets'>

export type AssetRefUsage = {
  entryId: string
  entryTitle: string
  fieldPath: string
  locale: string
  collectionSlug: string
  collectionLabel: string
}

export type EntryMeta = {
  title: string
  collectionSlug: string
  collectionLabel: string
}

export type CollectionMeta = {
  slug: string
  label: string
}

/**
 * Collection keys are stable slugs. The name is retained because the Studio
 * asset response still calls the public field `collectionId`; it no longer
 * denotes a Convex document id.
 */
export type AssetRelationships = {
  collectionById: Map<string, CollectionMeta>
  entryById: Map<string, EntryMeta>
  usagesByAssetId: Map<string, AssetRefUsage[]>
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

export async function loadAssetRelationships(
  ctx: QueryOrMutationCtx,
  assetIds: Set<string>,
): Promise<AssetRelationships> {
  const assetIdList = [...assetIds]
  const [referenceGroups, assets] = await Promise.all([
    Promise.all(
      assetIdList.map((assetId) =>
        ctx.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (query) => query.eq('assetId', assetId))
          .collect(),
      ),
    ),
    Promise.all(assetIdList.map((assetId) => ctx.db.get(assetId as Id<'assets'>))),
  ])
  const referenceRows = referenceGroups.flat()
  const entryIds = new Map<string, Id<'entries'>>()
  for (const row of referenceRows) entryIds.set(toStringId(row.entryId), row.entryId)
  for (const asset of assets) {
    if (asset?.entryId) entryIds.set(toStringId(asset.entryId), asset.entryId)
  }
  const entries = (
    await Promise.all([...entryIds.values()].map((entryId) => ctx.db.get(entryId)))
  ).filter((entry): entry is Doc<'entries'> => entry !== null)
  const entriesById = new Map(entries.map((entry) => [toStringId(entry._id), entry]))

  const collectionSlugs = new Set<string>()
  for (const row of referenceRows) collectionSlugs.add(row.collection)
  for (const entry of entries) collectionSlugs.add(entry.collection)
  for (const asset of assets) {
    if (asset?.collection) collectionSlugs.add(asset.collection)
  }
  const resolvedCollections = await Promise.all(
    [...collectionSlugs].map(async (slug) => [slug, await getCollection(ctx, slug)] as const),
  )
  const collections = new Map<string, CmsCollection>(
    resolvedCollections.filter(
      (entry): entry is readonly [string, CmsCollection] => entry[1] !== null,
    ),
  )
  const collectionById = new Map<string, CollectionMeta>()
  for (const [slug, collection] of collections) {
    collectionById.set(slug, {
      slug,
      label: resolveLocaleText(collection.label, getCollectionDefaultLocale(collection)),
    })
  }

  const usagesByAssetId = new Map<string, AssetRefUsage[]>()
  for (const assetId of assetIds) usagesByAssetId.set(assetId, [])

  const metadataRequests = new Map<
    string,
    {
      entryId: Id<'entries'>
      collection: string
      locale: string
      collectionMeta?: CollectionMeta
      collectionRecord?: CmsCollection
    }
  >()
  for (const row of referenceRows) {
    const collection = collections.get(row.collection)
    const locale = row.locale ?? (collection ? getCollectionDefaultLocale(collection) : 'en')
    metadataRequests.set(`${toStringId(row.entryId)}:${locale}`, {
      entryId: row.entryId,
      collection: row.collection,
      locale,
      collectionMeta: collectionById.get(row.collection),
      collectionRecord: collection,
    })
  }
  for (const asset of assets) {
    if (!asset?.entryId) continue
    const entry = entriesById.get(toStringId(asset.entryId))
    if (!entry) continue
    const collection = collections.get(entry.collection)
    const locale = collection ? getCollectionDefaultLocale(collection) : 'en'
    const key = `${toStringId(entry._id)}:${locale}`
    if (!metadataRequests.has(key)) {
      metadataRequests.set(key, {
        entryId: entry._id,
        collection: entry.collection,
        locale,
        collectionMeta: collectionById.get(entry.collection),
        collectionRecord: collection,
      })
    }
  }

  const draftTitleResolver = createDraftEntryTitleResolver(ctx)
  const resolvedMetadata = new Map(
    await Promise.all(
      [...metadataRequests.entries()].map(
        async ([key, request]) =>
          [
            key,
            await resolveEntryMetaForAssetRef(ctx, {
              ...request,
              entry: entriesById.get(toStringId(request.entryId)),
              draftTitleResolver,
            }),
          ] as const,
      ),
    ),
  )

  for (const row of referenceRows) {
    const collection = collections.get(row.collection)
    const locale = row.locale ?? (collection ? getCollectionDefaultLocale(collection) : 'en')
    const entryId = toStringId(row.entryId)
    const entryMeta = resolvedMetadata.get(`${entryId}:${locale}`)
    const target = usagesByAssetId.get(row.assetId)
    if (!entryMeta || !target) continue
    target.push({
      entryId,
      entryTitle: entryMeta.title,
      fieldPath: row.fieldPath,
      locale,
      collectionSlug: entryMeta.collectionSlug,
      collectionLabel: entryMeta.collectionLabel,
    })
  }

  for (const usages of usagesByAssetId.values()) {
    usages.sort((left, right) => {
      const entryOrder = left.entryTitle.localeCompare(right.entryTitle)
      return entryOrder !== 0 ? entryOrder : left.fieldPath.localeCompare(right.fieldPath)
    })
  }

  const entryById = new Map<string, EntryMeta>()
  for (const asset of assets) {
    if (!asset?.entryId) continue
    const entry = entriesById.get(toStringId(asset.entryId))
    if (!entry) continue
    const collection = collections.get(entry.collection)
    const locale = collection ? getCollectionDefaultLocale(collection) : 'en'
    const meta = resolvedMetadata.get(`${toStringId(entry._id)}:${locale}`)
    if (meta) entryById.set(toStringId(entry._id), meta)
  }

  return { collectionById, entryById, usagesByAssetId }
}

async function resolveEntryMetaForAssetRef(
  ctx: QueryOrMutationCtx,
  args: {
    entryId: Id<'entries'>
    collection: string
    locale: string
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
    return { title: publicRow.title, collectionSlug: args.collection, collectionLabel }
  }

  const entry = args.entry ?? (await ctx.db.get(args.entryId))
  if (entry && args.collectionRecord) {
    return {
      title: await args.draftTitleResolver({
        entry,
        collection: args.collectionRecord,
        locale: args.locale,
      }),
      collectionSlug: args.collection,
      collectionLabel,
    }
  }
  return {
    title: entry?.slug ?? toStringId(args.entryId),
    collectionSlug: args.collection,
    collectionLabel,
  }
}
