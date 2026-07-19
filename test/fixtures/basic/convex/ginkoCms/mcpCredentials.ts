import { mcpCredentialScopeKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import {
  assertMcpCallerSignedRequest,
  runVerifiedMcpLimiterRequest,
} from '@lupinum/ginko-cms-convex/mcp-limiter-protocol'
import { ConvexError, v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { requireMcpServerSecret } from './mcpCaller.js'

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
      requireMcpServerSecret(),
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
      requireMcpServerSecret(),
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

export const resolveAccessBySecretHash = query({
  args: {
    _mcpCredentialHash: v.string(),
    _mcpRequestId: v.string(),
    _mcpTimestamp: v.number(),
    _mcpSignature: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await assertMcpCallerSignedRequest(
        requireMcpServerSecret(),
        'query:ginkoCms/mcpCredentials:resolveAccessBySecretHash',
        {
          credentialHash: args._mcpCredentialHash,
          requestId: args._mcpRequestId,
          timestamp: args._mcpTimestamp,
          signature: args._mcpSignature,
        },
      )
    } catch {
      throw new ConvexError({ code: 'MCP_AUTH_INVALID', message: 'MCP authentication failed.' })
    }
    return await ctx.runQuery(components.ginkoCms.mcpCredentials.resolveAccessBySecretHash, {
      secretHash: args._mcpCredentialHash,
    })
  },
})
