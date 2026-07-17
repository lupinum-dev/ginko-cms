import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc } from '../_generated/dataModel.js'
import { resolveEntryTitle } from '../lib/fields.js'
import type { CmsCollection, QueryOrMutationCtx } from '../lib/types.js'

export function createDraftEntryTitleResolver(ctx: QueryOrMutationCtx) {
  const localeRows = new Map<string, Promise<Doc<'entryLocaleDrafts'> | null>>()

  function localeRow(entryId: Doc<'entries'>['_id'], locale: string) {
    const key = `${String(entryId)}\u0000${locale}`
    let pending = localeRows.get(key)
    if (!pending) {
      pending = ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
        .unique()
      localeRows.set(key, pending)
    }
    return pending
  }

  return async (args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    locale: string
  }): Promise<string> => {
    const localized = await localeRow(args.entry._id, args.locale)
    const data = materializeFieldData(
      args.collection.fields,
      args.entry.shared as JsonMap,
      (localized?.values ?? {}) as JsonMap,
    )
    return (
      resolveEntryTitle(data, args.collection.fields, args.collection.settings) ??
      args.entry.slug
    )
  }
}
