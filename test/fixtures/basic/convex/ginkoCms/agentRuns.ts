import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'
import { bindMcpCaller, mcpCallerArgs } from './mcpCaller.js'

export const startRun = mutation({
  args: {
    taskName: v.string(),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.agentRuns.startRun,
      bindExpectedCmsContract(await bindMcpCaller(ctx, args)),
    ),
})

export const listRuns = query({
  args: {
    limit: v.optional(v.number()),
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.agentRuns.listRuns, await bindMcpCaller(ctx, args)),
})

export const completeRun = mutation({
  args: {
    agentRunId: v.string(),
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.agentRuns.completeRun,
      bindExpectedCmsContract(await bindMcpCaller(ctx, args)),
    ),
})

export const revokeRun = mutation({
  args: {
    agentRunId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.revokeRun, bindExpectedCmsContract(args)),
})
