import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'

export const startRun = mutation({
  args: {
    taskName: v.string(),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.startRun, bindExpectedCmsContract(args)),
})

export const listRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.agentRuns.listRuns, args),
})

export const completeRun = mutation({
  args: {
    agentRunId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.completeRun, bindExpectedCmsContract(args)),
})

export const revokeRun = mutation({
  args: {
    agentRunId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.revokeRun, bindExpectedCmsContract(args)),
})
