/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { upsertPublicProjection } from '../../packages/convex/src/entries/workflow/projection'
import { createCtx, publishEntry, readTestContractWriteToken, seedMember } from './entries/helpers'

const api = anyApi

afterEach(() => {
  vi.useRealTimers()
})

async function publishedFixture(options: { asset?: boolean } = {}) {
  const ctx = createCtx()
  await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
  const contract = buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          route: '/posts',
          fields: {
            title: { type: 'text', required: true },
            hero: { type: 'image', required: false },
          },
        },
        'asset-overflow': {
          type: 'page',
          source: 'content/asset-overflow/**/*.md',
          route: '/asset-overflow',
          fields: { title: { type: 'text', required: true } },
        },
        'document-overflow': {
          type: 'page',
          source: 'content/document-overflow/**/*.md',
          route: '/document-overflow',
          fields: { title: { type: 'text', required: true } },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
  const titleField = contract.collections.posts.fields[0]!
  contract.collections.posts.fields.push({
    ...titleField,
    key: 'hero',
    type: 'image',
    role: null,
    required: false,
    media: { mediaTypes: ['image/png'], aspectRatio: null },
    validation: null,
  })
  const contentHash = await hashCanonicalJson(contract)
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash,
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
  const owner = ctx.asCmsUser('owner-1')
  let assetId: string | null = null
  let assetSha256: string | null = null
  if (options.asset) {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    const storageId = await ctx.raw.run(
      async (innerCtx) => await innerCtx.storage.store(new Blob([bytes], { type: 'image/png' })),
    )
    assetSha256 = createHash('sha256').update(bytes).digest('hex')
    const uploadSession = await owner.mutation(api.assets.createAssetUploadSession, {})
    await owner.mutation(api.assets.claimAssetUploadSession, {
      sessionId: uploadSession.sessionId,
      token: uploadSession.token,
      storageId,
    })
    assetId = String(
      await owner.action(api.assets.finalizeAssetUploadSession, {
        sessionId: uploadSession.sessionId,
        token: uploadSession.token,
        filename: 'hero.png',
        scope: 'global',
      }),
    )
  }
  const entryId = await owner.createEntry({
    collection: 'posts',
    slug: 'hello-world',
    shared: { title: 'Hello world', ...(assetId ? { hero: assetId } : {}) },
  })
  await publishEntry(owner, entryId)
  const entry = (await ctx.readAll('entries')).find((row) => String(row._id) === entryId)!
  return {
    ctx,
    owner,
    contentHash,
    entryId,
    stableId: entry.stableId as string,
    assetId,
    assetSha256,
  }
}

async function addPublishedFixtures(
  ctx: ReturnType<typeof createCtx>,
  contentHash: string,
  count: number,
) {
  await ctx.raw.run(async (innerCtx) => {
    const now = Date.now()
    for (let index = 1; index <= count; index += 1) {
      const key = `post-${String(index).padStart(3, '0')}`
      const createdAt = now + index
      const entryId = await innerCtx.db.insert('entries', {
        collection: 'posts',
        stableId: key,
        lifecycle: 'active',
        slug: key,
        parentEntryId: null,
        orderRank: key,
        nodeKind: 'page',
        shared: { title: key },
        draftVersion: 1,
        sharedVersion: 1,
        activePublications: [],
        latestEditorialRevisionId: null,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        createdAt,
        updatedAt: createdAt,
      })
      const revisionId = await innerCtx.db.insert('entryRevisions', {
        entryId,
        collection: 'posts',
        revisionNumber: 1,
        operationId: `test-publish:${key}`,
        parentRevisionId: null,
        kind: 'publish',
        snapshots: {
          en: {
            shared: { title: key },
            values: { public: { navigation: true, search: true, sitemap: true } },
            bodyMdc: '',
            slug: key,
            parentEntryId: null,
            orderRank: key,
            sharedVersion: 1,
            localeVersion: 1,
          },
        },
        affectedLocales: ['en'],
        contentHash,
        message: null,
        createdBy: 'owner-1',
        createdAt,
      })
      await innerCtx.db.patch(entryId, {
        activePublications: [
          {
            locale: 'en',
            revisionId,
            sharedVersion: 1,
            localeVersion: 1,
            firstPublishedAt: createdAt,
            activatedAt: createdAt,
            activatedBy: 'owner-1',
          },
        ],
        latestEditorialRevisionId: revisionId,
      })
      await upsertPublicProjection(innerCtx, {
        entryId,
        collection: 'posts',
        locale: 'en',
        revisionId,
        stableId: key,
        parentEntryId: null,
        orderKey: key,
        slug: key,
        title: key,
        description: null,
        data: { title: key },
        searchText: key,
        cacheTags: [],
        assetFacts: [],
        navIncluded: true,
        sitemapIncluded: true,
        searchIncluded: true,
        entryCreatedAt: createdAt,
        firstPublishedAt: createdAt,
        lastPublishedAt: createdAt,
      })
    }
  })
}

