import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { bindCmsCaller } from './caller.js'
import { bindExpectedCmsContract } from './contractBinding.js'

export const listRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.agentRuns.listRuns, await bindCmsCaller(ctx, args)),
})

export const revokeRun = mutation({
  args: {
    agentRunId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.agentRuns.revokeRun, bindExpectedCmsContract(args)),
})
