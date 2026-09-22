import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import { internalMutation } from '../_generated/server.js'
import type { MutationCtx } from '../lib/types.js'

export const DELETED_ENTRY_RECEIPT_BATCH_SIZE = 256
const cleanupReference = makeFunctionReference<'mutation', { entryId: Id<'entries'> }, null>(
  'entries/draftReceiptCleanup:cleanupDeletedEntryReceipts',
)

export async function scheduleDeletedEntryReceiptCleanup(ctx: MutationCtx, entryId: Id<'entries'>) {
  await ctx.scheduler.runAfter(0, cleanupReference, { entryId })
}

/** Receipts protect ambiguous retries for the entire lifetime of a working entry. */
export const cleanupDeletedEntryReceipts = internalMutation({
  args: { entryId: v.id('entries') },
  returns: v.null(),
  handler: async (ctx, { entryId }) => {
    // Recheck inside every batch. No caller, expiry or timer can prune receipts
    // for an existing entry and thereby make an old save replayable.
    if (await ctx.db.get(entryId)) return null
    const receipts = await ctx.db
      .query('draftSaveReceipts')
      .withIndex('by_entry_identity_request', (query) => query.eq('entryId', entryId))
      .take(DELETED_ENTRY_RECEIPT_BATCH_SIZE)
    for (const receipt of receipts) await ctx.db.delete(receipt._id)
    if (receipts.length === DELETED_ENTRY_RECEIPT_BATCH_SIZE) {
      await scheduleDeletedEntryReceiptCleanup(ctx, entryId)
    }
    return null
  },
})
