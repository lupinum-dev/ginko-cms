/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  publishEntry,
  seedEditorFixture,
  seedOwner,
  seedSettings,
  seedStorageObject,
} from './helpers'

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
      ctx.raw.mutation(api.entries.projectionMaintenance.repairPublishedProjectionIndexesForEntry, {
        entryId,
      }),
    ).resolves.toMatchObject({
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

  it('preserves published public data when repairing derived projection indexes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'gallery',
        label: { en: 'Gallery' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/gallery',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          {
            key: 'image',
            type: 'object',
            localized: false,
            fields: [
              { key: 'src', type: 'image' },
              { key: 'alt', type: 'text' },
              { key: 'caption', type: 'text' },
            ],
          },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const storageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 1024,
        width: 800,
        height: 600,
        alt: { en: 'Original asset alt' },
        caption: { en: 'Original asset caption' },
        scope: 'collection',
        entryId: null,
        collectionId,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const entryId = await owner.createEntry({
      collection: 'gallery',
      slug: 'asset-snapshot',
      localized: { title: 'Asset snapshot' },
      shared: { image: { src: assetId, alt: '', caption: '' } },
    })
    await publishEntry(owner, entryId)

    await owner.mutation(api.assets.updateAsset, {
      assetId,
      alt: { en: 'Updated asset alt' },
      caption: { en: 'Updated asset caption' },
    })
    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.repairPublishedProjectionIndexesForEntry, {
        entryId,
      }),
    ).resolves.toMatchObject({
      issues: [],
    })

    const publicRows = await ctx.readAll('publicEntries')
    expect(publicRows).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          image: expect.objectContaining({
            src: assetId,
            alt: 'Original asset alt',
            caption: 'Original asset caption',
          }),
        }),
      }),
    ])
  })

  it('treats data-only public entries as route-less projection truth', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()
    const collectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'settings',
        label: { en: 'Settings' },
        icon: null,
        type: 'flat',
        routing: {
          mode: 'none',
          pathPrefix: '',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true, required: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const entryId = await owner.createEntry({
      collection: 'settings',
      slug: 'site-settings',
      localized: { title: 'Site settings' },
    })
    await publishEntry(owner, entryId)
    const [publicRow] = await ctx.readAll('publicEntries')

    await expect(
      ctx.raw.query(api.entries.projectionMaintenance.verifyPublicProjectionInvariants, {
        entryId,
      }),
    ).resolves.toMatchObject({
      ok: true,
      checkedPublicEntries: 1,
      issues: [],
    })
    expect(await ctx.readAll('publicRoutes')).toEqual([])

    await ctx.seed(
      'publicRoutes' as never,
      {
        entryId,
        collectionId,
        locale: 'en',
        path: publicRow.path,
        href: publicRow.href,
        revisionId: publicRow.revisionId,
      } as never,
    )
    await expect(
      ctx.raw.query(api.entries.projectionMaintenance.verifyPublicProjectionInvariants, {
        entryId,
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'public-route-unexpected',
          entryId,
          locale: 'en',
        }),
      ],
    })

    await expect(
      ctx.raw.mutation(api.entries.projectionMaintenance.repairPublishedProjectionIndexesForEntry, {
        entryId,
      }),
    ).resolves.toMatchObject({
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
    expect(await ctx.readAll('publicRoutes')).toEqual([])
  })
})
