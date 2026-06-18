/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { executeConfirmedOperation } from '../helpers'
import { createCtx, seedOwner, seedSettings, seedEditorFixture } from './entries/helpers'

const api = anyApi

async function seedStorageObject(
  ctx: ReturnType<typeof createCtx>,
  input: { bytes: string; type?: string },
) {
  return (await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([input.bytes], { type: input.type })),
  )) as string
}

type CmsUserClient = ReturnType<ReturnType<typeof createCtx>['asCmsUser']>

async function listManagerAssets(owner: CmsUserClient, args: Record<string, unknown> = {}) {
  const page = await owner.query(api.assets.getAssetManagerData, {
    paginationOpts: { cursor: null, numItems: 100 },
    ...args,
  })
  return page.page
}

describe('asset management', () => {
  it('seeds and lists a global asset with correct metadata', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    const storageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 12345,
        width: 1920,
        height: 1080,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    const assets = await listManagerAssets(owner)
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      filename: 'hero.png',
      mimeType: 'image/png',
      size: 12345,
      width: 1920,
      height: 1080,
      scope: 'global',
      entryId: null,
      collectionId: null,
      ownerPath: ['Global'],
    })
  })

  it('updates asset alt, caption, and tags metadata', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    const storageId = await seedStorageObject(ctx, { bytes: 'photo', type: 'image/jpeg' })
    await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 5000,
        width: 800,
        height: 600,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const assets = await listManagerAssets(owner)
    const assetId = assets[0].id

    // Update metadata
    await owner.mutation(api.assets.updateAsset, {
      assetId,
      alt: { en: 'Hero banner' },
      caption: { en: 'Main site hero image' },
      tags: ['Hero', 'marketing', 'hero'],
    })

    const updatedAssets = await listManagerAssets(owner)
    expect(updatedAssets[0].alt).toEqual({ en: 'Hero banner' })
    expect(updatedAssets[0].caption).toEqual({ en: 'Main site hero image' })
    expect(updatedAssets[0].tags).toEqual(['hero', 'marketing'])
  })

  it('resolves only active readable asset URLs by id', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'image-bytes', type: 'image/png' })
    const deletedStorageId = await seedStorageObject(ctx, {
      bytes: 'deleted-image-bytes',
      type: 'image/png',
    })
    const now = Date.now()
    const activeAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'active.png',
        mimeType: 'image/png',
        size: 11,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const deletedAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: deletedStorageId,
        filename: 'deleted.png',
        mimeType: 'image/png',
        size: 19,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: now,
        deletedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const urls = await owner.query(api.assets.resolveAssetUrls, {
      assetIds: [activeAssetId, deletedAssetId, 'not-an-id'],
    })

    expect(urls[activeAssetId]).toMatch(/^https?:\/\//)
    expect(urls[deletedAssetId]).toBeNull()
    expect(urls['not-an-id']).toBeNull()
  })

  it('returns null for malformed public asset URL lookups', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    await expect(
      ctx.raw.query(api.assets.getAssetUrl, {
        assetId: 'abcdefghijklmnopqrstuvwx',
      }),
    ).resolves.toBeNull()
  })

  it('rejects unbounded asset URL resolution requests', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await expect(
      owner.query(api.assets.resolveAssetUrls, {
        assetIds: Array.from({ length: 201 }, (_, index) => `asset-${index}`),
      }),
    ).rejects.toThrow(/at most 200 asset ids/i)
  })

  it('seeds an entry-scoped asset and lists by entryId', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collectionId } = await seedEditorFixture(ctx)

    const now = Date.now()
    const storageId = await seedStorageObject(ctx, { bytes: 'pdf', type: 'application/pdf' })
    await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'attachment.pdf',
        mimeType: 'application/pdf',
        size: 50000,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'entry',
        entryId,
        collectionId,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    const colocatedAssets = await owner.query(api.assets.listColocatedAssets, {
      collectionSlug: 'posts',
      entryId,
    })
    const entryAssets = colocatedAssets.entry
    expect(entryAssets).toHaveLength(1)
    expect(entryAssets[0].scope).toBe('entry')
    expect(entryAssets[0].entryId).toBe(entryId)
    expect(entryAssets[0].ownerPath).toEqual(['Global', 'Posts', 'Hello world'])
  })

  it('updates filename with sanitization', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    const storageId = await seedStorageObject(ctx, { bytes: 'original', type: 'image/png' })
    await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'original.png',
        mimeType: 'image/png',
        size: 1000,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const assets = await listManagerAssets(owner)
    const assetId = assets[0].id

    await owner.mutation(api.assets.updateAsset, {
      assetId,
      filename: 'path/to/renamed.png',
    })

    const updated = await listManagerAssets(owner)
    // Path separators should be replaced with underscores
    expect(updated[0].filename).not.toContain('/')
    expect(updated[0].filename).toContain('renamed.png')
  })

  it('tracks usage in the asset manager and soft-deletes to trash', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collectionId } = await seedEditorFixture(ctx)

    const now = Date.now()
    const storageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 9000,
        width: 1200,
        height: 630,
        alt: null,
        caption: null,
        scope: 'entry',
        entryId,
        collectionId,
        tags: ['hero'],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          shared: { hero: assetId },
        },
      },
    })
    const backfill = await owner.mutation(api.assets.rebuildContentAssetRefsPage, {
      cursor: null,
      numItems: 10,
    })
    expect(backfill.processed).toBe(1)
    expect(await ctx.readAll('contentAssetRefs')).toMatchObject([
      {
        sourceKind: 'draft',
        assetId,
        entryId,
        collectionId,
        fieldPath: 'hero',
        locale: null,
      },
    ])

    const browserAssets = await owner.query(api.assets.getAssetManagerData, {})
    expect(browserAssets.page).toHaveLength(1)
    expect(browserAssets.page[0]?.usages).toHaveLength(1)
    expect(browserAssets.page[0]?.tags).toEqual(['hero'])

    await expect(
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.delete-asset',
        preview: api.assets.previewDeleteAssetOperation,
        execute: api.assets.deleteAssetOperationExecute,
        args: { assetId: assetId as string },
      }),
    ).rejects.toThrow(/trash/i)

    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.delete-asset',
      preview: api.assets.previewDeleteAssetOperation,
      execute: api.assets.deleteAssetOperationExecute,
      args: {
        assetId: assetId as string,
        force: true,
      },
    })

    const activeAssets = await listManagerAssets(owner, { deleted: 'active' })
    expect(activeAssets).toHaveLength(0)

    const trashedAssets = await owner.query(api.assets.getAssetManagerData, {})
    expect(trashedAssets.page[0]?.deletedAt).toBeTypeOf('number')

    await owner.mutation(api.assets.restoreAsset, {
      assetId: assetId as string,
    })

    const restoredAssets = await listManagerAssets(owner, { deleted: 'active' })
    expect(restoredAssets).toHaveLength(1)
  })

  it('server-paginates asset manager search and filters', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()

    const heroStorageId = await seedStorageObject(ctx, { bytes: 'hero-alpha', type: 'image/png' })
    await ctx.seed(
      'assets' as never,
      {
        storageId: heroStorageId,
        filename: 'hero-alpha.png',
        mimeType: 'image/png',
        size: 512,
        width: 32,
        height: 32,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const briefStorageId = await seedStorageObject(ctx, {
      bytes: 'brief',
      type: 'application/pdf',
    })
    await ctx.seed(
      'assets' as never,
      {
        storageId: briefStorageId,
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now - 1,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const trashStorageId = await seedStorageObject(ctx, {
      bytes: 'hero-trash',
      type: 'image/png',
    })
    await ctx.seed(
      'assets' as never,
      {
        storageId: trashStorageId,
        filename: 'hero-trash.png',
        mimeType: 'image/png',
        size: 1024,
        width: 32,
        height: 32,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now - 2,
        updatedAt: null,
        deletedAt: now - 1,
        deletedBy: 'owner-1',
      } as never,
    )

    await expect(
      owner.query(api.assets.getAssetManagerData, {
        search: 'hero',
        kind: 'image',
        deleted: 'active',
        paginationOpts: { cursor: null, numItems: 1 },
      }),
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ filename: 'hero-alpha.png' })],
      isDone: false,
    })

    await expect(
      owner.query(api.assets.getAssetManagerData, {
        kind: 'document',
        deleted: 'active',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ filename: 'brief.pdf' })],
      isDone: true,
    })

    await expect(
      owner.query(api.assets.getAssetManagerData, {
        search: 'hero',
        deleted: 'trashed',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ filename: 'hero-trash.png' })],
      isDone: true,
    })
  })

  it('continues asset manager pagination across equal createdAt rows', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()

    for (let i = 0; i < 3; i++) {
      const storageId = await seedStorageObject(ctx, {
        bytes: `same-time-${i}`,
        type: 'image/png',
      })
      await ctx.seed(
        'assets' as never,
        {
          storageId,
          filename: `same-time-${i}.png`,
          mimeType: 'image/png',
          size: 512,
          width: 32,
          height: 32,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collectionId: null,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt: now,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
        } as never,
      )
    }

    const seen = new Set<string>()
    let cursor: string | null = null
    do {
      const page = await owner.query(api.assets.getAssetManagerData, {
        paginationOpts: { cursor, numItems: 1 },
      })
      for (const asset of page.page) {
        seen.add(asset.filename)
      }
      cursor = page.continueCursor
    } while (cursor)

    expect(seen).toEqual(new Set(['same-time-0.png', 'same-time-1.png', 'same-time-2.png']))
  })

  it('restricts asset manager data to owners and editors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await ctx.seed(
      'members' as never,
      {
        userId: 'viewer-1',
        role: 'viewer',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const viewer = ctx.asCmsUser('viewer-1')

    const storageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 512,
        width: 32,
        height: 32,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    await expect(owner.query(api.assets.getAssetManagerData, {})).resolves.toMatchObject({
      page: [expect.objectContaining({ filename: 'hero.png' })],
    })
    await expect(viewer.query(api.assets.getAssetManagerData, {})).rejects.toThrow(/forbidden/i)
  })

  it('rejects missing storage objects during asset registration', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'missing', type: 'image/png' })
    await ctx.raw.run(async (innerCtx) => await innerCtx.storage.delete(storageId as never))

    await expect(
      owner.mutation(api.assets.registerAsset, {
        storageId,
        filename: 'missing.png',
        mimeType: 'image/png',
        size: 512,
        scope: 'global',
      }),
    ).rejects.toThrow(/storage|not found/i)
  })

  it('rejects storage objects without server MIME metadata', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'payload' })

    await expect(
      owner.mutation(api.assets.registerAsset, {
        storageId,
        filename: 'payload.png',
        mimeType: 'image/png',
        size: 512,
        scope: 'global',
      }),
    ).rejects.toThrow(/mime|unsupported/i)

    await expect(
      ctx.raw.run(async (innerCtx) => await innerCtx.db.system.get('_storage', storageId as never)),
    ).resolves.toMatchObject({ _id: storageId })
  })

  it('moves and lists collection-scoped assets by collection slug', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'avatar', type: 'image/png' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'avatar.png',
        mimeType: 'image/png',
        size: 9,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    await owner.moveAsset({
      assetId: assetId as string,
      scope: 'collection',
      collectionSlug: 'posts',
    })

    const colocatedAssets = await owner.query(api.assets.listColocatedAssets, {
      collectionSlug: 'posts',
    })
    const assets = colocatedAssets.collection
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      id: assetId,
      filename: 'avatar.png',
      ownerPath: ['Global', 'Posts'],
      scope: 'collection',
      entryId: null,
    })
  })

  it('rejects invalid collection ids without leaking Convex id decode errors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, {
      bytes: 'png bytes',
      type: 'image/png',
    })

    await expect(
      owner.mutation(api.assets.registerAsset, {
        storageId,
        filename: 'avatar.png',
        mimeType: 'image/png',
        size: 9,
        scope: 'collection',
        collectionId: 'not-a-convex-id',
      }),
    ).rejects.toThrow(/collectionId must be a valid CMS collection id/i)
  })

  it('validates asset scope relationships before moving assets', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId, collectionId } = await seedEditorFixture(ctx)
    const now = Date.now()
    const otherCollectionId = await ctx.seed(
      'collections' as never,
      {
        slug: 'docs',
        label: { en: 'Docs' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/docs',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const otherStorageId = await seedStorageObject(ctx, { bytes: 'hero', type: 'image/png' })
    await ctx.seed(
      'assets' as never,
      {
        storageId: otherStorageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: 512,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'entry',
        entryId,
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

    const colocatedAssets = await owner.query(api.assets.listColocatedAssets, {
      collectionSlug: 'posts',
      entryId,
    })
    const assets = colocatedAssets.entry
    expect(assets).toHaveLength(1)
    await expect(
      owner.moveAsset({
        assetId: assets[0].id,
        scope: 'entry',
        entryId,
        collectionId: otherCollectionId as string,
      }),
    ).rejects.toThrow(/collectionId|scope/i)
  })
})

/**
 * Unit tests for the sanitizeFilename function directly — no Convex context needed.
 */
describe('filename sanitization', () => {
  // Import directly to test the pure function
  it('strips path separators and control chars', async () => {
    const { sanitizeFilename } = await import('../../packages/convex/src/lib/sanitize')
    const result = sanitizeFilename('../../etc/passwd\x00hack.txt')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    expect(result).not.toContain('\x00')
    expect(result.length).toBeGreaterThan(0)
  })

  it("returns 'unnamed' for empty input", async () => {
    const { sanitizeFilename } = await import('../../packages/convex/src/lib/sanitize')
    expect(sanitizeFilename('')).toBe('unnamed')
    expect(sanitizeFilename('   ')).toBe('unnamed')
  })

  it('truncates to 255 characters', async () => {
    const { sanitizeFilename } = await import('../../packages/convex/src/lib/sanitize')
    const long = 'a'.repeat(300)
    expect(sanitizeFilename(long)).toHaveLength(255)
  })

  it('enforces server-side asset upload MIME and size policy', async () => {
    const { validateAssetUploadPolicy } = await import('../../packages/convex/src/lib/sanitize')

    expect(() => validateAssetUploadPolicy({ mimeType: 'image/png', size: 1024 })).not.toThrow()
    expect(() => validateAssetUploadPolicy({ mimeType: 'text/html', size: 1024 })).toThrow(/MIME/)
    expect(() => validateAssetUploadPolicy({ mimeType: 'image/svg+xml', size: 1024 })).toThrow(
      /MIME/,
    )
    expect(() =>
      validateAssetUploadPolicy({ mimeType: 'image/png', size: 25 * 1024 * 1024 + 1 }),
    ).toThrow(/size/i)
  })
})
