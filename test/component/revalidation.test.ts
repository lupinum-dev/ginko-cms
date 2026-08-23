/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createCtx,
  executeConfirmedOperation,
  installTestContract,
  seedMember,
  seedOwner,
} from '../helpers'

const api = anyApi

async function seedTarget(ctx: ReturnType<typeof createCtx>, options?: { enabled?: boolean }) {
  process.env.GINKO_CMS_REVALIDATION_ALLOWED_HOSTS = 'site.example'
  const now = Date.now()
  return await ctx.seed(
    'revalidationTargets' as never,
    {
      name: 'Production',
      environment: 'production',
      endpoint: 'https://site.example/api/_content/revalidate',
      secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
      enabled: options?.enabled ?? true,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      createdAt: now,
      updatedAt: now,
    } as never,
  )
}

async function seedEvent(
  ctx: ReturnType<typeof createCtx>,
  options?: {
    attempts?: number
    nextAttemptAt?: number
    status?: 'pending' | 'delivering' | 'delivered' | 'failed'
    lastError?: string | null
    lockExpiresAt?: number | null
    lockedAt?: number | null
    targetId?: string | null
    deliveryGeneration?: number
    leaseId?: string | null
  },
) {
  const now = Date.now()
  const requestedStatus = options?.status ?? 'pending'
  const storedStatus = requestedStatus === 'failed' ? 'dead' : requestedStatus
  return await ctx.seed(
    'outboxEvents' as never,
    {
      type: 'content.revalidate',
      status: storedStatus,
      idempotencyKey: `test:${now}:${Math.random()}`,
      versionId: 'version-1',
      targetId: options?.targetId ?? null,
      tags: ['entry:posts:hello-world', 'collection:posts'],
      paths: ['/posts/hello-world', '/posts'],
      payload: {
        reason: 'publish',
        collection: 'posts',
        entryId: 'entry-1',
        appIdentityId: 'owner-1',
      },
      attempts: options?.attempts ?? 0,
      deliveryGeneration: options?.deliveryGeneration ?? (storedStatus === 'delivering' ? 1 : 0),
      leaseId: options?.leaseId ?? (storedStatus === 'delivering' ? 'seed-lease' : null),
      nextAttemptAt: options?.nextAttemptAt ?? now - 1,
      lastError: options?.lastError ?? null,
      lockedAt: options?.lockedAt ?? null,
      lockExpiresAt: options?.lockExpiresAt ?? null,
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    } as never,
  )
}

