/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, publishEntry, seedEditorFixture, seedOwner, seedSettings } from './helpers'

const api = anyApi

describe('public projection maintenance', () => {
  it('validates and rebuilds public projection drift from the published revision', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)

    await expect(
      ctx.raw.query(api.entries.projectionMaintenance.verifyPublicProjectionInvariants, {
        entryId,
      }),
    ).resolves.toMatchObject({
      ok: true,
      checkedPublicEntries: 1,
      issues: [],
    })

    await ctx.raw.run(async (innerCtx) => {
      const route = await innerCtx.db
        .query('publicRoutes')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId as never).eq('locale', 'en'))
        .first()
      if (route) await innerCtx.db.delete(route._id)
    })

    await expect(
      ctx.raw.query(api.entries.projectionMaintenance.verifyPublicProjectionInvariants, {
        entryId,
      }),
    ).resolves.toMatchObject({
      ok: false,
      checkedPublicEntries: 1,
      issues: [
        expect.objectContaining({
          code: 'public-route-drift',
          entryId,
          locale: 'en',
        }),
      ],
    })

    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.rebuildDerivedStateForEntry, {
        entryId,
      }),
    ).resolves.toMatchObject({
      publicEntries: 1,
      publicRoutes: 1,
      issues: [],
    })

    await expect(
      ctx.raw.query(api.entries.projectionMaintenance.verifyPublicProjectionInvariants, {
        entryId,
      }),
    ).resolves.toMatchObject({
      ok: true,
      checkedPublicEntries: 1,
      issues: [],
    })
  })
})
