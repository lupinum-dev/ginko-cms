import type { Doc, Id } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import {
  computeDraftPath,
  effectiveDraftParent,
  effectiveDraftSlug,
} from './workflow/draftPlacement.js'
import { readDraftRows } from './workflow/drafts.js'
import { entrySnapshotPath } from './workflow/path.js'

type CollectionDoc = Awaited<ReturnType<typeof getCollectionOrThrow>>
type EntryDoc = Doc<'entries'>

function sameId(left: Id<'entries'> | null | undefined, right: Id<'entries'> | null) {
  return String(left ?? '') === String(right ?? '')
}

function routeSegment(collection: CollectionDoc, entry: EntryDoc, slug: string) {
  return entrySnapshotPath(collection, {
    slug,
    stableId: entry.stableId ?? null,
  }).replace(/^\/+/, '')
}

/**
 * Enforce draft route uniqueness from the canonical entry table plus explicit
 * draft move-ins. An omitted draft parent is not an override; null is an
 * explicit move to the collection root and is intentionally indexable.
 */
export async function assertNoDraftSiblingPathConflict(
  ctx: QueryOrMutationCtx,
  args: {
    entry: EntryDoc
    collection: CollectionDoc
    locales: string[]
    parentEntryId?: Id<'entries'> | null
  },
) {
  const movingRows = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id))
    .collect()
  const movingShared = movingRows.find((row) => row.locale === null) ?? null
  const movingByLocale = new Map(
    movingRows.filter((row) => row.locale !== null).map((row) => [row.locale as string, row]),
  )
  const targetParent =
    args.parentEntryId !== undefined
      ? args.parentEntryId
      : effectiveDraftParent(args.entry, movingShared)

  const [canonicalSiblings, draftMoveIns] = await Promise.all([
    ctx.db
      .query('entries')
      .withIndex('by_parent', (q) =>
        q.eq('collectionId', args.collection._id).eq('parentEntryId', targetParent),
      )
      .collect(),
    ctx.db
      .query('entryDrafts')
      .withIndex('by_parent_override', (q) => q.eq('parentEntryId', targetParent))
      .collect(),
  ])

  const candidates = new Map<string, EntryDoc>()
  for (const sibling of canonicalSiblings) candidates.set(String(sibling._id), sibling)
  const moveInEntries = await Promise.all(draftMoveIns.map((moveIn) => ctx.db.get(moveIn.entryId)))
  for (const entry of moveInEntries) {
    if (entry?.collectionId === args.collection._id) candidates.set(String(entry._id), entry)
  }
  candidates.delete(String(args.entry._id))

  const candidateDrafts = await Promise.all(
    [...candidates.values()].map(async (candidate) => ({
      candidate,
      draftRows: await readDraftRows(ctx, candidate._id),
    })),
  )

  for (const { candidate, draftRows } of candidateDrafts) {
    if (!sameId(effectiveDraftParent(candidate, draftRows.shared), targetParent)) continue

    for (const locale of args.locales) {
      const movingSlug = effectiveDraftSlug(
        args.entry,
        movingShared,
        movingByLocale.get(locale) ?? null,
      )
      const candidateSlug = effectiveDraftSlug(
        candidate,
        draftRows.shared,
        draftRows.byLocale[locale] ?? null,
      )
      if (
        routeSegment(args.collection, args.entry, movingSlug) !==
        routeSegment(args.collection, candidate, candidateSlug)
      ) {
        continue
      }
      const path = await computeDraftPath(ctx, {
        collection: args.collection,
        entry: args.entry,
        parentEntryId: targetParent,
        slug: movingSlug,
        locale,
      })
      throwCmsError('ENTRY_PATH_CONFLICT', `Path "${path}" already exists for locale "${locale}"`, {
        entryId: String(args.entry._id),
        conflictingEntryId: String(candidate._id),
        locale,
        path,
      })
    }
  }
}
