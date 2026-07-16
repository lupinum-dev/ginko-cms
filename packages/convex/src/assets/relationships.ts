import type { Doc, Id } from '../_generated/dataModel.js'
import { createDraftEntryTitleResolver } from '../entries/labels.js'
import { normalizeCollectionDoc } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { resolveLocaleText } from '../lib/locale.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'

type AssetDoc = Doc<'assets'>
type CollectionDoc = Doc<'collections'>

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

export type AssetRelationships = {
  collectionById: Map<string, CollectionMeta>
  entryById: Map<string, EntryMeta>
  usagesByAssetId: Map<string, AssetRefUsage[]>
}

function getDefaultLocale(settings: Doc<'cmsSettings'> | null): string {
  return (
    settings?.locales.find((locale) => locale.isDefault)?.code ?? settings?.locales[0]?.code ?? 'en'
  )
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
  const settings = await ctx.db
    .query('cmsSettings')
    .withIndex('by_key', (q) => q.eq('key', 'site'))
    .first()
  const defaultLocale = getDefaultLocale(settings)
  const assetIdList = [...assetIds]
  const [referenceGroups, assets] = await Promise.all([
    Promise.all(
      assetIdList.map((assetId) =>
        ctx.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', assetId))
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
  const collectionIds = new Map<string, Id<'collections'>>()
  for (const row of referenceRows) {
    collectionIds.set(toStringId(row.collectionId), row.collectionId)
  }
  for (const entry of entries) {
    collectionIds.set(toStringId(entry.collectionId), entry.collectionId)
  }
  for (const asset of assets) {
    if (asset?.collectionId) {
      collectionIds.set(toStringId(asset.collectionId), asset.collectionId)
    }
  }
  const collections = (
    await Promise.all([...collectionIds.values()].map((collectionId) => ctx.db.get(collectionId)))
  ).filter((collection): collection is CollectionDoc => collection !== null)
  const collectionById = new Map<string, CollectionMeta>()
  const collectionRecordsById = new Map<string, CmsCollection>()
  for (const collection of collections) {
    collectionRecordsById.set(toStringId(collection._id), normalizeCollectionDoc(collection))
    collectionById.set(toStringId(collection._id), {
      slug: collection.slug,
      label: resolveLocaleText(collection.label, defaultLocale),
    })
  }

  const usagesByAssetId = new Map<string, AssetRefUsage[]>()
  for (const assetId of assetIds) usagesByAssetId.set(assetId, [])

  const metadataRequests = new Map<
    string,
    {
      entryId: Id<'entries'>
      collectionId: Id<'collections'>
      locale: string
      collectionMeta?: CollectionMeta
      collection?: CmsCollection
    }
  >()
  for (const row of referenceRows) {
    const locale = row.locale ?? defaultLocale
    metadataRequests.set(`${toStringId(row.entryId)}:${locale}`, {
      entryId: row.entryId,
      collectionId: row.collectionId,
      locale,
      collectionMeta: collectionById.get(toStringId(row.collectionId)),
      collection: collectionRecordsById.get(toStringId(row.collectionId)),
    })
  }
  for (const asset of assets) {
    if (!asset?.entryId) continue
    const entry = entriesById.get(toStringId(asset.entryId))
    if (!entry) continue
    const key = `${toStringId(entry._id)}:${defaultLocale}`
    if (!metadataRequests.has(key)) {
      metadataRequests.set(key, {
        entryId: entry._id,
        collectionId: entry.collectionId,
        locale: defaultLocale,
        collectionMeta: collectionById.get(toStringId(entry.collectionId)),
        collection: collectionRecordsById.get(toStringId(entry.collectionId)),
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
    const entryId = toStringId(row.entryId)
    const locale = row.locale ?? defaultLocale
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

  for (const assetId of assetIds) {
    const usages = usagesByAssetId.get(assetId) ?? []
    if (usages.length === 0) continue
    usages.sort((left, right) => {
      const entryOrder = left.entryTitle.localeCompare(right.entryTitle)
      if (entryOrder !== 0) return entryOrder
      return left.fieldPath.localeCompare(right.fieldPath)
    })
  }

  const entryById = new Map<string, EntryMeta>()
  for (const asset of assets) {
    if (!asset?.entryId) continue
    const entryId = toStringId(asset.entryId)
    const meta = resolvedMetadata.get(`${entryId}:${defaultLocale}`)
    if (meta) entryById.set(entryId, meta)
  }

  return {
    collectionById,
    entryById,
    usagesByAssetId,
  }
}

async function resolveEntryMetaForAssetRef(
  ctx: QueryOrMutationCtx,
  args: {
    entryId: Id<'entries'>
    collectionId: Id<'collections'>
    locale: string
    collectionMeta?: CollectionMeta
    collection?: CmsCollection
    entry?: Doc<'entries'>
    draftTitleResolver: ReturnType<typeof createDraftEntryTitleResolver>
  },
): Promise<EntryMeta> {
  const collectionSlug = args.collectionMeta?.slug ?? toStringId(args.collectionId)
  const collectionLabel = args.collectionMeta?.label ?? collectionSlug
  const publicRow = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId).eq('locale', args.locale))
    .first()
  if (publicRow) {
    return {
      title: publicRow.title,
      collectionSlug,
      collectionLabel,
    }
  }

  const entry = args.entry ?? (await ctx.db.get(args.entryId))
  if (entry && args.collection) {
    return {
      title: await args.draftTitleResolver({
        entry,
        collection: args.collection,
        locale: args.locale,
      }),
      collectionSlug,
      collectionLabel,
    }
  }
  return {
    title: entry?.baseSlug ?? toStringId(args.entryId),
    collectionSlug,
    collectionLabel,
  }
}
