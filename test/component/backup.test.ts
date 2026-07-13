/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { decodeBackupArchive } from '../../packages/convex/src/backup'
import { executeConfirmedOperation } from '../helpers'
import { createCtx, seedEditorFixture, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi

function emptyArchive(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 2,
    exportedAt: 1,
    scope: { scope: 'snapshot' },
    dataChecksum: '0'.repeat(64),
    counts: { entries: 0, revisions: 0, assets: 0, members: 0 },
    manifest: {
      cmsSchemaVersion: '0.2',
      packageVersion: '0.2.0-rc.1',
      contractHashes: [],
      tables: [],
      rowCounts: {},
      dataBytes: 2,
      assetBytes: 0,
    },
    data: {},
    assetBytes: {},
    ...overrides,
  })
}

describe('backup archive trust boundary', () => {
  it('accepts the strict empty archive shape', () => {
    expect(decodeBackupArchive(emptyArchive())).toMatchObject({ version: 2 })
  })

  it('rejects unsupported schemas and unknown tables', () => {
    const wrongSchema = JSON.parse(emptyArchive())
    wrongSchema.manifest.cmsSchemaVersion = '0.1'
    expect(() => decodeBackupArchive(JSON.stringify(wrongSchema))).toThrow(/manifest/i)

    const unknownTable = JSON.parse(emptyArchive())
    unknownTable.data.shellCommands = []
    unknownTable.manifest.tables = ['shellCommands']
    unknownTable.manifest.rowCounts = { shellCommands: 0 }
    unknownTable.manifest.dataBytes = JSON.stringify({ shellCommands: [] }).length
    expect(() => decodeBackupArchive(JSON.stringify(unknownTable))).toThrow(/unknown table/i)
  })

  it('rejects malformed rows and dishonest byte counts', () => {
    const malformed = JSON.parse(emptyArchive())
    malformed.data.entries = [null]
    malformed.manifest.tables = ['entries']
    malformed.manifest.rowCounts = { entries: 1 }
    malformed.manifest.dataBytes = JSON.stringify({ entries: [null] }).length
    malformed.counts.entries = 1
    expect(() => decodeBackupArchive(JSON.stringify(malformed))).toThrow(/malformed row/i)

    const dishonest = JSON.parse(emptyArchive())
    dishonest.manifest.dataBytes = 20 * 1024 * 1024 + 1
    expect(() => decodeBackupArchive(JSON.stringify(dishonest))).toThrow(/byte count|size/i)
  })
})

async function seedStorageObject(
  ctx: ReturnType<typeof createCtx>,
  input: { bytes: string; type?: string },
) {
  return (await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([input.bytes], { type: input.type })),
  )) as string
}

