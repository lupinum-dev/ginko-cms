import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { logActivity } from '../lib/activity.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { rankAfter, rankBetween } from '../lib/ordering.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import { CMS_TREE_MAX_DEPTH } from './treePolicy.js'
import { refreshDraftSearchEntriesForEntry } from './workflow/draftSearch.js'

export async function resolveParentEntryId(
  ctx: QueryOrMutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  collectionSlug: string,
  parentEntryId: string | undefined,
): Promise<Id<'entries'> | null> {
  if (!parentEntryId) return null
  if (collection.type !== 'tree') {
    throwCmsError('ENTRY_PARENT_NOT_ALLOWED', 'Flat collections cannot assign a parent entry', {
      collection: collectionSlug,
      parentEntryId,
    })
  }
  const parentId = ctx.db.normalizeId('entries', parentEntryId)
  const parent = parentId ? await ctx.db.get(parentId) : null
  if (!parent || parent.collection !== collectionSlug || parent.lifecycle !== 'active') {
    throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found', {
      parentEntryId,
      collection: collectionSlug,
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

  if (depth > CMS_TREE_MAX_DEPTH) {
    throwCmsError(
      'ENTRY_MAX_DEPTH_EXCEEDED',
      `This move exceeds the supported tree depth of ${CMS_TREE_MAX_DEPTH}`,
      { maxDepth: CMS_TREE_MAX_DEPTH },
    )
  }
}

async function placementAnchor(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    parentEntryId: Id<'entries'> | null
    anchorId: string
    excludeEntryId?: Id<'entries'>
  },
) {
  const id = ctx.db.normalizeId('entries', args.anchorId)
  const entry = id ? await ctx.db.get(id) : null
  if (
    !entry ||
    entry.collection !== args.collection ||
    entry.parentEntryId !== args.parentEntryId ||
    entry._id === args.excludeEntryId
  ) {
    throwCmsError('ENTRY_PLACEMENT_ANCHOR_INVALID', 'Placement anchor is not a current sibling.', {
      collection: args.collection,
      parentEntryId: args.parentEntryId ? String(args.parentEntryId) : null,
      anchorId: args.anchorId,
    })
  }
  return entry
}

function withoutExcluded(rows: EntryDoc[], excludeEntryId?: Id<'entries'>) {
  return rows.find((entry) => !excludeEntryId || entry._id !== excludeEntryId) ?? null
}

async function resolveOrderRank(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
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

  const before = args.beforeEntryId
    ? await placementAnchor(ctx, {
        collection: args.collection,
        parentEntryId: args.parentEntryId,
        anchorId: args.beforeEntryId,
        excludeEntryId: args.excludeEntryId,
      })
    : null
  const after = args.afterEntryId
    ? await placementAnchor(ctx, {
        collection: args.collection,
        parentEntryId: args.parentEntryId,
        anchorId: args.afterEntryId,
        excludeEntryId: args.excludeEntryId,
      })
    : null

  if (before && after) {
    if (before._id === after._id || after.orderRank >= before.orderRank) {
      throwCmsError(
        'ENTRY_PLACEMENT_ANCHOR_INVALID',
        'Placement anchors are not in ascending sibling order.',
      )
    }
    return rankBetween(after.orderRank, before.orderRank)
  }

  if (before) {
    const previous = withoutExcluded(
      await ctx.db
        .query('entries')
        .withIndex('by_parent', (q) =>
          q
            .eq('collection', args.collection)
            .eq('parentEntryId', args.parentEntryId)
            .lt('orderRank', before.orderRank),
        )
        .order('desc')
        .take(args.excludeEntryId ? 2 : 1),
      args.excludeEntryId,
    )
    return rankBetween(previous?.orderRank, before.orderRank)
  }

  if (after) {
    const next = withoutExcluded(
      await ctx.db
        .query('entries')
        .withIndex('by_parent', (q) =>
          q
            .eq('collection', args.collection)
            .eq('parentEntryId', args.parentEntryId)
            .gt('orderRank', after.orderRank),
        )
        .order('asc')
        .take(args.excludeEntryId ? 2 : 1),
      args.excludeEntryId,
    )
    return rankBetween(after.orderRank, next?.orderRank)
  }

  const lastSibling = withoutExcluded(
    await ctx.db
      .query('entries')
      .withIndex('by_parent', (q) =>
        q.eq('collection', args.collection).eq('parentEntryId', args.parentEntryId),
      )
      .order('desc')
      .take(args.excludeEntryId ? 2 : 1),
    args.excludeEntryId,
  )
  return rankAfter(lastSibling?.orderRank)
}

export async function resolveEntryPlacement(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    collectionSlug: string
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
    args.collectionSlug,
    args.parentEntryId,
  )
  await assertTreePlacement(ctx, args.collection, resolvedParentEntryId, args.excludeEntryId)
  const orderRank = await resolveOrderRank(ctx, {
    collection: args.collectionSlug,
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
    collectionSlug: args.entry.collection,
    parentEntryId: args.parentEntryId,
    beforeEntryId: args.beforeEntryId,
    afterEntryId: args.afterEntryId,
    currentOrder: args.entry.orderRank ?? null,
    excludeEntryId: args.entry._id,
  })

  await ctx.db.patch(args.entry._id, {
    parentEntryId: resolved.parentEntryId,
    orderRank: resolved.orderRank,
    sharedVersion: args.entry.sharedVersion + 1,
    draftVersion: args.entry.draftVersion + 1,
    updatedAt: args.now,
    updatedBy: args.appIdentityId,
  })
  await refreshDraftSearchEntriesForEntry(ctx, args.entry._id, args.collection)

  await logActivity(ctx, {
    kind: args.activityKind,
    summary: args.activitySummary,
    appIdentityId: args.appIdentityId,
    entryId: args.entry._id,
    collection: args.entry.collection,
    detail: args.detail(resolved),
  })

  return {
    ...resolved,
    draftVersion: args.entry.draftVersion + 1,
  }
}
