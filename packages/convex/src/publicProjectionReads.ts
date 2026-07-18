import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { Doc, Id } from './_generated/dataModel.js'
import {
  MAX_PUBLIC_TREE_DEPTH,
  publicPathForEntry,
  publicPathFromTreeSegments,
} from './entries/workflow/publicTree.js'
import { throwCmsError } from './errors.js'
import { getCollectionDefaultLocale, getCollectionOrThrow } from './lib/collections.js'
import { getRoutingLocales } from './lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from './lib/paths.js'
import type { QueryCtx } from './lib/types.js'
import type { PublicTranslationSummary } from './publicReadAdapter.js'

const BULK_TRANSLATION_THRESHOLD = 400
const PUBLIC_COLLECTION_LOCALE_LIMIT = 1_500
const EXACT_TRANSLATION_CONCURRENCY = 100

export function publicPathsFromStructuralRows(
  rows: Array<Doc<'publicEntries'>>,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  locale: string,
) {
  const rowsById = new Map(rows.map((row) => [String(row.entryId), row]))
  const paths = new Map<string, string>()
  const unreachable = new Set<string>()
  const resolve = (row: Doc<'publicEntries'>): string | null => {
    const key = String(row.entryId)
    const cached = paths.get(key)
    if (cached) return cached
    if (unreachable.has(key)) return null
    const segments = [row.slug]
    const seen = new Set([key])
    let parentEntryId = row.parentEntryId
    while (parentEntryId) {
      const parentKey = String(parentEntryId)
      if (seen.has(parentKey) || segments.length >= MAX_PUBLIC_TREE_DEPTH) {
        unreachable.add(key)
        return null
      }
      seen.add(parentKey)
      const parent = rowsById.get(parentKey)
      if (!parent || parent.locale !== locale) {
        unreachable.add(key)
        return null
      }
      segments.unshift(parent.slug)
      parentEntryId = parent.parentEntryId
    }
    const path = publicPathFromTreeSegments(segments, {
      pathPrefix: pathPrefixForLocale(collection, locale),
      rootSlug: rootSlugForLocale(collection, locale),
    })
    paths.set(key, path)
    return path
  }
  for (const row of rows) resolve(row)
  return paths
}

/**
 * Exact alternate reads. Small pages use bounded entry-prefix lookups. Large
 * navigation batches use one bounded structural read per locale and resolve
 * tree paths in memory, avoiding Convex's 1,000 concurrent-I/O ceiling.
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
  if (entryIds.length >= BULK_TRANSLATION_THRESHOLD) {
    const requested = new Set(entryIds)
    for (const locale of contract.locales) {
      const rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_orderKey_entry', (query) =>
          query.eq('collection', collection).eq('locale', locale),
        )
        .order('asc')
        .take(PUBLIC_COLLECTION_LOCALE_LIMIT + 1)
      if (rows.length > PUBLIC_COLLECTION_LOCALE_LIMIT) {
        return throwCmsError(
          'SUPPORTED_SCALE_EXCEEDED',
          'Public translations support at most 1,500 entries per collection and locale.',
          { collection, locale, limit: PUBLIC_COLLECTION_LOCALE_LIMIT },
        )
      }
      const paths = publicPathsFromStructuralRows(rows, contract, locale)
      for (const row of rows) {
        const entryId = String(row.entryId)
        if (!requested.has(entryId)) continue
        const path = paths.get(entryId)
        if (!path) continue
        result.get(entryId)!.push({
          locale,
          slug: row.slug,
          path,
          href: renderGinkoHref({ locale, path }, routingLocales),
          published: true,
        })
      }
    }
    return result
  }

  for (let start = 0; start < entryIds.length; start += EXACT_TRANSLATION_CONCURRENCY) {
    await Promise.all(
      entryIds.slice(start, start + EXACT_TRANSLATION_CONCURRENCY).map(async (entryId) => {
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
  }
  return result
}
