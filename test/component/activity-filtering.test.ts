/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { logActivity } from '#component/lib/activity'
import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, seedMember, seedOwner, seedSettings, type TestCtx } from '../helpers'

const api = anyApi

type SeedActivity = {
  kind: string
  outcome?: 'applied' | 'failed' | 'blocked' | 'stale'
  summary?: string
  entryId?: string | null
  collection?: string | null
  appIdentityId?: string
  actorLabel?: string | null
  createdAt: number
  detail?: Record<string, unknown> | null
}

async function seedActivity(ctx: TestCtx, activity: SeedActivity) {
  return await ctx.seed('activity', {
    kind: activity.kind,
    outcome: activity.outcome ?? 'applied',
    summary: activity.summary ?? activity.kind,
    retention: 'standard',
    entryId: activity.entryId ?? null,
    collection: activity.collection ?? null,
    locale: null,
    detail: activity.detail ?? null,
    subjectKey: null,
    appIdentityId: activity.appIdentityId ?? 'owner-1',
    actorLabel: activity.actorLabel ?? null,
    createdAt: activity.createdAt,
  })
}

async function clearActivity(ctx: TestCtx) {
  await ctx.run(async (inner) => {
    for (const row of await inner.db.query('activity').collect()) {
      await inner.db.delete(row._id)
    }
  })
}

async function listAllMatching(
  ctx: TestCtx,
  filter:
    | { kind: 'content'; entryId: string }
    | { kind: 'collection'; collection: string }
    | { kind: 'actor'; appIdentityId: string }
    | { kind: 'operation'; operationKind: string }
    | { kind: 'result'; outcome: 'applied' | 'failed' | 'blocked' | 'stale' }
    | { kind: 'time'; from: number; to: number },
) {
  const seen: Array<{ _id: string; kind: string; createdAt: number }> = []
  let cursor: string | null = null
  let isDone = false
  while (!isDone) {
    const result = await ctx.asCmsUser('owner-1').query(api.editor.listActivity, {
      filter,
      paginationOpts: { cursor, numItems: 37 },
    })
    seen.push(...result.page)
    cursor = result.continueCursor
    isDone = result.isDone
  }
  return seen
}

