import {
  getEntry as getEntryArgs,
  publishEntry as publishEntryArgs,
  saveEntryDraft as saveEntryDraftArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { cmsMcpCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'

export const getEntry = internalQuery({
  args: {
    apiKeyId: v.string(),
    ...getEntryArgs.args,
  },
  handler: async (ctx, args) => {
    const { apiKeyId, ...entryArgs } = args
    return await ctx.runQuery(components.ginkoCms.editor.getEntry, {
      ...entryArgs,
      _trustedCaller: cmsMcpCaller(apiKeyId),
    })
  },
})

export const saveEntryDraft = internalMutation({
  args: {
    apiKeyId: v.string(),
    agentRunId: v.string(),
    ...saveEntryDraftArgs.args,
  },
  handler: async (ctx, args) => {
    const { apiKeyId, ...draftArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.editor.mcpSaveEntryDraft,
      bindExpectedCmsContract({
        ...draftArgs,
        _trustedCaller: cmsMcpCaller(apiKeyId),
      }),
    )
  },
})

export const previewPublish = internalMutation({
  args: {
    apiKeyId: v.string(),
    agentRunId: v.string(),
    ...publishEntryArgs.args,
  },
  handler: async (ctx, args) => {
    const { apiKeyId, ...previewArgs } = args
    return await ctx.runMutation(
      components.ginkoCms.editor.mcpPreviewPublishEntry,
      bindExpectedCmsContract({
        ...previewArgs,
        _trustedCaller: cmsMcpCaller(apiKeyId),
      }),
    )
  },
})
