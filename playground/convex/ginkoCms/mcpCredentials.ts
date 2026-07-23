import { mcpCredentialScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { ConvexError, v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

const mcpCredentialScopeValidator = v.union(
  ...mcpCredentialScopeKeys.map((scope) => v.literal(scope)),
)

export const createCredential = mutation({
  args: {
    ownerUserId: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    scopes: v.array(mcpCredentialScopeValidator),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    if (typeof args.expiresAt === 'number' && args.expiresAt <= Date.now()) {
      throw new ConvexError({
        code: 'MCP_CREDENTIAL_EXPIRY_IN_PAST',
        message: 'The MCP connection expiry must be in the future.',
        details: { expiresAt: args.expiresAt },
      })
    }
    return await ctx.runMutation(components.ginkoCms.mcpCredentials.createCredential, args)
  },
})

export const listOwnSettings = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.mcpCredentials.listOwnSettings, args),
})

export const revokeSettings = mutation({
  args: {
    apiKeyId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.mcpCredentials.revokeSettings, args),
})
