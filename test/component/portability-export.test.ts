/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { upsertPublicProjection } from '../../packages/convex/src/entries/workflow/projection'
import { executeConfirmedOperation } from '../helpers'
import { createCtx, seedMember } from './entries/helpers'

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
  const contractSha256 = await hashCanonicalJson(contract)
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash: contractSha256,
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
  const [collection] = (await ctx.readAll('collections')) as Array<{ _id: string }>
  const now = Date.now()
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
    assetId = String(
      await ctx.seed(
        'assets' as never,
        {
          storageId,
          filename: 'hero.png',
          mimeType: 'image/png',
          size: bytes.byteLength,
          sha256: assetSha256,
          width: 1,
          height: 1,
          frames: 1,
          alt: null,
          caption: null,
          scope: 'global',
          entryId: null,
          collectionId: null,
          tags: [],
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deletedBy: null,
        } as never,
      ),
    )
  }
  const entryId = await ctx.seed(
    'entries' as never,
    {
      collectionId: collection!._id,
      baseSlug: 'hello-world',
      stableId: 'hello-world',
      status: 'published',
      dirtyLocales: [],
      parentEntryId: null,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: 'owner-1',
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    } as never,
  )
  const revisionId = await ctx.seed(
    'entryRevisions' as never,
    {
      entryId,
      collectionId: collection!._id,
      revisionNumber: 1,
      parentRevisionId: null,
      kind: 'publish',
      snapshot: {
        parentEntryId: null,
        orderRank: null,
        slug: 'hello-world',
        shared: { title: 'Hello world', ...(assetId ? { hero: assetId } : {}) },
        locales: {
          en: {
            slug: 'hello-world',
            path: '/posts/hello-world',
            values: { public: { navigation: true, search: true, sitemap: true } },
            bodyMdc: '',
          },
        },
      },
      affectedLocales: ['en'],
      schemaVersion: contractSha256,
      message: null,
      createdBy: 'owner-1',
      createdAt: now,
    } as never,
  )
  await ctx.seed(
    'publicEntries' as never,
    {
      entryId,
      collectionId: collection!._id,
      locale: 'en',
      revisionId,
      stableId: 'hello-world',
      parentEntryId: null,
      orderKey: 'a0',
      slug: 'hello-world',
      path: '/posts/hello-world',
      href: '/posts/hello-world',
      title: 'Hello world',
      description: null,
      data: { title: 'Hello world', ...(assetId ? { hero: assetId } : {}) },
      bodyMdc: '',
      cacheTags: [],
      assetFacts: [],
      navIncluded: true,
      sitemapIncluded: true,
      searchIncluded: true,
      entryCreatedAt: now,
      firstPublishedAt: now,
      lastPublishedAt: now,
    } as never,
  )
  const owner = ctx.asCmsUser('owner-1')
  return { ctx, owner, contractSha256, entryId: String(entryId), assetId, assetSha256 }
}

