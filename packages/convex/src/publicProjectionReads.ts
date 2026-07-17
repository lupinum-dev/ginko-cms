import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { Id } from './_generated/dataModel.js'
import { getCollectionDefaultLocale, getCollectionOrThrow } from './lib/collections.js'
import { getRoutingLocales } from './lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from './lib/paths.js'
import type { QueryCtx } from './lib/types.js'
import { publicPathForEntry } from './entries/workflow/publicTree.js'
import type { PublicTranslationSummary } from './publicReadAdapter.js'

/**
 * Exact alternate reads: one indexed entry-prefix lookup per requested entry.
 * Collection size is irrelevant, so this remains correct beyond 5,000 rows.
 */
export async function readTranslationsByEntryId(
  ctx: QueryCtx,
  collection: string,
  entries: Array<{ entryId: Id<'entries'> }>,
) {
  const entryIds = [...new Set(entries.map((entry) => String(entry.entryId)))]
  const result = new Map<string, PublicTranslationSummary[]>(
    entryIds.map((entryId) => [entryId, []]),
  )
  if (!entryIds.length) return result

  const contract = await getCollectionOrThrow(ctx, collection)
  const routingLocales = await getRoutingLocales(
    ctx,
    contract.locales,
    getCollectionDefaultLocale(contract),
  )
  await Promise.all(
    entryIds.map(async (entryId) => {
      const id = ctx.db.normalizeId('entries', entryId)
      if (!id) return
      const rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_entry_locale', (query) => query.eq('entryId', id))
        .collect()
      const translations = result.get(entryId)!
      for (const row of rows) {
        if (row.collection !== collection) continue
        const path = await publicPathForEntry(ctx, row, {
          pathPrefix: pathPrefixForLocale(contract, row.locale),
          rootSlug: rootSlugForLocale(contract, row.locale),
        })
        if (!path) continue
        translations.push({
          locale: row.locale,
          slug: row.slug,
          path,
          href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
          published: true,
        })
      }
    }),
  )
  return result
}
