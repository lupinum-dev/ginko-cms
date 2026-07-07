import {
  archiveEntry as archiveEntryArgs,
  createCheckpoint as createCheckpointArgs,
  createEntry as createEntryArgs,
  createLocaleVariant as createLocaleVariantArgs,
  deleteEntry as deleteEntryArgs,
  getDraftVsPublishedDiff as getDraftVsPublishedDiffArgs,
  getEntry as getEntryArgs,
  getEntryActivity as getEntryActivityArgs,
  getStudioOverview as getStudioOverviewArgs,
  getVersionDiff as getVersionDiffArgs,
  getVersionSnapshot as getVersionSnapshotArgs,
  listActivity as listActivityArgs,
  listEntries as listEntriesArgs,
  listEntriesForStudio as listEntriesForStudioArgs,
  listEntrySummaries as listEntrySummariesArgs,
  listVersions as listVersionsArgs,
  publishEntry as publishEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
  revertDraftToPublished as revertDraftToPublishedArgs,
  restoreEntry as restoreEntryArgs,
  rollbackVersion as rollbackVersionArgs,
  saveEntryDraft as saveEntryDraftArgs,
  unpublishEntry as unpublishEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const listEntries = query({
  args: listEntriesArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listEntries, args as never),
})

export const listEntriesForStudio = query({
  args: listEntriesForStudioArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listEntriesForStudio, args as never),
})

export const listEntrySummaries = query({
  args: listEntrySummariesArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listEntrySummaries, args as never),
})

export const getStudioOverview = query({
  args: getStudioOverviewArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getStudioOverview, args as never),
})

export const getEntry = query({
  args: getEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getEntry, args as never),
})

export const getEntryReadinessDetail = query({
  args: {
    entryId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getEntryReadinessDetail, args as never),
})

export const getEntryReadinessSummary = query({
  args: {
    entryId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getEntryReadinessSummary, args as never),
})

export const listActivity = query({
  args: listActivityArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listActivity, args as never),
})

export const listVersions = query({
  args: listVersionsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listVersions, args as never),
})

export const getVersionDiff = query({
  args: getVersionDiffArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getVersionDiff, args as never),
})

export const getVersionSnapshot = query({
  args: getVersionSnapshotArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getVersionSnapshot, args as never),
})

export const getDraftVsPublishedDiff = query({
  args: getDraftVsPublishedDiffArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getDraftVsPublishedDiff, args as never),
})

export const getEntryActivity = query({
  args: getEntryActivityArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getEntryActivity, args as never),
})

export const createEntry = mutation({
  args: createEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.createEntry, args as never),
})

export const mcpCreateEntry = mutation({
  args: {
    agentRunId: v.string(),
    ...createEntryArgs.args,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.mcpCreateEntry, args as never),
})

export const createLocaleVariant = mutation({
  args: createLocaleVariantArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.createLocaleVariant, args as never),
})

export const saveEntryDraft = mutation({
  args: saveEntryDraftArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.saveEntryDraft, args as never),
})

export const mcpSaveEntryDraft = mutation({
  args: {
    agentRunId: v.string(),
    ...saveEntryDraftArgs.args,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.mcpSaveEntryDraft, args as never),
})

export const publishEntry = mutation({
  args: confirmedArgs(publishEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.publishEntryOperationExecute, args as never),
})

export const previewPublishEntryOperation = mutation({
  args: publishEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.previewPublishEntryOperation, args as never),
})

export const mcpPublishEntry = mutation({
  args: confirmedArgs({
    agentRunId: v.string(),
    ...publishEntryArgs.args,
  }),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpPublishEntryOperationExecute,
      args as never,
    ),
})

export const mcpPreviewPublishEntryOperation = mutation({
  args: {
    agentRunId: v.string(),
    ...publishEntryArgs.args,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpPreviewPublishEntryOperation,
      args as never,
    ),
})

export const unpublishEntry = mutation({
  args: confirmedArgs(unpublishEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.unpublishEntryOperationExecute, args as never),
})

export const previewUnpublishEntryOperation = mutation({
  args: unpublishEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.previewUnpublishEntryOperation, args as never),
})

export const archiveEntry = mutation({
  args: confirmedArgs(archiveEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.archiveEntryOperationExecute, args as never),
})

export const previewArchiveEntryOperation = mutation({
  args: archiveEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.previewArchiveEntryOperation, args as never),
})

export const mcpArchiveEntry = mutation({
  args: confirmedArgs({
    agentRunId: v.string(),
    ...archiveEntryArgs.args,
  }),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpArchiveEntryOperationExecute,
      args as never,
    ),
})

export const mcpPreviewArchiveEntryOperation = mutation({
  args: {
    agentRunId: v.string(),
    ...archiveEntryArgs.args,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpPreviewArchiveEntryOperation,
      args as never,
    ),
})

export const restoreEntry = mutation({
  args: restoreEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.restoreEntry, args as never),
})

export const mcpRestoreEntry = mutation({
  args: {
    agentRunId: v.string(),
    ...restoreEntryArgs.args,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.mcpRestoreEntry, args as never),
})

export const revertDraftToPublished = mutation({
  args: confirmedArgs(revertDraftToPublishedArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.revertDraftToPublishedOperationExecute,
      args as never,
    ),
})

export const previewRevertDraftToPublishedOperation = mutation({
  args: revertDraftToPublishedArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewRevertDraftToPublishedOperation,
      args as never,
    ),
})

export const rollbackVersion = mutation({
  args: confirmedArgs(rollbackVersionArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.rollbackVersionOperationExecute,
      args as never,
    ),
})

export const previewRollbackVersionOperation = mutation({
  args: rollbackVersionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewRollbackVersionOperation,
      args as never,
    ),
})

export const createCheckpoint = mutation({
  args: createCheckpointArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.createCheckpoint, args as never),
})

export const reorderEntry = mutation({
  args: reorderEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.reorderEntry, args as never),
})

export const reparentEntry = mutation({
  args: reparentEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.reparentEntry, args as never),
})

export const deleteEntry = mutation({
  args: confirmedArgs(deleteEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.deleteEntryOperationExecute, args as never),
})

export const previewDeleteEntryOperation = mutation({
  args: deleteEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.previewDeleteEntryOperation, args as never),
})
