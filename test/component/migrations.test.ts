/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { api, createCtx } from '../helpers'

function contractFixture(path: string): ResolvedContentContractV1 {
  return buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          route: path,
          i18n: true,
          cms: { type: 'flat' },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
}

async function seedTransitionEntry(ctx: ReturnType<typeof createCtx>) {
  const now = Date.now()
  const contract = contractFixture('/posts')
  const contentHash = await hashCanonicalJson(contract)
  await ctx.seed('cmsContract', {
    key: 'active',
    content: contract,
    presentation: {},
    contentHash,
    presentationHash: await hashCanonicalJson({}),
    transitionState: 'ready',
    transitionRunId: null,
    installedAt: now,
    installedBy: 'test',
  })
  const entryId = await ctx.seed('entries', {
    collection: 'posts',
    stableId: 'post-1',
    lifecycle: 'active',
    slug: 'hello',
    parentEntryId: null,
    orderRank: 'a',
    nodeKind: 'page',
    shared: { title: 'Before' },
    draftVersion: 1,
    sharedVersion: 1,
    activePublications: [],
    latestEditorialRevisionId: null,
    createdBy: 'test',
    updatedBy: 'test',
    createdAt: now,
    updatedAt: now,
  })
  await ctx.seed('entryLocaleDrafts', {
    entryId,
    locale: 'en',
    slug: null,
    values: {},
    bodyMdc: '',
    version: 1,
    updatedBy: 'test',
    updatedAt: now,
  })
  return { entryId, contract, contentHash, now }
}

async function seedAdditionalEntry(ctx: ReturnType<typeof createCtx>, suffix: string) {
  const now = Date.now() + 1
  const entryId = await ctx.seed('entries', {
    collection: 'posts',
    stableId: `post-${suffix}`,
    lifecycle: 'active',
    slug: `post-${suffix}`,
    parentEntryId: null,
    orderRank: suffix,
    nodeKind: 'page',
    shared: { title: `Post ${suffix}` },
    draftVersion: 1,
    sharedVersion: 1,
    activePublications: [],
    latestEditorialRevisionId: null,
    createdBy: 'test',
    updatedBy: 'test',
    createdAt: now,
    updatedAt: now,
  })
  await ctx.seed('entryLocaleDrafts', {
    entryId,
    locale: 'en',
    slug: null,
    values: {},
    bodyMdc: '',
    version: 1,
    updatedBy: 'test',
    updatedAt: now,
  })
  return entryId
}

function transitionOutput(current: {
  slug: string
  parentEntryId: string | null
  orderRank: string
  nodeKind: 'page' | 'folder' | 'group' | 'section' | null
  shared: Record<string, unknown>
  locales: Record<
    string,
    { slug: string | null; values: Record<string, unknown>; bodyMdc: string; version: number }
  >
}) {
  return {
    slug: current.slug,
    parentEntryId: current.parentEntryId,
    orderRank: current.orderRank,
    nodeKind: current.nodeKind,
    shared: current.shared,
    locales: Object.fromEntries(
      Object.entries(current.locales).map(([locale, value]) => [
        locale,
        {
          slug: value.slug,
          values: value.values,
          bodyMdc: value.bodyMdc,
        },
      ]),
    ),
  }
}

async function beginTransition(ctx: ReturnType<typeof createCtx>, runKey = 'route-v2') {
  const target = contractFixture('/articles')
  const targetContentHash = await hashCanonicalJson(target)
  const run = await ctx.raw.mutation(api.migrations.beginContractTransition, {
    runKey,
    targetContent: target,
    targetContentHash,
    actor: 'owner-cli',
  })
  return { target, targetContentHash, run }
}