function preflightAssetFacts(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1
    return {
      fieldPath: `hero.${number}`,
      assetId: `preflight-asset-${number}`,
      url: `https://assets.example.test/${number}.png`,
      expiresAt: null,
      mediaType: 'image/png' as const,
      bytes: 1,
      sha256: number.toString(16).padStart(64, '0'),
    }
  })
}

async function seedPreflightLimitRows(ctx: ReturnType<typeof createCtx>) {
  const base = (await ctx.readAll('publicEntries'))[0]!
  const { _id: _id, _creationTime: _creationTime, ...basePayload } = base
  const exactLimitAssetFacts = preflightAssetFacts(500)
  await ctx.raw.run(async (innerCtx) => {
    await innerCtx.db.patch(base._id, { assetFacts: [exactLimitAssetFacts[0]!] })
  })
  const pageSize = 250
  for (let offset = 1; offset < 5_000; offset += pageSize) {
    const end = Math.min(offset + pageSize, 5_000)
    await ctx.raw.run(async (innerCtx) => {
      for (let index = offset; index < end; index += 1) {
        const key = `preflight-post-${String(index).padStart(4, '0')}`
        const entryId =
          index < 500
            ? await innerCtx.db.insert('entries', {
                collection: 'posts',
                stableId: key,
                lifecycle: 'active',
                slug: key,
                parentEntryId: null,
                orderRank: key,
                nodeKind: 'page',
                shared: {},
                draftVersion: 1,
                sharedVersion: 1,
                activePublications: [],
                latestEditorialRevisionId: null,
                createdBy: 'owner-1',
                updatedBy: 'owner-1',
                createdAt: index + 1,
                updatedAt: index + 1,
              })
            : base.entryId
        await innerCtx.db.insert('publicEntries', {
          ...basePayload,
          entryId,
          stableId: key,
          orderKey: key,
          slug: key,
          title: key,
          assetFacts: index < 500 ? [exactLimitAssetFacts[index]!] : [],
        })
      }
    })
  }
  await ctx.raw.run(async (innerCtx) => {
    const documentOverflowEntryId = await innerCtx.db.insert('entries', {
      collection: 'document-overflow',
      stableId: 'document-overflow',
      lifecycle: 'active',
      slug: 'document-overflow',
      parentEntryId: null,
      orderRank: 'document-overflow',
      nodeKind: 'page',
      shared: {},
      draftVersion: 1,
      sharedVersion: 1,
      activePublications: [],
      latestEditorialRevisionId: null,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      createdAt: 1,
      updatedAt: 1,
    })
    await innerCtx.db.insert('publicEntries', {
      ...basePayload,
      entryId: documentOverflowEntryId,
      collection: 'document-overflow',
      stableId: 'document-overflow',
      orderKey: 'document-overflow',
      slug: 'document-overflow',
      title: 'Document overflow',
      assetFacts: [],
    })
  })

  const overflowAssetFacts = preflightAssetFacts(501)
  for (let offset = 0; offset < overflowAssetFacts.length; offset += pageSize) {
    const end = Math.min(offset + pageSize, overflowAssetFacts.length)
    await ctx.raw.run(async (innerCtx) => {
      for (let index = offset; index < end; index += 1) {
        const key = `asset-overflow-${String(index).padStart(3, '0')}`
        const entryId = await innerCtx.db.insert('entries', {
          collection: 'asset-overflow',
          stableId: key,
          lifecycle: 'active',
          slug: key,
          parentEntryId: null,
          orderRank: key,
          nodeKind: 'page',
          shared: {},
          draftVersion: 1,
          sharedVersion: 1,
          activePublications: [],
          latestEditorialRevisionId: null,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: index + 1,
          updatedAt: index + 1,
        })
        await innerCtx.db.insert('publicEntries', {
          ...basePayload,
          entryId,
          collection: 'asset-overflow',
          stableId: key,
          orderKey: key,
          slug: key,
          title: key,
          assetFacts: [overflowAssetFacts[index]!],
        })
      }
    })
  }
}

