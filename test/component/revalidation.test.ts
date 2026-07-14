/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCtx, executeConfirmedOperation, seedOwner } from '../helpers'

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
  },
) {
  const now = Date.now()
  return await ctx.seed(
    'outboxEvents' as never,
    {
      type: 'content.revalidate',
      status: options?.status ?? 'pending',
      idempotencyKey: `test:${now}:${Math.random()}`,
      versionId: 'version-1',
      siteId: null,
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
      target: {
        id: targetId,
        endpoint: 'https://site.example/api/_content/revalidate',
      },
    })

    const rows = await ctx.readAll('outboxEvents')
    expect(rows.find((row) => String(row._id) === dueEventId)).toMatchObject({
      status: 'delivering',
      attempts: 1,
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

  it('rejects a second enabled target in the same environment', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
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
    expect(JSON.parse(String(request.body))).toEqual({
      eventId,
      idempotencyKey: rowBeforeDelivery?.idempotencyKey,
      reason: 'publish',
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

  it('retries temporary delivery failures with backoff', async () => {
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

  it('reuses the stable idempotency key when retrying delivery', async () => {
    const ctx = createCtx()
    await seedTarget(ctx)
    const eventId = await seedEvent(ctx)
    process.env.GINKO_REVALIDATE_TOKEN_TEST = 'secret-token'
    const receivedKeys = new Set<string>()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { idempotencyKey: string }
      receivedKeys.add(body.idempotencyKey)
      return new Response(null, {
        status: receivedKeys.size === 1 && fetchMock.mock.calls.length === 1 ? 500 : 200,
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
    ) as Array<{ eventId: string; idempotencyKey: string }>
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toMatchObject({ eventId })
    expect(bodies[1]).toEqual(bodies[0])
    expect(receivedKeys.size).toBe(1)
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
      status: 'failed',
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
      status: 'failed',
      attempts: 1,
    })
    expect(authFailureRow?.lastError).toContain('HTTP 403')
  })

  it('lets settings managers replay failed jobs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
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
