import type { Doc } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import type { getCollectionOrThrow } from '../../lib/collections.js'
import { isEqualJsonValue } from '../../lib/data.js'
import type { MutationCtx } from '../../lib/types.js'
import { assertNoDraftSiblingPathConflict } from '../draftPathConflicts.js'
import { assertValidDraftParentChain } from './draftPlacement.js'

function restorableRevisionPlacement(sourceRevision: Doc<'entryRevisions'>) {
  const locales = Object.keys(sourceRevision.snapshots).sort()
  if (!locales.length) {
    throwCmsError('REVISION_SNAPSHOT_EMPTY', 'Revision contains no restorable locales.')
  }
  const first = sourceRevision.snapshots[locales[0]!]!
  for (const locale of locales.slice(1)) {
    const snapshot = sourceRevision.snapshots[locale]!
    if (
      !isEqualJsonValue(snapshot.shared, first.shared) ||
      snapshot.parentEntryId !== first.parentEntryId ||
      snapshot.orderRank !== first.orderRank
    ) {
      throwCmsError(
        'REVISION_PLACEMENT_INVALID',
        'Revision locales disagree about shared fields or placement.',
        { revisionId: String(sourceRevision._id), locale },
      )
    }
  }
  return {
    locales,
    first,
    slugByLocale: Object.fromEntries(
      locales.map((locale) => [locale, sourceRevision.snapshots[locale]!.slug]),
    ),
  }
}

export async function validateRevisionPlacementForDraftRestore(
  ctx: MutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    sourceRevision: Doc<'entryRevisions'>
  },
) {
  const placement = restorableRevisionPlacement(args.sourceRevision)
  await assertValidDraftParentChain(ctx, {
    entry: args.entry,
    collection: args.collection,
    parentEntryId: placement.first.parentEntryId,
  })
  await assertNoDraftSiblingPathConflict(ctx, {
    entry: args.entry,
    collection: args.collection,
    locales: placement.locales,
    parentEntryId: placement.first.parentEntryId,
    slugByLocale: placement.slugByLocale,
  })
  return placement
}
