/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { decodeAssetRecoveryArchive } from '../../packages/convex/src/assetRecovery'
import { assetSnapshot } from '../../packages/convex/src/assetRecovery/archive'
import { assetDiscoveryFields } from '../../packages/convex/src/assets/scope'
import {
  createCtx,
  installTestContract,
  seedOwner as seedOwnerRecord,
  seedSettings,
} from './entries/helpers'

const api = anyApi

afterEach(() => vi.useRealTimers())

async function seedOwner(ctx: ReturnType<typeof createCtx>) {
  await seedOwnerRecord(ctx)
  await installTestContract(ctx, ['en'])
}

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
    expect(decodeAssetRecoveryArchive(archiveFixture())).toMatchObject({
      format: 'ginko-cms-asset-recovery',
      version: 1,
      manifest: { byteSize: 11 },
    })
    expect(() =>
      decodeAssetRecoveryArchive(JSON.stringify({ version: 2, scope: 'snapshot' })),
    ).toThrow(/format is unsupported/i)
  })

  it('rejects incomplete, inconsistent, and corrupt byte manifests', () => {
    const missing = JSON.parse(archiveFixture())
    delete missing.asset.sha256
    expect(() => decodeAssetRecoveryArchive(JSON.stringify(missing))).toThrow(/sha256.*invalid/i)

    const mismatched = JSON.parse(archiveFixture())
    mismatched.manifest.byteSize += 1
    expect(() => decodeAssetRecoveryArchive(JSON.stringify(mismatched))).toThrow(/inconsistent/i)

    const corrupt = JSON.parse(archiveFixture())
    corrupt.bytesBase64 = 'not base64'
    expect(() => decodeAssetRecoveryArchive(JSON.stringify(corrupt))).toThrow(
      /malformed asset bytes/i,
    )
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
        ...assetDiscoveryFields({
          filename: 'asset.txt',
          mimeType: 'text/plain',
          tags: [],
          createdAt: now,
          updatedAt: null,
          deletedAt: null,
        }),
      }),
  )
  return { assetId: String(assetId), storageId }
}

async function contractWriteToken(ctx: ReturnType<typeof createCtx>) {
  const installed = (await ctx.readAll('cmsContract'))[0]!
  return {
    contentHash: installed.contentHash,
    presentationHash: installed.presentationHash,
    generation: installed.writeGeneration,
  }
}

async function createRecoveryArtifact(ctx: ReturnType<typeof createCtx>, assetId: string) {
  const artifact = await ctx
    .asCmsUser('owner-1')
    .action(api.assetRecovery.createAssetRecoveryArtifact, { assetId })
  await verifyCanonicalAssetReferences(ctx, nextProofRunId('asset-purge-proof'))
  return artifact
}

async function createRecoveryArtifactOnly(ctx: ReturnType<typeof createCtx>, assetId: string) {
  return await ctx
    .asCmsUser('owner-1')
    .action(api.assetRecovery.createAssetRecoveryArtifact, { assetId })
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

let proofRunSequence = 0

function nextProofRunId(prefix: string) {
  proofRunSequence += 1
  return `${prefix}-${proofRunSequence}`
}

async function trashAsset(
  ctx: ReturnType<typeof createCtx>,
  assetId: string,
  options: { force?: boolean } = {},
) {
  await verifyCanonicalAssetReferences(ctx, nextProofRunId('asset-trash-proof'))
  const owner = ctx.asCmsUser('owner-1')
  const args = { assetId, ...(options.force ? { force: true } : {}) }
  const preview = await owner.mutation(api.assets.previewDeleteAssetOperation, args)
  expect(preview.allowed).toBe(true)
  expect(preview.confirmation?.token).toBeTypeOf('string')
  await expect(
    owner.mutation(api.assets.deleteAssetOperationExecute, {
      ...args,
      _confirmationToken: preview.confirmation!.token,
    }),
  ).resolves.toMatchObject({ status: 'applied' })
}

async function purgeAsset(
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  args: { assetId: string; recoveryArtifactId: string },
) {
  const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, args)
  if (!preview.confirmation?.token) throw new Error('Expected purge confirmation')
  return await owner.action(api.assets.purgeAsset, {
    ...args,
    _confirmationToken: preview.confirmation.token,
  })
}

async function expectStalePurgeReceipt(
  ctx: ReturnType<typeof createCtx>,
  execution: Promise<unknown>,
  code: string,
) {
  const before = await ctx.readAll('destructiveAuditLog')
  await expect(execution).resolves.toMatchObject({ status: 'stale', code })
  const after = await ctx.readAll('destructiveAuditLog')
  expect(after).toHaveLength(before.length + 1)
  expect(after.at(-1)).toMatchObject({ status: 'stale', code })
}

