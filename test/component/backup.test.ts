/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { executeConfirmedOperation } from '../helpers'
import { createCtx, seedEditorFixture, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi

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
    const exported = await owner.action(api.backup.exportBackup, { scope: 'full' })

    expect(exported.artifactId).toMatch(/^backup_/)
    expect(exported.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(exported.counts.entries).toBe(1)
    expect(exported.counts.members).toBe(1)

    const artifacts = await ctx.readAll('backupArtifacts')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      artifactId: exported.artifactId,
      scope: 'full',
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

    await owner.mutation(api.editor.saveEntryDraft, {
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
    const exported = await owner.action(api.backup.exportBackup, { scope: 'full' })
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
    const missingBackupPreview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: assetId as string,
      exportArtifactId: 'missing',
    })
    expect(missingBackupPreview.allowed).toBe(false)
    expect(missingBackupPreview.blockers[0]?.code).toBe('backup-not-found')

    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'asset',
      assetId: assetId as string,
    })
    await expect(
      owner.mutation(api.assets.purgeAsset, {
        assetId: assetId as string,
        exportArtifactId: exported.artifactId,
      }),
    ).rejects.toThrow(/requires confirmation/i)
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
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.purge-asset',
        preview: api.assets.previewPurgeAssetOperation,
        execute: api.assets.purgeAsset,
        args: {
          assetId: assetId as string,
          force: true,
          exportArtifactId: exported.artifactId,
        },
      }),
    ).resolves.toBeNull()
    expect(await ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(storageId))).toBeNull()
    expect(await ctx.readAll('contentAssetRefs')).toEqual([])
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

  it('rejects permanent entry delete without a matching backup artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const fixture = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await expect(
      owner.mutation(api.entries.tree.deleteEntryTransportExecute, { entryId: fixture.entryId }),
    ).rejects.toSatisfy((error: unknown) => {
      const data = getCmsErrorData(error)
      return (
        data?.code === 'BACKUP_REQUIRED' &&
        (data.details as { suggestedAction?: string } | null)?.suggestedAction === 'export-backup'
      )
    })

    const exported = await owner.action(api.backup.exportBackup, {
      scope: 'entry',
      entryId: fixture.entryId,
    })
    await expect(
      owner.mutation(api.entries.tree.deleteEntryTransportExecute, {
        entryId: fixture.entryId,
        exportArtifactId: exported.artifactId,
      }),
    ).resolves.toBeNull()
    expect(await owner.query(api.editor.getEntry, { id: fixture.entryId })).toBeNull()
  })
})
