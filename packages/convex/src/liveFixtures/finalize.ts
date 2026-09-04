import { v } from 'convex/values'

import { internalMutation, internalQuery } from '../_generated/server.js'
import type { MutationCtx } from '../lib/types.js'
import { assertFixturePrefix } from '../liveFixtures.js'

export async function cleanupBootstrapOwnerHandler(
  ctx: MutationCtx,
  args: { prefix: string; configuredOwnerEmail: string },
) {
  const configuredOwnerEmail = args.configuredOwnerEmail.trim().toLowerCase()
  if (!configuredOwnerEmail || configuredOwnerEmail.includes(args.prefix.toLowerCase())) {
    throw new Error('Configured bootstrap owner email is invalid for fixture cleanup.')
  }
  const fixtureOwners = (await ctx.db.query('members').collect()).filter(
    (member) => member.updatedBy === args.prefix,
  )
  if (!fixtureOwners.some((member) => member.role === 'owner')) {
    throw new Error('Bootstrap owner cleanup requires a remaining disposable fixture owner.')
  }
  const member = await ctx.db
    .query('members')
    .withIndex('by_email', (q) => q.eq('email', configuredOwnerEmail))
    .unique()
  if (!member) return { deleted: 0, delegations: 0, agentRuns: 0 }
  if (member.role !== 'owner') {
    throw new Error('Configured bootstrap identity is not a CMS owner.')
  }
  let delegations = 0
  let agentRuns = 0
  for (const delegation of await ctx.db
    .query('mcpOAuthDelegations')
    .withIndex('by_owner_user', (q) => q.eq('ownerUserId', member.userId))
    .take(100)) {
    for (const run of await ctx.db
      .query('agentRuns')
      .withIndex('by_delegation', (q) => q.eq('oauthDelegationId', delegation.delegationId))
      .take(100)) {
      await ctx.db.delete(run._id)
      agentRuns += 1
    }
    await ctx.db.delete(delegation._id)
    delegations += 1
  }
  await ctx.db.delete(member._id)
  return { deleted: 1, delegations, agentRuns }
}

export const cleanupBootstrapOwner = internalMutation({
  args: { prefix: v.string(), configuredOwnerEmail: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    return await cleanupBootstrapOwnerHandler(ctx, args)
  },
})

export const globalCounts = internalQuery({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    assertFixturePrefix(args.prefix)
    const [entries, assets, reviews, redirects, siteData, mcpConnections, members] =
      await Promise.all([
        ctx.db.query('entries').collect(),
        ctx.db.query('assets').collect(),
        ctx.db.query('reviewRequests').collect(),
        ctx.db.query('redirects').collect(),
        ctx.db.query('siteData').collect(),
        ctx.db.query('mcpOAuthDelegations').take(100),
        ctx.db.query('members').collect(),
      ])
    return {
      entries: entries.length,
      assets: assets.length,
      reviews: reviews.length,
      redirects: redirects.length,
      siteData: siteData.length,
      mcpConnections: mcpConnections.length,
      members: members.length,
    }
  },
})
