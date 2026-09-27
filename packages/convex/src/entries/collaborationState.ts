import type { Id } from '../_generated/dataModel.js'
import type { MutationCtx } from '../lib/types.js'

/** Fence a source/import/rollback write in the same transaction as its draft.
 * A hash alone misses A → B → A replacements between collaboration requests.
 * The shared writer also calls this, then installs its accepted hash atomically.
 */
export async function invalidateSharedBody(
  ctx: MutationCtx,
  entryId: Id<'entries'>,
  locale: string,
) {
  const room = await ctx.db
    .query('editorBodyRooms')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
    .unique()
  // An empty value cannot equal a SHA-256 source checkpoint. The next authorized
  // open rebuilds from the accepted source with a new epoch; old operations stop.
  if (room) await ctx.db.patch(room._id, { sourceHash: '' })
}
