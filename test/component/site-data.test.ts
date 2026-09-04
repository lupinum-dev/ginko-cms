/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, seedMember } from '../helpers'
import { seedOwner, seedSettings } from './entries/helpers'

const api = anyApi

describe('site data ownership shape', () => {
  it('stores localized writes only under locale keys', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'localizedFooter',
      localized: true,
      locale: 'en',
      data: { headline: 'Hello' },
    })
    await owner.mutation(api.siteData.saveSiteData, {
      key: 'localizedFooter',
      locale: 'de',
      data: { headline: 'Hallo' },
    })

    const block = await owner.query(api.siteData.getSiteDataBlock, { key: 'localizedFooter' })
    expect(block?.data).toEqual({
      en: { headline: 'Hello' },
      de: { headline: 'Hallo' },
    })
  })

  it('rejects ambiguous localized and nonlocalized writes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.siteData.createSiteDataBlock, {
        key: 'badLocalized',
        localized: true,
        data: { headline: 'Hello' },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'SITE_DATA_LOCALE_REQUIRED',
    )

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'plainFooter',
      localized: false,
      data: { headline: 'Hello' },
    })

    await expect(
      owner.mutation(api.siteData.saveSiteData, {
        key: 'plainFooter',
        locale: 'en',
        data: { headline: 'Hello again' },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'SITE_DATA_LOCALE_NOT_ALLOWED',
    )
  })

  it('rejects non-JSON Convex values at public site data boundaries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.siteData.createSiteDataBlock, {
        key: 'binaryPayload',
        localized: false,
        data: new ArrayBuffer(1),
      }),
    ).rejects.toThrow()
  })

  it('drops legacy root keys on the next localized write while preserving locale entries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()
    await ctx.seed(
      'siteData' as never,
      {
        key: 'legacyLocalized',
        label: null,
        schemaType: null,
        localized: true,
        visibility: 'private',
        data: {
          en: { headline: 'Hello' },
          note: 'legacy root note',
        },
        updatedBy: 'owner-1',
        updatedAt: now,
      } as never,
    )

    await owner.mutation(api.siteData.saveSiteData, {
      key: 'legacyLocalized',
      locale: 'de',
      data: { headline: 'Hallo' },
    })

    const block = await owner.query(api.siteData.getSiteDataBlock, { key: 'legacyLocalized' })
    expect(block?.data).toEqual({
      en: { headline: 'Hello' },
      de: { headline: 'Hallo' },
    })
  })

  it('rejects localization flag changes that would reinterpret stored data', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'footer',
      localized: false,
      data: { headline: 'Hello' },
    })

    await expect(
      owner.mutation(api.siteData.updateSiteDataBlock, {
        key: 'footer',
        localized: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        getCmsErrorData(error)?.code ===
        'SITE_DATA_LOCALIZATION_CHANGE_REQUIRES_CONTRACT_TRANSITION',
    )
  })

  it('[DAT-01][DAT-02] saves canonical localized site data immediately with truthful public/private revalidation and redacted activity', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'announcement',
      localized: true,
      locale: 'en',
      visibility: 'public',
      data: { text: 'One' },
    })
    await owner.mutation(api.siteData.saveSiteData, {
      key: 'announcement',
      locale: 'de',
      data: { text: 'Two' },
    })
    await owner.mutation(api.siteData.updateSiteDataBlock, {
      key: 'announcement',
      visibility: 'private',
    })
    await owner.mutation(api.siteData.saveSiteData, {
      key: 'announcement',
      locale: 'de',
      data: { text: 'Private edit' },
    })
    await owner.mutation(api.siteData.updateSiteDataBlock, {
      key: 'announcement',
      visibility: 'public',
    })
    const preview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'announcement',
    })
    await owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
      key: 'announcement',
      _confirmationToken: preview.confirmation!.token,
    })

    const events = await ctx.readAll('outboxEvents')
    expect(events).toHaveLength(5)
    expect(events.map((event) => event.tags)).toEqual([
      ['site-data:announcement', 'site-data:announcement:en'],
      ['site-data:announcement', 'site-data:announcement:de'],
      ['site-data:announcement', 'site-data:announcement:de', 'site-data:announcement:en'],
      ['site-data:announcement', 'site-data:announcement:de', 'site-data:announcement:en'],
      ['site-data:announcement', 'site-data:announcement:de', 'site-data:announcement:en'],
    ])
    expect(new Set(events.map((event) => event.versionId)).size).toBe(events.length)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'content.revalidate',
          paths: ['/'],
          deliveryGeneration: 0,
          leaseId: null,
        }),
      ]),
    )
    const activity = await ctx.readAll('activity')
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'siteData.saved',
          appIdentityId: 'owner-1',
          locale: 'de',
          detail: { key: 'announcement' },
        }),
        expect.objectContaining({
          kind: 'siteData.deleted',
          appIdentityId: 'owner-1',
          detail: { key: 'announcement' },
        }),
      ]),
    )
    expect(JSON.stringify(activity)).not.toContain('Private edit')
  })

  it('allows read-only users to inspect site data without write access', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    const owner = ctx.asCmsUser('owner-1')
    const viewer = ctx.asCmsUser('viewer-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'announcement',
      localized: false,
      visibility: 'public',
      data: { text: 'Visible' },
    })

    await expect(viewer.query(api.siteData.listSiteData, {})).resolves.toEqual([
      expect.objectContaining({
        key: 'announcement',
        visibility: 'public',
      }),
    ])
    await expect(
      viewer.query(api.siteData.getSiteDataBlock, { key: 'announcement' }),
    ).resolves.toMatchObject({
      key: 'announcement',
      data: { text: 'Visible' },
    })

    await expect(
      viewer.mutation(api.siteData.createSiteDataBlock, {
        key: 'viewerCreated',
        localized: false,
        data: {},
      }),
    ).rejects.toThrow('Forbidden: Manage settings')
    await expect(
      viewer.mutation(api.siteData.saveSiteData, {
        key: 'announcement',
        data: { text: 'Edited' },
      }),
    ).rejects.toThrow('Forbidden: Manage settings')
    await expect(
      viewer.mutation(api.siteData.updateSiteDataBlock, {
        key: 'announcement',
        visibility: 'private',
      }),
    ).rejects.toThrow('Forbidden: Manage settings')
    await expect(
      viewer.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
        key: 'announcement',
      }),
    ).rejects.toThrow('Forbidden: Manage settings')
  })

  it('binds destructive confirmations to one caller, args, and one redemption', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'deleteMe',
      localized: false,
      data: { text: 'Remove' },
    })
    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'keepMe',
      localized: false,
      data: { text: 'Keep' },
    })

    const args = { key: 'deleteMe' }
    const wrongArgs = { key: 'keepMe' }
    const preview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, args)
    expect(preview.allowed).toBe(true)
    expect(preview.confirmation?.token).toEqual(expect.any(String))

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        ...wrongArgs,
        _confirmationToken: preview.confirmation.token,
      }),
    ).resolves.toMatchObject({
      status: 'stale',
      code: 'CONFIRMATION_ARGUMENT_MISMATCH',
    })

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        ...args,
        _confirmationToken: preview.confirmation.token,
      }),
    ).resolves.toEqual({ status: 'applied', value: null })

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        ...args,
        _confirmationToken: preview.confirmation.token,
      }),
    ).resolves.toMatchObject({
      status: 'stale',
      code: 'CONFIRMATION_ALREADY_USED',
    })

    expect(await owner.query(api.siteData.getSiteDataBlock, { key: 'deleteMe' })).toBeNull()
    expect(await owner.query(api.siteData.getSiteDataBlock, { key: 'keepMe' })).not.toBeNull()
    expect(await ctx.readAll('destructiveAuditLog')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'stale',
          code: 'CONFIRMATION_ARGUMENT_MISMATCH',
        }),
        expect.objectContaining({
          status: 'applied',
          code: null,
          message: null,
        }),
        expect.objectContaining({
          status: 'stale',
          code: 'CONFIRMATION_ALREADY_USED',
        }),
      ]),
    )
    expect(await ctx.readAll('destructiveAuditLog')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'ginko-cms.delete-site-data-block',
          callerKey: 'user:owner-1',
          scopeKey: 'ginko-cms',
          executePath: 'siteData:deleteSiteDataBlockOperationExecute',
        }),
      ]),
    )
  })
})
