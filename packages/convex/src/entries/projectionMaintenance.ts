import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../_generated/server.js'
import { getCollection } from '../lib/collections.js'
import { asEntryId } from '../lib/ids.js'
import type { CmsCollection, MutationCtx, QueryCtx } from '../lib/types.js'
import { rebuildContentAssetRefsForEntry } from './projections.js'
import { bumpPublicProjectionGeneration, type PublicEntryDoc } from './workflow/projection.js'

const projectionIssueValidator = v.object({
  code: v.string(),
  entryId: v.optional(v.string()),
  locale: v.optional(v.string()),
  path: v.optional(v.string()),
  message: v.string(),
})

type ProjectionIssue = {
  code: string
  entryId?: string
  locale?: string
  path?: string
  message: string
}

async function getCollectionForPublicRow(
  ctx: QueryCtx,
  args: {
    row: PublicEntryDoc
    cache: Map<string, CmsCollection | null>
    issues: ProjectionIssue[]
  },
) {
  const cacheKey = String(args.row.collectionId)
  if (args.cache.has(cacheKey)) return args.cache.get(cacheKey) ?? null

  const collectionRow = await ctx.db.get(args.row.collectionId)
  const collection = collectionRow ? await getCollection(ctx, collectionRow.slug) : null
  args.cache.set(cacheKey, collection)
  if (!collection) {
    args.issues.push({
      code: 'collection-not-found',
      entryId: String(args.row.entryId),
      locale: args.row.locale,
      path: args.row.path,
      message: 'Public row points at a missing collection.',
    })
  }
  return collection
}

async function syncPublicRouteFromPublicEntry(
  ctx: MutationCtx,
  args: {
    row: PublicEntryDoc
    collection: CmsCollection
    issues: ProjectionIssue[]
  },
) {
  const routeBacked = (args.collection.routing.mode ?? 'route') === 'route'
  const existingByEntry = await ctx.db
    .query('publicRoutes')
    .withIndex('by_entry_locale', (q) =>
      q.eq('entryId', args.row.entryId).eq('locale', args.row.locale),
    )
    .first()

  if (!routeBacked) {
    if (existingByEntry) await ctx.db.delete(existingByEntry._id)
    return existingByEntry ? 1 : 0
  }

  const existingByPath = await ctx.db
    .query('publicRoutes')
    .withIndex('by_locale_path', (q) => q.eq('locale', args.row.locale).eq('path', args.row.path))
    .first()
  if (existingByPath && existingByPath.entryId !== args.row.entryId) {
    args.issues.push({
      code: 'public-route-conflict',
      entryId: String(args.row.entryId),
      locale: args.row.locale,
      path: args.row.path,
      message: 'Public route cannot be rebuilt because another entry already owns this path.',
    })
    return 0
  }

  if (existingByEntry && existingByEntry.path !== args.row.path) {
    await ctx.db.delete(existingByEntry._id)
  }

  const target =
    existingByEntry && existingByEntry.path === args.row.path ? existingByEntry : existingByPath
  const payload = {
    entryId: args.row.entryId,
    collectionId: args.row.collectionId,
    locale: args.row.locale,
    path: args.row.path,
    href: args.row.href,
    revisionId: args.row.revisionId,
  }

  if (target) {
    await ctx.db.replace(target._id, payload)
  } else {
    await ctx.db.insert('publicRoutes', payload)
  }
  return 1
}