describe('immutable published portability export', () => {
  it('captures 101 published documents in bounded 100-row pages', async () => {
    const { ctx, owner, contractSha256 } = await publishedFixture()
    const [collection] = (await ctx.readAll('collections')) as Array<{ _id: string }>
    const now = Date.now()
    for (let index = 1; index <= 100; index += 1) {
      const key = `post-${String(index).padStart(3, '0')}`
      const entryId = await ctx.seed(
        'entries' as never,
        {
          collectionId: collection!._id,
          baseSlug: key,
          stableId: key,
          status: 'published',
          dirtyLocales: [],
          parentEntryId: null,
          orderRank: null,
          nodeKind: 'page',
          sortCache: {},
          draftVersion: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          publishedBy: 'owner-1',
          createdAt: now + index,
          updatedAt: now + index,
          publishedAt: now + index,
        } as never,
      )
      const revisionId = await ctx.seed(
        'entryRevisions' as never,
        {
          entryId,
          collectionId: collection!._id,
          revisionNumber: 1,
          parentRevisionId: null,
          kind: 'publish',
          snapshot: {
            parentEntryId: null,
            orderRank: null,
            slug: key,
            shared: { title: key },
            locales: {
              en: {
                slug: key,
                path: `/posts/${key}`,
                values: { public: { navigation: true, search: true, sitemap: true } },
                bodyMdc: '',
              },
            },
          },
          affectedLocales: ['en'],
          schemaVersion: contractSha256,
          message: null,
          createdBy: 'owner-1',
          createdAt: now + index,
        } as never,
      )
      await ctx.seed(
        'publicEntries' as never,
        {
          entryId,
          collectionId: collection!._id,
          locale: 'en',
          revisionId,
          stableId: key,
          parentEntryId: null,
          orderKey: key,
          slug: key,
          path: `/posts/${key}`,
          href: `/posts/${key}`,
          title: key,
          description: null,
          data: { title: key },
          bodyMdc: '',
          cacheTags: [],
          assetFacts: [],
          navIncluded: true,
          sitemapIncluded: true,
          searchIncluded: true,
          entryCreatedAt: now + index,
          firstPublishedAt: now + index,
          lastPublishedAt: now + index,
        } as never,
      )
    }
    const leaseTokenHash = 'f'.repeat(64)
    const created = (await owner.mutation(api.portability.createExportRun, {
      runId: 'export-page-boundary',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContractSha256: contractSha256,
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
    expect(await ctx.readAll('portableExportRoster')).toHaveLength(101)
  })

  it('fences only conflicting public projection writes until the roster seals', async () => {
    const { ctx, owner, contractSha256, entryId } = await publishedFixture()
    const [row] = (await ctx.readAll('publicEntries')) as Array<Record<string, unknown>>
    const leaseTokenHash = 'e'.repeat(64)
    const created = (await owner.mutation(api.portability.createExportRun, {
      runId: 'export-lease',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContractSha256: contractSha256,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    const write = () =>
      ctx.raw.run(
        async (innerCtx) =>
          await upsertPublicProjection(innerCtx, {
            entryId: entryId as never,
            collectionId: row!.collectionId as never,
            locale: 'en',
            revisionId: row!.revisionId as never,
            stableId: 'hello-world',
            parentEntryId: null,
            orderKey: 'a0',
            slug: 'hello-world',
            path: '/posts/hello-world',
            href: '/posts/hello-world',
            title: 'Hello world',
            description: null,
            data: { title: 'Hello world' },
            bodyMdc: '',
            cacheTags: [],
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
    const { ctx, owner, contractSha256 } = await publishedFixture()
    const leaseTokenHash = 'a'.repeat(64)

    const created = (await owner.mutation(api.portability.createExportRun, {
      runId: 'export-1',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContractSha256: contractSha256,
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
      canonicalKey: 'hello-world',
      locale: 'en',
      shared: { title: 'Hello world' },
      localized: {},
    })
    expect(await hashCanonicalJson(page.documents[0]!.document)).toBe(
      page.documents[0]!.documentSha256,
    )

    expect(await ctx.readAll('portableExportRoster' as never)).toEqual([
      expect.objectContaining({
        runId: 'export-1',
        collection: 'posts',
        canonicalKey: 'hello-world',
        locale: 'en',
      }),
    ])
  })

  it('holds immutable asset facts and limits a short-lived capability to three claims', async () => {
    const { ctx, owner, contractSha256, assetId, assetSha256 } = await publishedFixture({
      asset: true,
    })
    const leaseTokenHash = 'b'.repeat(64)
    const created = (await owner.mutation(api.portability.createExportRun, {
      runId: 'export-assets',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContractSha256: contractSha256,
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

    await expect(
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.delete-asset',
        preview: api.assets.previewDeleteAssetOperation,
        execute: api.assets.deleteAssetOperationExecute,
        args: { assetId, force: true },
      }),
    ).rejects.toThrow(/export hold.*retry/i)

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
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.delete-asset',
        preview: api.assets.previewDeleteAssetOperation,
        execute: api.assets.deleteAssetOperationExecute,
        args: { assetId, force: true },
      }),
    ).resolves.toBeNull()
    expect(ctx).toBeDefined()
  })

  it('expires a stale capture lease and removes its partial roster and holds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T10:00:00.000Z'))
    const { ctx, owner, contractSha256 } = await publishedFixture({ asset: true })
    const leaseTokenHash = '9'.repeat(64)
    const first = (await owner.mutation(api.portability.createExportRun, {
      runId: 'export-stale-lease',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContractSha256: contractSha256,
      leaseTokenHash,
    })) as { leaseGeneration: number }
    await owner.mutation(api.portability.captureExportPage, {
      runId: 'export-stale-lease',
      leaseTokenHash,
      leaseGeneration: first.leaseGeneration,
    })
    expect(await ctx.readAll('portableExportRoster' as never)).toHaveLength(1)
    expect(await ctx.readAll('portableExportAssets' as never)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(60_001)
    await ctx.raw.finishInProgressScheduledFunctions()
    await vi.advanceTimersByTimeAsync(0)
    await ctx.raw.finishInProgressScheduledFunctions()

    expect(await ctx.readAll('portableExportRoster' as never)).toHaveLength(0)
    expect(await ctx.readAll('portableExportAssets' as never)).toHaveLength(0)
    expect(await ctx.readAll('portableRuns' as never)).toContainEqual(
      expect.objectContaining({ runId: 'export-stale-lease', state: 'expired' }),
    )
    const restarted = (await owner.mutation(api.portability.createExportRun, {
      runId: 'export-after-stale-lease',
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      sourceContractSha256: contractSha256,
      leaseTokenHash: '8'.repeat(64),
    })) as { leaseGeneration: number }
    expect(restarted.leaseGeneration).toBeGreaterThan(first.leaseGeneration)
  })
})