describe('backup export and purge gating', () => {
  it('exports and verifies a full backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, { scope: 'snapshot' })

    expect(exported.artifactId).toMatch(/^backup_/)
    expect(exported.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(exported.counts.entries).toBe(1)
    expect(exported.counts.members).toBe(1)

    const artifacts = await ctx.readAll('backupArtifacts')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      artifactId: exported.artifactId,
      scope: 'snapshot',
      checksum: exported.checksum,
      driver: 'convex-storage-json',
    })

    await expect(
      owner.action(api.backup.verifyBackup, { artifactId: exported.artifactId }),
    ).resolves.toMatchObject({
      ok: true,
      checksumMatches: true,
      currentDataMatches: true,
    })
  })

  it('detects current data drift when verifying an old backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const fixture = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'entry',
      entryId: fixture.entryId,
    })

    await owner.saveEntryDraft({
      entryId: fixture.entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: { title: 'Changed after backup' },
          },
        },
      },
    })

    await expect(
      owner.action(api.backup.verifyBackup, { artifactId: exported.artifactId }),
    ).resolves.toMatchObject({
      ok: false,
      checksumMatches: true,
      currentDataMatches: false,
    })
  })

  it('deletes a backup artifact and its stored archive through a confirmed operation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, { scope: 'snapshot' })
    const [artifactBefore] = await ctx.readAll('backupArtifacts')
    expect(artifactBefore?.artifactId).toBe(exported.artifactId)
    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = await innerCtx.storage.get(artifactBefore.storageRef)
        return blob !== null
      }),
    ).toBe(true)

    const preview = await owner.mutation(api.backup.previewDeleteBackupArtifactOperation, {
      artifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(true)
    expect(preview.warnings[0]?.code).toBe('backup-artifact-delete')

    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.delete-backup-artifact',
      preview: api.backup.previewDeleteBackupArtifactOperation,
      execute: api.backup.deleteBackupArtifactOperationExecute,
      args: { artifactId: exported.artifactId },
    })

    expect(await ctx.readAll('backupArtifacts')).toEqual([])
    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = await innerCtx.storage.get(artifactBefore.storageRef)
        return blob !== null
      }),
    ).toBe(false)
    await expect(
      owner.action(api.backup.verifyBackup, { artifactId: exported.artifactId }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'BACKUP_NOT_FOUND')
  })

  it('rejects asset purge without a matching backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'asset bytes', type: 'text/plain' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'file.txt',
        mimeType: 'text/plain',
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
        createdAt: Date.now(),
        updatedAt: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    await expect(
      owner.mutation(api.assets.purgeAsset, {
        assetId: assetId as string,
        exportArtifactId: 'missing',
      }),
    ).rejects.toThrow(/requires confirmation/i)

    const missingPreview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: assetId as string,
      exportArtifactId: 'missing',
    })
    expect(missingPreview.allowed).toBe(false)
    expect(missingPreview.blockers[0]?.code).toBe('backup-not-found')

    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'asset',
      assetId: assetId as string,
    })
    await expect(
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.purge-asset',
        preview: api.assets.previewPurgeAssetOperation,
        execute: api.assets.purgeAsset,
        args: {
          assetId: assetId as string,
          exportArtifactId: exported.artifactId,
        },
      }),
    ).resolves.toBeNull()
    expect(await ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(storageId))).toBeNull()
  })

  it('rejects asset purge with a stale backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'asset bytes', type: 'text/plain' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'file.txt',
        mimeType: 'text/plain',
        size: 11,
        width: null,
        height: null,
        alt: null,
        caption: null,
        tags: [],
        scope: 'global',
        entryId: null,
        collectionId: null,
        deletedAt: null,
        deletedBy: null,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'asset',
      assetId: assetId as string,
    })
    await owner.mutation(api.assets.updateAsset, {
      assetId: assetId as string,
      filename: 'changed.txt',
    })

    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: assetId as string,
      exportArtifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers[0]?.code).toBe('backup-stale-for-purge')
  })

  it('rejects referenced asset purge even with a matching backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const fixture = await seedEditorFixture(ctx)
    const storageId = await seedStorageObject(ctx, { bytes: 'asset bytes', type: 'text/plain' })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'file.txt',
        mimeType: 'text/plain',
        size: 11,
        width: null,
        height: null,
        alt: null,
        caption: null,
        scope: 'entry',
        entryId: fixture.entryId,
        collectionId: fixture.collectionId,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
      } as never,
    )
    await ctx.seed(
      'contentAssetRefs' as never,
      {
        sourceKind: 'draft',
        sourceId: `${fixture.entryId}:en`,
        assetId: assetId as string,
        fieldPath: 'hero',
        locale: 'en',
        entryId: fixture.entryId,
        collectionId: fixture.collectionId,
        updatedAt: Date.now(),
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'asset',
      assetId: assetId as string,
    })

    const blockedPreview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: assetId as string,
      exportArtifactId: exported.artifactId,
    })
    expect(blockedPreview.allowed).toBe(false)
    expect(blockedPreview.blockers[0]?.code).toBe('asset-in-use')

    await expect(
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.purge-asset',
        preview: api.assets.previewPurgeAssetOperation,
        execute: api.assets.purgeAsset,
        args: {
          assetId: assetId as string,
          exportArtifactId: exported.artifactId,
        },
      }),
    ).rejects.toThrow(/did not return a confirmation token/)

    await expect(
      owner.mutation(api.assets.previewPurgeAssetOperation, {
        assetId: assetId as string,
        force: true,
        exportArtifactId: exported.artifactId,
      }),
    ).rejects.toThrow(/extra field|force/i)
    expect(
      await ctx.raw.run(async (innerCtx) => Boolean(await innerCtx.storage.get(storageId))),
    ).toBe(true)
    expect(await ctx.readAll('contentAssetRefs')).toHaveLength(1)
  })

  it('rejects asset purge when the backup scope does not cover the asset', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const firstStorageId = await seedStorageObject(ctx, {
      bytes: 'first asset bytes',
      type: 'text/plain',
    })
    const secondStorageId = await seedStorageObject(ctx, {
      bytes: 'second asset bytes',
      type: 'text/plain',
    })
    const now = Date.now()
    const firstAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: firstStorageId,
        filename: 'first.txt',
        mimeType: 'text/plain',
        size: 17,
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
    const secondAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId: secondStorageId,
        filename: 'second.txt',
        mimeType: 'text/plain',
        size: 18,
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
    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'asset',
      assetId: firstAssetId as string,
    })

    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: secondAssetId as string,
      exportArtifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers[0]?.code).toBe('backup-scope-mismatch')
    expect(
      await ctx.raw.run(async (innerCtx) => (await innerCtx.storage.get(secondStorageId)) !== null),
    ).toBe(true)
  })

  it('dry-runs and applies an asset restore from a verified backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const storageId = await seedStorageObject(ctx, {
      bytes: 'restorable asset bytes',
      type: 'text/plain',
    })
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'restore-me.txt',
        mimeType: 'text/plain',
        size: 22,
        width: null,
        height: null,
        alt: null,
        caption: null,
        tags: [],
        scope: 'global',
        entryId: null,
        collectionId: null,
        deletedAt: null,
        deletedBy: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'asset',
      assetId: assetId as string,
    })
    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.purge-asset',
      preview: api.assets.previewPurgeAssetOperation,
      execute: api.assets.purgeAsset,
      args: {
        assetId: assetId as string,
        exportArtifactId: exported.artifactId,
      },
    })
    expect(await ctx.readAll('assets')).toEqual([])

    const preview = await owner.action(api.backup.previewRestoreBackup, {
      artifactId: exported.artifactId,
    })
    expect(preview).toMatchObject({
      artifactId: exported.artifactId,
      checksum: exported.checksum,
      scope: 'asset',
      applySupported: true,
      blockers: [],
    })
    expect(preview.changes).toContainEqual(
      expect.objectContaining({
        table: 'assets',
        archiveRows: 1,
        existingRows: 0,
        missingRows: 1,
      }),
    )
    expect(await ctx.readAll('assets')).toEqual([])

    await expect(
      owner.action(api.backup.restoreBackup, {
        artifactId: exported.artifactId,
        expectedChecksum: 'wrong-checksum',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        getCmsErrorData(error)?.code === 'BACKUP_RESTORE_CHECKSUM_CONFIRMATION_MISMATCH',
    )

    const restored = await owner.action(api.backup.restoreBackup, {
      artifactId: exported.artifactId,
      expectedChecksum: exported.checksum,
    })
    expect(restored).toMatchObject({
      artifactId: exported.artifactId,
      scope: 'asset',
      restored: { assets: 1 },
      originalAssetId: assetId,
    })
    expect(restored.restoredAssetId).not.toBe(assetId)

    const [asset] = await ctx.readAll('assets')
    expect(asset).toMatchObject({
      _id: restored.restoredAssetId,
      filename: 'restore-me.txt',
      mimeType: 'text/plain',
      storageId: expect.any(String),
    })
    expect(asset.storageId).not.toBe(storageId)
    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = await innerCtx.storage.get(asset.storageId)
        return blob ? await blob.text() : null
      }),
    ).toBe('restorable asset bytes')
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'backup.restored',
          appIdentityId: 'owner-1',
          detail: expect.objectContaining({
            artifactId: exported.artifactId,
            originalAssetId: assetId,
            restoredAssetId: restored.restoredAssetId,
          }),
        }),
      ]),
    )
  })

  it('keeps full backup restore apply blocked after dry-run', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const exported = await owner.action(api.backup.exportBackup, { scope: 'snapshot' })
    const preview = await owner.action(api.backup.previewRestoreBackup, {
      artifactId: exported.artifactId,
    })

    expect(preview.applySupported).toBe(false)
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'restore-scope-unsupported' }),
    )
    await expect(
      owner.action(api.backup.restoreBackup, {
        artifactId: exported.artifactId,
        expectedChecksum: exported.checksum,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'BACKUP_RESTORE_BLOCKED',
    )
  })
})
