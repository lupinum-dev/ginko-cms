import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import type { getCollectionOrThrow } from '../../lib/collections.js'
import type { QueryOrMutationCtx } from '../../lib/types.js'
import { CMS_TREE_MAX_DEPTH } from '../treePolicy.js'
import type { EntryDraftDoc, SharedDraftView } from './drafts.js'
import { readDraftPlacementRows } from './drafts.js'
import { entrySnapshotPath, publicPathForLocaleSnapshot } from './path.js'

type EntryPlacement = Pick<Doc<'entries'>, 'slug' | 'parentEntryId' | 'stableId'>
type LocaleDraftPlacement = Pick<EntryDraftDoc, 'slug'> | null
type DraftCollection = Awaited<ReturnType<typeof getCollectionOrThrow>>

const MAX_SUPPORTED_ENTRIES = 1_500
const SUBTREE_READ_CONCURRENCY = 100

export function effectiveDraftParent(
  entry: Pick<EntryPlacement, 'parentEntryId'>,
  sharedRow: Pick<SharedDraftView, 'parentEntryId'> | null,
): Id<'entries'> | null {
  return sharedRow?.parentEntryId !== undefined
    ? (sharedRow.parentEntryId ?? null)
    : (entry.parentEntryId ?? null)
}

export function effectiveDraftSlug(
  entry: Pick<EntryPlacement, 'slug'>,
  sharedRow: Pick<SharedDraftView, 'slug'> | null,
  localeRow: LocaleDraftPlacement,
): string {
  return localeRow?.slug ?? sharedRow?.slug ?? entry.slug
}

export async function resolveDraftAncestorSlugs(
  ctx: QueryOrMutationCtx,
  args: { parentEntryId: Id<'entries'> | null; locale: string },
) {
  const slugs: string[] = []
  const visited = new Set<string>()
  let parentEntryId = args.parentEntryId
  while (parentEntryId) {
    const currentId = String(parentEntryId)
    if (visited.has(currentId)) {
      throwCmsError('ENTRY_INVALID_TREE_MOVE', 'Draft ancestry contains a cycle')
    }
    visited.add(currentId)
    const parent = await ctx.db.get(parentEntryId)
    if (!parent) break
    const parentDraftRows = await readDraftPlacementRows(ctx, parent._id, [args.locale])
    slugs.unshift(
      effectiveDraftSlug(
        parent,
        parentDraftRows.shared,
        parentDraftRows.byLocale[args.locale] ?? null,
      ),
    )
    parentEntryId = effectiveDraftParent(parent, parentDraftRows.shared)
  }
  return slugs
}

async function draftParentDepth(
  ctx: QueryOrMutationCtx,
  args: {
    collection: DraftCollection
    parentEntryId: Id<'entries'> | null
    movingEntryId?: Id<'entries'>
  },
) {
  const visited = new Set<string>(args.movingEntryId ? [String(args.movingEntryId)] : [])
  let currentParentId = args.parentEntryId
  let depth = 1
  while (currentParentId) {
    const currentId = String(currentParentId)
    if (visited.has(currentId)) {
      throwCmsError(
        'ENTRY_INVALID_TREE_MOVE',
        'An entry cannot be moved under itself or one of its descendants',
      )
    }
    visited.add(currentId)

    const parent = await ctx.db.get(currentParentId)
    if (!parent || parent.collection !== args.collection.slug || parent.lifecycle !== 'active') {
      throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found', {
        collection: args.collection.slug,
        parentEntryId: currentId,
      })
    }
    const parentDraftRows = await readDraftPlacementRows(ctx, parent._id, [])
    currentParentId = effectiveDraftParent(parent, parentDraftRows.shared)
    depth += 1
    if (depth > CMS_TREE_MAX_DEPTH) {
      throwCmsError(
        'ENTRY_MAX_DEPTH_EXCEEDED',
        `This move exceeds the supported tree depth of ${CMS_TREE_MAX_DEPTH}`,
        { maxDepth: CMS_TREE_MAX_DEPTH },
      )
    }
  }
  return depth
}

