import {
  attachAssetsToEntry as attachAssetsToEntryArgs,
  deleteAsset as deleteAssetArgs,
  getAsset as getAssetArgs,
  getAssetManagerData as getAssetManagerDataArgs,
  getAssetUrl as getAssetUrlArgs,
  listColocatedAssets as listColocatedAssetsArgs,
  moveAsset as moveAssetArgs,
  registerAsset as registerAssetArgs,
  resolveAssetUrls as resolveAssetUrlsArgs,
  updateAsset as updateAssetArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

const purgeAssetArgs = {
  assetId: v.string(),
  exportArtifactId: v.string(),
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.generateUploadUrl, args as never),
})

export const registerAsset = mutation({
  args: registerAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.registerAsset, args as never),
})

export const attachAssetsToEntry = mutation({
  args: attachAssetsToEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.attachAssetsToEntry, args as never),
})

export const updateAsset = mutation({
  args: updateAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.updateAsset, args as never),
})

export const moveAsset = mutation({
  args: moveAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.moveAsset, args as never),
})

export const mcpMoveAsset = mutation({
  args: {
    agentRunId: v.string(),
    ...moveAssetArgs.args,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.mcpMoveAsset, args as never),
})

export const getAssetUrl = query({
  args: getAssetUrlArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.getAssetUrl, args as never),
})

export const getAsset = query({
  args: getAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.getAsset, args as never),
})

export const listColocatedAssets = query({
  args: listColocatedAssetsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.listColocatedAssets, args as never),
})

export const resolveAssetUrls = query({
  args: resolveAssetUrlsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.resolveAssetUrls, args as never),
})

export const getAssetManagerData = query({
  args: getAssetManagerDataArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.getAssetManagerData, args as never),
})

export const deleteAsset = mutation({
  args: confirmedArgs(deleteAssetArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.deleteAssetOperationExecute, args as never),
})

export const previewDeleteAssetOperation = mutation({
  args: deleteAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.previewDeleteAssetOperation, args as never),
})

export const restoreAsset = mutation({
  args: { assetId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.restoreAsset, args as never),
})

export const purgeAsset = mutation({
  args: confirmedArgs(purgeAssetArgs),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.purgeAsset, args as never),
})

export const previewPurgeAssetOperation = mutation({
  args: purgeAssetArgs,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.previewPurgeAssetOperation, args as never),
})
