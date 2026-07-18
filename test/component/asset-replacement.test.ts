/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { decodeAssetRecoveryArchive } from '../../packages/convex/src/assetRecovery'
import { createCtx, publishEntry, seedMember, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi
const redPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==',
  'base64',
)
const bluePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNgYPj/HwADAgH/FAeIXAAAAABJRU5ErkJggg==',
  'base64',
)
const widePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4AWNk+M/wnwEIAAwGAgAe8r2BAAAAAElFTkSuQmCC',
  'base64',
)

afterEach(() => vi.useRealTimers())

type TestCtx = ReturnType<typeof createCtx>

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function storeBytes(ctx: TestCtx, bytes: Buffer, mimeType = 'image/png') {
  return await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([bytes], { type: mimeType })),
  )
}

async function createAsset(ctx: TestCtx, bytes = redPng) {
  const owner = ctx.asCmsUser('owner-1')
  const session = await owner.mutation(api.assets.createAssetUploadSession, {})
  const storageId = await storeBytes(ctx, bytes)
  await owner.mutation(api.assets.claimAssetUploadSession, {
    sessionId: session.sessionId,
    token: session.token,
    storageId: String(storageId),
  })
  const assetId = await owner.action(api.assets.finalizeAssetUploadSession, {
    sessionId: session.sessionId,
    token: session.token,
    filename: 'hero-original.png',
    scope: 'global',
  })
  return { assetId: String(assetId), storageId }
}

async function createClaimedReplacement(
  ctx: TestCtx,
  userId: string,
  bytes: Buffer,
  mimeType = 'image/png',
) {
  const user = ctx.asCmsUser(userId)
  const session = await user.mutation(api.assets.createAssetUploadSession, {})
  const storageId = await storeBytes(ctx, bytes, mimeType)
  await user.mutation(api.assets.claimAssetUploadSession, {
    sessionId: session.sessionId,
    token: session.token,
    storageId: String(storageId),
  })
  return { user, session, storageId }
}

async function stageReplacement(
  ctx: TestCtx,
  input: { userId: string; assetId: string; bytes: Buffer; filename?: string },
) {
  const claimed = await createClaimedReplacement(ctx, input.userId, input.bytes)
  const staged = await claimed.user.action(api.assets.verifyAssetReplacementUpload, {
    assetId: input.assetId,
    sessionId: claimed.session.sessionId,
    token: claimed.session.token,
    filename: input.filename ?? 'hero-replacement.png',
  })
  return { ...claimed, staged }
}

async function verifyCanonicalAssetReferences(ctx: TestCtx, runId: string) {
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
  if (status.state !== 'complete' || status.issueCount !== 0) {
    const revisions = await ctx.readAll('entryRevisions')
    const references = await ctx.readAll('contentAssetRefs')
    throw new Error(
      `Projection/reference verification failed: ${JSON.stringify({ status, revisions, references })}`,
    )
  }
}

async function readAsset(ctx: TestCtx, assetId: string) {
  return await ctx.raw.run(async (innerCtx) => {
    const id = innerCtx.db.normalizeId('assets', assetId)
    return id ? await innerCtx.db.get(id) : null
  })
}

