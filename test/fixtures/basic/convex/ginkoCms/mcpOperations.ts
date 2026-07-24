import { cmsMcpCallerValidator } from '@lupinum/ginko-cms-contract/convex/caller.js'
import {
  getEntry as getEntryArgs,
  publishEntry as publishEntryArgs,
  saveEntryDraft as saveEntryDraftArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'

export const startAgentRun = internalMutation({
  args: {
    caller: cmsMcpCallerValidator,
    taskName: v.string(),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const { caller, ...runArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.agentRuns.startRun,
      bindExpectedCmsContract({
        ...runArgs,
        _trustedCaller: caller,
      }),
    )
  },
})

export const completeAgentRun = internalMutation({
  args: {
    caller: cmsMcpCallerValidator,
    agentRunId: v.string(),
  },
  handler: async (ctx, args) => {
    const { caller, ...runArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.agentRuns.completeRun,
      bindExpectedCmsContract({
        ...runArgs,
        _trustedCaller: caller,
      }),
    )
  },
})

export const getEntry = internalQuery({
  args: {
    caller: cmsMcpCallerValidator,
    ...getEntryArgs.args,
  },
  handler: async (ctx, args) => {
    const { caller, ...entryArgs } = args
    return await ctx.runQuery(components.ginkoCms.editor.getEntry, {
      ...entryArgs,
      _trustedCaller: caller,
    })
  },
})

export const saveEntryDraft = internalMutation({
  args: {
    caller: cmsMcpCallerValidator,
    agentRunId: v.string(),
    ...saveEntryDraftArgs.args,
  },
  handler: async (ctx, args) => {
    const { caller, ...draftArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.editor.mcpSaveEntryDraft,
      bindExpectedCmsContract({
        ...draftArgs,
        _trustedCaller: caller,
      }),
    )
  },
})

export const previewPublish = internalMutation({
  args: {
    caller: cmsMcpCallerValidator,
    agentRunId: v.string(),
    ...publishEntryArgs.args,
  },
  handler: async (ctx, args) => {
    const { caller, ...previewArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.editor.mcpPreviewPublishEntry,
      bindExpectedCmsContract({
        ...previewArgs,
        _trustedCaller: caller,
      }),
    )
  },
})

export const requestPublishReview = internalMutation({
  args: {
    caller: cmsMcpCallerValidator,
    agentRunId: v.string(),
    operationKey: v.string(),
    entryId: v.string(),
    locales: v.array(v.string()),
    expectedVersion: v.number(),
    message: v.optional(v.string()),
    title: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const { caller, ...reviewArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.reviewRequests.requestPublishReview,
      bindExpectedCmsContract({
        ...reviewArgs,
        _trustedCaller: caller,
      }),
    )
  },
})

export const getReviewStatus = internalQuery({
  args: {
    caller: cmsMcpCallerValidator,
    reviewRequestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { caller, reviewRequestId } = args
    return await ctx.runQuery(components.ginkoCms.reviewRequests.getOwnReviewRequest, {
      reviewRequestId,
      _trustedCaller: caller,
    })
  },
})
