/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { assetDiscoveryFields } from '../../packages/convex/src/assets/scope'
import { executeConfirmedOperation } from '../helpers'
import { createCtx, seedOwner, seedSettings, seedEditorFixture } from './entries/helpers'

const api = anyApi
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function testAssetDiscovery(
  filename: string,
  createdAt: number,
  options: {
    mimeType?: string
    tags?: string[]
    updatedAt?: number | null
    deletedAt?: number | null
  } = {},
) {
  return assetDiscoveryFields({
    filename,
    mimeType: options.mimeType ?? 'image/png',
    tags: options.tags ?? [],
    createdAt,
    updatedAt: options.updatedAt ?? null,
    deletedAt: options.deletedAt ?? null,
  })
}

async function seedStorageObject(
  ctx: ReturnType<typeof createCtx>,
  input: { bytes: BlobPart; type?: string },
) {
  return (await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([input.bytes], { type: input.type })),
  )) as string
}

async function finalizeStoredAsset(
  ctx: ReturnType<typeof createCtx>,
  storageId: string,
  metadata: Record<string, unknown>,
) {
  const owner = ctx.asCmsUser('owner-1')
  const session = await owner.mutation(api.assets.createAssetUploadSession, {})
  await owner.mutation(api.assets.claimAssetUploadSession, {
    sessionId: session.sessionId,
    token: session.token,
    storageId,
  })
  return await owner.action(api.assets.finalizeAssetUploadSession, {
    sessionId: session.sessionId,
    token: session.token,
    ...metadata,
  })
}

async function seedCollectionAsset(
  ctx: ReturnType<typeof createCtx>,
  input: { createdBy?: string; collection?: string; filename?: string } = {},
) {
  const filename = input.filename ?? 'staged.png'
  const createdAt = Date.now()
  const storageId = await seedStorageObject(ctx, { bytes: filename, type: 'image/png' })
  return await ctx.seed(
    'assets' as never,
    {
      storageId,
      filename,
      mimeType: 'image/png',
      size: filename.length,
      sha256: 'a'.repeat(64),
      width: 1,
      height: 1,
      frames: 1,
      alt: null,
      caption: null,
      scope: 'collection',
      entryId: null,
      collection: input.collection ?? 'posts',
      tags: [],
      createdBy: input.createdBy ?? 'owner-1',
      updatedBy: null,
      createdAt,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      ...testAssetDiscovery(filename, createdAt),
    } as never,
  )
}

type CmsUserClient = ReturnType<ReturnType<typeof createCtx>['asCmsUser']>

async function listManagerAssets(owner: CmsUserClient, args: Record<string, unknown> = {}) {
  const page = await owner.query(api.assets.getAssetManagerData, {
    paginationOpts: { cursor: null, numItems: 100 },
    ...args,
  })
  return page.page
}

async function verifyCanonicalAssetReferences(ctx: ReturnType<typeof createCtx>, runId: string) {
  const owner = ctx.asCmsUser('owner-1')
  let status = await owner.mutation(api.entries.projectionMaintenance.startProjectionRepairRun, {
    runId,
    pageSize: 25,
    autoContinue: false,
  })
  let pages = 0
  while (status.state === 'running') {
    pages += 1
    if (pages > 100) throw new Error('Projection/reference verification did not terminate.')
    if (!status.workToken) throw new Error('Projection/reference verification has no lease token.')
    await ctx.raw.mutation(api.entries.projectionMaintenance.processProjectionRepairPage, {
      runId: status.runId,
      generation: status.generation,
      workGeneration: status.workGeneration,
      token: status.workToken,
      expectedPhase: status.phase,
      expectedCursor: status.cursor,
    })
    status = await owner.query(api.entries.projectionMaintenance.getProjectionRepairRun, { runId })
  }
  expect(status).toMatchObject({ state: 'complete', issueCount: 0 })
  return status
}

