/* eslint-disable */
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

export const requestPublishReview = mutation({
  args: {
    agentRunId: v.string(),
    entryId: v.string(),
    locales: v.array(v.string()),
    expectedVersion: v.number(),
    message: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    summary: v.string(),
    preview: jsonObjectValidator,
    versionHash: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.reviewRequests.requestPublishReview, args as never),
})

export const listPendingReviews = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.reviewRequests.listPendingReviews, args as never),
})

export const approveReview = mutation({
  args: {
    reviewRequestId: v.string(),
    expectedVersionHash: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.reviewRequests.approveReview, args as never),
})

export const rejectReview = mutation({
  args: {
    reviewRequestId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.reviewRequests.rejectReview, args as never),
})
