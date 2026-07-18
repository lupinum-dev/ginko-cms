import type { Id } from '../_generated/dataModel.js'
import { requireRecord } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { getCollection } from '../lib/collections.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'

export type AssetDiscoveryKind = 'image' | 'document'
export type AssetDeletedState = 'active' | 'trashed'

const MAX_ASSET_TAGS = 20
const MAX_ASSET_TAG_LENGTH = 64

export function assetKindForMimeType(mimeType: string): AssetDiscoveryKind {
  return mimeType.startsWith('image/') ? 'image' : 'document'
}

export function assetTagSearchToken(tag: string): string {
  const bytes = new TextEncoder().encode(tag)
  return `tag${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function assetDiscoveryFields(input: {
  filename: string
  mimeType: string
  tags: string[]
  createdAt: number
  updatedAt: number | null | undefined
  deletedAt: number | null | undefined
}) {
  return {
    kind: assetKindForMimeType(input.mimeType),
    filenameSort: input.filename.toLocaleLowerCase('en-US'),
    discoveryText: [input.filename, ...input.tags.map(assetTagSearchToken)].join(' '),
    effectiveUpdatedAt: input.updatedAt ?? input.createdAt,
    deletedState: input.deletedAt == null ? ('active' as const) : ('trashed' as const),
  }
}

export function normalizeTags(tags: string[]): string[] {
  const next = new Set<string>()
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized.length > MAX_ASSET_TAG_LENGTH) {
      throwCmsError(
        'ASSET_TAG_INVALID',
        `Asset tags must be at most ${MAX_ASSET_TAG_LENGTH} characters.`,
      )
    }
    if (normalized.length > 0) next.add(normalized)
  }
  if (next.size > MAX_ASSET_TAGS) {
    throwCmsError('ASSET_TAG_INVALID', `Assets support at most ${MAX_ASSET_TAGS} tags.`)
  }
  return Array.from(next)
}

function validateScope(args: {
  scope: 'global' | 'collection' | 'entry'
  entryId?: string
  collection?: string
}) {
  if (args.scope === 'global' && (args.entryId || args.collection)) {
    throwCmsError('ASSET_SCOPE_INVALID', 'Global assets cannot include entryId or collection.')
  }
  if (args.scope === 'collection' && (!args.collection || args.entryId)) {
    throwCmsError('ASSET_SCOPE_INVALID', 'Collection assets require collection and no entryId.')
  }
  if (args.scope === 'entry' && (!args.entryId || !args.collection)) {
    throwCmsError('ASSET_SCOPE_INVALID', 'Entry assets require entryId and collection.')
  }
}

function normalizeEntryId(ctx: QueryOrMutationCtx, entryId: string): Id<'entries'> {
  const normalized = ctx.db.normalizeId('entries', entryId)
  if (!normalized) {
    throwCmsError('ASSET_SCOPE_INVALID', 'entryId must be a valid CMS entry id.', { entryId })
  }
  return normalized
}

async function resolveCollectionForAssetScope(
  ctx: QueryOrMutationCtx,
  collectionKey?: string,
): Promise<CmsCollection> {
  if (collectionKey) {
    const collection = await getCollection(ctx, collectionKey)
    if (collection) return collection
    throwCmsError(
      'ASSET_SCOPE_INVALID',
      `Collection "${collectionKey}" is not present in the installed CMS contract.`,
      { collection: collectionKey },
    )
  }
  throwCmsError('ASSET_SCOPE_INVALID', 'Collection scope requires collection.')
}

export async function validateAssetScopeRelationships(
  ctx: QueryOrMutationCtx,
  args: {
    scope: 'global' | 'collection' | 'entry'
    entryId?: string
    collection?: string
  },
): Promise<{ entryId: Id<'entries'> | null; collection: string | null }> {
  validateScope(args)
  if (args.scope === 'global') return { entryId: null, collection: null }

  const collection = await resolveCollectionForAssetScope(ctx, args.collection)
  const collectionKey = collection.slug
  if (args.scope === 'collection') return { entryId: null, collection: collectionKey }

  const entryId = normalizeEntryId(ctx, args.entryId!)
  const entry = await ctx.db.get(entryId)
  requireRecord(entry, 'Entry')
  if (entry.collection !== collectionKey) {
    throwCmsError(
      'ASSET_SCOPE_INVALID',
      'Entry-scoped assets must use the entry collection slug.',
      {
        entryId: args.entryId ?? null,
        collection: collectionKey,
      },
    )
  }
  return { entryId, collection: collectionKey }
}
