import type { Doc, Id } from '../../_generated/dataModel.js'
import type { getCollectionOrThrow } from '../../lib/collections.js'
import type { QueryOrMutationCtx } from '../../lib/types.js'
import { readDraftRows } from './drafts.js'
import { entrySnapshotPath, publicPathForLocaleSnapshot } from './path.js'

type EntryPlacement = Pick<Doc<'entries'>, 'baseSlug' | 'parentEntryId' | 'stableId'>
type LocaleDraftPlacement = Pick<Doc<'entryDrafts'>, 'localeSlug'> | null
type DraftCollection = Awaited<ReturnType<typeof getCollectionOrThrow>>

export function effectiveDraftParent(
  entry: Pick<EntryPlacement, 'parentEntryId'>,
  sharedRow: Pick<Doc<'entryDrafts'>, 'parentEntryId'> | null,
): Id<'entries'> | null {
  return sharedRow?.parentEntryId !== undefined
    ? (sharedRow.parentEntryId ?? null)
    : (entry.parentEntryId ?? null)
}

export function effectiveDraftSlug(
  entry: Pick<EntryPlacement, 'baseSlug'>,
  sharedRow: Pick<Doc<'entryDrafts'>, 'slug'> | null,
  localeRow: LocaleDraftPlacement,
): string {
  return localeRow?.localeSlug ?? sharedRow?.slug ?? entry.baseSlug
}

export async function resolveDraftAncestorSlugs(
  ctx: QueryOrMutationCtx,
  args: { parentEntryId: Id<'entries'> | null; locale: string },
) {
  const slugs: string[] = []
  let parentEntryId = args.parentEntryId
  while (parentEntryId) {
    const parent = await ctx.db.get(parentEntryId)
    if (!parent) break
    const parentDraftRows = await readDraftRows(ctx, parent._id)
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
