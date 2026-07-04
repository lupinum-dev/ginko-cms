/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx } from '../helpers'
import { seedOwner } from './entries/helpers'

const api = anyApi

describe('site data ownership shape', () => {
  it('stores localized writes only under locale keys', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
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
        getCmsErrorData(error)?.code === 'SITE_DATA_LOCALIZATION_CHANGE_REQUIRES_MIGRATION',
    )
  })

  it('queues revalidation when public site data changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'announcement',
      localized: false,
      visibility: 'public',
      data: { text: 'One' },
    })
    await owner.mutation(api.siteData.saveSiteData, {
      key: 'announcement',
      data: { text: 'Two' },
    })

    const events = await ctx.readAll('outboxEvents')
    expect(events).toEqual([
      expect.objectContaining({
        type: 'content.revalidate',
        tags: ['site-data', 'site-data:announcement'],
        paths: ['/'],
      }),
    ])
  })

  it('binds destructive confirmations to one caller, args, and one redemption', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
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
    ).rejects.toThrow(/arguments mismatch/)

    await owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
      ...args,
      _confirmationToken: preview.confirmation.token,
    })

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        ...args,
        _confirmationToken: preview.confirmation.token,
      }),
    ).rejects.toThrow(/already used/)

    expect(await owner.query(api.siteData.getSiteDataBlock, { key: 'deleteMe' })).toBeNull()
    expect(await owner.query(api.siteData.getSiteDataBlock, { key: 'keepMe' })).not.toBeNull()
    expect(await ctx.readAll('destructiveAuditLog')).toEqual([
      expect.objectContaining({
        operationId: 'ginko-cms.delete-site-data-block',
        callerKey: 'user:owner-1',
        scopeKey: 'ginko-cms',
        executePath: 'siteData:deleteSiteDataBlockOperationExecute',
      }),
    ])
  })
})
