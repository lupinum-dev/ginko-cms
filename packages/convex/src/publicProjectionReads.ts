import type { Id } from './_generated/dataModel.js'
import { throwCmsError } from './errors.js'
import type { ReadCtx } from './lib/types.js'
import type { PublicTranslationSummary } from './publicReadAdapter.js'

const PUBLIC_TRANSLATION_SCAN_MAX_ROWS = 5000

export async function readTranslationsByEntryId(
  ctx: ReadCtx,
  collectionId: Id<'collections'>,
  entries: Array<{ entryId: Id<'entries'> }>,
) {
  const entryIds = new Set(entries.map((entry) => String(entry.entryId)))
  const result = new Map<string, PublicTranslationSummary[]>(
    Array.from(entryIds, (entryId) => [entryId, []]),
  )
  if (entryIds.size === 0) return result

  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_orderKey', (query) => query.eq('collectionId', collectionId))
    .take(PUBLIC_TRANSLATION_SCAN_MAX_ROWS + 1)
  if (rows.length > PUBLIC_TRANSLATION_SCAN_MAX_ROWS) {
    throwCmsError(
      'PUBLIC_TRANSLATION_SCAN_TOO_LARGE',
      `Public translation scan exceeds ${PUBLIC_TRANSLATION_SCAN_MAX_ROWS} rows. Split the collection before querying translated variants.`,
      { collectionId: String(collectionId), maxRows: PUBLIC_TRANSLATION_SCAN_MAX_ROWS },
    )
  }

  for (const row of rows) {
    const entryId = String(row.entryId)
    const translations = result.get(entryId)
    if (!translations) continue
    translations.push({
      locale: row.locale,
      slug: row.slug,
      path: row.path,
      href: row.href,
      published: true,
    })
  }
  return result
}
