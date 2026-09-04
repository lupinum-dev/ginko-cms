import {
  createAssetRecoveryArtifact as createAssetRecoveryArtifactArgs,
  downloadAssetRecoveryArtifact as downloadAssetRecoveryArtifactArgs,
  previewRestoreAsset as previewRestoreAssetArgs,
  restoreAsset as restoreAssetArgs,
  verifyAssetRecoveryArtifact as verifyAssetRecoveryArtifactArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/maintenance.js'
import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { action, mutation } from '../_generated/server.js'
import { bindExpectedCmsContract } from './contractBinding.js'

function trustedCaller(identity: Awaited<ReturnType<typeof cmsCallerFromActionAuthIdentity>>) {
  return identity ?? undefined
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.optional(v.string()),
  }
}

export const createAssetRecoveryArtifact = action({
  args: createAssetRecoveryArtifactArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assetRecovery.createAssetRecoveryArtifact,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller: trustedCaller(
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()),
        ),
      }),
    ),
})

export const downloadAssetRecoveryArtifact = action({
  args: downloadAssetRecoveryArtifactArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assetRecovery.downloadAssetRecoveryArtifact,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller: trustedCaller(
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()),
        ),
      }),
    ),
})

export const verifyAssetRecoveryArtifact = action({
  args: verifyAssetRecoveryArtifactArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assetRecovery.verifyAssetRecoveryArtifact,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller: trustedCaller(
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()),
        ),
      }),
    ),
})

export const previewRestoreAsset = action({
  args: previewRestoreAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assetRecovery.previewRestoreAsset,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller: trustedCaller(
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()),
        ),
      }),
    ),
})

export const restoreAsset = action({
  args: restoreAssetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(
      components.ginkoCms.assetRecovery.restoreAsset,
      bindExpectedCmsContract({
        ...args,
        _trustedCaller: trustedCaller(
          cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()),
        ),
      }),
    ),
})

export const deleteAssetRecoveryArtifact = mutation({
  args: confirmedArgs({ artifactId: v.string() }),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assetRecovery.deleteAssetRecoveryArtifactOperationExecute,
      bindExpectedCmsContract(args),
    ),
})

export const previewDeleteAssetRecoveryArtifactOperation = mutation({
  args: { artifactId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.assetRecovery.previewDeleteAssetRecoveryArtifactOperation,
      bindExpectedCmsContract(args),
    ),
})
