import {
  archiveEntry as archiveEntryArgs,
  createCheckpoint as createCheckpointArgs,
  createEntry as createEntryArgs,
  duplicateEntry as duplicateEntryArgs,
  createLocaleVariant as createLocaleVariantArgs,
  getDraftVsPublishedDiff as getDraftVsPublishedDiffArgs,
  getEntry as getEntryArgs,
  getEntryActivity as getEntryActivityArgs,
  getStudioOverview as getStudioOverviewArgs,
  getVersionDiff as getVersionDiffArgs,
  getVersionSnapshot as getVersionSnapshotArgs,
  listActivity as listActivityArgs,
  listEntriesForStudio as listEntriesForStudioArgs,
  listEntrySummaries as listEntrySummariesArgs,
  listPublishRouteImpactPage as listPublishRouteImpactPageArgs,
  listStudioWorkQueue as listStudioWorkQueueArgs,
  listVersions as listVersionsArgs,
  permanentlyDeleteEntry as permanentlyDeleteEntryArgs,
  publishEntry as publishEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
  revertDraftToPublished as revertDraftToPublishedArgs,
  restoreEntry as restoreEntryArgs,
  rollbackVersion as rollbackVersionArgs,
  saveEntryDraft as saveEntryDraftArgs,
  unpublishEntry as unpublishEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  listRedirects as listRedirectsArgs,
  retireRedirect as retireRedirectArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/redirects.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'
import { bindMcpCaller, mcpCallerArgs } from './mcpCaller.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.optional(v.string()),
  }
}

export const listEntriesForStudio = query({
  args: { ...listEntriesForStudioArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.editor.listEntriesForStudio,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/editor:listEntriesForStudio'),
    ),
})

export const listEntrySummaries = query({
  args: listEntrySummariesArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listEntrySummaries, args),
})

export const getStudioOverview = query({
  args: getStudioOverviewArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getStudioOverview, args),
})

export const listStudioWorkQueue = query({
  args: listStudioWorkQueueArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listStudioWorkQueue, args),
})

export const getEntry = query({
  args: { ...getEntryArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.editor.getEntry,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/editor:getEntry'),
    ),
})

export const getEntryReadinessDetail = query({
  args: {
    entryId: v.string(),
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.editor.getEntryReadinessDetail,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/editor:getEntryReadinessDetail'),
    ),
})

export const getEntryReadinessSummary = query({
  args: {
    entryId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getEntryReadinessSummary, args),
})

export const listActivity = query({
  args: listActivityArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.editor.listActivity, args),
})

export const listVersions = query({
  args: listVersionsArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.editor.listVersions, args),
})

export const getVersionDiff = query({
  args: getVersionDiffArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.editor.getVersionDiff, args),
})

export const getVersionSnapshot = query({
  args: getVersionSnapshotArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getVersionSnapshot, args),
})

export const getDraftVsPublishedDiff = query({
  args: getDraftVsPublishedDiffArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getDraftVsPublishedDiff, args),
})

export const getEntryActivity = query({
  args: getEntryActivityArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.getEntryActivity, args),
})

export const listRedirects = query({
  args: listRedirectsArgs.args,
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.editor.listRedirects, args),
})

export const createEntry = mutation({
  args: createEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.createEntry, bindExpectedCmsContract(args)),
})

export const duplicateEntry = mutation({
  args: duplicateEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.duplicateEntry, bindExpectedCmsContract(args)),
})

export const mcpCreateEntry = mutation({
  args: {
    agentRunId: v.string(),
    requestId: v.string(),
    ...createEntryArgs.args,
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpCreateEntry,
      bindExpectedCmsContract(
        await bindMcpCaller(ctx, args, 'mutation:ginkoCms/editor:mcpCreateEntry'),
      ),
    ),
})

export const createLocaleVariant = mutation({
  args: createLocaleVariantArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.createLocaleVariant,
      bindExpectedCmsContract(args),
    ),
})

export const saveEntryDraft = mutation({
  args: saveEntryDraftArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.editor.saveEntryDraft, bindExpectedCmsContract(args)),
})

export const mcpSaveEntryDraft = mutation({
  args: {
    agentRunId: v.string(),
    ...saveEntryDraftArgs.args,
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpSaveEntryDraft,
      bindExpectedCmsContract(
        await bindMcpCaller(ctx, args, 'mutation:ginkoCms/editor:mcpSaveEntryDraft'),
      ),
    ),
})

export const publishEntry = mutation({
  args: confirmedArgs(publishEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.publishEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewPublishEntryOperation = mutation({
  args: publishEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewPublishEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const listPublishRouteImpactPage = query({
  args: listPublishRouteImpactPageArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.editor.listPublishRouteImpactPage, args),
})

export const mcpPreviewPublishEntry = mutation({
  args: {
    agentRunId: v.string(),
    ...publishEntryArgs.args,
    ...mcpCallerArgs,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.mcpPreviewPublishEntry,
      bindExpectedCmsContract(
        await bindMcpCaller(ctx, args, 'mutation:ginkoCms/editor:mcpPreviewPublishEntry'),
      ),
    ),
})

export const unpublishEntry = mutation({
  args: confirmedArgs(unpublishEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.unpublishEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewUnpublishEntryOperation = mutation({
  args: unpublishEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewUnpublishEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const archiveEntry = mutation({
  args: confirmedArgs(archiveEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.archiveEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewArchiveEntryOperation = mutation({
  args: archiveEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewArchiveEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const permanentlyDeleteEntry = mutation({
  args: confirmedArgs(permanentlyDeleteEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.permanentlyDeleteEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewPermanentlyDeleteEntryOperation = mutation({
  args: permanentlyDeleteEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewPermanentlyDeleteEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const restoreEntry = mutation({
  args: confirmedArgs(restoreEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.restoreEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewRestoreEntryOperation = mutation({
  args: restoreEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewRestoreEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const revertDraftToPublished = mutation({
  args: confirmedArgs(revertDraftToPublishedArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.revertDraftToPublishedOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewRevertDraftToPublishedOperation = mutation({
  args: revertDraftToPublishedArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewRevertDraftToPublishedOperation,
      bindExpectedCmsContract(args),
    ),
})

export const rollbackVersion = mutation({
  args: confirmedArgs(rollbackVersionArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.rollbackVersionOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewRollbackVersionOperation = mutation({
  args: rollbackVersionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewRollbackVersionOperation,
      bindExpectedCmsContract(args),
    ),
})

export const createCheckpoint = mutation({
  args: createCheckpointArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.createCheckpoint,
      bindExpectedCmsContract(args),
    ),
})

export const reorderEntry = mutation({
  args: confirmedArgs(reorderEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.reorderEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewReorderEntryOperation = mutation({
  args: reorderEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewReorderEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const reparentEntry = mutation({
  args: confirmedArgs(reparentEntryArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.reparentEntryOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewReparentEntryOperation = mutation({
  args: reparentEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewReparentEntryOperation,
      bindExpectedCmsContract(args),
    ),
})

export const retireRedirect = mutation({
  args: confirmedArgs(retireRedirectArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.retireRedirectOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewRetireRedirectOperation = mutation({
  args: retireRedirectArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.editor.previewRetireRedirectOperation,
      bindExpectedCmsContract(args),
    ),
})