async function stageCurrentPage(
  ctx: ReturnType<typeof createCtx>,
  runId: string,
  mutate?: (output: ReturnType<typeof transitionOutput>) => void,
) {
  const listed = await ctx.raw.query(api.migrations.listContractTransitionPage, {
    runId,
    cursor: null,
    limit: 25,
  })
  const item = listed.page[0]!
  const output = transitionOutput(item.current)
  mutate?.(output)
  const outputHash = await hashCanonicalJson(output)
  const staged = await ctx.raw.mutation(api.migrations.stageContractTransitionPage, {
    runId,
    cursor: null,
    limit: 25,
    items: [
      {
        entryId: item.entryId,
        inputDraftVersion: item.inputDraftVersion,
        inputHash: item.inputHash,
        outputHash,
        output,
      },
    ],
  })
  return { listed, item, output, staged }
}

async function stageListedPage(
  ctx: ReturnType<typeof createCtx>,
  runId: string,
  cursor: string | null,
  limit: number,
) {
  const listed = await ctx.raw.query(api.migrations.listContractTransitionPage, {
    runId,
    cursor,
    limit,
  })
  const items = await Promise.all(
    listed.page.map(async (item) => {
      const output = transitionOutput(item.current)
      return {
        entryId: item.entryId,
        inputDraftVersion: item.inputDraftVersion,
        inputHash: item.inputHash,
        outputHash: await hashCanonicalJson(output),
        output,
      }
    }),
  )
  const staged = await ctx.raw.mutation(api.migrations.stageContractTransitionPage, {
    runId,
    cursor,
    limit,
    items,
  })
  return { listed, staged }
}

