/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import {
  buildDraftSearchPayload,
  deriveDraftSearchEntryState,
} from '../../packages/convex/src/entries/workflow/draftSearch'
import { projectContentCollection } from '../../packages/convex/src/lib/installedContract'
import { api, createCtx } from '../helpers'

function contractFixture(path: string, locales = ['en']): ResolvedContentContractV1 {
  return buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          route: path,
          i18n: true,
          cms: {
            type: 'flat',
            fields: {
              title: { type: 'text', localized: false, searchable: true },
            },
          },
        },
      },
    },
    { defaultLocale: locales[0]!, locales },
  )
}

function presentationFixture(label: string) {
  return { collections: { posts: { label } } }
}

async function seedTransitionEntry(ctx: ReturnType<typeof createCtx>, locales = ['en']) {
  const now = Date.now()
  const contract = contractFixture('/posts', locales)
  const contentHash = await hashCanonicalJson(contract)
  const presentation = presentationFixture('Posts')
  const presentationHash = await hashCanonicalJson(presentation)
  await ctx.seed('cmsContract', {
    key: 'active',
    content: contract,
    presentation,
    contentHash,
    presentationHash,
    writeGeneration: 1,
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
  for (const locale of locales) {
    await ctx.seed('entryLocaleDrafts', {
      entryId,
      locale,
      slug: null,
      values: {},
      bodyMdc: '',
      version: 1,
      updatedBy: 'test',
      updatedAt: now,
    })
  }
  const entry = (await ctx.readAll('entries'))[0]!
  const localeDrafts = await ctx.readAll('entryLocaleDrafts')
  const collection = projectContentCollection(contract.collections.posts!, {
    contentHash,
    presentation,
    installedAt: now,
    installedBy: 'test',
  })
  const entryState = deriveDraftSearchEntryState(entry, localeDrafts, collection)
  for (const localeDraft of localeDrafts) {
    await ctx.seed(
      'draftSearchEntries',
      buildDraftSearchPayload(entry, localeDraft, collection, entryState, localeDraft.locale),
    )
  }
  return { entryId, contract, contentHash, presentation, presentationHash, now }
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

async function beginTransition(
  ctx: ReturnType<typeof createCtx>,
  runKey = 'route-v2',
  locales = ['en'],
) {
  const target = contractFixture('/articles', locales)
  const targetContentHash = await hashCanonicalJson(target)
  const targetPresentation = presentationFixture('Articles')
  const targetPresentationHash = await hashCanonicalJson(targetPresentation)
  const run = await ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
    runKey,
    targetContent: target,
    targetContentHash,
    targetPresentation,
    targetPresentationHash,
    actor: 'owner-cli',
  })
  return { target, targetContentHash, targetPresentation, targetPresentationHash, run }
}

async function stageCurrentPage(
  ctx: ReturnType<typeof createCtx>,
  runId: string,
  mutate?: (output: ReturnType<typeof transitionOutput>) => void,
) {
  const status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, {
    runId,
  })
  const listed = await ctx.raw.query(api.contractTransitions.listContractTransitionPage, {
    runId,
    generation: status.generation,
    cursor: status.cursor,
    limit: 25,
  })
  const item = listed.page[0]!
  const output = transitionOutput(item.current)
  mutate?.(output)
  const outputHash = await hashCanonicalJson(output)
  const staged = await ctx.raw.mutation(api.contractTransitions.stageContractTransitionPage, {
    runId,
    generation: status.generation,
    cursor: status.cursor,
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
  const validated = await validateAllPages(ctx, runId)
  return { listed, item, output, staged, validated }
}

async function validateAllPages(ctx: ReturnType<typeof createCtx>, runId: string, limit = 25) {
  let status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  while (status.state === 'validating') {
    await ctx.raw.mutation(api.contractTransitions.validateContractTransitionPage, {
      runId,
      generation: status.generation,
      cursor: status.cursor,
      limit,
    })
    status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  }
  return status
}

async function applyNextPage(ctx: ReturnType<typeof createCtx>, runId: string, limit = 25) {
  const status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  return await ctx.raw.mutation(api.contractTransitions.applyContractTransitionPage, {
    runId,
    generation: status.generation,
    cursor: status.cursor,
    limit,
    actor: 'owner-cli',
  })
}

async function activateTransition(ctx: ReturnType<typeof createCtx>, runId: string) {
  const status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId })
  return await ctx.raw.mutation(api.contractTransitions.activateContractTransition, {
    runId,
    generation: status.generation,
    actor: 'owner-cli',
  })
}

