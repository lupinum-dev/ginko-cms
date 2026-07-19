import {
  attachAssetsToEntry as attachAssetsToEntryArgs,
  claimAssetUploadSession as claimAssetUploadSessionArgs,
  createAssetUploadSession as createAssetUploadSessionArgs,
  deleteAsset as deleteAssetArgs,
  finalizeAssetUploadSession as finalizeAssetUploadSessionArgs,
  getAsset as getAssetArgs,
  getAssetManagerData as getAssetManagerDataArgs,
  listAssetsByOwner as listAssetsByOwnerArgs,
  listAssetUsages as listAssetUsagesArgs,
  moveAsset as moveAssetArgs,
  previewReplaceAssetOperation as previewReplaceAssetOperationArgs,
  replaceAsset as replaceAssetArgs,
  resolveAssetUrls as resolveAssetUrlsArgs,
  updateAsset as updateAssetArgs,
  verifyAssetReplacementUpload as verifyAssetReplacementUploadArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { action, mutation, query } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'
import { bindMcpCaller, mcpCallerArgs } from './mcpCaller.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.optional(v.string()),
  }
}

const purgeAssetArgs = {
  assetId: v.string(),
  recoveryArtifactId: v.string(),
}

export const createAssetUploadSession = mutation({
  args: createAssetUploadSessionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.createAssetUploadSession,
      bindExpectedCmsContract(args),
    ),
})

export const claimAssetUploadSession = mutation({
  args: claimAssetUploadSessionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.claimAssetUploadSession,
      bindExpectedCmsContract(args),
    ),
})

export const finalizeAssetUploadSession = action({
  args: finalizeAssetUploadSessionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assets.finalizeAssetUploadSession,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const verifyAssetReplacementUpload = action({
  args: verifyAssetReplacementUploadArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assets.verifyAssetReplacementUpload,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const previewReplaceAssetOperation = mutation({
  args: previewReplaceAssetOperationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.previewReplaceAssetOperation,
      bindExpectedCmsContract(args),
    ),
})

export const replaceAsset = action({
  args: replaceAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assets.replaceAsset,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const attachAssetsToEntry = mutation({
  args: attachAssetsToEntryArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.attachAssetsToEntry,
      bindExpectedCmsContract(args),
    ),
})

export const updateAsset = mutation({
  args: updateAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.updateAsset, bindExpectedCmsContract(args)),
})

export const moveAsset = mutation({
  args: moveAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.moveAsset, bindExpectedCmsContract(args)),
})

export const getAsset = query({
  args: { ...getAssetArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.assets.getAsset,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/assets:getAsset'),
    ),
})

export const listAssetsByOwner = query({
  args: listAssetsByOwnerArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.listAssetsByOwner, args),
})

export const listAssetUsages = query({
  args: listAssetUsagesArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.listAssetUsages, args),
})

export const resolveAssetUrls = query({
  args: { ...resolveAssetUrlsArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.assets.resolveAssetUrls,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/assets:resolveAssetUrls'),
    ),
})

export const getAssetManagerData = query({
  args: getAssetManagerDataArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.assets.getAssetManagerData, args),
})

export const deleteAsset = mutation({
  args: confirmedArgs(deleteAssetArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.deleteAssetOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewDeleteAssetOperation = mutation({
  args: deleteAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.previewDeleteAssetOperation,
      bindExpectedCmsContract(args),
    ),
})

export const restoreAsset = mutation({
  args: { assetId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.assets.restoreAsset, bindExpectedCmsContract(args)),
})

export const purgeAsset = action({
  args: confirmedArgs(purgeAssetArgs),
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assets.purgeAsset,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller:
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
      }),
    ),
})

export const previewPurgeAssetOperation = mutation({
  args: purgeAssetArgs,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assets.previewPurgeAssetOperation,
      bindExpectedCmsContract(args),
    ),
})
