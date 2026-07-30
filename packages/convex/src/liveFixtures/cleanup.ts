import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel.js'
import { internalAction, internalMutation, internalQuery } from '../_generated/server.js'
import type { MutationCtx, QueryCtx } from '../lib/types.js'
import {
  assertFixturePrefix,
  boundedPage,
  FIXTURE_COLLECTION,
  FIXTURE_LOCALES,
} from '../liveFixtures.js'
function browserEntrySlugPrefix(prefix: string) {
  return `v-next-live-smoke-${prefix}`
}
async function fixtureMembers(ctx: MutationCtx | QueryCtx, prefix: string) {
  return (await ctx.db.query('members').collect()).filter((member) => member.updatedBy === prefix)
}

async function fixtureSiteData(ctx: MutationCtx | QueryCtx, prefix: string, count = 100) {
  const rows: Doc<'siteData'>[] = []
  for (const keyPrefix of [prefix, `proof-${prefix}`]) {
    if (rows.length >= count) break
    rows.push(
      ...(await ctx.db
        .query('siteData')
        .withIndex('by_key', (q) => q.gte('key', keyPrefix).lt('key', `${keyPrefix}\uFFFF`))
        .take(count - rows.length)),
    )
  }
  return rows
}

async function deleteEntryDependents(ctx: MutationCtx, entryId: Id<'entries'>) {
  for (const state of ['active', 'retired'] as const) {
    const redirects = await ctx.db
      .query('redirects')
      .withIndex('by_target', (q) => q.eq('targetEntryId', entryId).eq('state', state))
      .collect()
    for (const row of redirects) await ctx.db.delete(row._id)
  }
  for (const row of await ctx.db
    .query('reviewRequests')
    .withIndex('by_entry', (q) => q.eq('entryId', String(entryId)))
    .collect()) {
    await ctx.db.delete(row._id)
  }
  for (const row of await ctx.db
    .query('contentAssetRefs')
    .withIndex('by_entry', (q) => q.eq('entryId', entryId))
    .collect()) {
    await ctx.db.delete(row._id)
  }
  for (const locale of FIXTURE_LOCALES) {
    for (const table of ['draftSearchEntries', 'publicSearchEntries', 'publicEntries'] as const) {
      const row = await ctx.db
        .query(table)
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
        .unique()
      if (row) await ctx.db.delete(row._id)
    }
  }
  for (const row of await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entryId))
    .collect()) {
    await ctx.db.delete(row._id)
  }
  for (const row of await ctx.db
    .query('entryRevisions')
    .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId))
    .collect()) {
    await ctx.db.delete(row._id)
  }
}

export async function cleanupEntriesPageHandler(
  ctx: MutationCtx,
  args: { prefix: string; count: number },
) {
  boundedPage(0, args.count, 100)
  const count = Math.min(args.count, 50)
  const fixtureRows = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q
        .eq('collection', FIXTURE_COLLECTION)
        .gte('stableId', args.prefix)
        .lt('stableId', `${args.prefix}\uFFFF`),
    )
    .take(count)
  const browserSlugPrefix = browserEntrySlugPrefix(args.prefix)
  const browserRows =
    fixtureRows.length < count
      ? await ctx.db
          .query('entries')
          .withIndex('by_collection_slug', (q) =>
            q
              .eq('collection', 'blog')
              .gte('slug', browserSlugPrefix)
              .lt('slug', `${browserSlugPrefix}\uFFFF`),
          )
          .take(count - fixtureRows.length)
      : []
  const rows = [...fixtureRows, ...browserRows]
  for (const row of rows) {
    await deleteEntryDependents(ctx, row._id)
    await ctx.db.delete(row._id)
  }
  return { deleted: rows.length, complete: rows.length === 0 }
}

export async function fixtureEntryCountHandler(ctx: QueryCtx, prefix: string) {
  const browserSlugPrefix = browserEntrySlugPrefix(prefix)
  const [fixtureRows, browserRows] = await Promise.all([
    ctx.db
      .query('entries')
      .withIndex('by_collection_stableId', (q) =>
        q
          .eq('collection', FIXTURE_COLLECTION)
          .gte('stableId', prefix)
          .lt('stableId', `${prefix}\uFFFF`),
      )
      .take(1_501),
    ctx.db
      .query('entries')
      .withIndex('by_collection_slug', (q) =>
        q
          .eq('collection', 'blog')
          .gte('slug', browserSlugPrefix)
          .lt('slug', `${browserSlugPrefix}\uFFFF`),
      )
      .take(101),
  ])
  return fixtureRows.length + browserRows.length
}

export const cleanupEntriesPage = internalMutation({
  args: { prefix: v.string(), count: v.number() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await cleanupEntriesPageHandler(ctx, args)
  },
})

