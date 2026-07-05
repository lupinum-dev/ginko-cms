/* eslint-disable */
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

export const startRun = mutation({
  args: {
    taskName: v.string(),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.startRun, args as never),
})

export const listOwnRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.agentRuns.listOwnRuns, args as never),
})

export const completeRun = mutation({
  args: {
    agentRunId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.completeRun, args as never),
})

export const revokeRun = mutation({
  args: {
    agentRunId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.revokeRun, args as never),
})

export const recordWrite = mutation({
  args: {
    agentRunId: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.recordWrite, args as never),
})
