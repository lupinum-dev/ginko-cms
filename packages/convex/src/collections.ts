import { v } from 'convex/values'

import { canRead } from './auth/checks.js'
import { computeDraftPath } from './entries/workflow/draftPlacement.js'
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

/**
 * Cross-collection content search for the Studio command palette.
 *
 * Searches the authorized draft projection, so unpublished and divergent
 * drafts remain discoverable without exposing them through public queries.
 */
export const searchStudioEntries = callerQuery.protected({
  id: 'collections:searchStudioEntries',
  args: {
    query: v.string(),
    locale: v.string(),
    collection: v.optional(v.string()),
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

    const installedCollections = await listInstalledCollections(ctx)
    const collections = args.collection
      ? installedCollections.filter((collection) => collection.slug === args.collection)
      : installedCollections
    const results: Array<(typeof studioSearchResultValidator)['type']> = []

    for (const collection of collections) {
      if (results.length >= limit) break
      if (!isRouteBackedCollection(collection)) continue
      if (!collection.locales.includes(args.locale)) continue

      const rows = await ctx.db
        .query('draftSearchEntries')
        .withSearchIndex('search_collection_locale', (q) =>
          q.search('searchText', query).eq('collection', collection.slug).eq('locale', args.locale),
        )
        .take(limit)

      for (const row of rows) {
        if (results.length >= limit) break
        const entry = await ctx.db.get(row.entryId)
        if (!entry || entry.lifecycle !== 'active') continue
        const draft = await ctx.db
          .query('entryLocaleDrafts')
          .withIndex('by_entry_locale', (index) =>
            index.eq('entryId', row.entryId).eq('locale', row.locale),
          )
          .unique()
        if (
          !draft ||
          row.sourceDraftVersion !== entry.draftVersion ||
          row.sourceSharedVersion !== entry.sharedVersion ||
          row.sourceLocaleVersion !== draft.version
        ) {
          continue
        }
        const href = await computeDraftPath(ctx, {
          collection,
          entry,
          parentEntryId: entry.parentEntryId,
          slug: row.slug,
          locale: row.locale,
        })
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
