/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { decodeBackupArchive } from '../../packages/convex/src/backup'
import { executeConfirmedOperation } from '../helpers'
import { createCtx, seedOwner } from './entries/helpers'

const api = anyApi

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function archiveFixture(overrides: Record<string, unknown> = {}) {
  const bytes = 'asset bytes'
  const bytesSha256 = sha256(bytes)
  return JSON.stringify({
    format: 'ginko-cms-asset-recovery',
    version: 1,
    exportedAt: 1,
    asset: {
      originalAssetId: 'asset-1',
      filename: 'asset.txt',
      mimeType: 'text/plain',
      size: bytes.length,
      sha256: bytesSha256,
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
      createdAt: 1,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    },
    manifest: {
      byteSize: bytes.length,
      bytesSha256,
      assetSha256: 'a'.repeat(64),
      assetUpdatedAt: 1,
    },
    bytesBase64: Buffer.from(bytes).toString('base64'),
    ...overrides,
  })
}

describe('asset recovery archive trust boundary', () => {
  it('accepts only the asset recovery format', () => {
    expect(decodeBackupArchive(archiveFixture())).toMatchObject({
      format: 'ginko-cms-asset-recovery',
      version: 1,
      manifest: { byteSize: 11 },
    })
    expect(() =>
      decodeBackupArchive(JSON.stringify({ version: 2, scope: { scope: 'snapshot' } })),
    ).toThrow(/format is unsupported/i)
  })

  it('rejects incomplete, inconsistent, and corrupt byte manifests', () => {
    const missing = JSON.parse(archiveFixture())
    delete missing.asset.sha256
    expect(() => decodeBackupArchive(JSON.stringify(missing))).toThrow(/sha256.*invalid/i)

    const mismatched = JSON.parse(archiveFixture())
    mismatched.manifest.byteSize += 1
    expect(() => decodeBackupArchive(JSON.stringify(mismatched))).toThrow(/inconsistent/i)

    const corrupt = JSON.parse(archiveFixture())
    corrupt.bytesBase64 = 'not base64'
    expect(() => decodeBackupArchive(JSON.stringify(corrupt))).toThrow(/malformed asset bytes/i)
  })
})

async function seedAsset(ctx: ReturnType<typeof createCtx>, bytes: string, now = Date.now()) {
  const storageId = await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([bytes], { type: 'text/plain' })),
  )
  const assetId = await ctx.raw.run(
    async (innerCtx) =>
      await innerCtx.db.insert('assets', {
        storageId,
        filename: 'asset.txt',
        mimeType: 'text/plain',
        size: Buffer.byteLength(bytes),
        sha256: sha256(bytes),
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
        createdAt: now,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      }),
  )
  return { assetId: String(assetId), storageId }
}

async function exportAsset(ctx: ReturnType<typeof createCtx>, assetId: string) {
  return await ctx.asCmsUser('owner-1').action(api.backup.exportBackup, {
    scope: 'asset',
    assetId,
  })
}

describe('verified asset recovery', () => {
  it('exports, verifies, purges, and restores byte-identical asset data', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'restorable asset bytes')
    const owner = ctx.asCmsUser('owner-1')
    const exported = await exportAsset(ctx, source.assetId)

    expect(exported).toMatchObject({
      artifactId: expect.stringMatching(/^asset_recovery_/),
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      counts: { entries: 0, revisions: 0, assets: 1, members: 0 },
    })
    await expect(
      owner.action(api.backup.verifyBackup, { artifactId: exported.artifactId }),
    ).resolves.toMatchObject({ ok: true, checksumMatches: true, currentDataMatches: true })

    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.purge-asset',
      preview: api.assets.previewPurgeAssetOperation,
      execute: api.assets.purgeAsset,
      args: { assetId: source.assetId, exportArtifactId: exported.artifactId },
    })
    expect(
      await ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(source.storageId)),
    ).toBeNull()

    await expect(
      owner.action(api.backup.previewRestoreBackup, { artifactId: exported.artifactId }),
    ).resolves.toMatchObject({ applySupported: true, blockers: [] })
    const restored = await owner.action(api.backup.restoreBackup, {
      artifactId: exported.artifactId,
      expectedChecksum: exported.checksum,
    })
    expect(restored).toMatchObject({
      originalAssetId: source.assetId,
      restored: { assets: 1 },
    })
    expect(restored.restoredAssetId).not.toBe(source.assetId)
    const asset = await ctx.raw.run(async (innerCtx) => {
      const assetId = innerCtx.db.normalizeId('assets', restored.restoredAssetId)
      return assetId ? await innerCtx.db.get(assetId) : null
    })
    expect(asset).not.toBeNull()
    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = asset ? await innerCtx.storage.get(asset.storageId) : null
        return blob ? await blob.text() : null
      }),
    ).toBe('restorable asset bytes')
  })

  it('blocks purge after asset metadata changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    const exported = await exportAsset(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.assets.updateAsset, {
      assetId: source.assetId,
      filename: 'changed.txt',
    })

    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      exportArtifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers[0]?.code).toBe('backup-stale-for-purge')
  })

  it('blocks referenced asset purge even with a current artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    const now = Date.now()
    const entryId = await ctx.raw.run(
      async (innerCtx) =>
        await innerCtx.db.insert('entries', {
          collection: 'posts',
          stableId: 'entry-1',
          lifecycle: 'active',
          slug: 'entry-1',
          parentEntryId: null,
          orderRank: 'a0',
          nodeKind: 'page',
          shared: {},
          draftVersion: 1,
          sharedVersion: 1,
          activePublications: [],
          latestEditorialRevisionId: null,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: now,
          updatedAt: now,
        }),
    )
    await ctx.raw.run(
      async (innerCtx) =>
        await innerCtx.db.insert('contentAssetRefs', {
          sourceKind: 'draft',
          sourceId: `${entryId}:en`,
          assetId: source.assetId,
          fieldPath: 'hero',
          locale: 'en',
          entryId,
          collection: 'posts',
          updatedAt: now,
        }),
    )
    const exported = await exportAsset(ctx, source.assetId)
    const preview = await ctx
      .asCmsUser('owner-1')
      .mutation(api.assets.previewPurgeAssetOperation, {
        assetId: source.assetId,
        exportArtifactId: exported.artifactId,
      })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers[0]?.code).toBe('asset-in-use')
  })

  it('detects a missing recovery artifact storage object', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    const exported = await exportAsset(ctx, source.assetId)
    const [artifact] = await ctx.raw.run(
      async (innerCtx) => await innerCtx.db.query('backupArtifacts').collect(),
    )
    await ctx.raw.run(async (innerCtx) => await innerCtx.storage.delete(artifact!.storageRef))

    await expect(
      ctx.asCmsUser('owner-1').action(api.backup.verifyBackup, {
        artifactId: exported.artifactId,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'BACKUP_STORAGE_MISSING',
    )
  })
})