export async function cleanupAssetsPageHandler(
  ctx: MutationCtx,
  args: { prefix: string; count: number },
) {
  boundedPage(0, args.count, 100)
  const count = args.count
  const rows = await ctx.db
    .query('assets')
    .withIndex('by_filename', (q) =>
      q.gte('filenameSort', args.prefix).lt('filenameSort', `${args.prefix}\uFFFF`),
    )
    .take(count)
  const storageIds = new Set<string>()
  for (const row of rows) {
    storageIds.add(String(row.storageId))
    for (const ref of await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_asset_source', (q) => q.eq('assetId', String(row._id)))
      .collect()) {
      await ctx.db.delete(ref._id)
    }
    for (const artifact of await ctx.db
      .query('assetRecoveryArtifacts')
      .withIndex('by_asset_created', (q) => q.eq('assetId', String(row._id)))
      .collect()) {
      storageIds.add(String(artifact.storageRef))
      await ctx.db.delete(artifact._id)
    }
    await ctx.db.delete(row._id)
  }
  return { deleted: rows.length, storageIds: [...storageIds], complete: rows.length === 0 }
}

export const cleanupAssetsPage = internalMutation({
  args: { prefix: v.string(), count: v.number() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await cleanupAssetsPageHandler(ctx, args)
  },
})

export const deleteStorage = internalAction({
  args: { prefix: v.string(), storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    await ctx.storage.delete(args.storageId)
    return null
  },
})

export async function cleanupControlPageHandler(
  ctx: MutationCtx,
  args: {
    prefix: string
    phase: 'redirects' | 'siteData' | 'mcp' | 'members'
    count: number
  },
) {
  boundedPage(0, args.count, 100)
  const count = args.count
  if (args.phase === 'redirects') {
    const rows = await ctx.db
      .query('redirects')
      .withIndex('by_redirect_id', (q) =>
        q.gte('redirectId', args.prefix).lt('redirectId', `${args.prefix}\uFFFF`),
      )
      .take(count)
    for (const row of rows) await ctx.db.delete(row._id)
    return { deleted: rows.length, complete: rows.length === 0 }
  }
  if (args.phase === 'siteData') {
    const rows = await fixtureSiteData(ctx, args.prefix, count)
    for (const row of rows) await ctx.db.delete(row._id)
    return { deleted: rows.length, complete: rows.length === 0 }
  }
  if (args.phase === 'mcp') {
    const members = await fixtureMembers(ctx, args.prefix)
    let deleted = 0
    for (const member of members) {
      const delegations = await ctx.db
        .query('mcpOAuthDelegations')
        .withIndex('by_owner_user', (q) => q.eq('ownerUserId', member.userId))
        .take(count)
      for (const delegation of delegations) {
        for (const run of await ctx.db
          .query('agentRuns')
          .withIndex('by_delegation', (q) => q.eq('oauthDelegationId', delegation.delegationId))
          .take(100)) {
          await ctx.db.delete(run._id)
        }
        await ctx.db.delete(delegation._id)
        deleted += 1
      }
    }
    return { deleted, complete: deleted === 0 }
  }
  const rows = (await fixtureMembers(ctx, args.prefix)).slice(0, count)
  for (const row of rows) await ctx.db.delete(row._id)
  return { deleted: rows.length, complete: rows.length === 0 }
}

export const cleanupControlPage = internalMutation({
  args: {
    prefix: v.string(),
    phase: v.union(
      v.literal('redirects'),
      v.literal('siteData'),
      v.literal('mcp'),
      v.literal('members'),
    ),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await cleanupControlPageHandler(ctx, args)
  },
})

export const findPendingReview = internalQuery({
  args: { prefix: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    const reviews = await ctx.db
      .query('reviewRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .collect()
    return reviews.find((review) => review.title === args.title) ?? null
  },
})

export const counts = internalQuery({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    const [entryCount, assets, reviews, redirects, siteData, members] = await Promise.all([
      fixtureEntryCountHandler(ctx, args.prefix),
      ctx.db
        .query('assets')
        .withIndex('by_filename', (q) =>
          q.gte('filenameSort', args.prefix).lt('filenameSort', `${args.prefix}\uFFFF`),
        )
        .collect(),
      ctx.db.query('reviewRequests').collect(),
      ctx.db
        .query('redirects')
        .withIndex('by_redirect_id', (q) =>
          q.gte('redirectId', args.prefix).lt('redirectId', `${args.prefix}\uFFFF`),
        )
        .collect(),
      fixtureSiteData(ctx, args.prefix),
      fixtureMembers(ctx, args.prefix),
    ])
    const fixtureReviews = reviews.filter((row) =>
      row.title.toLowerCase().includes(args.prefix.toLowerCase()),
    )
    let mcpConnections = 0
    for (const member of members) {
      mcpConnections += (
        await ctx.db
          .query('mcpOAuthDelegations')
          .withIndex('by_owner_user', (q) => q.eq('ownerUserId', member.userId))
          .take(100)
      ).length
    }
    return {
      entries: entryCount,
      assets: assets.length,
      reviews: fixtureReviews.length,
      redirects: redirects.length,
      siteData: siteData.length,
      mcpConnections,
      members: members.length,
    }
  },
})