async function stageListedPage(
  ctx: ReturnType<typeof createCtx>,
  runId: string,
  cursor: string | null,
  limit: number,
) {
  const status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, {
    runId,
  })
  const listed = await ctx.raw.query(api.contractTransitions.listContractTransitionPage, {
    runId,
    generation: status.generation,
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
  const staged = await ctx.raw.mutation(api.contractTransitions.stageContractTransitionPage, {
    runId,
    generation: status.generation,
    cursor,
    limit,
    items,
  })
  return { listed, staged }
}

describe('bounded canonical contract transitions', () => {
  it('[DEV-05] locks writes, stages exact inputs, resumes apply, and activates atomically', async () => {
    const ctx = createCtx()
    const { entryId, contentHash, presentation, presentationHash } = await seedTransitionEntry(ctx)
    const { run, target, targetContentHash, targetPresentation, targetPresentationHash } =
      await beginTransition(ctx)

    expect(run).toMatchObject({
      fromContentHash: contentHash,
      toContentHash: targetContentHash,
      fromPresentationHash: presentationHash,
      toPresentationHash: targetPresentationHash,
    })
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({
      fromContentHash: contentHash,
      toContentHash: targetContentHash,
      fromPresentationHash: presentationHash,
      toPresentationHash: targetPresentationHash,
      lockActive: true,
    })

    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        transitionState: 'locked',
        transitionRunId: String(run.runId),
      }),
    ])
    const { staged, validated } = await stageCurrentPage(ctx, run.runId, (output) => {
      output.shared.title = 'After'
    })
    expect(staged).toMatchObject({ state: 'validating', staged: 1, stagedCount: 1 })
    expect(validated).toMatchObject({ state: 'ready', validatedCount: 1 })

    await expect(applyNextPage(ctx, run.runId, 1)).resolves.toMatchObject({
      applied: 1,
      appliedCount: 1,
      readyToActivate: true,
    })
    const appliedEntry = (await ctx.readAll('entries'))[0]!
    const appliedLocale = (await ctx.readAll('entryLocaleDrafts'))[0]!
    const targetCollection = projectContentCollection(target.collections.posts!, {
      contentHash: targetContentHash,
      presentation: targetPresentation,
      installedAt: Date.now(),
      installedBy: 'owner-cli',
    })
    const appliedSearchRows = await ctx.readAll('draftSearchEntries')
    expect(appliedSearchRows).toHaveLength(1)
    const {
      _id: _searchId,
      _creationTime: _searchCreatedAt,
      ...appliedSearch
    } = appliedSearchRows[0]!
    expect(appliedSearch).toEqual(
      buildDraftSearchPayload(
        appliedEntry,
        appliedLocale,
        targetCollection,
        deriveDraftSearchEntryState(appliedEntry, [appliedLocale], targetCollection),
      ),
    )
    expect(appliedSearch.searchText).toContain('After')
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        contentHash,
        presentation,
        presentationHash,
        transitionState: 'locked',
      }),
    ])
    await expect(activateTransition(ctx, run.runId)).resolves.toEqual({
      state: 'complete',
      contentHash: targetContentHash,
      presentationHash: targetPresentationHash,
      appliedCount: 1,
    })

    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        content: target,
        contentHash: targetContentHash,
        presentation: targetPresentation,
        presentationHash: targetPresentationHash,
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
    expect(await ctx.readAll('draftSearchEntries')).toEqual([
      expect.objectContaining({
        entryId,
        title: 'After',
        sourceDraftVersion: 2,
        sourceSharedVersion: 2,
        sourceLocaleVersion: 1,
      }),
    ])
  })

  it('rebuilds exact draft-search rows when transformed locales are added and removed', async () => {
    const ctx = createCtx()
    const { entryId } = await seedTransitionEntry(ctx, ['en', 'de'])
    await ctx.seed('contentAssetRefs', {
      sourceKind: 'draft',
      sourceId: `${entryId}:de`,
      sourceFence: { kind: 'draftVersion', version: 1 },
      assetId: 'asset-de-only',
      fieldPath: 'bodyMdc',
      locale: 'de',
      entryId,
      collection: 'posts',
    })
    const { run, target, targetContentHash, targetPresentation } = await beginTransition(
      ctx,
      'locale-search-projection',
      ['en', 'fr'],
    )
    await stageCurrentPage(ctx, run.runId, (output) => {
      output.shared.title = 'Transformed'
      output.locales.en = {
        slug: 'hello-transformed',
        values: {},
        bodyMdc: '# Searchable transformed body',
      }
      delete output.locales.de
      output.locales.fr = {
        slug: 'bonjour',
        values: {},
        bodyMdc: '# Corps français',
      }
    })

    await applyNextPage(ctx, run.runId, 1)

    const entry = (await ctx.readAll('entries'))[0]!
    const drafts = (await ctx.readAll('entryLocaleDrafts')).sort((left, right) =>
      left.locale.localeCompare(right.locale),
    )
    expect(drafts.map((row) => row.locale)).toEqual(['en', 'fr'])
    const collection = projectContentCollection(target.collections.posts!, {
      contentHash: targetContentHash,
      presentation: targetPresentation,
      installedAt: Date.now(),
      installedBy: 'owner-cli',
    })
    const entryState = deriveDraftSearchEntryState(entry, drafts, collection)
    const expected = drafts.map((row) =>
      buildDraftSearchPayload(entry, row, collection, entryState, row.locale),
    )
    const actual = (await ctx.readAll('draftSearchEntries'))
      .sort((left, right) => left.locale.localeCompare(right.locale))
      .map(({ _id: _id, _creationTime: _creationTime, ...row }) => row)
    expect(actual).toEqual(expected)
    expect(actual).toEqual([
      expect.objectContaining({
        entryId,
        locale: 'en',
        slug: 'hello-transformed',
        sourceDraftVersion: 2,
        sourceSharedVersion: 2,
        sourceLocaleVersion: 2,
      }),
      expect.objectContaining({
        entryId,
        locale: 'fr',
        slug: 'bonjour',
        sourceDraftVersion: 2,
        sourceSharedVersion: 2,
        sourceLocaleVersion: 1,
      }),
    ])
    expect(actual[0]!.searchText).toContain('Searchable transformed body')
    expect(actual[1]!.searchText).toContain('Corps français')
    expect(await ctx.readAll('contentAssetRefs')).not.toContainEqual(
      expect.objectContaining({ sourceKind: 'draft', sourceId: `${entryId}:de` }),
    )
    expect(await ctx.readAll('draftSearchEntries')).not.toContainEqual(
      expect.objectContaining({ entryId, locale: 'de' }),
    )

    await expect(applyNextPage(ctx, run.runId, 1)).resolves.toMatchObject({
      applied: 0,
      appliedCount: 1,
      readyToActivate: true,
    })
    expect(await ctx.readAll('draftSearchEntries')).toHaveLength(2)
  })

  it('keeps presentation-only updates on the direct install path', async () => {
    const ctx = createCtx()
    const { contract, contentHash, presentation, presentationHash } = await seedTransitionEntry(ctx)
    const targetPresentation = presentationFixture('Editorial posts')
    const targetPresentationHash = await hashCanonicalJson(targetPresentation)

    await expect(
      ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
        runKey: 'presentation-only',
        targetContent: contract,
        targetContentHash: contentHash,
        targetPresentation,
        targetPresentationHash,
        actor: 'owner-cli',
      }),
    ).rejects.toThrow(/NOT_REQUIRED/)
    expect(await ctx.readAll('contractTransitionRuns')).toEqual([])
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({ presentation, presentationHash, transitionState: 'ready' }),
    ])

    await expect(
      ctx.raw.mutation(api.contract.installCmsContract, {
        content: contract,
        contentHash,
        presentation: targetPresentation,
        presentationHash: targetPresentationHash,
      }),
    ).resolves.toMatchObject({
      contentHash,
      presentationHash: targetPresentationHash,
      transitionState: 'ready',
    })
    expect(await ctx.readAll('contractTransitionRuns')).toEqual([])
  })

  it('validates both canonical target hashes before acquiring the write lock', async () => {
    const ctx = createCtx()
    await seedTransitionEntry(ctx)
    const target = contractFixture('/articles')
    const targetContentHash = await hashCanonicalJson(target)
    const targetPresentation = presentationFixture('Articles')
    const targetPresentationHash = await hashCanonicalJson(targetPresentation)

    await expect(
      ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
        runKey: 'bad-content-hash',
        targetContent: target,
        targetContentHash: '0'.repeat(64),
        targetPresentation,
        targetPresentationHash,
        actor: 'owner-cli',
      }),
    ).rejects.toThrow(/TARGET_HASH_MISMATCH/)
    await expect(
      ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
        runKey: 'bad-presentation-hash',
        targetContent: target,
        targetContentHash,
        targetPresentation,
        targetPresentationHash: '0'.repeat(64),
        actor: 'owner-cli',
      }),
    ).rejects.toThrow(/TARGET_PRESENTATION_HASH_MISMATCH/)
    expect(await ctx.readAll('contractTransitionRuns')).toEqual([])
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({ transitionState: 'ready', transitionRunId: null }),
    ])
  })

  it('binds run-key idempotency to canonical content and presentation hashes', async () => {
    const ctx = createCtx()
    await seedTransitionEntry(ctx)
    const first = await beginTransition(ctx, 'same-run-key')

    await expect(
      ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
        runKey: 'same-run-key',
        targetContent: first.target,
        targetContentHash: first.targetContentHash,
        targetPresentation: first.targetPresentation,
        targetPresentationHash: first.targetPresentationHash,
        actor: 'owner-cli',
      }),
    ).resolves.toMatchObject({ runId: first.run.runId, state: 'staging' })

    const otherPresentation = presentationFixture('Another editorial layout')
    await expect(
      ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
        runKey: 'same-run-key',
        targetContent: first.target,
        targetContentHash: first.targetContentHash,
        targetPresentation: otherPresentation,
        targetPresentationHash: await hashCanonicalJson(otherPresentation),
        actor: 'owner-cli',
      }),
    ).rejects.toThrow(/already targets another contract/i)
    await expect(
      ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
        runKey: 'same-run-key',
        targetContent: first.target,
        targetContentHash: first.targetContentHash,
        targetPresentation: first.targetPresentation,
        targetPresentationHash: '0'.repeat(64),
        actor: 'owner-cli',
      }),
    ).rejects.toThrow(/PRESENTATION_HASH_MISMATCH/)
    expect(await ctx.readAll('contractTransitionRuns')).toHaveLength(1)
  })

  it('rejects target presentation tampering without unlocking and resumes activation', async () => {
    const ctx = createCtx()
    const { contentHash, presentation, presentationHash } = await seedTransitionEntry(ctx)
    const { run, targetPresentation, targetPresentationHash } = await beginTransition(
      ctx,
      'tampered-presentation',
    )
    await stageCurrentPage(ctx, run.runId)
    await applyNextPage(ctx, run.runId)
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(run.runId as never, {
        targetPresentation: presentationFixture('Tampered'),
      })
    })

    await expect(activateTransition(ctx, run.runId)).rejects.toThrow(
      /TARGET_PRESENTATION_HASH_MISMATCH/,
    )
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        contentHash,
        presentation,
        presentationHash,
        transitionState: 'locked',
        transitionRunId: String(run.runId),
      }),
    ])
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({ state: 'applying', pendingCount: 0, lockActive: true })

    await ctx.raw.run(async (inner) => {
      await inner.db.patch(run.runId as never, { targetPresentation })
    })
    await expect(activateTransition(ctx, run.runId)).resolves.toMatchObject({
      state: 'complete',
      presentationHash: targetPresentationHash,
    })
  })

  it('rejects stale apply inputs and preserves the locked resumable run', async () => {
    const ctx = createCtx()
    const { entryId } = await seedTransitionEntry(ctx)
    const { run } = await beginTransition(ctx)
    await stageCurrentPage(ctx, run.runId)
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(entryId as never, { draftVersion: 2 })
    })

    await expect(applyNextPage(ctx, run.runId)).rejects.toThrow(/changed after transition staging/i)
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
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
      ctx.raw.query(api.contractTransitions.listContractTransitionPage, {
        runId: run.runId,
        generation: first.staged.generation,
        cursor: null,
        limit: 1,
      }),
    ).rejects.toThrow(/stale_cursor/i)

    const second = await stageListedPage(ctx, run.runId, first.staged.continueCursor, 1)
    expect(second.listed.isDone).toBe(true)
    expect(second.staged).toMatchObject({ state: 'validating', stagedCount: 2 })
    await expect(validateAllPages(ctx, run.runId, 1)).resolves.toMatchObject({
      state: 'ready',
      validatedCount: 2,
    })

    await expect(applyNextPage(ctx, run.runId, 1)).resolves.toMatchObject({
      applied: 1,
      appliedCount: 1,
      readyToActivate: false,
    })
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({ state: 'applying', appliedCount: 1, pendingCount: 1 })
    await expect(applyNextPage(ctx, run.runId, 1)).resolves.toMatchObject({
      applied: 1,
      appliedCount: 2,
      readyToActivate: true,
    })
  })

  it('produces the same compact staging and validation hashes across page boundaries', async () => {
    const stageWithLimit = async (limit: number, runKey: string) => {
      const ctx = createCtx()
      await seedTransitionEntry(ctx)
      await seedAdditionalEntry(ctx, '2')
      const { run } = await beginTransition(ctx, runKey)
      let cursor: string | null = null
      for (;;) {
        const page = await stageListedPage(ctx, run.runId, cursor, limit)
        if (page.listed.isDone) break
        cursor = page.staged.continueCursor
      }
      const ready = await validateAllPages(ctx, run.runId, limit)
      return {
        stagedCount: ready.stagedCount,
        validatedCount: ready.validatedCount,
        stagedHash: ready.stagedHash,
        validatedHash: ready.validatedHash,
      }
    }

    const singleItemPages = await stageWithLimit(1, 'hash-pages-one')
    const combinedPage = await stageWithLimit(10, 'hash-pages-ten')
    expect(singleItemPages).toEqual(combinedPage)
    expect(singleItemPages).toMatchObject({
      stagedCount: 2,
      validatedCount: 2,
      stagedHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(singleItemPages.validatedHash).toBe(singleItemPages.stagedHash)
  })

  it('accepts the 1,500-entry scan boundary and rejects limit plus one', async () => {
    const exact = createCtx()
    await seedTransitionEntry(exact)
    const exactRun = await beginTransition(exact, 'exact-transition-limit')
    await exact.raw.run(async (inner) => {
      await inner.db.patch(exactRun.run.runId as never, { scannedCount: 1_499 })
    })
    await expect(stageCurrentPage(exact, exactRun.run.runId)).resolves.toMatchObject({
      staged: expect.objectContaining({ scannedCount: 1_500, stagedCount: 1 }),
      validated: expect.objectContaining({ state: 'ready' }),
    })

    const over = createCtx()
    await seedTransitionEntry(over)
    const overRun = await beginTransition(over, 'over-transition-limit')
    await over.raw.run(async (inner) => {
      await inner.db.patch(overRun.run.runId as never, { scannedCount: 1_500 })
    })
    await expect(stageCurrentPage(over, overRun.run.runId)).rejects.toThrow(/at most 1500 entries/i)
    expect(await over.readAll('contractTransitionItems')).toEqual([])
  })

  it('resumes validation after a later page fails without advancing its durable fence', async () => {
    const ctx = createCtx()
    await seedTransitionEntry(ctx)
    await seedAdditionalEntry(ctx, '2')
    const { run } = await beginTransition(ctx, 'validation-page-failure')

    const first = await stageListedPage(ctx, run.runId, null, 1)
    await stageListedPage(ctx, run.runId, first.staged.continueCursor, 1)
    const beforeFirstPage = await ctx.raw.query(
      api.contractTransitions.getContractTransitionStatus,
      { runId: run.runId },
    )
    await ctx.raw.mutation(api.contractTransitions.validateContractTransitionPage, {
      runId: run.runId,
      generation: beforeFirstPage.generation,
      cursor: beforeFirstPage.cursor,
      limit: 1,
    })
    const afterFirstPage = await ctx.raw.query(
      api.contractTransitions.getContractTransitionStatus,
      { runId: run.runId },
    )
    expect(afterFirstPage).toMatchObject({
      state: 'validating',
      validatedCount: 1,
      pendingCount: 2,
    })

    const transitionItems = (await ctx.readAll('contractTransitionItems')).sort(
      (left, right) => Number(left.sequence) - Number(right.sequence),
    )
    const secondItem = transitionItems[1]!
    const originalRouteClaimsHash = String(secondItem.routeClaimsHash)
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(secondItem._id as never, { routeClaimsHash: '0'.repeat(64) })
    })

    await expect(
      ctx.raw.mutation(api.contractTransitions.validateContractTransitionPage, {
        runId: run.runId,
        generation: afterFirstPage.generation,
        cursor: afterFirstPage.cursor,
        limit: 1,
      }),
    ).rejects.toThrow(/corrupt staged route-claim metadata/i)
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({
      state: 'validating',
      generation: afterFirstPage.generation,
      cursor: afterFirstPage.cursor,
      validatedCount: 1,
    })
    expect(await ctx.readAll('contractTransitionItems')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: 0, state: 'validated' }),
        expect.objectContaining({ sequence: 1, state: 'staged' }),
      ]),
    )

    await ctx.raw.run(async (inner) => {
      await inner.db.patch(secondItem._id as never, { routeClaimsHash: originalRouteClaimsHash })
    })
    await expect(validateAllPages(ctx, run.runId, 1)).resolves.toMatchObject({
      state: 'ready',
      validatedCount: 2,
    })
  })

  it('resumes apply after a later page fails without replaying an applied page', async () => {
    const ctx = createCtx()
    await seedTransitionEntry(ctx)
    const secondEntryId = await seedAdditionalEntry(ctx, '2')
    const { run } = await beginTransition(ctx, 'apply-page-failure')

    const first = await stageListedPage(ctx, run.runId, null, 1)
    await stageListedPage(ctx, run.runId, first.staged.continueCursor, 1)
    await validateAllPages(ctx, run.runId, 1)
    await expect(applyNextPage(ctx, run.runId, 1)).resolves.toMatchObject({
      applied: 1,
      appliedCount: 1,
      readyToActivate: false,
    })
    const afterFirstPage = await ctx.raw.query(
      api.contractTransitions.getContractTransitionStatus,
      { runId: run.runId },
    )
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(secondEntryId as never, { draftVersion: 2 })
    })

    await expect(applyNextPage(ctx, run.runId, 1)).rejects.toThrow(
      /changed after transition staging/i,
    )
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({
      state: 'applying',
      generation: afterFirstPage.generation,
      cursor: afterFirstPage.cursor,
      appliedCount: 1,
    })
    expect(await ctx.readAll('contractTransitionItems')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: 0, state: 'applied' }),
        expect.objectContaining({ sequence: 1, state: 'validated' }),
      ]),
    )

    await ctx.raw.run(async (inner) => {
      await inner.db.patch(secondEntryId as never, { draftVersion: 1 })
    })
    await expect(applyNextPage(ctx, run.runId, 1)).resolves.toMatchObject({
      applied: 1,
      appliedCount: 2,
      readyToActivate: true,
    })
  })

  it('discovers affected public locales pagewise while retaining the transition lock', async () => {
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
            firstPublishedAt: now,
            activatedAt: now,
            activatedBy: 'test',
          },
        ],
      })
    })

    const { run } = await beginTransition(ctx)
    await expect(stageCurrentPage(ctx, run.runId)).rejects.toThrow(/requires_unpublish/i)
    expect(await ctx.readAll('contractTransitionRuns')).toEqual([
      expect.objectContaining({ state: 'staging', stagedCount: 0 }),
    ])
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({ transitionState: 'locked', transitionRunId: String(run.runId) }),
    ])
  })

  it('permits cancellation before apply and rejects cancellation after the first applied page', async () => {
    const cancellable = createCtx()
    await seedTransitionEntry(cancellable)
    const first = await beginTransition(cancellable, 'cancel-before-apply')
    await stageCurrentPage(cancellable, first.run.runId)
    await expect(
      cancellable.raw.mutation(api.contractTransitions.cancelContractTransition, {
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
    await applyNextPage(resumeOnly, second.run.runId, 1)
    await expect(
      resumeOnly.raw.mutation(api.contractTransitions.cancelContractTransition, {
        runId: second.run.runId,
      }),
    ).rejects.toThrow(/before apply begins/i)
  })

  it('rejects a staged transition whose final tree would reach depth six', async () => {
    const ctx = createCtx()
    const current = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            route: '/posts',
            cms: {
              type: 'tree',
              fields: { title: { type: 'text', localized: false } },
            },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const target = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            route: '/articles',
            cms: {
              type: 'tree',
              fields: { title: { type: 'text', localized: false } },
            },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const now = Date.now()
    const presentation = presentationFixture('Posts')
    await ctx.seed('cmsContract', {
      key: 'active',
      content: current,
      presentation,
      contentHash: await hashCanonicalJson(current),
      presentationHash: await hashCanonicalJson(presentation),
      writeGeneration: 1,
      transitionState: 'ready',
      transitionRunId: null,
      installedAt: now,
      installedBy: 'test',
    })
    for (let index = 0; index < 6; index += 1) {
      const entryId = await ctx.seed('entries', {
        collection: 'posts',
        stableId: `depth-${index + 1}`,
        lifecycle: 'active',
        slug: `depth-${index + 1}`,
        parentEntryId: null,
        orderRank: String(index),
        nodeKind: 'page',
        shared: { title: `Depth ${index + 1}` },
        draftVersion: 1,
        sharedVersion: 1,
        activePublications: [],
        latestEditorialRevisionId: null,
        createdBy: 'test',
        updatedBy: 'test',
        createdAt: now + index,
        updatedAt: now + index,
      })
      await ctx.seed('entryLocaleDrafts', {
        entryId,
        locale: 'en',
        slug: null,
        values: {},
        bodyMdc: '',
        version: 1,
        updatedBy: 'test',
        updatedAt: now + index,
      })
    }
    const targetPresentation = presentationFixture('Articles')
    const run = await ctx.raw.mutation(api.contractTransitions.beginContractTransition, {
      runKey: 'depth-six',
      targetContent: target,
      targetContentHash: await hashCanonicalJson(target),
      targetPresentation,
      targetPresentationHash: await hashCanonicalJson(targetPresentation),
      actor: 'owner-cli',
    })
    const status = await ctx.raw.query(api.contractTransitions.getContractTransitionStatus, {
      runId: run.runId,
    })
    const listed = await ctx.raw.query(api.contractTransitions.listContractTransitionPage, {
      runId: run.runId,
      generation: status.generation,
      cursor: null,
      limit: 25,
    })
    const items = await Promise.all(
      listed.page.map(async (item, index) => {
        const output = transitionOutput(item.current)
        output.parentEntryId = index === 0 ? null : listed.page[index - 1]!.entryId
        return {
          entryId: item.entryId,
          inputDraftVersion: item.inputDraftVersion,
          inputHash: item.inputHash,
          outputHash: await hashCanonicalJson(output),
          output,
        }
      }),
    )

    await expect(
      ctx.raw.mutation(api.contractTransitions.stageContractTransitionPage, {
        runId: run.runId,
        generation: status.generation,
        cursor: null,
        limit: 25,
        items,
      }),
    ).resolves.toMatchObject({ state: 'validating', stagedCount: 6 })
    await expect(validateAllPages(ctx, run.runId)).rejects.toThrow(/tree depth of 5/i)
    expect(await ctx.readAll('contractTransitionItems')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'staged' }),
        expect.objectContaining({ state: 'staged' }),
        expect.objectContaining({ state: 'staged' }),
        expect.objectContaining({ state: 'staged' }),
        expect.objectContaining({ state: 'staged' }),
        expect.objectContaining({ state: 'staged' }),
      ]),
    )
    await expect(
      ctx.raw.query(api.contractTransitions.getContractTransitionStatus, { runId: run.runId }),
    ).resolves.toMatchObject({ state: 'validating', validatedCount: 0, cursor: null })
  })
})
