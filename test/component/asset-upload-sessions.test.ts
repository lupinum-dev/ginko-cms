/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, installTestContract, seedOwner as seedOwnerRecord } from './entries/helpers'

const api = anyApi
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

afterEach(() => vi.useRealTimers())

async function seedOwner(ctx: ReturnType<typeof createCtx>) {
  await seedOwnerRecord(ctx)
  await installTestContract(ctx, ['en'])
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function seedStorage(ctx: ReturnType<typeof createCtx>, bytes: BlobPart, type = 'image/png') {
  return await ctx.raw.run(
    async (innerCtx) => await innerCtx.storage.store(new Blob([bytes], { type })),
  )
}

async function createAndClaim(
  ctx: ReturnType<typeof createCtx>,
  userId: string,
  bytes: BlobPart = validPng,
  type = 'image/png',
) {
  const user = ctx.asCmsUser(userId)
  const session = await user.mutation(api.assets.createAssetUploadSession, {})
  const storageId = await seedStorage(ctx, bytes, type)
  const claim = await user.mutation(api.assets.claimAssetUploadSession, {
    sessionId: session.sessionId,
    token: session.token,
    storageId: String(storageId),
  })
  return { user, session, storageId, claim }
}

describe('canonical asset upload sessions', () => {
  it('[AST-01] stores only a token hash and makes concurrent or lost-response finalize retries idempotent', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { user, session, storageId } = await createAndClaim(ctx, 'owner-1')
    const beforeFinalize = await ctx.raw.run(async (innerCtx) => {
      return await innerCtx.db
        .query('assetUploadSessions')
        .withIndex('by_session', (query) => query.eq('sessionId', session.sessionId))
        .unique()
    })
    expect(beforeFinalize).toMatchObject({
      ownerId: 'owner-1',
      state: 'uploaded',
      generation: 2,
      storageId,
      tokenHash: hashValue(session.token),
    })
    expect(beforeFinalize?.tokenHash).not.toBe(session.token)

    const finalize = (filename = 'verified.png') =>
      user.action(api.assets.finalizeAssetUploadSession, {
        sessionId: session.sessionId,
        token: session.token,
        filename,
        scope: 'global',
      })
    const [assetId, concurrentAssetId] = await Promise.all([finalize(), finalize()])
    expect(concurrentAssetId).toBe(assetId)
    const asset = await ctx.raw.run(async (innerCtx) => {
      const id = innerCtx.db.normalizeId('assets', assetId)
      return id ? await innerCtx.db.get(id) : null
    })
    expect(asset).toMatchObject({
      storageId,
      filename: 'verified.png',
      mimeType: 'image/png',
      size: validPng.length,
      sha256: createHash('sha256').update(validPng).digest('hex'),
      width: 1,
      height: 1,
      frames: 1,
      scope: 'global',
      createdBy: 'owner-1',
    })
    expect(await ctx.readAll('assetUploadSessions')).toEqual([
      expect.objectContaining({
        sessionId: session.sessionId,
        state: 'finalized',
        generation: 3,
        assetId: asset?._id,
      }),
    ])

    await expect(finalize('replayed-after-lost-response.png')).resolves.toBe(assetId)
    expect(await ctx.readAll('assets')).toHaveLength(1)
  })

  it('[AST-01] rejects the wrong owner and wrong token at claim and finalization', async () => {
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
    const owner = ctx.asCmsUser('owner-1')
    const editor = ctx.asCmsUser('editor-2')
    const session = await owner.mutation(api.assets.createAssetUploadSession, {})
    const storageId = await seedStorage(ctx, validPng)

    await expect(
      editor.mutation(api.assets.claimAssetUploadSession, {
        sessionId: session.sessionId,
        token: session.token,
        storageId: String(storageId),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_UPLOAD_SESSION_OWNER_MISMATCH',
    )
    await expect(
      owner.mutation(api.assets.claimAssetUploadSession, {
        sessionId: session.sessionId,
        token: 'wrong-token',
        storageId: String(storageId),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_UPLOAD_SESSION_TOKEN_INVALID',
    )
    await owner.mutation(api.assets.claimAssetUploadSession, {
      sessionId: session.sessionId,
      token: session.token,
      storageId: String(storageId),
    })
    await expect(
      editor.action(api.assets.finalizeAssetUploadSession, {
        sessionId: session.sessionId,
        token: session.token,
        filename: 'wrong-owner.png',
        scope: 'global',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_UPLOAD_SESSION_OWNER_MISMATCH',
    )
    await expect(
      owner.action(api.assets.finalizeAssetUploadSession, {
        sessionId: session.sessionId,
        token: 'wrong-token',
        filename: 'wrong-token.png',
        scope: 'global',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_UPLOAD_SESSION_TOKEN_INVALID',
    )
    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('[AST-01] allows exactly one upload session to claim a storage object', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const first = await owner.mutation(api.assets.createAssetUploadSession, {})
    const second = await owner.mutation(api.assets.createAssetUploadSession, {})
    const storageId = await seedStorage(ctx, validPng)

    await owner.mutation(api.assets.claimAssetUploadSession, {
      sessionId: first.sessionId,
      token: first.token,
      storageId: String(storageId),
    })
    await expect(
      owner.mutation(api.assets.claimAssetUploadSession, {
        sessionId: second.sessionId,
        token: second.token,
        storageId: String(storageId),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_UPLOAD_STORAGE_ALREADY_CLAIMED',
    )
    expect(await ctx.readAll('assetUploadSessions')).toEqual([
      expect.objectContaining({ sessionId: first.sessionId, state: 'uploaded' }),
      expect.objectContaining({ sessionId: second.sessionId, state: 'awaiting-upload' }),
    ])
  })

  it('[AST-01] rejects finalization after the upload session expires', async () => {
    const start = Date.UTC(2026, 6, 17, 12)
    vi.useFakeTimers()
    vi.setSystemTime(start)
    const ctx = createCtx()
    await seedOwner(ctx)
    const { user, session } = await createAndClaim(ctx, 'owner-1')
    vi.setSystemTime(session.expiresAt + 1)

    await expect(
      user.action(api.assets.finalizeAssetUploadSession, {
        sessionId: session.sessionId,
        token: session.token,
        filename: 'expired.png',
        scope: 'global',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_UPLOAD_SESSION_EXPIRED',
    )
    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('[AST-01] does not create an asset when claimed storage bytes are missing', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { user, session, storageId } = await createAndClaim(ctx, 'owner-1')
    await ctx.raw.run(async (innerCtx) => await innerCtx.storage.delete(storageId))

    await expect(
      user.action(api.assets.finalizeAssetUploadSession, {
        sessionId: session.sessionId,
        token: session.token,
        filename: 'missing.png',
        scope: 'global',
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ASSET_STORAGE_MISSING',
    )
    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('[AST-01] does not create an asset from empty, corrupt, or MIME-forged bytes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const empty = await createAndClaim(ctx, 'owner-1', new Uint8Array(), 'image/png')
    await expect(
      empty.user.action(api.assets.finalizeAssetUploadSession, {
        sessionId: empty.session.sessionId,
        token: empty.session.token,
        filename: 'empty.png',
        scope: 'global',
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'ASSET_SIZE_INVALID')

    const corrupt = await createAndClaim(ctx, 'owner-1', 'not an image', 'image/png')
    await expect(
      corrupt.user.action(api.assets.finalizeAssetUploadSession, {
        sessionId: corrupt.session.sessionId,
        token: corrupt.session.token,
        filename: 'corrupt.png',
        scope: 'global',
      }),
    ).rejects.toThrow()

    const forged = await createAndClaim(ctx, 'owner-1', validPng, 'image/jpeg')
    await expect(
      forged.user.action(api.assets.finalizeAssetUploadSession, {
        sessionId: forged.session.sessionId,
        token: forged.session.token,
        filename: 'forged.jpg',
        scope: 'global',
      }),
    ).rejects.toThrow(/does not match/i)
    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('[AST-01] automatically deletes abandoned claimed storage after expiry and grace', async () => {
    const start = Date.UTC(2026, 6, 17, 13)
    vi.useFakeTimers()
    vi.setSystemTime(start)
    const ctx = createCtx()
    await seedOwner(ctx)
    const { storageId } = await createAndClaim(ctx, 'owner-1')

    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1)
    await ctx.raw.finishAllScheduledFunctions(() => vi.runAllTimers())

    await expect(
      ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(storageId)),
    ).resolves.toBeNull()
    expect(await ctx.readAll('assetUploadSessions')).toEqual([])
    expect(await ctx.readAll('assetCleanupTasks')).toEqual([])
    expect(await ctx.readAll('assets')).toEqual([])
  })

  it('lists terminal cleanup failures and resumes them with generation-fenced proof', async () => {
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
    const storageId = await seedStorage(ctx, validPng)
    const uploadSessionId = await ctx.seed('assetUploadSessions', {
      sessionId: 'asset_upload_terminal_cleanup',
      ownerId: 'owner-1',
      tokenHash: hashValue('not-retained'),
      state: 'cleanup-queued',
      generation: 3,
      storageId,
      createdAt: now - 20_000,
      expiresAt: now - 10_000,
      claimedAt: now - 19_000,
    })
    const taskId = await ctx.seed('assetCleanupTasks', {
      storageId,
      uploadSessionId,
      status: 'cleanup-required',
      generation: 7,
      attempts: 4,
      lastError: 'previous failure',
      createdAt: now - 9_000,
      updatedAt: now - 1_000,
    })

    await expect(
      ctx.raw.mutation(api.assets.failAssetStorageCleanup, {
        taskId,
        generation: 7,
        attempt: 5,
        error: 'storage failed; token=must-not-leak',
      }),
    ).resolves.toBe('terminal-failure')

    const owner = ctx.asCmsUser('owner-1')
    const inventory = await owner.query(api.assets.listTerminalAssetCleanupTasks, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(inventory).toMatchObject({
      isDone: true,
      page: [
        {
          taskId: String(taskId),
          storageId: String(storageId),
          uploadSessionId: String(uploadSessionId),
          generation: 7,
          attempts: 5,
          lastError: 'storage failed; token=[redacted]',
        },
      ],
    })
    await expect(
      ctx.asCmsUser('editor-2').query(api.assets.listTerminalAssetCleanupTasks, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow()

    const stalePreview = await owner.mutation(api.assets.previewRetryAssetCleanupOperation, {
      taskId: String(taskId),
      expectedGeneration: 7,
    })
    expect(stalePreview.allowed).toBe(true)
    expect(stalePreview.confirmation).not.toBeNull()
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(taskId, { generation: 8, updatedAt: now + 1 })
    })
    const staleExecution = await owner.mutation(api.assets.retryAssetCleanupOperationExecute, {
      taskId: String(taskId),
      expectedGeneration: 7,
      _confirmationToken: stalePreview.confirmation!.token,
    })
    expect(staleExecution.status).toBe('stale')

    const currentPreview = await owner.mutation(api.assets.previewRetryAssetCleanupOperation, {
      taskId: String(taskId),
      expectedGeneration: 8,
    })
    const applied = await owner.mutation(api.assets.retryAssetCleanupOperationExecute, {
      taskId: String(taskId),
      expectedGeneration: 8,
      _confirmationToken: currentPreview.confirmation!.token,
    })
    expect(applied).toEqual({
      status: 'applied',
      value: { taskId: String(taskId), generation: 9 },
    })

    await ctx.raw.mutation(api.assets.finishAssetStorageCleanup, {
      taskId,
      generation: 8,
      attempt: 5,
    })
    expect(await ctx.readAll('assetCleanupTasks')).toEqual([
      expect.objectContaining({
        _id: taskId,
        status: 'cleanup-required',
        generation: 9,
        attempts: 0,
        lastError: null,
      }),
    ])

    await ctx.raw.action(api.assets.cleanupAssetStorage, {
      taskId,
      storageId,
      generation: 9,
      attempt: 1,
    })
    await expect(
      ctx.raw.run(async (innerCtx) => await innerCtx.storage.get(storageId)),
    ).resolves.toBeNull()
    expect(await ctx.readAll('assetCleanupTasks')).toEqual([])
    expect(await ctx.readAll('assetUploadSessions')).toEqual([])
    expect(
      await owner.query(api.assets.listTerminalAssetCleanupTasks, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).toMatchObject({ page: [], isDone: true })
  })

  it('pages terminal cleanup failures without loss when timestamps are identical', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const updatedAt = Date.now()
    const expectedTaskIds: string[] = []
    for (let index = 0; index < 5; index += 1) {
      const storageId = await seedStorage(ctx, new Uint8Array([index]))
      const taskId = await ctx.seed('assetCleanupTasks', {
        storageId,
        status: 'terminal-failure',
        generation: 1,
        attempts: 5,
        lastError: `failure-${index}`,
        createdAt: updatedAt - 1_000,
        updatedAt,
      })
      expectedTaskIds.push(String(taskId))
    }

    const owner = ctx.asCmsUser('owner-1')
    const actualTaskIds: string[] = []
    let cursor: string | null = null
    do {
      const result = await owner.query(api.assets.listTerminalAssetCleanupTasks, {
        paginationOpts: { cursor, numItems: 2 },
      })
      actualTaskIds.push(...result.page.map((task: { taskId: string }) => task.taskId))
      cursor = result.isDone ? null : result.continueCursor
    } while (cursor)

    expect(new Set(actualTaskIds).size).toBe(5)
    expect(actualTaskIds.slice().sort()).toEqual(expectedTaskIds.sort())
  })
})
