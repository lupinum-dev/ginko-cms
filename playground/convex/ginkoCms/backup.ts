import { cmsCallerFromActionAuthIdentity } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { action, mutation } from '../_generated/server.js'

const backupScopeValidator = v.union(
  v.literal('snapshot'),
  v.literal('collection'),
  v.literal('entry'),
  v.literal('asset'),
)

const backupScopeArgs = {
  scope: backupScopeValidator,
  collectionId: v.optional(v.string()),
  entryId: v.optional(v.string()),
  assetId: v.optional(v.string()),
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const exportBackup = action({
  args: backupScopeArgs,
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.backup.exportBackup, {
      ...args,
      _trustedCaller:
        cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
    } as never),
})

export const downloadBackup = action({
  args: { artifactId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.backup.downloadBackup, {
      ...args,
      _trustedCaller:
        cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
    } as never),
})

export const verifyBackup = action({
  args: { artifactId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.backup.verifyBackup, {
      ...args,
      _trustedCaller:
        cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
    } as never),
})

export const previewRestoreBackup = action({
  args: { artifactId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.backup.previewRestoreBackup, {
      ...args,
      _trustedCaller:
        cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
    } as never),
})

export const restoreBackup = action({
  args: {
    artifactId: v.string(),
    expectedChecksum: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.backup.restoreBackup, {
      ...args,
      _trustedCaller:
        cmsCallerFromActionAuthIdentity(await ctx.auth.getUserIdentity()) ?? undefined,
    } as never),
})

export const deleteBackupArtifact = mutation({
  args: confirmedArgs({ artifactId: v.string() }),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.backup.deleteBackupArtifactOperationExecute,
      args as never,
    ),
})

export const previewDeleteBackupArtifactOperation = mutation({
  args: { artifactId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.backup.previewDeleteBackupArtifactOperation,
      args as never,
    ),
})
