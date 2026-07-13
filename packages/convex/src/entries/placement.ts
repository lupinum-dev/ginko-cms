import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { logActivity } from '../lib/activity.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { asEntryId, toStringId } from '../lib/ids.js'
import { compareOrderRank, rankAfter, rankBetween } from '../lib/ordering.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import { refreshDraftAssetRefsForEntrySubtree } from './projections.js'

export async function resolveParentEntryId(
  ctx: QueryOrMutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  collectionId: Id<'collections'>,
  parentEntryId: string | undefined,
): Promise<Id<'entries'> | null> {
  if (!parentEntryId) return null
  if (collection.type !== 'tree') {
    throwCmsError('ENTRY_PARENT_NOT_ALLOWED', 'Flat collections cannot assign a parent entry', {
      collectionId: toStringId(collectionId),
      parentEntryId,
    })
  }
  const parent = await ctx.db.get(asEntryId(parentEntryId))
  if (!parent || parent.collectionId !== collectionId) {
    throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found', {
      parentEntryId,
      collectionId: toStringId(collectionId),
    })
  }
  return parent._id
}

export async function assertTreePlacement(
  ctx: QueryOrMutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  parentEntryId: Id<'entries'> | null,
  movingEntryId?: Id<'entries'>,
) {
  if (collection.type !== 'tree') return
  if (!parentEntryId) return
  if (movingEntryId && movingEntryId === parentEntryId) {
    throwCmsError('ENTRY_INVALID_TREE_MOVE', 'An entry cannot be moved under itself')
  }

  let currentParentId: Id<'entries'> | null = parentEntryId
  let depth = 1
  while (currentParentId) {
    if (movingEntryId && currentParentId === movingEntryId) {
      throwCmsError(
        'ENTRY_INVALID_TREE_MOVE',
        'An entry cannot be moved under one of its descendants',
      )
    }
    const parent: EntryDoc | null = await ctx.db.get(currentParentId)
    if (!parent) break
    currentParentId = parent.parentEntryId ?? null
    depth += 1
  }

  const settings = collection.settings as Record<string, unknown> | undefined
  const maxDepth = Number(settings?.maxDepth ?? 0)
  if (!maxDepth || Number.isNaN(maxDepth)) return
  if (depth > maxDepth) {
    throwCmsError(
      'ENTRY_MAX_DEPTH_EXCEEDED',
      `This move exceeds the collection max depth of ${maxDepth}`,
      { maxDepth },
    )
  }
}

async function getSiblingEntries(
  ctx: QueryOrMutationCtx,
  collectionId: Id<'collections'>,
  parentEntryId: Id<'entries'> | null,
  excludeEntryId?: Id<'entries'>,
) {
  const entries = await ctx.db
    .query('entries')
    .withIndex('by_parent', (q) =>
      q.eq('collectionId', collectionId).eq('parentEntryId', parentEntryId),
    )
    .collect()

  return entries
    .filter((entry: EntryDoc) => !excludeEntryId || entry._id !== excludeEntryId)
    .sort((left: EntryDoc, right: EntryDoc) => {
      const rank = compareOrderRank(left.orderRank ?? null, right.orderRank ?? null)
      if (rank !== 0) return rank
      return String(left._id).localeCompare(String(right._id))
    })
}

async function resolveOrderRank(
  ctx: QueryOrMutationCtx,
  args: {
    collectionId: Id<'collections'>
    parentEntryId: Id<'entries'> | null
    beforeEntryId?: string
    afterEntryId?: string
    currentOrder?: string | null
    excludeEntryId?: Id<'entries'>
  },
) {
  if (args.currentOrder && !args.beforeEntryId && !args.afterEntryId) {
    return args.currentOrder
  }

  const siblings = await getSiblingEntries(
    ctx,
    args.collectionId,
    args.parentEntryId,
    args.excludeEntryId,
  )

  const before = args.beforeEntryId
    ? siblings.find((entry: EntryDoc) => String(entry._id) === args.beforeEntryId)
    : undefined
  const after = args.afterEntryId
    ? siblings.find((entry: EntryDoc) => String(entry._id) === args.afterEntryId)
    : undefined

  if (before && after) {
    return rankBetween(after.orderRank ?? undefined, before.orderRank ?? undefined)
  }

  if (before) {
    const index = siblings.findIndex((entry: EntryDoc) => entry._id === before._id)
    const prev = index > 0 ? siblings[index - 1] : null
    return rankBetween(prev?.orderRank ?? undefined, before.orderRank ?? undefined)
  }

  if (after) {
    const index = siblings.findIndex((entry: EntryDoc) => entry._id === after._id)
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null
    return rankBetween(after.orderRank ?? undefined, next?.orderRank ?? undefined)
  }

  const lastSibling = siblings[siblings.length - 1]
  return rankAfter(lastSibling?.orderRank ?? undefined)
}

