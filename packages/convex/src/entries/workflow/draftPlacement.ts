import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import type { getCollectionOrThrow } from '../../lib/collections.js'
import type { QueryOrMutationCtx } from '../../lib/types.js'
import type { EntryDraftDoc, SharedDraftView } from './drafts.js'
import { readDraftPlacementRows } from './drafts.js'
import { entrySnapshotPath, publicPathForLocaleSnapshot } from './path.js'

type EntryPlacement = Pick<Doc<'entries'>, 'slug' | 'parentEntryId' | 'stableId'>
type LocaleDraftPlacement = Pick<EntryDraftDoc, 'localeSlug'> | null
type DraftCollection = Awaited<ReturnType<typeof getCollectionOrThrow>>

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
  return localeRow?.localeSlug ?? sharedRow?.slug ?? entry.slug
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

export async function assertValidDraftParentChain(
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
    return
  }

  const visited = new Set<string>([String(args.entry._id)])
  let currentParentId = targetParent
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
    if (!parent || parent.collection !== args.collection.slug) {
      throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found', {
        collection: args.collection.slug,
        parentEntryId: currentId,
      })
    }
    const parentDraftRows = await readDraftPlacementRows(ctx, parent._id, [])
    currentParentId = effectiveDraftParent(parent, parentDraftRows.shared)
    depth += 1
  }

  const settings =
    args.collection.settings &&
    typeof args.collection.settings === 'object' &&
    !Array.isArray(args.collection.settings)
      ? (args.collection.settings as Record<string, unknown>)
      : {}
  const maxDepth = Number(settings.maxDepth ?? 0)
  if (maxDepth && !Number.isNaN(maxDepth) && depth > maxDepth) {
    throwCmsError(
      'ENTRY_MAX_DEPTH_EXCEEDED',
      `This move exceeds the collection max depth of ${maxDepth}`,
      { maxDepth },
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