describe('revalidation outbox worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GINKO_REVALIDATE_TOKEN_TEST
    delete process.env.GINKO_CMS_ALLOW_LOCAL_REVALIDATION
    delete process.env.GINKO_CMS_REVALIDATION_ALLOWED_HOSTS
  })

  it('claims only due pending revalidation jobs and binds the enabled target', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const targetId = await seedTarget(ctx)
    const dueEventId = await seedEvent(ctx, { targetId: targetId as string })
    const futureEventId = await seedEvent(ctx, { nextAttemptAt: Date.now() + 60_000 })

    const claimed = await ctx.raw.mutation(api.revalidation.claimDueRevalidationEvents, {
      now: Date.now(),
      limit: 10,
    })

    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({
      id: dueEventId,
      attempts: 1,
      deliveryGeneration: 1,
      leaseId: expect.any(String),
      target: {
        id: targetId,
        endpoint: 'https://site.example/api/_content/revalidate',
      },
    })

    const rows = await ctx.readAll('outboxEvents')
    expect(rows.find((row) => String(row._id) === dueEventId)).toMatchObject({
      status: 'delivering',
      attempts: 1,
      deliveryGeneration: 1,
      leaseId: expect.any(String),
      targetId,
    })
    expect(rows.find((row) => String(row._id) === futureEventId)).toMatchObject({
      status: 'pending',
      attempts: 0,
    })
  })

  it('rejects local revalidation targets unless explicitly allowed', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const owner = ctx.asCmsUser('owner-1')

    await expect(() =>
      owner.mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Local',
        environment: 'development',
        endpoint: 'http://127.0.0.1:3000/api/revalidate',
        secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
        enabled: true,
      }),
    ).rejects.toThrow('REVALIDATION_ENDPOINT_PUBLIC_HTTPS_REQUIRED')

    process.env.GINKO_CMS_ALLOW_LOCAL_REVALIDATION = '1'
    await expect(
      owner.mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Local',
        environment: 'development',
        endpoint: 'http://127.0.0.1:3000/api/revalidate',
        secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
        enabled: true,
      }),
    ).resolves.toEqual(expect.any(String))
  })

  it('rejects public revalidation targets unless the host is explicitly allowed', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const owner = ctx.asCmsUser('owner-1')

    await expect(() =>
      owner.mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Production',
        environment: 'production',
        endpoint: 'https://site.example/api/revalidate',
        secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
        enabled: true,
      }),
    ).rejects.toThrow('REVALIDATION_ENDPOINT_HOST_NOT_ALLOWED')

    process.env.GINKO_CMS_REVALIDATION_ALLOWED_HOSTS = 'site.example'
    await expect(
      owner.mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Production',
        environment: 'production',
        endpoint: 'https://site.example/api/revalidate',
        secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
        enabled: true,
      }),
    ).resolves.toEqual(expect.any(String))
  })

  it('rejects target URLs containing credentials', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    process.env.GINKO_CMS_REVALIDATION_ALLOWED_HOSTS = 'site.example'

    await expect(() =>
      ctx.asCmsUser('owner-1').mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Production',
        environment: 'production',
        endpoint: 'https://user:password@site.example/api/revalidate',
        secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
        enabled: true,
      }),
    ).rejects.toThrow('REVALIDATION_ENDPOINT_CREDENTIALS_FORBIDDEN')
  })

  it('[ADM-05] validates secret references before saving a target', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    process.env.GINKO_CMS_REVALIDATION_ALLOWED_HOSTS = 'site.example'

    await expect(
      ctx.asCmsUser('owner-1').mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Production',
        environment: 'production',
        endpoint: 'https://site.example/api/revalidate',
        secretEnv: 'literal secret value',
        enabled: true,
      }),
    ).rejects.toThrow('REVALIDATION_SECRET_ENV_INVALID')
  })

  it('[ADM-05] runs a bounded signed target diagnostic without exposing the credential', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const targetId = await seedTarget(ctx)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'diagnostic-secret-never-returned'
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ctx
      .asCmsUser('owner-1')
      .action(api.revalidation.testRevalidationTarget, { targetId: String(targetId) })

    expect(result).toMatchObject({
      status: 'passed',
      code: 'REVALIDATION_TEST_PASSED',
      statusCode: 204,
      message: expect.not.stringContaining('diagnostic-secret-never-returned'),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://site.example/api/_content/revalidate',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'x-ginko-revalidation-test': '1',
          'x-ginko-signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
        }),
      }),
    )
    const request = fetchMock.mock.calls[0]![1] as RequestInit
    expect(JSON.stringify(request)).not.toContain('diagnostic-secret-never-returned')
    const activity = (await ctx.readAll('activity')).find(
      (row) => row.kind === 'revalidation.tested',
    )
    expect(activity).toMatchObject({
      appIdentityId: 'owner-1',
      subjectKey: String(targetId),
      detail: expect.objectContaining({ status: 'passed', code: 'REVALIDATION_TEST_PASSED' }),
    })
    expect(JSON.stringify(activity)).not.toContain('diagnostic-secret-never-returned')
  })

  it('[ADM-05] returns a redacted missing-secret result, records it, and denies viewers', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    const targetId = await seedTarget(ctx)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      ctx
        .asCmsUser('viewer-1')
        .action(api.revalidation.testRevalidationTarget, { targetId: String(targetId) }),
    ).rejects.toThrow(/forbidden/i)
    await expect(
      ctx
        .asCmsUser('owner-1')
        .action(api.revalidation.testRevalidationTarget, { targetId: String(targetId) }),
    ).resolves.toMatchObject({
      status: 'failed',
      code: 'REVALIDATION_SECRET_MISSING',
      statusCode: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(
      (await ctx.readAll('activity')).find((row) => row.kind === 'revalidation.tested'),
    ).toMatchObject({ detail: expect.objectContaining({ code: 'REVALIDATION_SECRET_MISSING' }) })
  })

  it('rejects a second enabled target in the same environment', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    await seedTarget(ctx)

    await expect(() =>
      ctx.asCmsUser('owner-1').mutation(api.revalidation.upsertRevalidationTarget, {
        name: 'Second production target',
        environment: 'production',
        endpoint: 'https://site.example/api/other-revalidate',
        secretEnv: 'GINKO_REVALIDATE_TOKEN_TEST',
        enabled: true,
      }),
    ).rejects.toThrow('REVALIDATION_TARGET_ALREADY_ENABLED_FOR_ENVIRONMENT')
  })

  it('keeps jobs pending when no target is configured', async () => {
    const ctx = createCtx()
    const eventId = await seedEvent(ctx)

    const claimed = await ctx.raw.mutation(api.revalidation.claimDueRevalidationEvents, {
      now: Date.now(),
      limit: 10,
    })

    expect(claimed).toEqual([])
    const row = (await ctx.readAll('outboxEvents')).find((item) => String(item._id) === eventId)
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 0,
      lastError: null,
    })
  })

  it('does not redeliver already delivered jobs', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    await seedEvent(ctx, { status: 'delivered' })
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await ctx.raw.action(api.revalidation.deliverDue, {})

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('recovers expired delivery locks without double-claiming active locks', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const now = Date.now()
    const activeId = await seedEvent(ctx, {
      status: 'delivering',
      lockedAt: now - 1_000,
      lockExpiresAt: now + 60_000,
    })
    const expiredId = await seedEvent(ctx, {
      status: 'delivering',
      lockedAt: now - 120_000,
      lockExpiresAt: now - 1,
    })

    await ctx.raw.mutation(api.revalidation.recoverExpiredDeliveries, { now })

    const rows = await ctx.readAll('outboxEvents')
    expect(rows.find((item) => String(item._id) === activeId)).toMatchObject({
      status: 'delivering',
    })
    expect(rows.find((item) => String(item._id) === expiredId)).toMatchObject({
      status: 'pending',
      lockedAt: null,
      lockExpiresAt: null,
      lastError: 'Delivery lock expired before completion.',
    })
  })

  it('rejects a stale worker completion after a newer lease is claimed', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const eventId = await seedEvent(ctx)
    const firstClaimedAt = Date.now()
    const [firstLease] = await ctx.raw.mutation(api.revalidation.claimDueRevalidationEvents, {
      now: firstClaimedAt,
      limit: 1,
    })

    const recoveredAt = firstClaimedAt + 2 * 60 * 1000 + 1
    await ctx.raw.mutation(api.revalidation.recoverExpiredDeliveries, { now: recoveredAt })
    const [secondLease] = await ctx.raw.mutation(api.revalidation.claimDueRevalidationEvents, {
      now: recoveredAt + 1,
      limit: 1,
    })

    await expect(
      ctx.raw.mutation(api.revalidation.recordRevalidationDelivery, {
        eventId,
        deliveryGeneration: firstLease.deliveryGeneration,
        leaseId: firstLease.leaseId,
        ok: true,
        now: recoveredAt + 2,
      }),
    ).resolves.toBe(false)
    expect(
      (await ctx.readAll('outboxEvents')).find((row) => String(row._id) === eventId),
    ).toMatchObject({
      status: 'delivering',
      deliveryGeneration: secondLease.deliveryGeneration,
      leaseId: secondLease.leaseId,
    })

    await expect(
      ctx.raw.mutation(api.revalidation.recordRevalidationDelivery, {
        eventId,
        deliveryGeneration: secondLease.deliveryGeneration,
        leaseId: secondLease.leaseId,
        ok: true,
        now: recoveredAt + 3,
      }),
    ).resolves.toBe(true)
    expect(
      (await ctx.readAll('outboxEvents')).find((row) => String(row._id) === eventId),
    ).toMatchObject({
      status: 'delivered',
      deliveryGeneration: secondLease.deliveryGeneration,
      leaseId: null,
    })
  })

  it('delivers pending jobs and marks them delivered', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedTarget(ctx)
    const eventId = await seedEvent(ctx)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await ctx.raw.action(api.revalidation.deliverDue, {})

    expect(fetchMock).toHaveBeenCalledWith(
      'https://site.example/api/_content/revalidate',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          'x-ginko-revalidation-event': eventId,
        }),
      }),
    )
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = request.headers as Record<string, string>
    expect(headers['x-ginko-revalidate-token']).toBeUndefined()
    expect(headers['x-ginko-signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
    expect(headers['x-ginko-signature-timestamp']).toEqual(expect.any(String))
    const rowBeforeDelivery = (await ctx.readAll('outboxEvents')).find(
      (item) => String(item._id) === eventId,
    )
    expect(rowBeforeDelivery?.idempotencyKey).toBeTruthy()
    expect(JSON.parse(String(request.body))).toEqual({
      tags: ['entry:posts:hello-world', 'collection:posts'],
      paths: ['/posts/hello-world', '/posts'],
    })

    const row = (await ctx.readAll('outboxEvents')).find((item) => String(item._id) === eventId)
    expect(row).toMatchObject({
      status: 'delivered',
      attempts: 1,
      lastError: null,
      lockedAt: null,
      lockExpiresAt: null,
    })
    expect(row?.deliveredAt).toEqual(expect.any(Number))
  })

  it('[PUB-10] retries temporary public revalidation failures with backoff and preserves the delivery receipt', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const eventId = await seedEvent(ctx)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream unavailable', { status: 500 })),
    )

    await ctx.raw.action(api.revalidation.deliverDue, {})

    const row = (await ctx.readAll('outboxEvents')).find((item) => String(item._id) === eventId)
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      lockedAt: null,
      lockExpiresAt: null,
    })
    expect(row?.lastError).toContain('HTTP 500')
    expect(row?.lastError).not.toContain('upstream unavailable')
    expect(row?.nextAttemptAt).toBeGreaterThan(Date.now())
  })

  it('reuses the stable event identity when retrying delivery', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const eventId = await seedEvent(ctx)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'
    const receivedEventIds = new Set<string>()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      receivedEventIds.add(headers['x-ginko-revalidation-event']!)
      return new Response(null, {
        status: receivedEventIds.size === 1 && fetchMock.mock.calls.length === 1 ? 500 : 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await ctx.raw.action(api.revalidation.deliverDue, {})
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(eventId as never, { nextAttemptAt: Date.now() - 1 })
    })
    await ctx.raw.action(api.revalidation.deliverDue, {})

    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    ) as Array<{ tags: string[]; paths: string[] }>
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
    expect(receivedEventIds).toEqual(new Set([eventId]))
  })

  it('recovers expired locks in bounded batches and schedules remaining work', async () => {
    const ctx = createCtx()
    const now = Date.now()
    for (let index = 0; index < 27; index += 1) {
      await seedEvent(ctx, {
        status: 'delivering',
        lockedAt: now - 120_000,
        lockExpiresAt: now - index - 1,
      })
    }

    await ctx.raw.mutation(api.revalidation.recoverExpiredDeliveries, { now })

    const rows = await ctx.readAll('outboxEvents')
    expect(rows.filter((row) => row.status === 'pending')).toHaveLength(25)
    expect(rows.filter((row) => row.status === 'delivering')).toHaveLength(2)

    await ctx.raw.mutation(api.revalidation.recoverExpiredDeliveries, { now })
    expect(
      (await ctx.readAll('outboxEvents')).filter((row) => row.status === 'pending'),
    ).toHaveLength(27)
  })

  it('records delivery timeouts as retryable failures', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const eventId = await seedEvent(ctx)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Revalidation endpoint timed out.')
      }),
    )

    await ctx.raw.action(api.revalidation.deliverDue, {})

    const row = (await ctx.readAll('outboxEvents')).find((item) => String(item._id) === eventId)
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      lockedAt: null,
      lockExpiresAt: null,
    })
    expect(row?.lastError).toContain('timed out')
  })

  it('marks auth/config failures as permanent failures', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const missingSecretEventId = await seedEvent(ctx)

    await ctx.raw.action(api.revalidation.deliverDue, {})

    const missingSecretRow = (await ctx.readAll('outboxEvents')).find(
      (item) => String(item._id) === missingSecretEventId,
    )
    expect(missingSecretRow).toMatchObject({
      status: 'dead',
      attempts: 1,
      lastError: 'Missing revalidation secret env "GINKO_REVALIDATE_TOKEN_TEST".',
    })

    const ctxWithAuthFailure = createCtx()
    await seedTarget(ctxWithAuthFailure)
    const authFailureEventId = await seedEvent(ctxWithAuthFailure)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    )

    await ctxWithAuthFailure.raw.action(api.revalidation.deliverDue, {})

    const authFailureRow = (await ctxWithAuthFailure.readAll('outboxEvents')).find(
      (item) => String(item._id) === authFailureEventId,
    )
    expect(authFailureRow).toMatchObject({
      status: 'dead',
      attempts: 1,
    })
    expect(authFailureRow?.lastError).toContain('HTTP 403')
  })

  it('lets settings managers replay failed jobs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const eventId = await seedEvent(ctx, {
      status: 'failed',
      lastError: 'bad token',
      nextAttemptAt: Date.now() + 60_000,
    })

    const owner = ctx.asCmsUser('owner-1')
    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.retry-revalidation-job',
      preview: api.revalidation.previewRetryRevalidationJobOperation,
      execute: api.revalidation.retryRevalidationJobOperationExecute,
      args: { eventId },
    })

    const replayed = (await ctx.readAll('outboxEvents')).find(
      (item) => String(item._id) === eventId,
    )
    expect(replayed).toMatchObject({
      status: 'pending',
      lastError: null,
      lockedAt: null,
      lockExpiresAt: null,
    })
    expect(replayed?.nextAttemptAt).toBeLessThanOrEqual(Date.now())
  })
})
