import { mcpCredentialScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { runVerifiedMcpLimiterRequest } from '@lupinum/ginko-cms-convex/mcp-limiter-protocol'
import { requireBetterAuthSecret } from '@lupinum/ginko-cms/convex/auth'
import { ConvexError, v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

const mcpCredentialScopeValidator = v.union(
  ...mcpCredentialScopeKeys.map((scope) => v.literal(scope)),
)

const limiterArgs = {
  ipBucketKey: v.string(),
  credentialBucketKey: v.string(),
  requestId: v.string(),
  timestamp: v.number(),
  signature: v.string(),
}

export const checkFailureBudget = query({
  args: limiterArgs,
  handler: async (ctx, args) => {
    return await runVerifiedMcpLimiterRequest(
      requireBetterAuthSecret(),
      'check',
      args,
      async () =>
        await ctx.runQuery(components.ginkoCms.mcpAuthLimiter.checkFailureBudget, {
          ipBucketKey: args.ipBucketKey,
          credentialBucketKey: args.credentialBucketKey,
          now: args.timestamp,
        }),
    )
  },
})

export const recordFailure = mutation({
  args: limiterArgs,
  handler: async (ctx, args) => {
    return await runVerifiedMcpLimiterRequest(
      requireBetterAuthSecret(),
      'record',
      args,
      async () =>
        await ctx.runMutation(components.ginkoCms.mcpAuthLimiter.recordFailure, {
          ipBucketKey: args.ipBucketKey,
          credentialBucketKey: args.credentialBucketKey,
          requestId: args.requestId,
        }),
    )
  },
})

export const upsertSettings = mutation({
  args: {
    apiKeyId: v.string(),
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
    return await ctx.runMutation(components.ginkoCms.mcpCredentials.upsertSettings, args)
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

export const resolveAccess = query({
  args: {
    apiKeyId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.mcpCredentials.resolveAccess, args),
})