describe('guarded asset replacement', () => {
  it('[AST-06] preserves stable references and metadata while refreshing public bytes with exact recovery proof', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T08:00:00.000Z'))
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedMember(ctx, { userId: 'editor-2', role: 'editor' })
    const source = await createAsset(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.assets.updateAsset, {
      assetId: source.assetId,
      alt: { en: 'Red hero' },
      caption: { en: 'Homepage lead image' },
      tags: ['campaign', 'hero'],
    })
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'replacement-proof',
      shared: { hero: source.assetId },
      localized: { title: 'Replacement proof' },
    })
    await publishEntry(owner, entryId)
    await verifyCanonicalAssetReferences(ctx, 'ast-06-referenced-proof')

    const beforeAsset = await readAsset(ctx, source.assetId)
    const beforePublic = structuredClone((await ctx.readAll('publicEntries'))[0]!)
    const beforeReferences = (await ctx.readAll('contentAssetRefs')).filter(
      (row) => row.assetId === source.assetId,
    )
    expect(
      beforeReferences
        .map((row) => ({ sourceKind: row.sourceKind, locale: row.locale ?? null }))
        .sort((left, right) => left.sourceKind.localeCompare(right.sourceKind)),
    ).toEqual([
      { sourceKind: 'draft', locale: null },
      { sourceKind: 'public', locale: 'en' },
      { sourceKind: 'revision', locale: null },
    ])
    const beforeReferenceIds = beforeReferences.map((row) => String(row._id)).sort()
    expect(beforePublic.assetFacts).toEqual([
      expect.objectContaining({ assetId: source.assetId, sha256: sha256(redPng) }),
    ])
    expect(beforePublic.cacheTags).toContain(`asset:${source.assetId}`)

    const replacement = await stageReplacement(ctx, {
      userId: 'editor-2',
      assetId: source.assetId,
      bytes: bluePng,
    })
    const preview = await replacement.user.mutation(api.assets.previewReplaceAssetOperation, {
      assetId: source.assetId,
      sessionId: replacement.staged.sessionId,
    })
    expect(preview).toMatchObject({
      allowed: true,
      blockers: [],
      details: {
        stableReference: true,
        metadata: {
          filename: 'hero-original.png',
          alt: { en: 'Red hero' },
          caption: { en: 'Homepage lead image' },
          tags: ['campaign', 'hero'],
          behavior: 'preserved',
        },
        current: { sha256: sha256(redPng), width: 1, height: 1, frames: 1 },
        replacement: { sha256: sha256(bluePng), width: 1, height: 1, frames: 1 },
        usageCounts: { draft: 1, revision: 1, public: 1, publishedEntries: 1 },
      },
    })
    expect(preview.confirmation?.token).toBeTypeOf('string')

    const result = await replacement.user.action(api.assets.replaceAsset, {
      assetId: source.assetId,
      sessionId: replacement.staged.sessionId,
      _confirmationToken: preview.confirmation!.token,
    })
    expect(result).toMatchObject({
      status: 'applied',
      value: {
        assetId: source.assetId,
        publicEntriesUpdated: 1,
        revalidationQueued: true,
      },
    })

    const afterAsset = await readAsset(ctx, source.assetId)
    expect(afterAsset).toMatchObject({
      _id: beforeAsset?._id,
      storageId: replacement.storageId,
      filename: 'hero-original.png',
      mimeType: 'image/png',
      size: bluePng.length,
      sha256: sha256(bluePng),
      width: 1,
      height: 1,
      frames: 1,
      alt: { en: 'Red hero' },
      caption: { en: 'Homepage lead image' },
      tags: ['campaign', 'hero'],
      scope: 'global',
      collection: null,
      entryId: null,
    })
    const afterReferenceIds = (await ctx.readAll('contentAssetRefs'))
      .filter((row) => row.assetId === source.assetId)
      .map((row) => String(row._id))
      .sort()
    expect(afterReferenceIds).toEqual(beforeReferenceIds)

    const afterPublic = (await ctx.readAll('publicEntries'))[0]!
    expect(afterPublic.revisionId).toBe(beforePublic.revisionId)
    expect(afterPublic.assetFacts).toEqual([
      expect.objectContaining({
        assetId: source.assetId,
        sha256: sha256(bluePng),
        bytes: bluePng.length,
      }),
    ])
    expect(afterPublic.assetFacts[0]?.url).not.toBe(beforePublic.assetFacts[0]?.url)
    const publicProjectionAfterReplacement = structuredClone(afterPublic)
    await verifyCanonicalAssetReferences(ctx, 'ast-06-post-replacement-proof')
    expect((await ctx.readAll('publicEntries'))[0]).toEqual(publicProjectionAfterReplacement)

    const outbox = (await ctx.readAll('outboxEvents')).find(
      (row) => row.payload.reason === 'asset-replaced',
    )
    expect(outbox).toMatchObject({
      status: 'pending',
      tags: [`asset:${source.assetId}`],
      payload: {
        assetId: source.assetId,
        sha256: sha256(bluePng),
        publicEntriesUpdated: 1,
      },
    })
    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'asset.recovery-exported', appIdentityId: 'editor-2' }),
        expect.objectContaining({
          kind: 'asset.replaced',
          appIdentityId: 'editor-2',
          detail: expect.objectContaining({
            assetId: source.assetId,
            previousSha256: sha256(redPng),
            replacementSha256: sha256(bluePng),
            metadataPreserved: true,
          }),
        }),
      ]),
    )

    const recoveryArtifactId = result.value.recoveryArtifactId
    const artifact = (await ctx.readAll('assetRecoveryArtifacts')).find(
      (row) => row.artifactId === recoveryArtifactId,
    )
    expect(artifact).toMatchObject({
      assetId: source.assetId,
      byteSize: redPng.length,
      bytesSha256: sha256(redPng),
      createdBy: 'editor-2',
    })
    const archiveJson = await ctx.raw.run(async (innerCtx) => {
      const blob = artifact ? await innerCtx.storage.get(artifact.storageRef) : null
      return blob ? await blob.text() : null
    })
    expect(archiveJson).not.toBeNull()
    const archive = decodeAssetRecoveryArchive(archiveJson!)
    expect(archive.asset).toMatchObject({
      originalAssetId: source.assetId,
      sha256: sha256(redPng),
      alt: { en: 'Red hero' },
      caption: { en: 'Homepage lead image' },
    })
    expect(Buffer.from(archive.bytesBase64, 'base64')).toEqual(redPng)
    expect(await ctx.readAll('assetCleanupTasks')).toEqual([
      expect.objectContaining({ storageId: source.storageId, status: 'cleanup-required' }),
    ])
    const sourceStorageRetained = await ctx.raw.run(
      async (innerCtx) => (await innerCtx.storage.get(source.storageId)) !== null,
    )
    expect(sourceStorageRetained).toBe(true)
  })

  it('[AST-06] rejects forged uploads and incompatible dimensions without touching the asset', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const source = await createAsset(ctx)
    const before = await readAsset(ctx, source.assetId)

    const forged = await createClaimedReplacement(ctx, 'owner-1', bluePng, 'image/jpeg')
    await expect(
      forged.user.action(api.assets.verifyAssetReplacementUpload, {
        assetId: source.assetId,
        sessionId: forged.session.sessionId,
        token: forged.session.token,
        filename: 'forged.jpg',
      }),
    ).rejects.toThrow()

    const incompatible = await createClaimedReplacement(ctx, 'owner-1', widePng)
    await expect(
      incompatible.user.action(api.assets.verifyAssetReplacementUpload, {
        assetId: source.assetId,
        sessionId: incompatible.session.sessionId,
        token: incompatible.session.token,
        filename: 'wide.png',
      }),
    ).rejects.toThrow(/keep 1 × 1/i)

    expect(await readAsset(ctx, source.assetId)).toEqual(before)
    expect(await ctx.readAll('assetRecoveryArtifacts')).toEqual([])
    expect(await ctx.readAll('assetCleanupTasks')).toEqual([])
  })

  it('[AST-06] fails closed for stale reference proof and a concurrent new use', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const source = await createAsset(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const replacement = await stageReplacement(ctx, {
      userId: 'owner-1',
      assetId: source.assetId,
      bytes: bluePng,
    })

    await expect(
      owner.mutation(api.assets.previewReplaceAssetOperation, {
        assetId: source.assetId,
        sessionId: replacement.staged.sessionId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'asset-reference-verification-required' })],
    })

    await verifyCanonicalAssetReferences(ctx, 'ast-06-unreferenced-proof')
    const preview = await owner.mutation(api.assets.previewReplaceAssetOperation, {
      assetId: source.assetId,
      sessionId: replacement.staged.sessionId,
    })
    expect(preview).toMatchObject({
      allowed: true,
      details: {
        usageCounts: { draft: 0, revision: 0, public: 0, publishedEntries: 0 },
      },
    })

    await owner.createEntry({
      collection: 'posts',
      slug: 'concurrent-asset-use',
      shared: { hero: source.assetId },
      localized: { title: 'Concurrent asset use' },
    })
    const beforeExecute = await readAsset(ctx, source.assetId)
    await expect(
      owner.action(api.assets.replaceAsset, {
        assetId: source.assetId,
        sessionId: replacement.staged.sessionId,
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale' })

    expect(await readAsset(ctx, source.assetId)).toEqual(beforeExecute)
    expect(await ctx.readAll('assetRecoveryArtifacts')).toEqual([])
    expect(await ctx.readAll('assetCleanupTasks')).toEqual([])
    expect(await ctx.readAll('assetUploadSessions')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: replacement.staged.sessionId,
          state: 'verified-replacement',
          storageId: replacement.storageId,
        }),
      ]),
    )
  })
})
