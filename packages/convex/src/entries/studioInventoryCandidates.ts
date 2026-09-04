import type { Doc } from '../_generated/dataModel.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import { draftSearchPublicationHash } from './workflow/draftSearch.js'

export type StudioWorkState =
  | 'all'
  | 'changed'
  | 'needs_attention'
  | 'missing_translation'
  | undefined

export async function canonicalEntriesForSearchRows(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  rows: Doc<'draftSearchEntries'>[],
) {
  const loaded = await Promise.all(
    rows.map(async (row) => {
      const [entry, draft] = await Promise.all([
        ctx.db.get(row.entryId),
        ctx.db
          .query('entryLocaleDrafts')
          .withIndex('by_entry_locale', (query) =>
            query.eq('entryId', row.entryId).eq('locale', row.locale),
          )
          .unique(),
      ])
      if (
        !entry ||
        entry.collection !== collection.slug ||
        entry.draftVersion !== row.sourceDraftVersion ||
        entry.sharedVersion !== row.sourceSharedVersion ||
        entry.updatedAt !== row.updatedAt ||
        (draft?.version ?? 0) !== row.sourceLocaleVersion ||
        draftSearchPublicationHash(entry) !== row.sourcePublicationHash
      ) {
        return null
      }
      return { entry, row }
    }),
  )
  return loaded.filter(
    (item): item is { entry: EntryDoc; row: Doc<'draftSearchEntries'> } => item !== null,
  )
}

export async function cheaplyMatchesWorkState(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  candidate: { entry: EntryDoc; row: Doc<'draftSearchEntries'> },
  workState: StudioWorkState,
) {
  if (!workState || workState === 'all' || workState === 'needs_attention') return true
  const rows =
    collection.locales.length === 1
      ? [candidate.row]
      : (
          await Promise.all(
            collection.locales.map((locale) =>
              ctx.db
                .query('draftSearchEntries')
                .withIndex('by_entry_locale', (query) =>
                  query.eq('entryId', candidate.entry._id).eq('locale', locale),
                )
                .unique(),
            ),
          )
        ).filter((row): row is Doc<'draftSearchEntries'> => row !== null)
  if (workState === 'missing_translation') {
    return rows.some(
      (row) =>
        row.sourceLocaleVersion === 0 &&
        !candidate.entry.activePublications.some(
          (publication) => publication.locale === row.locale,
        ),
    )
  }
  return rows.some((row) => {
    if (row.sourceLocaleVersion === 0) return false
    const publication = candidate.entry.activePublications.find(
      (active) => active.locale === row.locale,
    )
    return (
      !publication ||
      publication.sharedVersion !== candidate.entry.sharedVersion ||
      publication.localeVersion !== row.sourceLocaleVersion
    )
  })
}
