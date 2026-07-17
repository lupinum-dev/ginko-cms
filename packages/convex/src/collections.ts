import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel.js'
import { canRead } from './auth/checks.js'
import { pathPrefixForLocale } from './entries/workflow/path.js'
import { publicPathForEntry } from './entries/workflow/publicTree.js'
import { throwCmsError } from './errors.js'
import { callerQuery } from './functions.js'
import { isRouteBackedCollection, listInstalledCollections } from './lib/collections.js'
import { toStringId } from './lib/ids.js'

export { listCollections, getCollection } from './collections/contracts.js'

/** Default result cap for the Studio cross-collection search. */
const STUDIO_SEARCH_DEFAULT_LIMIT = 10
/** Maximum result cap for the Studio cross-collection search. */
const STUDIO_SEARCH_MAX_LIMIT = 25
/** Mirrors PUBLIC_QUERY_MAX_LENGTH in public.ts. */
const STUDIO_SEARCH_QUERY_MAX_LENGTH = 256

const studioSearchResultValidator = v.object({
  id: v.string(),
  title: v.string(),
  collection: v.string(),
  route: v.object({ slug: v.string(), href: v.string() }),
})

/** Same opt-out semantics as `publicFlag(row, 'search')` in public.ts. */
function includedInSearch(row: Doc<'publicEntries'>): boolean {
  if (row.searchIncluded === false) return false
  const publicValue = (row.data as JsonMap | undefined)?.public
  if (!publicValue || typeof publicValue !== 'object' || Array.isArray(publicValue)) return true
  const value = (publicValue as Record<string, unknown>).search
  return typeof value === 'boolean' ? value : true
}

/**
 * Cross-collection content search for the Studio command palette.
 *
 * Searches the same `publicEntries.search_locale` index the public
 * `public:search` query uses, but spans every route-backed collection that
 * supports the requested locale, with a bounded per-collection scan. Results
 * are merged in collection order and capped at `limit`.
 */
export const searchStudioEntries = callerQuery.protected({
  id: 'collections:searchStudioEntries',
  args: {
    query: v.string(),
    locale: v.string(),
    limit: v.optional(v.number()),
  },
  guard: canRead,
  returns: v.array(studioSearchResultValidator),
  handler: async (ctx, args) => {
    const query = args.query.trim()
    if (!query) return []
    if (query.length > STUDIO_SEARCH_QUERY_MAX_LENGTH) {
      throwCmsError('INVALID_QUERY', 'Search query exceeds the maximum length.', {
        maxLength: STUDIO_SEARCH_QUERY_MAX_LENGTH,
      })
    }
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? STUDIO_SEARCH_DEFAULT_LIMIT), 1),
      STUDIO_SEARCH_MAX_LIMIT,
    )

    const collections = await listInstalledCollections(ctx)
    const results: Array<(typeof studioSearchResultValidator)['type']> = []

    for (const collection of collections) {
      if (results.length >= limit) break
      if (!isRouteBackedCollection(collection)) continue
      if (!collection.locales.includes(args.locale)) continue

      const rows = await ctx.db
        .query('publicEntries')
        .withSearchIndex('search_locale', (q) =>
          q.search('searchText', query).eq('locale', args.locale).eq('collection', collection.slug),
        )
        .take(limit)

      for (const row of rows) {
        if (results.length >= limit) break
        if (!includedInSearch(row)) continue
        const href = await publicPathForEntry(ctx, row, {
          pathPrefix: pathPrefixForLocale(collection, row.locale),
          rootSlug: collection.routing.rootSlug,
        })
        // Broken ancestor chains are not publicly discoverable.
        if (!href) continue
        results.push({
          id: toStringId(row.entryId),
          title: row.title,
          collection: collection.slug,
          route: { slug: row.slug, href },
        })
      }
    }

    return results
  },
})
