import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cleanupDeletedEntryReceipts,
  DELETED_ENTRY_RECEIPT_BATCH_SIZE,
} from '../../../packages/convex/src/entries/draftReceiptCleanup'
import {
  archiveEntry,
  createCtx,
  permanentlyDeleteEntry,
  seedEditorFixture,
  seedOwner,
  seedSettings,
} from './helpers'

const api = anyApi
async function setup(count: number) {
  vi.useFakeTimers()
  const ctx = createCtx()
  await seedOwner(ctx)
  await seedSettings(ctx)
  const { entryId } = await seedEditorFixture(ctx)
  await ctx.run(async (inner) => {
    const id = inner.db.normalizeId('entries', entryId)
    if (!id) throw new Error('Expected an entry ID')
    for (let index = 0; index < count; index++) {
      await inner.db.insert('draftSaveReceipts', {
        entryId: id,
        appIdentityId: 'owner-1',
        requestId: `saved-${index}`,
        requestHash: 'digest',
        draftVersion: index + 1,
        dirtyLocales: [],
        createdAt: Date.now(),
      })
    }
  })
  return { ctx, entryId, owner: ctx.asCmsUser('owner-1') }
}
afterEach(() => vi.useRealTimers())

describe('deleted-entry draft receipt cleanup', () => {
  it('allows permanent deletion after more than 2000 saves and drains scheduled batches', async () => {
    const { ctx, owner, entryId } = await setup(2_005)
    await archiveEntry(owner, entryId)
    const entry = (await ctx.readAll('entries'))[0]!
    await expect(
      permanentlyDeleteEntry(owner, { entryId, confirmationPhrase: `DELETE ${entry.stableId}` }),
    ).resolves.toMatchObject({ deleted: true })
    expect(await ctx.readAll('entries')).toEqual([])
    expect(await ctx.readAll('draftSaveReceipts')).toHaveLength(2_005)
    await ctx.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await ctx.readAll('draftSaveReceipts')).toEqual([])
  })

  it('deletes only one bounded batch per transaction and safely resumes from the remaining index rows', async () => {
    const count = DELETED_ENTRY_RECEIPT_BATCH_SIZE * 2 + 5
    const { ctx, entryId } = await setup(count)
    await ctx.run(async (inner) => {
      const id = inner.db.normalizeId('entries', entryId)
      if (id) await inner.db.delete(id)
    })
    await ctx.mutation(api.entries.draftReceiptCleanup.cleanupDeletedEntryReceipts, { entryId })
    expect(await ctx.readAll('draftSaveReceipts')).toHaveLength(
      count - DELETED_ENTRY_RECEIPT_BATCH_SIZE,
    )
    await ctx.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await ctx.readAll('draftSaveReceipts')).toEqual([])
    await ctx.mutation(api.entries.draftReceiptCleanup.cleanupDeletedEntryReceipts, { entryId })
    expect(await ctx.readAll('draftSaveReceipts')).toEqual([])
  })

  it('is registered as internal and never deletes receipts belonging to an existing entry', async () => {
    const { ctx, entryId } = await setup(3)
    expect(cleanupDeletedEntryReceipts.isInternal).toBe(true)
    await ctx.mutation(api.entries.draftReceiptCleanup.cleanupDeletedEntryReceipts, { entryId })
    await ctx.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await ctx.readAll('draftSaveReceipts')).toHaveLength(3)
  })
})
