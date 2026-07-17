import type { Id } from '../_generated/dataModel.js'
import type { MutationCtx } from '../lib/types.js'

const MAX_ACTIVE_EXPORTS = 100

export async function assertCollectionOutsidePortableExportLease(
  ctx: MutationCtx,
  collection: string,
) {
  const now = Date.now()
  const active = await ctx.db
    .query('portableRuns')
    .withIndex('by_mode_state', (query) => query.eq('mode', 'export').eq('state', 'capturing'))
    .take(MAX_ACTIVE_EXPORTS + 1)
  if (active.length > MAX_ACTIVE_EXPORTS) {
    throw new Error('Portable export lease inventory is saturated; retry the editorial write.')
  }
  if (
    active.some(
      (run) =>
        run.mode === 'export' &&
        run.leaseExpiresAt !== null &&
        run.leaseExpiresAt > now &&
        run.scope.collections.includes(collection),
    )
  ) {
    throw new Error(
      `A portable export capture is temporarily fencing collection "${collection}"; retry the editorial write after capture completes.`,
    )
  }
}

export async function assertStorageOutsidePortableExportHold(
  ctx: MutationCtx,
  storageId: Id<'_storage'>,
) {
  const holds = await ctx.db
    .query('portableExportAssets')
    .withIndex('by_storage', (query) => query.eq('storageId', storageId))
    .take(101)
  if (holds.length > 100) {
    throw new Error('Portable export hold inventory is unexpectedly saturated.')
  }
  const now = Date.now()
  for (const hold of holds) {
    if (hold.expiresAt <= now) continue
    const run = await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', hold.runId))
      .unique()
    if (
      run?.mode === 'export' &&
      (run.state === 'ready' ||
        (run.state === 'capturing' && run.leaseExpiresAt !== null && run.leaseExpiresAt > now))
    ) {
      throw new Error(
        'A live portable export hold protects this asset; retry after export completion.',
      )
    }
  }
}