describe('bounded canonical contract transitions', () => {
  it('locks writes, stages exact inputs, resumes apply, and activates atomically', async () => {
    const ctx = createCtx()
    const { entryId } = await seedTransitionEntry(ctx)
    const { run, targetContentHash } = await beginTransition(ctx)

    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        transitionState: 'locked',
        transitionRunId: String(run.runId),
      }),
    ])
    const { staged } = await stageCurrentPage(ctx, run.runId, (output) => {
      output.shared.title = 'After'
    })
    expect(staged).toMatchObject({ state: 'ready', staged: 1, stagedCount: 1 })

    await expect(
      ctx.raw.mutation(api.migrations.applyContractTransitionPage, {
        runId: run.runId,
        limit: 1,
        actor: 'owner-cli',
      }),
    ).resolves.toEqual({ applied: 1, appliedCount: 1, readyToActivate: true })
    await expect(
      ctx.raw.mutation(api.migrations.activateContractTransition, {
        runId: run.runId,
        actor: 'owner-cli',
      }),
    ).resolves.toEqual({
      state: 'complete',
      contentHash: targetContentHash,
      appliedCount: 1,
    })

    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        contentHash: targetContentHash,
        transitionState: 'ready',
        transitionRunId: null,
      }),
    ])
    const entries = await ctx.readAll('entries')
    expect(entries).toEqual([
      expect.objectContaining({
        _id: entryId,
        shared: { title: 'After' },
        draftVersion: 2,
        sharedVersion: 2,
      }),
    ])
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual([
      expect.objectContaining({ values: {}, version: 1 }),
    ])
  })

  it('rejects stale apply inputs and preserves the locked resumable run', async () => {
    const ctx = createCtx()
    const { entryId } = await seedTransitionEntry(ctx)
    const { run } = await beginTransition(ctx)
    await stageCurrentPage(ctx, run.runId)
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(entryId as never, { draftVersion: 2 })
    })

    await expect(
      ctx.raw.mutation(api.migrations.applyContractTransitionPage, {
        runId: run.runId,
        actor: 'owner-cli',
      }),
    ).rejects.toThrow(/changed after transition staging/i)
    await expect(
      ctx.raw.query(api.migrations.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({
      state: 'ready',
      appliedCount: 0,
      pendingCount: 1,
      lockActive: true,
    })
  })

  it('advances durable staging and apply cursors one bounded page at a time', async () => {
    const ctx = createCtx()
    await seedTransitionEntry(ctx)
    await seedAdditionalEntry(ctx, '2')
    const { run } = await beginTransition(ctx, 'two-page-transition')

    const first = await stageListedPage(ctx, run.runId, null, 1)
    expect(first.listed.isDone).toBe(false)
    expect(first.staged).toMatchObject({ state: 'staging', stagedCount: 1 })
    await expect(
      ctx.raw.query(api.migrations.listContractTransitionPage, {
        runId: run.runId,
        cursor: null,
        limit: 1,
      }),
    ).rejects.toThrow(/stale_cursor/i)

    const second = await stageListedPage(ctx, run.runId, first.staged.continueCursor, 1)
    expect(second.listed.isDone).toBe(true)
    expect(second.staged).toMatchObject({ state: 'ready', stagedCount: 2 })

    await expect(
      ctx.raw.mutation(api.migrations.applyContractTransitionPage, {
        runId: run.runId,
        limit: 1,
        actor: 'owner-cli',
      }),
    ).resolves.toEqual({ applied: 1, appliedCount: 1, readyToActivate: false })
    await expect(
      ctx.raw.query(api.migrations.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({ state: 'applying', appliedCount: 1, pendingCount: 1 })
    await expect(
      ctx.raw.mutation(api.migrations.applyContractTransitionPage, {
        runId: run.runId,
        limit: 1,
        actor: 'owner-cli',
      }),
    ).resolves.toEqual({ applied: 1, appliedCount: 2, readyToActivate: true })
  })

  it('requires affected public locales to be explicitly unpublished before locking', async () => {
    const ctx = createCtx()
    const { entryId, contentHash, now } = await seedTransitionEntry(ctx)
    const revisionId = await ctx.seed('entryRevisions', {
      entryId,
      collection: 'posts',
      revisionNumber: 1,
      operationId: 'publish:test',
      parentRevisionId: null,
      kind: 'publish',
      snapshots: {
        en: {
          shared: { title: 'Before' },
          values: {},
          bodyMdc: '',
          slug: 'hello',
          parentEntryId: null,
          orderRank: 'a',
          sharedVersion: 1,
          localeVersion: 1,
        },
      },
      affectedLocales: ['en'],
      contentHash,
      message: null,
      createdBy: 'test',
      createdAt: now,
    })
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(entryId as never, {
        activePublications: [
          {
            locale: 'en',
            revisionId,
            sharedVersion: 1,
            localeVersion: 1,
            activatedAt: now,
            activatedBy: 'test',
          },
        ],
      })
    })

    await expect(beginTransition(ctx)).rejects.toThrow(/requires_unpublish/i)
    expect(await ctx.readAll('contractTransitionRuns')).toEqual([])
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({ transitionState: 'ready', transitionRunId: null }),
    ])
  })

  it('permits cancellation before apply and rejects cancellation after the first applied page', async () => {
    const cancellable = createCtx()
    await seedTransitionEntry(cancellable)
    const first = await beginTransition(cancellable, 'cancel-before-apply')
    await stageCurrentPage(cancellable, first.run.runId)
    await expect(
      cancellable.raw.mutation(api.migrations.cancelContractTransition, {
        runId: first.run.runId,
      }),
    ).resolves.toEqual({ state: 'cancelled' })
    expect(await cancellable.readAll('cmsContract')).toEqual([
      expect.objectContaining({ transitionState: 'ready', transitionRunId: null }),
    ])

    const resumeOnly = createCtx()
    await seedTransitionEntry(resumeOnly)
    const second = await beginTransition(resumeOnly, 'resume-only-after-apply')
    await stageCurrentPage(resumeOnly, second.run.runId)
    await resumeOnly.raw.mutation(api.migrations.applyContractTransitionPage, {
      runId: second.run.runId,
      limit: 1,
      actor: 'owner-cli',
    })
    await expect(
      resumeOnly.raw.mutation(api.migrations.cancelContractTransition, {
        runId: second.run.runId,
      }),
    ).rejects.toThrow(/before apply begins/i)
  })
})