export async function resolveEntryPlacement(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    collectionId: Id<'collections'>
    parentEntryId?: string
    beforeEntryId?: string
    afterEntryId?: string
    currentOrder?: string | null
    excludeEntryId?: Id<'entries'>
  },
) {
  const resolvedParentEntryId = await resolveParentEntryId(
    ctx,
    args.collection,
    args.collectionId,
    args.parentEntryId,
  )
  await assertTreePlacement(ctx, args.collection, resolvedParentEntryId, args.excludeEntryId)
  const orderRank = await resolveOrderRank(ctx, {
    collectionId: args.collectionId,
    parentEntryId: resolvedParentEntryId,
    beforeEntryId: args.beforeEntryId,
    afterEntryId: args.afterEntryId,
    currentOrder: args.currentOrder ?? null,
    excludeEntryId: args.excludeEntryId,
  })

  return { parentEntryId: resolvedParentEntryId, orderRank }
}

export async function moveEntryInTree(
  ctx: MutationCtx,
  args: {
    entry: EntryDoc
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    appIdentityId: string
    parentEntryId?: string
    beforeEntryId?: string
    afterEntryId?: string
    now: number
    activityKind: 'entry.reordered' | 'entry.reparented'
    activitySummary: string
    detail: (resolved: {
      parentEntryId: Id<'entries'> | null
      orderRank: string
    }) => Record<string, JsonValue>
  },
) {
  const resolved = await resolveEntryPlacement(ctx, {
    collection: args.collection,
    collectionId: args.entry.collectionId,
    parentEntryId: args.parentEntryId,
    beforeEntryId: args.beforeEntryId,
    afterEntryId: args.afterEntryId,
    currentOrder: args.entry.orderRank ?? null,
    excludeEntryId: args.entry._id,
  })

  await ctx.db.patch(args.entry._id, {
    parentEntryId: resolved.parentEntryId,
    orderRank: resolved.orderRank,
    updatedAt: args.now,
    updatedBy: args.appIdentityId,
  })
  await syncSharedDraftPlacement(ctx, {
    entry: args.entry,
    parentEntryId: resolved.parentEntryId,
    orderRank: resolved.orderRank,
    appIdentityId: args.appIdentityId,
    now: args.now,
  })
  await refreshDraftAssetRefsForEntrySubtree(ctx, {
    collection: args.collection,
    entryId: args.entry._id,
    includeSubtree: true,
  })

  await logActivity(ctx, {
    kind: args.activityKind,
    summary: args.activitySummary,
    appIdentityId: args.appIdentityId,
    entryId: args.entry._id,
    collectionId: args.entry.collectionId,
    detail: args.detail(resolved),
  })
}

async function syncSharedDraftPlacement(
  ctx: MutationCtx,
  args: {
    entry: EntryDoc
    parentEntryId: Id<'entries'> | null
    orderRank: string
    appIdentityId: string
    now: number
  },
) {
  const existing = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id).eq('locale', null))
    .first()

  if (existing) {
    await ctx.db.patch(existing._id, {
      parentEntryId: args.parentEntryId,
      orderRank: args.orderRank,
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    })
    return
  }

  await ctx.db.insert('entryDrafts', {
    entryId: args.entry._id,
    locale: null,
    baseRevisionId: args.entry.latestRevisionId ?? null,
    parentEntryId: args.parentEntryId,
    orderRank: args.orderRank,
    slug: args.entry.baseSlug,
    shared: {},
    updatedBy: args.appIdentityId,
    updatedAt: args.now,
  })
}
