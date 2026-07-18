import type { Id } from '../_generated/dataModel.js'
import { toStringId } from '../lib/ids.js'
import type { QueryOrMutationCtx } from '../lib/types.js'

export type CmsStorageOwner = {
  assetId?: Id<'assets'>
  uploadSessionId?: Id<'assetUploadSessions'>
  portableAssetId?: Id<'portableAssets'>
  recoveryArtifactId?: Id<'assetRecoveryArtifacts'>
  cleanupTaskId?: Id<'assetCleanupTasks'>
}

export async function isStorageClaimedByAnotherOwner(
  ctx: QueryOrMutationCtx,
  storageId: Id<'_storage'>,
  owner: CmsStorageOwner = {},
): Promise<boolean> {
  const assets = await ctx.db
    .query('assets')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(owner.assetId ? 2 : 1)
  if (assets.some((asset) => asset._id !== owner.assetId)) return true

  const sessions = await ctx.db
    .query('assetUploadSessions')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(owner.uploadSessionId ? 2 : 1)
  if (sessions.some((session) => session._id !== owner.uploadSessionId)) return true

  const stages = await ctx.db
    .query('portableAssets')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(owner.assetId || owner.portableAssetId ? 2 : 1)
  if (stages.length > 1) return true
  if (
    stages.some(
      (stage) =>
        stage._id !== owner.portableAssetId &&
        !(
          owner.assetId &&
          stage.mode === 'import' &&
          stage.state === 'attached' &&
          stage.assetId === toStringId(owner.assetId)
        ),
    )
  ) {
    return true
  }

  const artifacts = await ctx.db
    .query('assetRecoveryArtifacts')
    .withIndex('by_storage', (query) => query.eq('storageRef', storageId))
    .take(owner.recoveryArtifactId ? 2 : 1)
  if (artifacts.some((artifact) => artifact._id !== owner.recoveryArtifactId)) return true

  const cleanupTasks = await ctx.db
    .query('assetCleanupTasks')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(owner.cleanupTaskId ? 2 : 1)
  return cleanupTasks.some((task) => task._id !== owner.cleanupTaskId)
}
