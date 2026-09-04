/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner, seedSettings } from '../helpers'
import { seedEditorFixture } from './entries/helpers'

const api = anyApi

async function createSiteDataBlock(
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  key: string,
) {
  await owner.mutation(api.siteData.createSiteDataBlock, {
    key,
    localized: false,
    data: { value: key },
  })
}

describe('guarded operation execution protocol', () => {
  it('returns applied, argument-mismatch stale, and confirmation-reuse stale receipts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await createSiteDataBlock(owner, 'deleteMe')
    await createSiteDataBlock(owner, 'keepMe')

    const preview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'deleteMe',
    })
    const token = preview.confirmation!.token

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'keepMe',
        _confirmationToken: token,
      }),
    ).resolves.toMatchObject({
      status: 'stale',
      code: 'CONFIRMATION_ARGUMENT_MISMATCH',
    })
    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'deleteMe',
        _confirmationToken: token,
      }),
    ).resolves.toEqual({ status: 'applied', value: null })
    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'deleteMe',
        _confirmationToken: token,
      }),
    ).resolves.toMatchObject({
      status: 'stale',
      code: 'CONFIRMATION_ALREADY_USED',
    })

    expect((await ctx.readAll('destructiveAuditLog')).map((row) => row.status)).toEqual([
      'stale',
      'applied',
      'stale',
    ])
  })

  it('returns an expired confirmation as stale without changing canonical state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await createSiteDataBlock(owner, 'expires')
    const preview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'expires',
    })
    await ctx.raw.run(async (inner) => {
      const confirmation = await inner.db.query('destructiveConfirmations').first()
      if (!confirmation) throw new Error('Expected a stored confirmation.')
      await inner.db.patch(confirmation._id, { expiresAt: Date.now() - 1 })
    })

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'expires',
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'CONFIRMATION_EXPIRED' })
    await expect(
      owner.query(api.siteData.getSiteDataBlock, { key: 'expires' }),
    ).resolves.not.toBeNull()
  })

  it('returns recomputed version and blocker changes as stale', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await createSiteDataBlock(owner, 'versionChanged')
    const versionPreview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'versionChanged',
    })
    await ctx.raw.run(async (inner) => {
      const row = await inner.db
        .query('siteData')
        .withIndex('by_key', (query) => query.eq('key', 'versionChanged'))
        .unique()
      if (!row) throw new Error('Expected site data block.')
      await inner.db.patch(row._id, { updatedAt: row.updatedAt + 1 })
    })
    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'versionChanged',
        _confirmationToken: versionPreview.confirmation!.token,
      }),
    ).resolves.toMatchObject({
      status: 'stale',
      code: 'CONFIRMATION_VERSION_MISMATCH',
    })

    await createSiteDataBlock(owner, 'nowBlocked')
    const blockerPreview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'nowBlocked',
    })
    await ctx.raw.run(async (inner) => {
      const row = await inner.db
        .query('siteData')
        .withIndex('by_key', (query) => query.eq('key', 'nowBlocked'))
        .unique()
      if (!row) throw new Error('Expected site data block.')
      await inner.db.delete(row._id)
    })
    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'nowBlocked',
        _confirmationToken: blockerPreview.confirmation!.token,
      }),
    ).resolves.toMatchObject({
      status: 'stale',
      code: 'OPERATION_NO_LONGER_ALLOWED',
    })
  })

  it('rechecks authority, records a blocked receipt, and does not consume the confirmation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await createSiteDataBlock(owner, 'authority')
    const preview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'authority',
    })
    const token = preview.confirmation!.token
    await ctx.raw.run(async (inner) => {
      const member = await inner.db
        .query('members')
        .withIndex('by_userId', (query) => query.eq('userId', 'owner-1'))
        .unique()
      if (!member) throw new Error('Expected owner member.')
      await inner.db.patch(member._id, { role: 'viewer' })
    })

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'authority',
        _confirmationToken: token,
      }),
    ).resolves.toMatchObject({ status: 'blocked', code: 'OPERATION_FORBIDDEN' })
    await expect(
      owner.query(api.siteData.getSiteDataBlock, { key: 'authority' }),
    ).resolves.not.toBeNull()

    await ctx.raw.run(async (inner) => {
      const member = await inner.db
        .query('members')
        .withIndex('by_userId', (query) => query.eq('userId', 'owner-1'))
        .unique()
      if (!member) throw new Error('Expected owner member.')
      await inner.db.patch(member._id, { role: 'owner' })
    })
    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'authority',
        _confirmationToken: token,
      }),
    ).resolves.toEqual({ status: 'applied', value: null })
  })

  it('reports an invalid historical snapshot as a preview blocker without writing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const revisionId = await owner.mutation(api.entries.publish.createCheckpoint, {
      entryId,
      message: 'Corrupt source fixture',
    })
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(revisionId, { snapshots: {} })
    })
    const before = {
      entries: structuredClone(await ctx.readAll('entries')),
      drafts: structuredClone(await ctx.readAll('entryLocaleDrafts')),
      revisions: structuredClone(await ctx.readAll('entryRevisions')),
      activity: structuredClone(await ctx.readAll('activity')),
    }
    const args = { entryId, versionId: revisionId, publish: false }
    const preview = await owner.mutation(
      api.entries.publicationHistory.previewRollbackVersionOperation,
      args,
    )
    expect(preview).toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'revision-snapshot-empty' })],
    })

    expect(await ctx.readAll('entries')).toEqual(before.entries)
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before.drafts)
    expect(await ctx.readAll('entryRevisions')).toEqual(before.revisions)
    expect(await ctx.readAll('activity')).toEqual(before.activity)
    expect(await ctx.readAll('destructiveAuditLog')).toEqual([])
    expect(await ctx.readAll('destructiveConfirmations')).toEqual([])
  })
})