async function scheduledFunctionIds(ctx: ReturnType<typeof createCtx>) {
  return await ctx.raw.run(async (innerCtx) =>
    (await innerCtx.db.system.query('_scheduled_functions').collect())
      .map((row) => String(row._id))
      .sort(),
  )
}

describe('immutable published portability export', () => {
  it('accepts the exact export envelope and rejects either limit plus one before durable work', async () => {
    const { ctx, owner, contentHash } = await publishedFixture()
    await seedPreflightLimitRows(ctx)

    const exact = await owner.action(api.portability.createExportRun, {
      runId: 'export-exact-supported-envelope',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash: 'e'.repeat(64),
    })
    expect(exact).toMatchObject({
      preflight: { documentCount: 5_000, assetCount: 500 },
    })

    const durableBeforeRejections = {
      runs: await ctx.readAll('portableRuns'),
      items: await ctx.readAll('portableItems'),
      assets: await ctx.readAll('portableAssets'),
      scheduled: await scheduledFunctionIds(ctx),
    }
    await expect(
      owner.action(api.portability.createExportRun, {
        runId: 'export-document-limit-plus-one',
        deploymentId: 'test-deployment',
        scope: { collections: ['document-overflow', 'posts'] },
        sourceContentHash: contentHash,
        leaseTokenHash: 'd'.repeat(64),
      }),
    ).rejects.toThrow(/document limit/i)
    expect(await ctx.readAll('portableRuns')).toEqual(durableBeforeRejections.runs)
    expect(await ctx.readAll('portableItems')).toEqual(durableBeforeRejections.items)
    expect(await ctx.readAll('portableAssets')).toEqual(durableBeforeRejections.assets)
    expect(await scheduledFunctionIds(ctx)).toEqual(durableBeforeRejections.scheduled)

    await expect(
      owner.action(api.portability.createExportRun, {
        runId: 'export-asset-limit-plus-one',
        deploymentId: 'test-deployment',
        scope: { collections: ['asset-overflow'] },
        sourceContentHash: contentHash,
        leaseTokenHash: 'c'.repeat(64),
      }),
    ).rejects.toThrow(/asset limit/i)
    expect(await ctx.readAll('portableRuns')).toEqual(durableBeforeRejections.runs)
    expect(await ctx.readAll('portableItems')).toEqual(durableBeforeRejections.items)
    expect(await ctx.readAll('portableAssets')).toEqual(durableBeforeRejections.assets)
    expect(await scheduledFunctionIds(ctx)).toEqual(durableBeforeRejections.scheduled)
  }, 60_000)

  it('captures and cleans 101 published documents in durable 100-row pages', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-14T09:00:00.000Z') })
    const { ctx, owner, contentHash } = await publishedFixture()
    await addPublishedFixtures(ctx, contentHash, 100)
    const leaseTokenHash = 'f'.repeat(64)
    const created = (await owner.action(api.portability.createExportRun, {
      runId: 'export-page-boundary',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    await expect(
      owner.mutation(api.portability.captureExportPage, {
        runId: 'export-page-boundary',
        leaseTokenHash,
        leaseGeneration: created.leaseGeneration,
      }),
    ).resolves.toEqual({ captured: 100, complete: false })
    await expect(
      owner.mutation(api.portability.captureExportPage, {
        runId: 'export-page-boundary',
        leaseTokenHash,
        leaseGeneration: created.leaseGeneration,
      }),
    ).resolves.toEqual({ captured: 1, complete: true })
    expect(await ctx.readAll('portableItems')).toHaveLength(101)

    await owner.mutation(api.portability.sealExportRun, {
      runId: 'export-page-boundary',
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })
    await owner.mutation(api.portability.completeExportRun, {
      runId: 'export-page-boundary',
      manifestSha256: '1'.repeat(64),
      documentCount: 101,
      assetCount: 0,
    })
    expect(await ctx.readAll('portableItems')).toHaveLength(1)
    await expect(
      owner.query(api.portability.getPortabilityRunStatus, {
        runId: 'export-page-boundary',
      }),
    ).resolves.toMatchObject({ state: 'complete', phase: 'cleanup', generation: 1 })

    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    expect(await ctx.readAll('portableItems')).toHaveLength(0)
    await expect(
      owner.query(api.portability.getPortabilityRunStatus, {
        runId: 'export-page-boundary',
      }),
    ).resolves.toMatchObject({ state: 'complete', phase: null, attempts: 0 })
  })

  it('dead-letters repeated cleanup failures and resumes with the same generation fence', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-14T09:30:00.000Z') })
    const { ctx, owner, contentHash } = await publishedFixture()
    await addPublishedFixtures(ctx, contentHash, 100)
    const runId = 'export-cleanup-retry'
    const leaseTokenHash = '7'.repeat(64)
    const created = (await owner.action(api.portability.createExportRun, {
      runId,
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    await owner.mutation(api.portability.captureExportPage, {
      runId,
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })
    await owner.mutation(api.portability.captureExportPage, {
      runId,
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })
    await owner.mutation(api.portability.sealExportRun, {
      runId,
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })
    await owner.mutation(api.portability.completeExportRun, {
      runId,
      manifestSha256: '2'.repeat(64),
      documentCount: 101,
      assetCount: 0,
    })
    expect(await ctx.readAll('portableItems')).toHaveLength(1)

    const contractWriteToken = await readTestContractWriteToken(ctx)
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const [run] = await ctx.readAll('portableRuns' as never)
      await expect(
        ctx.raw.mutation(api.portability.exports.recordExportCleanupFailure, {
          runId,
          generation: run.workGeneration,
          token: run.workToken,
          contractWriteToken,
          error:
            attempt === 5
              ? 'injected export cleanup crash Bearer export-cleanup-secret'
              : `injected export cleanup crash ${attempt}`,
        }),
      ).resolves.toEqual({ status: attempt === 5 ? 'dead-lettered' : 'retrying' })
    }
    await expect(
      owner.query(api.portability.getPortabilityRunStatus, { runId }),
    ).resolves.toMatchObject({
      state: 'failed',
      phase: 'cleanup',
      attempts: 5,
      lastError: 'injected export cleanup crash Bearer [redacted]',
    })

    await expect(
      owner.action(api.portability.resumePortabilityRun, { runId }),
    ).resolves.toMatchObject({
      state: 'complete',
      phase: null,
      attempts: 0,
    })
    expect(await ctx.readAll('portableItems')).toHaveLength(0)
  })

  it('fences only conflicting public projection writes until the roster seals', async () => {
    const { ctx, owner, contentHash, entryId } = await publishedFixture()
    const [row] = (await ctx.readAll('publicEntries')) as Array<Record<string, unknown>>
    const leaseTokenHash = 'e'.repeat(64)
    const created = (await owner.action(api.portability.createExportRun, {
      runId: 'export-lease',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    const write = () =>
      ctx.raw.run(
        async (innerCtx) =>
          await upsertPublicProjection(innerCtx, {
            entryId: entryId as never,
            collection: row!.collection as string,
            locale: 'en',
            revisionId: row!.revisionId as never,
            stableId: 'hello-world',
            parentEntryId: null,
            orderKey: 'a0',
            slug: 'hello-world',
            title: 'Hello world',
            description: null,
            data: { title: 'Hello world' },
            bodyMdc: '',
            cacheTags: [],
            assetFacts: [],
            navIncluded: true,
            sitemapIncluded: true,
            searchIncluded: true,
            entryCreatedAt: row!.entryCreatedAt as number,
            firstPublishedAt: row!.firstPublishedAt as number,
            lastPublishedAt: row!.lastPublishedAt as number,
          }),
      )
    await expect(write()).rejects.toThrow(/export capture.*retry/i)
    let complete = false
    while (!complete) {
      ;({ complete } = (await owner.mutation(api.portability.captureExportPage, {
        runId: 'export-lease',
        leaseTokenHash,
        leaseGeneration: created.leaseGeneration,
      })) as { complete: boolean })
    }
    await owner.mutation(api.portability.sealExportRun, {
      runId: 'export-lease',
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })
    await expect(write()).resolves.toBeNull()
  })

  it('captures a fenced bounded roster and exports only its immutable revision', async () => {
    const { ctx, owner, contentHash, stableId } = await publishedFixture()
    const leaseTokenHash = 'a'.repeat(64)

    const created = (await owner.action(api.portability.createExportRun, {
      runId: 'export-1',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash,
    })) as { runId: string; state: string; leaseGeneration: number }

    expect(created).toMatchObject({ runId: 'export-1', state: 'capturing' })
    let capture = { complete: false, captured: 0 }
    while (!capture.complete) {
      capture = (await owner.mutation(api.portability.captureExportPage, {
        runId: created.runId,
        leaseTokenHash,
        leaseGeneration: created.leaseGeneration,
      })) as typeof capture
    }
    const ready = (await owner.mutation(api.portability.sealExportRun, {
      runId: created.runId,
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })) as { state: string; documentCount: number; assetCount: number }
    expect(ready).toEqual({ state: 'ready', documentCount: 1, assetCount: 0 })

    const page = (await owner.query(api.portability.readExportDocuments, {
      runId: created.runId,
      cursor: null,
      limit: 100,
    })) as {
      documents: Array<{ document: Record<string, unknown>; documentSha256: string }>
      cursor: string | null
    }
    expect(page.cursor).toBeNull()
    expect(page.documents).toHaveLength(1)
    expect(page.documents[0]!.document).toMatchObject({
      format: 'ginko-content-document',
      version: 1,
      collection: 'posts',
      canonicalKey: stableId,
      locale: 'en',
      shared: { title: 'Hello world' },
      localized: {},
    })
    expect(await hashCanonicalJson(page.documents[0]!.document)).toBe(
      page.documents[0]!.documentSha256,
    )

    expect(await ctx.readAll('portableItems' as never)).toEqual([
      expect.objectContaining({
        runId: 'export-1',
        collection: 'posts',
        canonicalKey: stableId,
        locale: 'en',
      }),
    ])
  })

  it('holds immutable asset facts and limits a short-lived capability to three claims', async () => {
    const { ctx, owner, contentHash, assetId, assetSha256 } = await publishedFixture({
      asset: true,
    })
    const leaseTokenHash = 'b'.repeat(64)
    const created = (await owner.action(api.portability.createExportRun, {
      runId: 'export-assets',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    let complete = false
    while (!complete) {
      ;({ complete } = (await owner.mutation(api.portability.captureExportPage, {
        runId: 'export-assets',
        leaseTokenHash,
        leaseGeneration: created.leaseGeneration,
      })) as { complete: boolean })
    }
    await owner.mutation(api.portability.sealExportRun, {
      runId: 'export-assets',
      leaseTokenHash,
      leaseGeneration: created.leaseGeneration,
    })
    const page = (await owner.query(api.portability.readExportAssets, {
      runId: 'export-assets',
      cursor: null,
      limit: 100,
    })) as { assets: Array<{ holdId: string; sha256: string; bytes: number }> }
    expect(page.assets).toEqual([expect.objectContaining({ sha256: assetSha256, bytes: 68 })])

    await expect(
      owner.mutation(api.assets.updateAsset, {
        assetId,
        filename: 'renamed-after-seal.png',
      }),
    ).rejects.toThrow(/export hold.*retry/i)
    await ctx.raw.run(async (innerCtx) => {
      const asset = await innerCtx.db.get(assetId as never)
      await innerCtx.db.patch(asset!._id, { filename: 'mutated-outside-command.png' })
    })
    const documents = (await owner.query(api.portability.readExportDocuments, {
      runId: 'export-assets',
      cursor: null,
      limit: 100,
    })) as { documents: Array<{ document: { shared: Record<string, unknown> } }> }
    expect(documents.documents[0]!.document.shared.hero).toMatchObject({
      originalFilename: 'hero.png',
      sha256: assetSha256,
    })

    const tokenHash = 'c'.repeat(64)
    const attempt = (await owner.mutation(api.portability.beginPortableAssetDownload, {
      runId: 'export-assets',
      holdId: page.assets[0]!.holdId,
      downloadTokenHash: tokenHash,
    })) as { downloadGeneration: number }
    for (let expected = 1; expected <= 3; expected += 1) {
      await expect(
        owner.mutation(api.portability.claimPortableAssetDownload, {
          runId: 'export-assets',
          holdId: page.assets[0]!.holdId,
          downloadTokenHash: tokenHash,
          downloadGeneration: attempt.downloadGeneration,
        }),
      ).resolves.toMatchObject({ attempt: expected, sha256: assetSha256 })
    }
    await expect(
      owner.mutation(api.portability.claimPortableAssetDownload, {
        runId: 'export-assets',
        holdId: page.assets[0]!.holdId,
        downloadTokenHash: tokenHash,
        downloadGeneration: attempt.downloadGeneration,
      }),
    ).rejects.toThrow(/attempts.*exhausted/i)

    await owner.mutation(api.portability.completeExportRun, {
      runId: 'export-assets',
      manifestSha256: 'd'.repeat(64),
      documentCount: 1,
      assetCount: 1,
    })
    await expect(
      owner.mutation(api.assets.updateAsset, {
        assetId,
        filename: 'renamed-after-complete.png',
      }),
    ).resolves.toBeNull()
    expect(ctx).toBeDefined()
  })

  it('expires a stale capture lease and removes its partial roster and holds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T10:00:00.000Z'))
    const { ctx, owner, contentHash } = await publishedFixture({ asset: true })
    const leaseTokenHash = '9'.repeat(64)
    const first = (await owner.action(api.portability.createExportRun, {
      runId: 'export-stale-lease',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    await owner.mutation(api.portability.captureExportPage, {
      runId: 'export-stale-lease',
      leaseTokenHash,
      leaseGeneration: first.leaseGeneration,
    })
    expect(await ctx.readAll('portableItems' as never)).toHaveLength(1)
    expect(await ctx.readAll('portableAssets' as never)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(60_001)
    await ctx.raw.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(0)
    await ctx.raw.finishInProgressScheduledFunctions()

    expect(await ctx.readAll('portableItems' as never)).toHaveLength(0)
    expect(await ctx.readAll('portableAssets' as never)).toHaveLength(0)
    expect(await ctx.readAll('portableRuns' as never)).toContainEqual(
      expect.objectContaining({ runId: 'export-stale-lease', state: 'expired' }),
    )
    const restarted = (await owner.action(api.portability.createExportRun, {
      runId: 'export-after-stale-lease',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContentHash: contentHash,
      leaseTokenHash: '8'.repeat(64),
    })) as { leaseGeneration: number }
    expect(restarted.leaseGeneration).toBeGreaterThan(first.leaseGeneration)
  })
})