async function draftSubtreeHeight(
  ctx: QueryOrMutationCtx,
  collectionSlug: string,
  entryId: Id<'entries'>,
): Promise<number> {
  let height = 1
  let frontier = [entryId]
  const visited = new Set<string>([String(entryId)])
  while (frontier.length > 0 && height <= CMS_TREE_MAX_DEPTH) {
    const children: Doc<'entries'>[] = []
    for (let offset = 0; offset < frontier.length; offset += SUBTREE_READ_CONCURRENCY) {
      const parentBatch = frontier.slice(offset, offset + SUBTREE_READ_CONCURRENCY)
      const remaining = MAX_SUPPORTED_ENTRIES - visited.size
      const batch = (
        await Promise.all(
          parentBatch.map((parentEntryId) =>
            ctx.db
              .query('entries')
              .withIndex('by_parent', (query) =>
                query.eq('collection', collectionSlug).eq('parentEntryId', parentEntryId),
              )
              .take(remaining + 1),
          ),
        )
      ).flat()
      children.push(...batch)
      if (children.length > remaining) {
        throwCmsError(
          'CMS_SCALE_LIMIT_EXCEEDED',
          `Tree operations support at most ${MAX_SUPPORTED_ENTRIES} entries.`,
          { maxEntries: MAX_SUPPORTED_ENTRIES, collection: collectionSlug },
        )
      }
    }
    if (children.length === 0) return height
    const next: Id<'entries'>[] = []
    for (const child of children) {
      const childId = String(child._id)
      if (visited.has(childId)) {
        throwCmsError('ENTRY_INVALID_TREE_MOVE', 'Draft ancestry contains a cycle')
      }
      visited.add(childId)
      next.push(child._id)
    }
    height += 1
    frontier = next
  }
  return height
}

export async function assertDraftParentDepthForCreate(
  ctx: QueryOrMutationCtx,
  args: { collection: DraftCollection; parentEntryId: Id<'entries'> | null },
) {
  if (args.collection.type !== 'tree') {
    if (args.parentEntryId) {
      throwCmsError('ENTRY_PARENT_NOT_ALLOWED', 'Flat collections cannot assign a parent entry', {
        collection: args.collection.slug,
        parentEntryId: String(args.parentEntryId),
      })
    }
    return
  }
  await draftParentDepth(ctx, args)
}

export async function assertCurrentDraftParentChain(
  ctx: QueryOrMutationCtx,
  args: {
    collection: DraftCollection
    entry: Doc<'entries'>
    parentEntryId?: Id<'entries'> | null
  },
) {
  const targetParent =
    args.parentEntryId !== undefined
      ? args.parentEntryId
      : effectiveDraftParent(
          args.entry,
          (await readDraftPlacementRows(ctx, args.entry._id, [])).shared,
        )

  if (args.collection.type !== 'tree') {
    if (targetParent) {
      throwCmsError('ENTRY_PARENT_NOT_ALLOWED', 'Flat collections cannot assign a parent entry', {
        collection: args.collection.slug,
        parentEntryId: String(targetParent),
      })
    }
    return 1
  }

  return await draftParentDepth(ctx, {
    collection: args.collection,
    parentEntryId: targetParent,
    movingEntryId: args.entry._id,
  })
}

export async function assertValidDraftParentChain(
  ctx: QueryOrMutationCtx,
  args: {
    collection: DraftCollection
    entry: Doc<'entries'>
    parentEntryId?: Id<'entries'> | null
  },
) {
  const depth = await assertCurrentDraftParentChain(ctx, args)
  if (args.collection.type !== 'tree') return
  const subtreeHeight = await draftSubtreeHeight(ctx, args.collection.slug, args.entry._id)
  if (depth + subtreeHeight - 1 > CMS_TREE_MAX_DEPTH) {
    throwCmsError(
      'ENTRY_MAX_DEPTH_EXCEEDED',
      `This move exceeds the supported tree depth of ${CMS_TREE_MAX_DEPTH}`,
      { maxDepth: CMS_TREE_MAX_DEPTH },
    )
  }
}

export async function computeDraftPath(
  ctx: QueryOrMutationCtx,
  args: {
    collection: DraftCollection
    entry: EntryPlacement
    parentEntryId: Id<'entries'> | null
    slug: string
    locale: string
  },
) {
  const ancestorSlugs = await resolveDraftAncestorSlugs(ctx, {
    parentEntryId: args.parentEntryId,
    locale: args.locale,
  })
  const localePath = entrySnapshotPath(args.collection, {
    slug: args.slug,
    stableId: args.entry.stableId ?? null,
    ancestorSlugs,
  })
  return publicPathForLocaleSnapshot(args.collection, localePath, args.locale)
}