describe('indexed global Activity feed', () => {
  it('[COL-02] permits publishers and owners, rejects lower roles, and supports every exact indexed scope', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const targetId = await owner.createEntry({
      collection: 'posts',
      slug: 'target',
      localized: { title: 'Target' },
    })
    const otherId = await owner.createEntry({
      collection: 'docs',
      slug: 'other',
      localized: { title: 'Other' },
    })
    await clearActivity(ctx)

    await seedActivity(ctx, {
      kind: 'entry.published',
      entryId: targetId,
      collection: 'posts',
      appIdentityId: 'publisher-1',
      createdAt: 100,
    })
    await seedActivity(ctx, {
      kind: 'entry.archived',
      entryId: targetId,
      collection: 'posts',
      appIdentityId: 'owner-1',
      createdAt: 200,
    })
    await seedActivity(ctx, {
      kind: 'asset.recovered',
      entryId: null,
      collection: null,
      appIdentityId: 'publisher-1',
      createdAt: 300,
    })
    await seedActivity(ctx, {
      kind: 'entry.published',
      entryId: otherId,
      collection: 'docs',
      appIdentityId: 'owner-1',
      createdAt: 400,
    })
    await ctx.run(
      async (inner) =>
        await logActivity(inner, {
          kind: 'member.invitation.deliveryFailed',
          summary: 'Member invitation delivery failed',
          appIdentityId: 'editor-1',
          detail: { status: 'failed' },
          createdAt: 500,
        }),
    )

    const publisherPage = await ctx.asCmsUser('publisher-1').query(api.editor.listActivity, {
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(publisherPage.page).toHaveLength(1)
    await expect(
      ctx.asCmsUser('editor-1').query(api.editor.listActivity, {
        paginationOpts: { cursor: null, numItems: 1 },
      }),
    ).rejects.toThrow(/Publish entries/i)
    await expect(
      ctx.asCmsUser('viewer-1').query(api.editor.listActivity, {
        paginationOpts: { cursor: null, numItems: 1 },
      }),
    ).rejects.toThrow(/Publish entries/i)

    expect(
      (await listAllMatching(ctx, { kind: 'content', entryId: targetId })).map((row) => row.kind),
    ).toEqual(['entry.archived', 'entry.published'])
    expect(
      (await listAllMatching(ctx, { kind: 'collection', collection: 'posts' })).map(
        (row) => row.kind,
      ),
    ).toEqual(['entry.archived', 'entry.published'])
    expect(
      (await listAllMatching(ctx, { kind: 'actor', appIdentityId: 'publisher-1' })).map(
        (row) => row.kind,
      ),
    ).toEqual(['asset.recovered', 'entry.published'])
    expect(
      (await listAllMatching(ctx, { kind: 'operation', operationKind: 'entry.published' })).map(
        (row) => row.createdAt,
      ),
    ).toEqual([400, 100])
    expect(
      (await listAllMatching(ctx, { kind: 'result', outcome: 'failed' })).map((row) => row.kind),
    ).toEqual(['member.invitation.deliveryFailed'])
    expect(
      (await listAllMatching(ctx, { kind: 'time', from: 150, to: 350 })).map((row) => row.kind),
    ).toEqual(['asset.recovered', 'entry.archived'])

    await ctx.run(async (inner) => {
      const removedId = inner.db.normalizeId('entries', targetId)
      if (removedId) await inner.db.delete(removedId)
    })
    const removedTarget = await owner.query(api.editor.listActivity, {
      filter: { kind: 'content', entryId: targetId },
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(removedTarget.page).toHaveLength(2)
    expect(removedTarget.page.every((row) => row.entrySlug === null)).toBe(true)
  })

  it('[COL-02] records guarded blocked and stale receipts as filterable canonical outcomes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'deleteMe',
      localized: false,
      data: { value: 'delete' },
    })
    await owner.mutation(api.siteData.createSiteDataBlock, {
      key: 'keepMe',
      localized: false,
      data: { value: 'keep' },
    })
    const preview = await owner.mutation(api.siteData.previewDeleteSiteDataBlockOperation, {
      key: 'deleteMe',
    })

    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'keepMe',
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'CONFIRMATION_ARGUMENT_MISMATCH' })
    await expect(
      owner.mutation(api.siteData.deleteSiteDataBlockOperationExecute, {
        key: 'deleteMe',
      }),
    ).resolves.toMatchObject({ status: 'blocked', code: 'CONFIRMATION_REQUIRED' })

    const stale = await listAllMatching(ctx, { kind: 'result', outcome: 'stale' })
    const blocked = await listAllMatching(ctx, { kind: 'result', outcome: 'blocked' })
    expect(stale.map((row) => row.kind)).toEqual(['operation.stale'])
    expect(blocked.map((row) => row.kind)).toEqual(['operation.blocked'])

    const activityJson = JSON.stringify([...stale, ...blocked])
    expect(activityJson).not.toContain(preview.confirmation!.token)
    expect(activityJson).not.toContain('argsHash')
  })

  it('[COL-02] binds every keyset cursor to its exact server-side filter scope', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    for (let index = 0; index < 3; index += 1) {
      await seedActivity(ctx, {
        kind: 'entry.published',
        collection: 'posts',
        createdAt: 100,
      })
    }

    const first = await ctx.asCmsUser('owner-1').query(api.editor.listActivity, {
      filter: { kind: 'collection', collection: 'posts' },
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(first.continueCursor).not.toBeNull()

    await expect(
      ctx.asCmsUser('owner-1').query(api.editor.listActivity, {
        filter: { kind: 'operation', operationKind: 'entry.published' },
        paginationOpts: { cursor: first.continueCursor, numItems: 1 },
      }),
    ).rejects.toSatisfy((cause: unknown) => getCmsErrorData(cause)?.code === 'INVALID_CURSOR')
  })

  it('[COL-02] paginates 1,205 equal-timestamp result matches without loss, duplication, or an unrelated-row scan', async () => {
    const ctx = createCtx({ transactionLimits: { documentsRead: 80 } })
    await seedOwner(ctx)
    await seedSettings(ctx)

    for (let start = 0; start < 1_205; start += 200) {
      await ctx.run(async (inner) => {
        const end = Math.min(start + 200, 1_205)
        for (let index = start; index < end; index += 1) {
          await inner.db.insert('activity', {
            kind: 'revalidation.deliveryFailed',
            outcome: 'failed',
            summary: `Delivery failed ${index}`,
            retention: 'standard',
            entryId: null,
            collection: 'posts',
            locale: 'en',
            detail: null,
            subjectKey: null,
            appIdentityId: 'owner-1',
            actorLabel: null,
            createdAt: 1_000,
          })
        }
      })
    }
    await ctx.run(async (inner) => {
      for (let index = 0; index < 120; index += 1) {
        await inner.db.insert('activity', {
          kind: 'entry.published',
          outcome: 'applied',
          summary: `Unrelated ${index}`,
          retention: 'standard',
          entryId: null,
          collection: null,
          locale: null,
          detail: null,
          subjectKey: null,
          appIdentityId: 'owner-1',
          actorLabel: null,
          createdAt: 1_000,
        })
      }
    })

    const seen = await listAllMatching(ctx, { kind: 'result', outcome: 'failed' })
    expect(seen).toHaveLength(1_205)
    expect(new Set(seen.map((row) => row._id)).size).toBe(1_205)
    expect(seen.every((row) => row.kind === 'revalidation.deliveryFailed')).toBe(true)
  })

  it('[COL-02] returns only redacted narrative fields and rejects invalid filter values', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedActivity(ctx, {
      kind: 'member.roleChanged',
      summary: 'Changed member role for "private@example.com"',
      appIdentityId: 'owner-1',
      actorLabel: 'Owner',
      detail: { password: 'never-return-this', authorization: 'Bearer secret' },
      createdAt: 100,
    })

    const result = await ctx.asCmsUser('owner-1').query(api.editor.listActivity, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(result.page[0]?.displaySummary).toBe('Changed member role')
    expect(result.page[0]).not.toHaveProperty('summary')
    expect(result.page[0]).not.toHaveProperty('detail')
    expect(JSON.stringify(result.page[0])).not.toContain('private@example.com')
    expect(JSON.stringify(result.page[0])).not.toContain('never-return-this')

    await expect(
      ctx.asCmsUser('owner-1').query(api.editor.listActivity, {
        filter: { kind: 'actor', appIdentityId: '   ' },
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toSatisfy(
      (cause: unknown) => getCmsErrorData(cause)?.code === 'INVALID_ACTIVITY_FILTER',
    )
    await expect(
      ctx.asCmsUser('owner-1').query(api.editor.listActivity, {
        filter: { kind: 'time', from: 200, to: 100 },
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toSatisfy(
      (cause: unknown) => getCmsErrorData(cause)?.code === 'INVALID_ACTIVITY_FILTER',
    )
  })
})
