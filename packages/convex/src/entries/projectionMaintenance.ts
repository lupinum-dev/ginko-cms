import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../_generated/server.js'
import { getCollection } from '../lib/collections.js'
import { asEntryId } from '../lib/ids.js'
import { rebuildContentAssetRefsForEntry } from './projections.js'
import { replaceAssetRefs } from './workflow/assetRefs.js'
import { buildPublicProjectionFromRevisionSnapshot } from './workflow/commands.js'
import { upsertPublicProjection } from './workflow/projection.js'

const projectionIssueValidator = v.object({
  code: v.string(),
  entryId: v.optional(v.string()),
  locale: v.optional(v.string()),
  path: v.optional(v.string()),
  message: v.string(),
})

export const rebuildDerivedStateForEntry = internalMutation({
  args: {
    entryId: v.string(),
  },
  returns: v.object({
    publicEntries: v.number(),
    publicRoutes: v.number(),
    contentAssetRefs: v.number(),
    issues: v.array(projectionIssueValidator),
  }),
  handler: async (ctx, args) => {
    const entryId = asEntryId(args.entryId)
    const entry = await ctx.db.get(entryId)
    if (!entry) {
      return {
        publicEntries: 0,
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
    const collection = await getCollection(ctx, entry.collectionId)
    if (!collection) {
      return {
        publicEntries: 0,
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

    const issues: Array<{
      code: string
      entryId?: string
      locale?: string
      path?: string
      message: string
    }> = []
    const publicRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
      .collect()

    let rebuiltPublicEntries = 0
    let rebuiltPublicRoutes = 0
    for (const row of publicRows) {
      const revision = await ctx.db.get(row.revisionId)
      const localeSnapshot = revision?.snapshot.locales[row.locale]
      if (!revision || !localeSnapshot) {
        issues.push({
          code: 'public-revision-missing',
          entryId: String(entry._id),
          locale: row.locale,
          path: row.path,
          message: 'Public row cannot be rebuilt because its revision snapshot is missing.',
        })
        continue
      }
      const projection = await buildPublicProjectionFromRevisionSnapshot(ctx, {
        entry,
        collection,
        revisionId: revision._id,
        snapshot: {
          parentEntryId: revision.snapshot.parentEntryId ?? null,
          orderRank: revision.snapshot.orderRank ?? null,
        },
        locale: row.locale,
        localeSnapshot,
        now: row.lastPublishedAt,
      })
      await upsertPublicProjection(ctx, projection.input)
      await replaceAssetRefs(ctx, {
        sourceKind: 'public',
        sourceId: `${entry._id}:${row.locale}`,
        entryId: entry._id,
        collectionId: entry.collectionId,
        refs: projection.assetRefs,
        now: row.lastPublishedAt,
      })
      rebuiltPublicEntries += 1
      rebuiltPublicRoutes += 1
    }

    await rebuildContentAssetRefsForEntry(ctx, entry._id, collection)
    const contentAssetRefs = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
      .collect()

    return {
      publicEntries: rebuiltPublicEntries,
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
    const issues: Array<{
      code: string
      entryId?: string
      locale?: string
      path?: string
      message: string
    }> = []
    const entryId = args.entryId ? asEntryId(args.entryId) : null
    const publicRows = entryId
      ? await ctx.db
          .query('publicEntries')
          .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
          .collect()
      : await ctx.db.query('publicEntries').collect()

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

      const route = await ctx.db
        .query('publicRoutes')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', row.entryId).eq('locale', row.locale))
        .first()
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
