import { mcpDelegatedScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { ConvexError, v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

const mcpScopeValidator = v.union(...mcpDelegatedScopeKeys.map((scope) => v.literal(scope)))

export const createDelegation = mutation({
  args: {
    ownerUserId: v.string(),
    oauthClientId: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    scopes: v.array(mcpScopeValidator),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    if (typeof args.expiresAt === 'number' && args.expiresAt <= Date.now()) {
      throw new ConvexError({
        code: 'MCP_DELEGATION_EXPIRY_IN_PAST',
        message: 'The MCP delegation expiry must be in the future.',
        details: { expiresAt: args.expiresAt },
      })
    }
    return await ctx.runMutation(components.ginkoCms.mcpOAuthDelegations.createDelegation, args)
  },
})

export const listDelegations = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.mcpOAuthDelegations.listDelegations, args),
})

export const revokeDelegation = mutation({
  args: { delegationId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.mcpOAuthDelegations.revokeDelegation, args),
})