describe('verified asset recovery', () => {
  it('reauthorizes artifact creation in the terminal mutation after an owner is demoted', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'terminal artifact authorization')
    const recoveryStorage = await ctx.raw.run(
      async (innerCtx) => await innerCtx.storage.store(new Blob(['recovery archive'])),
    )
    await ctx.raw.run(async (innerCtx) => {
      const member = await innerCtx.db
        .query('members')
        .withIndex('by_userId', (query) => query.eq('userId', 'owner-1'))
        .unique()
      await innerCtx.db.patch(member!._id, { role: 'viewer' })
    })

    await expect(
      ctx.raw.mutation(api.assetRecovery.recordAssetRecoveryArtifact, {
        contractWriteToken: await contractWriteToken(ctx),
        artifactId: 'terminal-auth-artifact',
        assetId: source.assetId,
        collection: null,
        entryId: null,
        checksum: sha256('recovery archive'),
        storageRef: recoveryStorage,
        byteSize: 16,
        bytesSha256: sha256('terminal artifact authorization'),
        assetFactsHash: 'a'.repeat(64),
        assetUpdatedAt: 1,
        userId: 'owner-1',
        now: 2,
      }),
    ).rejects.toThrow(/forbidden/i)

    expect(await ctx.readAll('assetRecoveryArtifacts')).toEqual([])
    expect(await ctx.readAll('activity')).toEqual([])
  })

  it('reauthorizes restore in the terminal mutation after membership removal', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'terminal restore authorization')
    const snapshot = await ctx.raw.run(async (innerCtx) => {
      const asset = await innerCtx.db.get(source.assetId as never)
      if (!asset) throw new Error('Expected source asset')
      await innerCtx.db.delete(asset._id)
      return assetSnapshot(asset)
    })
    const restoredStorage = await ctx.raw.run(
      async (innerCtx) =>
        await innerCtx.storage.store(new Blob(['terminal restore authorization'])),
    )
    await ctx.raw.run(async (innerCtx) => {
      const member = await innerCtx.db
        .query('members')
        .withIndex('by_userId', (query) => query.eq('userId', 'owner-1'))
        .unique()
      await innerCtx.db.delete(member!._id)
    })

    await expect(
      ctx.raw.mutation(api.assetRecovery.restoreAssetFromRecovery, {
        contractWriteToken: await contractWriteToken(ctx),
        artifactId: 'terminal-restore-artifact',
        asset: snapshot,
        restoredStorageRef: restoredStorage,
        userId: 'owner-1',
        now: 3,
      }),
    ).rejects.toThrow(/forbidden/i)

    expect(await ctx.readAll('assets')).toEqual([])
    expect(await ctx.readAll('activity')).toEqual([])
  })

  it('[AST-08] keeps permanent purge owner-only and unavailable to agents', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const now = Date.now()
    await ctx.seed('members', {
      userId: 'editor-2',
      role: 'editor',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'owner-1',
    })
    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'owner-asset-recovery-agent',
      ownerUserId: 'owner-1',
      label: 'Asset recovery must remain user-only',
      scopes: ['cms.assetRecovery.manage'],
      status: 'active',
      createdBy: 'owner-1',
      createdAt: now,
      updatedBy: 'owner-1',
      updatedAt: now,
      revokedAt: null,
    })
    const source = await seedAsset(ctx, 'owner-only purge bytes')
    await trashAsset(ctx, source.assetId)
    const artifact = await createRecoveryArtifact(ctx, source.assetId)
    const args = { assetId: source.assetId, recoveryArtifactId: artifact.artifactId }

    await expect(
      ctx.asCmsUser('editor-2').mutation(api.assets.previewPurgeAssetOperation, args),
    ).rejects.toThrow()
    await expect(
      ctx.asCmsUser('editor-2').action(api.assets.purgeAsset, {
        ...args,
        _confirmationToken: 'not-authorized',
      }),
    ).rejects.toThrow()
    await expect(
      ctx
        .asMcpApiKey('owner-asset-recovery-agent', 'owner-1')
        .mutation(api.assets.previewPurgeAssetOperation, args),
    ).rejects.toThrow()
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).not.toBeNull()
  })

  it('[AST-08] requires the reversible trash step before permanent purge is eligible', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'active asset bytes')
    const artifact = await createRecoveryArtifact(ctx, source.assetId)

    await expect(
      ctx.asCmsUser('owner-1').mutation(api.assets.previewPurgeAssetOperation, {
        assetId: source.assetId,
        recoveryArtifactId: artifact.artifactId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-not-trashed' })],
      confirmation: null,
    })
    await expect(
      ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).resolves.not.toBeNull()
  })

  it('[AST-08] fails closed until current reference and exact-byte recovery proof make purge eligible', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'verified unreferenced bytes')
    await trashAsset(ctx, source.assetId)
    const artifact = await createRecoveryArtifactOnly(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')

    await owner.createEntry({
      collection: 'posts',
      slug: 'invalidate-asset-reference-proof',
      localized: { title: 'Invalidate asset reference proof' },
    })

    await expect(
      owner.mutation(api.assets.previewPurgeAssetOperation, {
        assetId: source.assetId,
        recoveryArtifactId: artifact.artifactId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-reference-verification-required' })],
    })

    await verifyCanonicalAssetReferences(ctx, nextProofRunId('asset-purge-proof-unreferenced'))
    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: artifact.artifactId,
    })
    expect(preview).toMatchObject({ allowed: true, blockers: [] })
    await owner.action(api.assets.purgeAsset, {
      assetId: source.assetId,
      recoveryArtifactId: artifact.artifactId,
      _confirmationToken: preview.confirmation!.token,
    })
    await expect(
      ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(source.storageId)),
    ).resolves.toBeNull()
  })

  it('[AST-08] rejects stale confirmation and canonical references even when derived refs are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const source = await seedAsset(ctx, 'canonically referenced bytes')
    await trashAsset(ctx, source.assetId)
    const artifact = await createRecoveryArtifact(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    const stalePreview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: artifact.artifactId,
    })
    expect(stalePreview.allowed).toBe(true)

    await owner.mutation(api.assets.restoreAsset, { assetId: source.assetId })
    await owner.createEntry({
      collection: 'posts',
      slug: 'canonical-asset-reference',
      shared: { hero: source.assetId },
      localized: { title: 'Canonical asset reference' },
    })
    await trashAsset(ctx, source.assetId, { force: true })
    await ctx.raw.run(async (innerCtx) => {
      for (const row of await innerCtx.db.query('contentAssetRefs').collect()) {
        await innerCtx.db.delete(row._id)
      }
    })

    await expect(
      owner.mutation(api.assets.previewPurgeAssetOperation, {
        assetId: source.assetId,
        recoveryArtifactId: artifact.artifactId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-recovery-stale-for-purge' })],
    })
    await expect(
      owner.action(api.assets.purgeAsset, {
        assetId: source.assetId,
        recoveryArtifactId: artifact.artifactId,
        _confirmationToken: stalePreview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale' })

    const currentArtifact = await createRecoveryArtifact(ctx, source.assetId)
    await ctx.raw.run(async (innerCtx) => {
      for (const row of await innerCtx.db.query('contentAssetRefs').collect()) {
        await innerCtx.db.delete(row._id)
      }
    })
    expect(await ctx.readAll('contentAssetRefs')).toEqual([])
    await expect(
      owner.mutation(api.assets.previewPurgeAssetOperation, {
        assetId: source.assetId,
        recoveryArtifactId: currentArtifact.artifactId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-in-use' })],
    })
    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = await innerCtx.storage.get(source.storageId)
        return blob ? await blob.text() : null
      }),
    ).toBe('canonically referenced bytes')
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).not.toBeNull()
  })

  it('[IMP-05][IMP-06] previews without writes and restores byte-identical data as a fresh asset from a reverified artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'restorable asset bytes')
    const owner = ctx.asCmsUser('owner-1')
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)

    expect(exported).toMatchObject({
      artifactId: expect.stringMatching(/^asset_recovery_/),
      assetId: source.assetId,
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    await expect(
      owner.action(api.assetRecovery.verifyAssetRecoveryArtifact, {
        artifactId: exported.artifactId,
      }),
    ).resolves.toMatchObject({ ok: true, checksumMatches: true, currentDataMatches: true })

    await purgeAsset(owner, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    const consumedArtifact = await ctx.raw.run(async (innerCtx) => {
      return await innerCtx.db
        .query('assetRecoveryArtifacts')
        .withIndex('by_artifact', (query) => query.eq('artifactId', exported.artifactId))
        .unique()
    })
    expect(consumedArtifact).toMatchObject({ generation: 3 })
    expect(consumedArtifact).not.toHaveProperty('purgeFenceTokenHash')
    expect(consumedArtifact).not.toHaveProperty('purgeFenceIssuedTo')
    expect(consumedArtifact).not.toHaveProperty('purgeFenceExpiresAt')
    expect(
      await ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(source.storageId)),
    ).toBeNull()

    const assetsBeforeRestorePreview = structuredClone(await ctx.readAll('assets'))
    const artifactsBeforeRestorePreview = structuredClone(
      await ctx.readAll('assetRecoveryArtifacts'),
    )
    await expect(
      owner.action(api.assetRecovery.previewRestoreAsset, { artifactId: exported.artifactId }),
    ).resolves.toMatchObject({ applySupported: true, blockers: [] })
    expect(await ctx.readAll('assets')).toEqual(assetsBeforeRestorePreview)
    expect(await ctx.readAll('assetRecoveryArtifacts')).toEqual(artifactsBeforeRestorePreview)
    const restored = await owner.action(api.assetRecovery.restoreAsset, {
      artifactId: exported.artifactId,
      expectedChecksum: exported.checksum,
    })
    expect(restored).toMatchObject({ originalAssetId: source.assetId })
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

  it('rejects a stale shared-storage purge and preserves every original byte', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'shared legacy asset bytes')
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(true)

    const aliasId = await ctx.raw.run(async (innerCtx) =>
      innerCtx.db.insert('assets', {
        storageId: source.storageId,
        filename: 'legacy-alias.txt',
        mimeType: 'text/plain',
        size: Buffer.byteLength('shared legacy asset bytes'),
        sha256: sha256('shared legacy asset bytes'),
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
        createdAt: Date.now() + 1,
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
        ...assetDiscoveryFields({
          filename: 'legacy-alias.txt',
          mimeType: 'text/plain',
          tags: [],
          createdAt: Date.now() + 1,
          updatedAt: null,
          deletedAt: null,
        }),
      }),
    )

    await expect(
      owner.mutation(api.assets.previewPurgeAssetOperation, {
        assetId: source.assetId,
        recoveryArtifactId: exported.artifactId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-storage-shared' })],
    })
    await expect(
      owner.action(api.assets.purgeAsset, {
        assetId: source.assetId,
        recoveryArtifactId: exported.artifactId,
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'OPERATION_NO_LONGER_ALLOWED' })

    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = await innerCtx.storage.get(source.storageId)
        return blob ? await blob.text() : null
      }),
    ).toBe('shared legacy asset bytes')
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Promise.all([innerCtx.db.get(source.assetId as never), innerCtx.db.get(aliasId)]),
      ),
    ).toEqual([expect.objectContaining({ storageId: source.storageId }), expect.any(Object)])
  })

  it('blocks purge after asset metadata changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.assets.updateAsset, {
      assetId: source.assetId,
      filename: 'changed.txt',
    })

    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers[0]?.code).toBe('asset-recovery-stale-for-purge')
  })

  it('rejects reuse of a confirmation with another asset recovery artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'source asset bytes')
    const target = await seedAsset(ctx, 'target asset bytes', Date.now() + 1)
    await trashAsset(ctx, source.assetId)
    await trashAsset(ctx, target.assetId)
    const sourceArtifact = await createRecoveryArtifact(ctx, source.assetId)
    const targetArtifact = await createRecoveryArtifact(ctx, target.assetId)
    const owner = ctx.asCmsUser('owner-1')
    const targetPreview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: target.assetId,
      recoveryArtifactId: targetArtifact.artifactId,
    })

    await expectStalePurgeReceipt(
      ctx,
      owner.action(api.assets.purgeAsset, {
        assetId: target.assetId,
        recoveryArtifactId: sourceArtifact.artifactId,
        _confirmationToken: targetPreview.confirmation!.token,
      }),
      'CONFIRMATION_ARGUMENT_MISMATCH',
    )
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(target.assetId as never)),
    ).not.toBeNull()
  })

  it('rejects an expired byte-verification fence before purge', async () => {
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes', now)
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const preview = await ctx.asCmsUser('owner-1').mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    const artifact = await ctx.raw.run(async (innerCtx) => {
      return await innerCtx.db
        .query('assetRecoveryArtifacts')
        .withIndex('by_artifact', (query) => query.eq('artifactId', exported.artifactId))
        .unique()
    })
    if (!artifact) throw new Error('Expected recovery artifact')
    const fenceToken = 'known-test-fence'
    const verification = {
      artifactId: artifact.artifactId,
      assetId: artifact.assetId,
      generation: artifact.generation,
      checksum: artifact.checksum,
      storageRef: artifact.storageRef,
      assetFactsHash: artifact.assetFactsHash,
      assetUpdatedAt: artifact.assetUpdatedAt,
    }
    const installed = (await ctx.readAll('cmsContract'))[0]!
    const contractWriteToken = {
      contentHash: installed.contentHash,
      presentationHash: installed.presentationHash,
      generation: installed.writeGeneration,
    }
    const issued = await ctx.raw.mutation(api.assets.issueAssetPurgeVerificationFence, {
      contractWriteToken,
      userId: 'owner-1',
      verification,
      fenceTokenHash: sha256(JSON.stringify(fenceToken)),
    })
    vi.setSystemTime(issued.expiresAt + 1)

    await expectStalePurgeReceipt(
      ctx,
      ctx.raw.mutation(api.assets.executeVerifiedAssetPurge, {
        contractWriteToken,
        assetId: source.assetId,
        recoveryArtifactId: exported.artifactId,
        confirmationToken: preview.confirmation!.token,
        fenceToken,
        userId: 'owner-1',
        verification: { ...verification, generation: issued.generation },
      }),
      'ASSET_RECOVERY_FENCE_EXPIRED',
    )
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).not.toBeNull()
  })

  it('blocks referenced asset purge even with a current artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    await ctx.asCmsUser('owner-1').createEntry({
      collection: 'posts',
      slug: 'entry-1',
      shared: { hero: source.assetId },
      localized: { title: 'Referenced asset' },
    })
    await trashAsset(ctx, source.assetId, { force: true })
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const preview = await ctx.asCmsUser('owner-1').mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers[0]?.code).toBe('asset-in-use')
  })

  it('blocks permanent purge when recovery artifact storage is missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    const [artifact] = await ctx.raw.run(
      async (innerCtx) => await innerCtx.db.query('assetRecoveryArtifacts').collect(),
    )
    await ctx.raw.run(async (innerCtx) => await innerCtx.storage.delete(artifact!.storageRef))

    await expectStalePurgeReceipt(
      ctx,
      owner.action(api.assets.purgeAsset, {
        assetId: source.assetId,
        recoveryArtifactId: exported.artifactId,
        _confirmationToken: preview.confirmation!.token,
      }),
      'ASSET_RECOVERY_STORAGE_MISSING',
    )
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).not.toBeNull()
  })

  it('[AST-08] blocks permanent purge when recovery artifact bytes or checksum are corrupt', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    await ctx.raw.run(async (innerCtx) => {
      const artifact = await innerCtx.db.query('assetRecoveryArtifacts').first()
      if (!artifact) throw new Error('Expected recovery artifact')
      const corruptStorage = await innerCtx.storage.store(
        new Blob(['corrupt recovery bytes'], { type: 'application/json' }),
      )
      await innerCtx.db.patch(artifact._id, { storageRef: String(corruptStorage) })
    })

    await expectStalePurgeReceipt(
      ctx,
      owner.action(api.assets.purgeAsset, {
        assetId: source.assetId,
        recoveryArtifactId: exported.artifactId,
        _confirmationToken: preview.confirmation!.token,
      }),
      'ASSET_RECOVERY_CHECKSUM_MISMATCH',
    )
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).not.toBeNull()
  })

  it('blocks permanent purge when the recovery manifest is incomplete', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const source = await seedAsset(ctx, 'asset bytes')
    await trashAsset(ctx, source.assetId)
    const exported = await createRecoveryArtifact(ctx, source.assetId)
    const owner = ctx.asCmsUser('owner-1')
    const preview = await owner.mutation(api.assets.previewPurgeAssetOperation, {
      assetId: source.assetId,
      recoveryArtifactId: exported.artifactId,
    })
    const incomplete = '{}'
    await ctx.raw.run(async (innerCtx) => {
      const artifact = await innerCtx.db.query('assetRecoveryArtifacts').first()
      if (!artifact) throw new Error('Expected recovery artifact')
      const incompleteStorage = await innerCtx.storage.store(
        new Blob([incomplete], { type: 'application/json' }),
      )
      await innerCtx.db.patch(artifact._id, {
        checksum: sha256(incomplete),
        storageRef: String(incompleteStorage),
      })
    })

    await expectStalePurgeReceipt(
      ctx,
      owner.action(api.assets.purgeAsset, {
        assetId: source.assetId,
        recoveryArtifactId: exported.artifactId,
        _confirmationToken: preview.confirmation!.token,
      }),
      'ASSET_RECOVERY_ARCHIVE_INVALID',
    )
    expect(
      await ctx.raw.run(async (innerCtx) => innerCtx.db.get(source.assetId as never)),
    ).not.toBeNull()
  })
})
