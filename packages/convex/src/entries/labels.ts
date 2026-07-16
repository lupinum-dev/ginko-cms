import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc } from '../_generated/dataModel.js'
import { resolveEntryTitle } from '../lib/fields.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'

export function createDraftEntryTitleResolver(ctx: QueryOrMutationCtx) {
  const sharedRows = new Map<string, Promise<Doc<'entryDrafts'> | null>>()
  const localeRows = new Map<string, Promise<Doc<'entryDrafts'> | null>>()

  function sharedRow(entryId: Doc<'entries'>['_id']) {
    const key = String(entryId)
    let pending = sharedRows.get(key)
    if (!pending) {
      pending = ctx.db
        .query('entryDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', null))
        .first()
      sharedRows.set(key, pending)
    }
    return pending
  }

  function localeRow(entryId: Doc<'entries'>['_id'], locale: string) {
    const key = `${String(entryId)}\u0000${locale}`
    let pending = localeRows.get(key)
    if (!pending) {
      pending = ctx.db
        .query('entryDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
        .first()
      localeRows.set(key, pending)
    }
    return pending
  }

  return async (args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    locale: string
  }): Promise<string> => {
    const [shared, localized] = await Promise.all([
      sharedRow(args.entry._id),
      localeRow(args.entry._id, args.locale),
    ])
    const data = materializeFieldData(
      args.collection.fields,
      (shared?.shared ?? {}) as JsonMap,
      (localized?.values ?? {}) as JsonMap,
    )
    return (
      resolveEntryTitle(data, args.collection.fields, args.collection.settings) ??
      args.entry.baseSlug
    )
  }
}
