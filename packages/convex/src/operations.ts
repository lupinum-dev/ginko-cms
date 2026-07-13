import { v } from 'convex/values'

import { internal } from './_generated/api.js'
import { internalMutation } from './_generated/server.js'

const CONFIRMATION_CLEANUP_BATCH_SIZE = 100

export {
  deleteAssetOperation,
  moveAssetOperation,
  previewDeleteAssetOperation,
  previewPurgeAssetOperation,
  purgeAssetOperation,
} from './assets.js'
export { deleteBackupArtifactOperation, previewDeleteBackupArtifactOperation } from './backup.js'
export { removeMemberOperation, previewRemoveMemberOperation } from './members.js'
export {
  retryRevalidationJobOperation,
  previewRetryRevalidationJobOperation,
} from './revalidation.js'
export { deleteSiteDataBlockOperation, previewDeleteSiteDataBlockOperation } from './siteData.js'
export {
  saveEntryDraftOperation,
  revertDraftToPublishedOperation,
  previewRevertDraftToPublishedOperation,
} from './entries/draft.js'
export {
  archiveEntryOperation,
  previewArchiveEntryOperation,
  publishEntryOperation,
  previewPublishEntryOperation,
  restoreEntryOperation,
  rollbackVersionOperation,
  previewRollbackVersionOperation,
  unpublishEntryOperation,
  previewUnpublishEntryOperation,
} from './entries/publish.js'
export { createEntryOperation } from './entries/tree.js'

export const cleanupExpiredConfirmations = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    remaining: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? CONFIRMATION_CLEANUP_BATCH_SIZE), 1),
      CONFIRMATION_CLEANUP_BATCH_SIZE,
    )
    const expired = await ctx.db
      .query('destructiveConfirmations')
      .withIndex('by_expires_at', (q) => q.lt('expiresAt', now))
      .take(limit)

    for (const row of expired) {
      await ctx.db.delete(row._id)
    }

    const remaining = expired.length === limit
    if (remaining) {
      await ctx.scheduler.runAfter(0, internal.operations.cleanupExpiredConfirmations, {
        now,
        limit,
      })
    }

    return {
      deleted: expired.length,
      remaining,
    }
  },
})
