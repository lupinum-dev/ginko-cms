import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'
import { bindCmsCaller, bindMcpCaller, mcpCallerArgs } from './mcpCaller.js'

export const requestPublishReview = mutation({
  args: {
    agentRunId: v.optional(v.union(v.string(), v.null())),
    entryId: v.string(),
    locales: v.array(v.string()),
    expectedVersion: v.number(),
    message: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    summary: v.string(),
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.reviewRequests.requestPublishReview,
      bindExpectedCmsContract(
        await bindMcpCaller(ctx, args, 'mutation:ginkoCms/reviewRequests:requestPublishReview'),
      ),
    ),
})

export const listPendingReviews = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.reviewRequests.listPendingReviews, args),
})

export const listRecentReviewOutcomes = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.reviewRequests.listRecentReviewOutcomes, args),
})

export const listRecentReviewOutcomesForEntry = query({
  args: {
    entryId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.reviewRequests.listRecentReviewOutcomesForEntry, args),
})

export const getOwnReviewRequest = query({
  args: { reviewRequestId: v.string(), ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.reviewRequests.getOwnReviewRequest,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/reviewRequests:getOwnReviewRequest'),
    ),
})

export const approveReview = mutation({
  args: {
    reviewRequestId: v.string(),
    expectedVersionHash: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.reviewRequests.approveReview,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})

export const rejectReview = mutation({
  args: {
    reviewRequestId: v.string(),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.reviewRequests.rejectReview,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})