export const repairPublishedProjectionIndexesForEntry = internalMutation({
  args: {
    entryId: v.string(),
  },
  returns: v.object({
    publicRoutes: v.number(),
    contentAssetRefs: v.number(),
    issues: v.array(projectionIssueValidator),
  }),
  handler: async (ctx, args) => {
    const entryId = asEntryId(args.entryId)
    const entry = await ctx.db.get(entryId)
    if (!entry) {
      return {
        publicRoutes: 0,
        contentAssetRefs: 0,
        issues: [
          {
            code: 'entry-not-found',
            entryId: args.entryId,
            message: 'Entry not found.',
          },
        ],
      }
    }
    const collectionRow = await ctx.db.get(entry.collectionId)
    if (!collectionRow) {
      return {
        publicRoutes: 0,
        contentAssetRefs: 0,
        issues: [
          {
            code: 'collection-not-found',
            entryId: args.entryId,
            message: 'Collection not found.',
          },
        ],
      }
    }
    const collection = await getCollection(ctx, collectionRow.slug)
    if (!collection) {
      return {
        publicRoutes: 0,
        contentAssetRefs: 0,
        issues: [
          {
            code: 'collection-not-found',
            entryId: args.entryId,
            message: 'Collection not found.',
          },
        ],
      }
    }

    const issues: ProjectionIssue[] = []
    const publicRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
      .collect()

    let rebuiltPublicRoutes = 0
    for (const row of publicRows) {
      const revision = await ctx.db.get(row.revisionId)
      if (!revision) {
        issues.push({
          code: 'public-revision-missing',
          entryId: String(entry._id),
          locale: row.locale,
          path: row.path,
          message: 'Public row points at a missing revision.',
        })
      }
      rebuiltPublicRoutes += await syncPublicRouteFromPublicEntry(ctx, {
        row,
        collection,
        issues,
      })
    }
    if (rebuiltPublicRoutes > 0) await bumpPublicProjectionGeneration(ctx)

    await rebuildContentAssetRefsForEntry(ctx, entry._id, collection)
    const contentAssetRefs = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
      .collect()

    return {
      publicRoutes: rebuiltPublicRoutes,
      contentAssetRefs: contentAssetRefs.length,
      issues,
    }
  },
})

export const verifyPublicProjectionInvariants = internalQuery({
  args: {
    entryId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    checkedPublicEntries: v.number(),
    issues: v.array(projectionIssueValidator),
  }),
  handler: async (ctx, args) => {
    const issues: ProjectionIssue[] = []
    const entryId = args.entryId ? asEntryId(args.entryId) : null
    const publicRows = entryId
      ? await ctx.db
          .query('publicEntries')
          .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
          .collect()
      : await ctx.db.query('publicEntries').collect()

    const collectionCache = new Map<string, CmsCollection | null>()
    const seenRoutes = new Set<string>()
    for (const row of publicRows) {
      const revision = await ctx.db.get(row.revisionId)
      if (!revision) {
        issues.push({
          code: 'public-revision-missing',
          entryId: String(row.entryId),
          locale: row.locale,
          path: row.path,
          message: 'Public row points at a missing revision.',
        })
      }

      const collection = await getCollectionForPublicRow(ctx, {
        row,
        cache: collectionCache,
        issues,
      })
      const routeBacked = (collection?.routing.mode ?? 'route') === 'route'

      const route = await ctx.db
        .query('publicRoutes')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', row.entryId).eq('locale', row.locale))
        .first()
      if (!routeBacked) {
        if (route) {
          issues.push({
            code: 'public-route-unexpected',
            entryId: String(row.entryId),
            locale: row.locale,
            path: row.path,
            message: 'Data-only public entries must not have publicRoutes rows.',
          })
        }
        continue
      }

      const routeKey = `${row.collectionId}:${row.locale}:${row.path}`
      if (seenRoutes.has(routeKey)) {
        issues.push({
          code: 'duplicate-public-route',
          entryId: String(row.entryId),
          locale: row.locale,
          path: row.path,
          message: 'Multiple public entries claim the same collection/locale/path.',
        })
      }
      seenRoutes.add(routeKey)

      if (
        !route ||
        route.collectionId !== row.collectionId ||
        route.path !== row.path ||
        route.revisionId !== row.revisionId
      ) {
        issues.push({
          code: 'public-route-drift',
          entryId: String(row.entryId),
          locale: row.locale,
          path: row.path,
          message: 'publicRoutes does not match publicEntries for this entry locale.',
        })
      }
    }

    return {
      ok: issues.length === 0,
      checkedPublicEntries: publicRows.length,
      issues,
    }
  },
})
