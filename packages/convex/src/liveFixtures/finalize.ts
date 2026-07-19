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
  const fixtureOwners = await ctx.db
    .query('members')
    .withIndex('by_email', (q) => q.gte('email', args.prefix).lt('email', `${args.prefix}\uFFFF`))
    .collect()
  if (!fixtureOwners.some((member) => member.role === 'owner')) {
    throw new Error('Bootstrap owner cleanup requires a remaining disposable fixture owner.')
  }
  const member = await ctx.db
    .query('members')
    .withIndex('by_email', (q) => q.eq('email', configuredOwnerEmail))
    .unique()
  if (!member) return { deleted: 0, credentials: 0, agentRuns: 0 }
  if (member.role !== 'owner') {
    throw new Error('Configured bootstrap identity is not a CMS owner.')
  }
  let credentials = 0
  let agentRuns = 0
  for (const credential of await ctx.db
    .query('mcpCredentialSettings')
    .withIndex('by_owner_user', (q) => q.eq('ownerUserId', member.userId))
    .collect()) {
    for (const run of await ctx.db
      .query('agentRuns')
      .withIndex('by_credential', (q) => q.eq('credentialApiKeyId', credential.apiKeyId))
      .collect()) {
      await ctx.db.delete(run._id)
      agentRuns += 1
    }
    await ctx.db.delete(credential._id)
    credentials += 1
  }
  await ctx.db.delete(member._id)
  return { deleted: 1, credentials, agentRuns }
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
        ctx.db.query('mcpCredentialSettings').collect(),
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
