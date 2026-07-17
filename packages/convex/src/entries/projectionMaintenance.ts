import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../_generated/server.js'
import { getCollection, needsStableId } from '../lib/collections.js'
import { asEntryId } from '../lib/ids.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import { rebuildContentAssetRefsForEntry } from './projections.js'
import { stableHash } from './workflow/hashing.js'
import { upsertPublicProjection } from './workflow/projection.js'
import { buildPublicProjectionFromRevisionSnapshot } from './workflow/projectionBuild.js'
import { publicPathForPlacement } from './workflow/publicTree.js'

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

export const repairPublishedProjectionIndexesForEntry = internalMutation({
  args: { entryId: v.string() },
  returns: v.object({
    publicEntries: v.number(),
    contentAssetRefs: v.number(),
    issues: v.array(projectionIssueValidator),
  }),
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) {
      return {
        publicEntries: 0,
        contentAssetRefs: 0,
        issues: [{ code: 'entry-not-found', entryId: args.entryId, message: 'Entry not found.' }],
      }
    }
    const collection = await getCollection(ctx, entry.collection)
    if (!collection) {
      return {
        publicEntries: 0,
        contentAssetRefs: 0,
        issues: [
          { code: 'collection-not-found', entryId: args.entryId, message: 'Collection not found.' },
        ],
      }
    }

    const issues: ProjectionIssue[] = []
    const activeLocales = new Set(entry.activePublications.map((pointer) => pointer.locale))
    const currentRows = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
      .collect()
    for (const row of currentRows) {
      if (!activeLocales.has(row.locale)) await ctx.db.delete(row._id)
    }

    const revisions = await ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entry._id))
      .collect()
    for (const pointer of entry.activePublications) {
      const revision = await ctx.db.get(pointer.revisionId)
      const snapshot = revision?.snapshots[pointer.locale]
      if (!revision || !snapshot) {
        issues.push({
          code: 'active-revision-missing',
          entryId: args.entryId,
          locale: pointer.locale,
          message: 'Active publication points at a missing complete snapshot.',
        })
        continue
      }
      const slug = needsStableId(collection) ? `${snapshot.slug}-${entry.stableId}` : snapshot.slug
      const path = await publicPathForPlacement(ctx, {
        collection: entry.collection,
        locale: pointer.locale,
        parentEntryId: snapshot.parentEntryId,
        slug,
        options: {
          pathPrefix: pathPrefixForLocale(collection, pointer.locale),
          rootSlug: rootSlugForLocale(collection, pointer.locale),
        },
      })
      if (!path) {
        issues.push({
          code: 'public-parent-unreachable',
          entryId: args.entryId,
          locale: pointer.locale,
          message: 'Active publication has an unreachable public parent.',
        })
        continue
      }
      const firstPublishedAt = Math.min(
        ...revisions
          .filter(
            (candidate) =>
              (candidate.kind === 'publish' || candidate.kind === 'rollback') &&
              candidate.snapshots[pointer.locale],
          )
          .map((candidate) => candidate.createdAt),
        pointer.activatedAt,
      )
      const built = await buildPublicProjectionFromRevisionSnapshot(ctx, {
        entry,
        collection,
        revisionId: revision._id,
        locale: pointer.locale,
        localeSnapshot: snapshot,
        publicPath: path,
        firstPublishedAt,
        now: pointer.activatedAt,
      })
      built.input.slug = slug
      await upsertPublicProjection(ctx, built.input)
    }

    await rebuildContentAssetRefsForEntry(ctx, entry._id, collection)
    const refs = await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
      .collect()
    return {
      publicEntries: entry.activePublications.length - issues.length,
      contentAssetRefs: refs.length,
      issues,
    }
  },
})

export const verifyPublicProjectionInvariants = internalQuery({
  args: { entryId: v.optional(v.string()) },
  returns: v.object({
    ok: v.boolean(),
    checkedPublicEntries: v.number(),
    issues: v.array(projectionIssueValidator),
  }),
  handler: async (ctx, args) => {
    const issues: ProjectionIssue[] = []
    const entries = args.entryId
      ? [await ctx.db.get(asEntryId(args.entryId))].filter((entry) => entry !== null)
      : await ctx.db.query('entries').take(1501)
    if (!args.entryId && entries.length > 1500) {
      issues.push({
        code: 'verification-page-required',
        message: 'Verify projections pagewise at target scale.',
      })
    }
    let checkedPublicEntries = 0
    for (const entry of entries.slice(0, 1500)) {
      const rows = await ctx.db
        .query('publicEntries')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
        .collect()
      checkedPublicEntries += rows.length
      const rowByLocale = new Map(rows.map((row) => [row.locale, row]))
      for (const pointer of entry.activePublications) {
        const row = rowByLocale.get(pointer.locale)
        const revision = await ctx.db.get(pointer.revisionId)
        const snapshot = revision?.snapshots[pointer.locale]
        if (!row || !revision || !snapshot || row.revisionId !== pointer.revisionId) {
          issues.push({
            code: 'public-projection-drift',
            entryId: String(entry._id),
            locale: pointer.locale,
            message: 'Canonical active publication and public projection disagree.',
          })
          continue
        }
        if (
          stableHash({
            collection: row.collection,
            parentEntryId: row.parentEntryId ? String(row.parentEntryId) : null,
            orderKey: row.orderKey,
            revisionId: String(row.revisionId),
          }) !==
          stableHash({
            collection: entry.collection,
            parentEntryId: snapshot.parentEntryId ? String(snapshot.parentEntryId) : null,
            orderKey: snapshot.orderRank,
            revisionId: String(pointer.revisionId),
          })
        ) {
          issues.push({
            code: 'public-placement-drift',
            entryId: String(entry._id),
            locale: pointer.locale,
            message: 'Public placement does not match its immutable source revision.',
          })
        }
      }
      for (const row of rows) {
        if (!entry.activePublications.some((pointer) => pointer.locale === row.locale)) {
          issues.push({
            code: 'orphan-public-projection',
            entryId: String(entry._id),
            locale: row.locale,
            message: 'Public row has no canonical active publication pointer.',
          })
        }
      }
    }
    return { ok: issues.length === 0, checkedPublicEntries, issues }
  },
})
