import { v } from 'convex/values'

import { internal } from '../_generated/api.js'
import { internalMutation } from '../_generated/server.js'

// Old epochs cannot be read after their room fence changes. Delete their log
// in bounded jobs so repeated imports cannot accumulate unreachable content.
export const pruneOldEpoch = internalMutation({
  args: { roomId: v.id('editorBodyRooms'), epoch: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId)
    if (room?.epoch === args.epoch) return null
    const rows = await ctx.db
      .query('editorBodySteps')
      .withIndex('by_room_epoch_version', (q) =>
        q.eq('roomId', args.roomId).eq('epoch', args.epoch),
      )
      .take(32)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === 32)
      await ctx.scheduler.runAfter(0, internal.entries.collaborationCleanup.pruneOldEpoch, args)
    return null
  },
})

// Access already fails when the canonical entry is deleted. Purge derived
// rooms and logs separately because a multilingual entry can exceed one
// transaction's byte budget even with bounded history in each room.
export const removeDeletedEntryRooms = internalMutation({
  args: { entryId: v.id('entries') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.entryId)) return null
    const room = await ctx.db
      .query('editorBodyRooms')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId))
      .first()
    if (!room) return null
    const rows = await ctx.db
      .query('editorBodySteps')
      .withIndex('by_room_epoch_version', (q) => q.eq('roomId', room._id))
      .take(32)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length < 32) await ctx.db.delete(room._id)
    await ctx.scheduler.runAfter(
      0,
      internal.entries.collaborationCleanup.removeDeletedEntryRooms,
      args,
    )
    return null
  },
})