describe('asset management', () => {
  it('claims staged collection assets in the entry-creation transaction', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const assetId = await seedCollectionAsset(ctx)

    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'atomic-assets',
      localized: { title: 'Atomic assets' },
      stagedAssetIds: [assetId],
    })

    const storedAsset = (await ctx.readAll('assets')).find((row) => row._id === assetId)
    expect(storedAsset).toMatchObject({
      scope: 'entry',
      collection: 'posts',
      entryId,
      updatedBy: 'owner-1',
    })
  })

  it('rolls back entry creation and every staged claim when one asset is invalid', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const validAssetId = await seedCollectionAsset(ctx, { filename: 'valid.png' })
    const invalidAssetId = await seedCollectionAsset(ctx, {
      filename: 'foreign.png',
      createdBy: 'another-user',
    })
    const entriesBefore = await ctx.readAll('entries')

    await expect(
      owner.createEntry({
        collection: 'posts',
        slug: 'must-roll-back',
        localized: { title: 'Must roll back' },
        stagedAssetIds: [validAssetId, invalidAssetId],
      }),
    ).rejects.toThrow(/staged asset/i)

    expect(await ctx.readAll('entries')).toEqual(entriesBefore)
    expect((await ctx.readAll('assets')).find((row) => row._id === validAssetId)).toMatchObject({
      scope: 'collection',
      collection: 'posts',
      entryId: null,
    })
  })

  it('rejects a staged asset from another collection', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const assetId = await seedCollectionAsset(ctx, { collection: 'docs' })

    await expect(
      owner.createEntry({
        collection: 'posts',
        slug: 'wrong-collection',
        localized: { title: 'Wrong collection' },
        stagedAssetIds: [assetId],
      }),
    ).rejects.toThrow(/staged asset/i)

    expect((await ctx.readAll('assets')).find((row) => row._id === assetId)).toMatchObject({
      scope: 'collection',
      collection: 'docs',
      entryId: null,
    })
  })

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
        collection: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
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
      collection: null,
      ownerPath: ['Global'],
    })
  })

  it('[AST-03] stores normalized asset metadata once and records only redacted field-level audit evidence', async () => {
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
        collection: null,
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
    expect(await ctx.readAll('activity')).toEqual([
      expect.objectContaining({
        kind: 'asset.updated',
        appIdentityId: 'owner-1',
        detail: { fields: ['alt', 'caption', 'tags'] },
      }),
    ])
    expect(JSON.stringify(await ctx.readAll('activity'))).not.toContain('Hero banner')
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
        collection: null,
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
        collection: null,
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
    const { entryId, collection } = await seedEditorFixture(ctx)

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
        collection,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    const entryAssetsPage = await owner.query(api.assets.listAssetsByOwner, {
      scope: 'entry',
      collection: 'posts',
      entryId,
      paginationOpts: { cursor: null, numItems: 100 },
    })
    const entryAssets = entryAssetsPage.page
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
        collection: null,
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

  it('[AST-05][AST-07] derives usage, blocks unconfirmed in-use trash, and restores the same asset identity with audit evidence', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)

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
        collection,
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
    expect(await ctx.readAll('contentAssetRefs')).toMatchObject([
      {
        sourceKind: 'draft',
        assetId,
        entryId,
        collection,
        fieldPath: 'hero',
        locale: null,
      },
    ])

    const browserAssets = await owner.query(api.assets.getAssetManagerData, {
      paginationOpts: { cursor: null, numItems: 100 },
    })
    expect(browserAssets.page).toHaveLength(1)
    expect(browserAssets.page[0]?.referenceCertainty).toMatchObject({
      state: 'used',
      proofCurrent: false,
    })
    expect(browserAssets.page[0]).not.toHaveProperty('usages')
    expect(browserAssets.page[0]?.tags).toEqual(['hero'])

    const usagePage = await owner.query(api.assets.listAssetUsages, {
      assetId: assetId as string,
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(usagePage.page).toEqual([
      expect.objectContaining({
        sourceKind: 'draft',
        entryId,
        entryTitle: 'Hello world',
        fieldPath: 'hero',
      }),
    ])

    const blockedPreview = await owner.mutation(api.assets.previewDeleteAssetOperation, {
      assetId: assetId as string,
    })
    expect(blockedPreview).toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-in-use' })],
    })
    const forcedPreview = await owner.mutation(api.assets.previewDeleteAssetOperation, {
      assetId: assetId as string,
      force: true,
    })
    expect(forcedPreview).toMatchObject({
      allowed: true,
      warnings: [expect.objectContaining({ code: 'forced-delete' })],
    })

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

    const trashedAssets = await owner.query(api.assets.getAssetManagerData, {
      paginationOpts: { cursor: null, numItems: 100 },
    })
    expect(trashedAssets.page[0]?.deletedAt).toBeTypeOf('number')
    await expect(
      ctx.raw.run(async (innerCtx) => (await innerCtx.storage.get(storageId as never)) !== null),
    ).resolves.toBe(true)

    await owner.mutation(api.assets.restoreAsset, {
      assetId: assetId as string,
    })

    const restoredAssets = await listManagerAssets(owner, { deleted: 'active' })
    expect(restoredAssets).toHaveLength(1)
    expect(restoredAssets[0]?.id).toBe(assetId)
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'asset.trashed', appIdentityId: 'owner-1' }),
        expect.objectContaining({ kind: 'asset.restored', appIdentityId: 'owner-1' }),
      ]),
    )
  })

  it('[AST-02] server-paginates complete-library search, metadata filters, views, and sort without loss', async () => {
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
        collection: null,
        tags: ['marketing'],
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
        size: 200_000,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collection: null,
        tags: ['reports'],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now - 691_200_000,
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
        collection: null,
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
        time: '7d',
        size: 'small',
        location: 'global',
        sort: 'size',
        deleted: 'active',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ filename: 'hero-alpha.png' })],
      isDone: true,
    })

    await expect(
      owner.query(api.assets.getAssetManagerData, {
        size: 'medium',
        sort: 'size',
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
          collection: null,
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

  it('binds asset cursors to filters and rejects stale cursor anchors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, {
      bytes: 'cursor-search',
      type: 'image/png',
    })
    for (let index = 0; index < 2; index += 1) {
      await ctx.raw.run(async (innerCtx) => {
        await innerCtx.db.insert('assets', {
          storageId: storageId as never,
          filename: `cursor-needle-${index}.png`,
          mimeType: 'image/png',
          size: 13,
          sha256: '0'.repeat(64),
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collection: null,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt: index,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          ...testAssetDiscovery(`cursor-needle-${index}.png`, index),
        })
      })
    }

    const first = await owner.query(api.assets.getAssetManagerData, {
      search: 'cursor-needle',
      kind: 'all',
      deleted: 'active',
      usage: 'all',
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(first.continueCursor).toEqual(expect.any(String))

    await expect(
      owner.query(api.assets.getAssetManagerData, {
        search: 'cursor-needle',
        kind: 'image',
        deleted: 'active',
        usage: 'all',
        paginationOpts: { cursor: first.continueCursor, numItems: 1 },
      }),
    ).rejects.toThrow(/cursor.*query/i)

    await ctx.raw.run(async (innerCtx) => {
      const assetId = innerCtx.db.normalizeId('assets', first.page[0]!.id)
      if (!assetId) throw new Error('Expected a valid cursor asset id.')
      await innerCtx.db.delete(assetId)
    })
    await expect(
      owner.query(api.assets.getAssetManagerData, {
        search: 'cursor-needle',
        kind: 'all',
        deleted: 'active',
        usage: 'all',
        paginationOpts: { cursor: first.continueCursor, numItems: 1 },
      }),
    ).rejects.toThrow(/cursor.*stale/i)
  })

  it('[AST-02] pages the target 500 entry-owned assets without loss or duplication', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'shared-bytes', type: 'image/png' })
    const createdAt = Date.now()

    await ctx.raw.run(async (innerCtx) => {
      for (let index = 0; index < 500; index += 1) {
        await innerCtx.db.insert('assets', {
          storageId: storageId as never,
          filename: `entry-asset-${index.toString().padStart(3, '0')}.png`,
          mimeType: 'image/png',
          size: 12,
          sha256: '0'.repeat(64),
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'entry',
          entryId: entryId as never,
          collection,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          ...testAssetDiscovery(`entry-asset-${index.toString().padStart(3, '0')}.png`, createdAt),
        })
      }
    })

    const seen = new Set<string>()
    let cursor: string | null = null
    do {
      const page = await owner.query(api.assets.listAssetsByOwner, {
        scope: 'entry',
        collection,
        entryId,
        paginationOpts: { cursor, numItems: 37 },
      })
      for (const asset of page.page) {
        expect(seen.has(asset.id)).toBe(false)
        seen.add(asset.id)
      }
      cursor = page.continueCursor
    } while (cursor)

    expect(seen.size).toBe(500)
    expect(cursor).toBe('')

    const searchSeen = new Set<string>()
    cursor = null
    do {
      const page = await owner.query(api.assets.getAssetManagerData, {
        search: 'entry-asset',
        deleted: 'active',
        paginationOpts: { cursor, numItems: 37 },
      })
      for (const asset of page.page) {
        expect(searchSeen.has(asset.id)).toBe(false)
        searchSeen.add(asset.id)
      }
      cursor = page.continueCursor
    } while (cursor)

    expect(searchSeen.size).toBe(500)
    expect(cursor).toBe('')
  })

  it('rejects discovery above the documented 500-asset envelope before paging', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'limit', type: 'image/png' })

    await ctx.raw.run(async (innerCtx) => {
      for (let index = 0; index < 501; index += 1) {
        const filename = `over-limit-${index.toString().padStart(3, '0')}.png`
        await innerCtx.db.insert('assets', {
          storageId: storageId as never,
          filename,
          mimeType: 'image/png',
          size: 5,
          sha256: index.toString(16).padStart(64, '0'),
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collection: null,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt: index,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          ...testAssetDiscovery(filename, index),
        })
      }
    })

    await expect(
      owner.query(api.assets.getAssetManagerData, {
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).rejects.toThrow(/at most 500 assets/i)
  })

  it('[AST-05] pages canonical draft and public asset usages lazily without loss', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'usage-bytes', type: 'image/png' })
    const assetId = await ctx.seed('assets' as never, {
      storageId,
      filename: 'usage-target.png',
      mimeType: 'image/png',
      size: 11,
      width: 1,
      height: 1,
      alt: null,
      caption: null,
      scope: 'entry',
      entryId,
      collection,
      tags: [],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt: Date.now(),
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })

    await ctx.raw.run(async (innerCtx) => {
      for (let index = 0; index < 205; index += 1) {
        await innerCtx.db.insert('contentAssetRefs', {
          sourceKind: 'draft',
          sourceId: `draft-source-${index}`,
          sourceFence: { kind: 'draftVersion', version: 1 },
          assetId: assetId as string,
          fieldPath: `gallery[${index}]`,
          locale: 'en',
          entryId: entryId as never,
          collection,
        })
      }
    })

    const seen = new Set<string>()
    let cursor: string | null = null
    do {
      const page = await owner.query(api.assets.listAssetUsages, {
        assetId: assetId as string,
        paginationOpts: { cursor, numItems: 31 },
      })
      for (const usage of page.page) {
        expect(seen.has(usage.sourceId)).toBe(false)
        seen.add(usage.sourceId)
      }
      cursor = page.continueCursor
    } while (cursor)

    expect(seen.size).toBe(205)
    expect(cursor).toBe('')
  })

  it('[AST-02] finds an asset beyond the first manager page through the filename index', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'search-bytes', type: 'image/png' })

    await ctx.raw.run(async (innerCtx) => {
      for (let index = 0; index < 499; index += 1) {
        await innerCtx.db.insert('assets', {
          storageId: storageId as never,
          filename: `noise-${index}.png`,
          mimeType: 'image/png',
          size: 12,
          sha256: '0'.repeat(64),
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collection: null,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt: index + 1,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          ...testAssetDiscovery(`noise-${index}.png`, index + 1),
        })
      }
      await innerCtx.db.insert('assets', {
        storageId: storageId as never,
        filename: 'needle-deep.png',
        mimeType: 'image/png',
        size: 12,
        sha256: '0'.repeat(64),
        width: 1,
        height: 1,
        frames: 1,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collection: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: 0,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
        ...testAssetDiscovery('needle-deep.png', 0),
      })
    })

    const result = await owner.query(api.assets.getAssetManagerData, {
      search: 'needle',
      deleted: 'active',
      paginationOpts: { cursor: null, numItems: 20 },
    })

    expect(result.page.map((asset: { filename: string }) => asset.filename)).toEqual([
      'needle-deep.png',
    ])
  })

  it('[AST-02][AST-05] filters the complete manager result before paging a sparse usage match', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'filter-bytes', type: 'image/png' })
    const targetAssetId = await ctx.raw.run(async (innerCtx) => {
      for (let index = 0; index < 125; index += 1) {
        await innerCtx.db.insert('assets', {
          storageId: storageId as never,
          filename: `unused-${index}.png`,
          mimeType: 'image/png',
          size: 12,
          sha256: '0'.repeat(64),
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collection: null,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt: index + 1,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          ...testAssetDiscovery(`unused-${index}.png`, index + 1),
        })
      }
      return await innerCtx.db.insert('assets', {
        storageId: storageId as never,
        filename: 'referenced-deep.png',
        mimeType: 'image/png',
        size: 12,
        sha256: '0'.repeat(64),
        width: 1,
        height: 1,
        frames: 1,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collection: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: 0,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
        ...testAssetDiscovery('referenced-deep.png', 0),
      })
    })
    await ctx.seed('contentAssetRefs' as never, {
      sourceKind: 'draft',
      sourceId: 'deep-reference-source',
      sourceFence: { kind: 'draftVersion', version: 1 },
      assetId: targetAssetId as string,
      fieldPath: 'hero',
      locale: 'en',
      entryId,
      collection,
    })

    const page = await owner.query(api.assets.getAssetManagerData, {
      usage: 'used',
      deleted: 'active',
      paginationOpts: { cursor: null, numItems: 20 },
    })

    expect(page).toMatchObject({
      isDone: true,
      continueCursor: '',
      page: [expect.objectContaining({ filename: 'referenced-deep.png' })],
    })
  })

  it('keeps exact keyset boundaries after indexed tag filtering and server sorting', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'tag-page', type: 'image/png' })
    const createdAt = Date.now()

    await ctx.raw.run(async (innerCtx) => {
      for (let index = 0; index < 41; index += 1) {
        const filename = `tag-boundary-${index.toString().padStart(2, '0')}.png`
        const tags = index % 2 === 0 ? ['keep'] : ['skip']
        await innerCtx.db.insert('assets', {
          storageId: storageId as never,
          filename,
          mimeType: 'image/png',
          size: index + 1,
          sha256: index.toString(16).padStart(64, '0'),
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collection: null,
          tags,
          createdBy: 'owner-1',
          updatedBy: null,
          createdAt,
          updatedAt: null,
          deletedAt: null,
          deletedBy: null,
          ...assetDiscoveryFields({
            filename,
            mimeType: 'image/png',
            tags,
            createdAt,
            updatedAt: null,
            deletedAt: null,
          }),
        })
      }
    })

    const filenames: string[] = []
    const pageSizes: number[] = []
    let cursor: string | null = null
    do {
      const page = await owner.query(api.assets.getAssetManagerData, {
        tag: 'keep',
        sort: 'name',
        deleted: 'active',
        paginationOpts: { cursor, numItems: 7 },
      })
      pageSizes.push(page.page.length)
      filenames.push(...page.page.map((asset: { filename: string }) => asset.filename))
      cursor = page.continueCursor
    } while (cursor)

    expect(pageSizes).toEqual([7, 7, 7])
    expect(filenames).toEqual(
      Array.from(
        { length: 21 },
        (_, index) => `tag-boundary-${(index * 2).toString().padStart(2, '0')}.png`,
      ),
    )
    expect(new Set(filenames).size).toBe(21)
  })

  it('[AST-05][AST-07] never calls an unverified reference result unused or permits unproved trash', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'certainty', type: 'image/png' })
    const assetId = await ctx.seed('assets' as never, {
      storageId,
      filename: 'certainty.png',
      mimeType: 'image/png',
      size: 9,
      width: 1,
      height: 1,
      alt: null,
      caption: null,
      scope: 'global',
      entryId: null,
      collection: null,
      tags: [],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt: Date.now(),
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })

    const before = await owner.query(api.assets.getAssetManagerData, {
      usage: 'unknown-stale',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(before.page).toEqual([
      expect.objectContaining({
        id: assetId,
        referenceCertainty: expect.objectContaining({
          state: 'unknown-stale',
          proofCurrent: false,
        }),
      }),
    ])
    const blockedTrash = await owner.mutation(api.assets.previewDeleteAssetOperation, {
      assetId: assetId as string,
    })
    expect(blockedTrash).toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-reference-verification-required' })],
    })

    await verifyCanonicalAssetReferences(ctx, 'asset-certainty-proof')
    const after = await owner.query(api.assets.getAssetManagerData, {
      usage: 'unused-verified',
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(after.page).toEqual([
      expect.objectContaining({
        id: assetId,
        referenceCertainty: expect.objectContaining({
          state: 'unused-verified',
          proofCurrent: true,
          verifiedRunId: 'asset-certainty-proof',
        }),
      }),
    ])
  })

  it('[AST-07] lets the owner undo a finalized upload without weakening ordinary stale-proof guards', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'upload undo', type: 'image/png' })
    const assetId = await ctx.seed('assets' as never, {
      storageId,
      filename: 'upload-undo.png',
      mimeType: 'image/png',
      size: 11,
      width: 1,
      height: 1,
      alt: null,
      caption: null,
      scope: 'global',
      entryId: null,
      collection: null,
      tags: [],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt: Date.now(),
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })
    await ctx.seed('assetUploadSessions' as never, {
      sessionId: 'asset_upload_undo',
      ownerId: 'owner-1',
      tokenHash: 'token-hash',
      state: 'finalized',
      generation: 3,
      assetId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      finalizedAt: Date.now(),
    })

    const preview = await owner.mutation(api.assets.previewDeleteAssetOperation, {
      assetId: assetId as string,
    })
    expect(preview).toMatchObject({
      allowed: true,
      blockers: [],
      warnings: [expect.objectContaining({ code: 'recent-upload-undo' })],
    })

    await expect(
      owner.mutation(api.assets.deleteAssetOperationExecute, {
        assetId: assetId as string,
        _confirmationToken: preview.confirmation?.token,
      }),
    ).resolves.toMatchObject({ status: 'applied', value: null })
    expect((await ctx.readAll('assets'))[0]?.deletedAt).toBeTypeOf('number')
  })

  it('[AST-07] recomputes reference blockers when a trash confirmation executes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await seedStorageObject(ctx, { bytes: 'guarded', type: 'image/png' })
    const assetId = await ctx.seed('assets' as never, {
      storageId,
      filename: 'guarded.png',
      mimeType: 'image/png',
      size: 7,
      width: 1,
      height: 1,
      alt: null,
      caption: null,
      scope: 'entry',
      entryId,
      collection,
      tags: [],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt: Date.now(),
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })
    await verifyCanonicalAssetReferences(ctx, 'asset-trash-current-proof')
    const args = { assetId: assetId as string }
    const preview = await owner.mutation(api.assets.previewDeleteAssetOperation, args)
    expect(preview.allowed).toBe(true)
    expect(preview.confirmation?.token).toBeTypeOf('string')

    await ctx.seed('contentAssetRefs' as never, {
      sourceKind: 'draft',
      sourceId: 'new-draft-source',
      sourceFence: { kind: 'draftVersion', version: 1 },
      assetId: assetId as string,
      fieldPath: 'hero',
      locale: 'en',
      entryId,
      collection,
    })

    const result = await owner.mutation(api.assets.deleteAssetOperationExecute, {
      ...args,
      _confirmationToken: preview.confirmation?.token,
    })
    expect(result).toMatchObject({ status: 'stale', code: 'OPERATION_NO_LONGER_ALLOWED' })
    expect((await ctx.readAll('assets'))[0]?.deletedAt).toBeNull()
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
        collection: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const pageArgs = { paginationOpts: { cursor: null, numItems: 100 } }
    await expect(owner.query(api.assets.getAssetManagerData, pageArgs)).resolves.toMatchObject({
      page: [expect.objectContaining({ filename: 'hero.png' })],
    })
    await expect(viewer.query(api.assets.getAssetManagerData, pageArgs)).rejects.toThrow(
      /forbidden/i,
    )
  })

  it('rejects missing storage objects during asset registration', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'missing', type: 'image/png' })
    await ctx.raw.run(async (innerCtx) => await innerCtx.storage.delete(storageId as never))

    await expect(
      finalizeStoredAsset(ctx, storageId, {
        filename: 'missing.png',
        scope: 'global',
      }),
    ).rejects.toThrow(/storage|not found/i)
  })

  it('rejects storage objects without server MIME metadata', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'payload' })

    await expect(
      finalizeStoredAsset(ctx, storageId, {
        filename: 'payload.png',
        scope: 'global',
      }),
    ).rejects.toThrow(/mime|unsupported/i)

    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('registers only server-verified image facts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: validPng, type: 'image/png' })
    const assetId = await finalizeStoredAsset(ctx, storageId, {
      filename: 'verified.png',
      scope: 'global',
    })

    expect(await ctx.readAll('assets')).toEqual([
      expect.objectContaining({
        _id: assetId,
        storageId,
        mimeType: 'image/png',
        size: validPng.length,
        width: 1,
        height: 1,
        frames: 1,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ])
  })

  it('rejects a claimed MIME mismatch without creating an asset', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: validPng, type: 'image/jpeg' })

    await expect(
      finalizeStoredAsset(ctx, storageId, {
        filename: 'forged.jpg',
        scope: 'global',
      }),
    ).rejects.toThrow(/does not match/i)
    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('updates draft asset references when an entry field selects a replacement asset', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const now = Date.now()
    const firstStorageId = await seedStorageObject(ctx, { bytes: 'first', type: 'image/png' })
    const secondStorageId = await seedStorageObject(ctx, { bytes: 'second', type: 'image/png' })
    const firstAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: firstStorageId,
        filename: 'first.png',
        mimeType: 'image/png',
        size: 5,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'entry',
        entryId,
        collection,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const secondAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: secondStorageId,
        filename: 'second.png',
        mimeType: 'image/png',
        size: 6,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'entry',
        entryId,
        collection,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          shared: { hero: firstAssetId },
        },
      },
    })
    expect(await ctx.readAll('contentAssetRefs')).toMatchObject([
      {
        sourceKind: 'draft',
        assetId: firstAssetId,
        entryId,
        fieldPath: 'hero',
      },
    ])

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: {
        shared: {
          shared: { hero: secondAssetId },
        },
      },
    })
    expect(await ctx.readAll('contentAssetRefs')).toMatchObject([
      {
        sourceKind: 'draft',
        assetId: secondAssetId,
        entryId,
        fieldPath: 'hero',
      },
    ])
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
        collection: null,
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
      collection: 'posts',
    })

    const assetsPage = await owner.query(api.assets.listAssetsByOwner, {
      scope: 'collection',
      collection: 'posts',
      paginationOpts: { cursor: null, numItems: 100 },
    })
    const assets = assetsPage.page
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
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, {
      bytes: validPng,
      type: 'image/png',
    })

    await expect(
      finalizeStoredAsset(ctx, storageId, {
        filename: 'avatar.png',
        scope: 'collection',
        collection: 'not-a-collection',
      }),
    ).rejects.toThrow(/not present in the installed CMS contract/i)
  })

  it('validates asset scope relationships before moving assets', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collection } = await seedEditorFixture(ctx)
    const now = Date.now()

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
        collection,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )

    const assetsPage = await owner.query(api.assets.listAssetsByOwner, {
      scope: 'entry',
      collection: 'posts',
      entryId,
      paginationOpts: { cursor: null, numItems: 100 },
    })
    const assets = assetsPage.page
    expect(assets).toHaveLength(1)
    await expect(
      owner.moveAsset({
        assetId: assets[0].id,
        scope: 'entry',
        entryId,
        collection: 'docs',
      }),
    ).rejects.toThrow(/collection|scope/i)
  })

  it('requires an exact owner scope for owner asset pagination', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.query(api.assets.listAssetsByOwner, {
        scope: 'collection',
        entryId: 'not-an-entry',
        collection: 'posts',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow(/scope|collection/i)
    await expect(
      owner.query(api.assets.listAssetsByOwner, {
        scope: 'global',
        collection: 'posts',
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow(/global|scope/i)
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
