/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCtx, seedMember } from './entries/helpers'

const api = anyApi
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function contractFixture() {
  const contract = buildResolvedContentContract(
    {
      collections: {
        authors: {
          type: 'page',
          source: 'content/authors/**/*.md',
          route: '/authors',
          fields: { title: { type: 'text', required: true } },
        },
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          route: '/posts',
          fields: {
            title: { type: 'text', required: true },
          },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
  const fieldTemplate = contract.collections.posts.fields[0]!
  contract.collections.posts.fields.push({
    ...fieldTemplate,
    key: 'author',
    type: 'relation',
    role: null,
    required: false,
    relation: { collection: 'authors', multiple: false },
  })
  contract.collections.posts.fields.push({
    ...fieldTemplate,
    key: 'hero',
    type: 'image',
    role: null,
    required: false,
    media: { mediaTypes: ['image/png'], aspectRatio: null },
    validation: null,
  })
  return contract
}

const documentFixture: PortableDocumentV1 = {
  format: 'ginko-content-document',
  version: 1,
  collection: 'posts',
  canonicalKey: 'hello',
  locale: 'en',
  slug: 'hello',
  parentCanonicalKey: null,
  order: null,
  shared: { title: 'Hello' },
  localized: {},
  body: { kind: 'mdc', source: '# Hello' },
  visibility: { navigation: true, search: true, sitemap: true },
}

async function installFixture(ctx: ReturnType<typeof createCtx>) {
  const contract = contractFixture()
  const contractSha256 = await hashCanonicalJson(contract)
  await ctx.raw.mutation(api.policy.installCmsPolicy, { contract, contractSha256 })
  return { contract, contractSha256 }
}

async function createPlan(
  operator: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  targetContractSha256: string,
  document: PortableDocumentV1 = documentFixture,
  options: {
    planId?: string
    expectedDraftSha256?: string | null
    effect?: 'create' | 'update' | 'skip' | 'conflict'
    assets?: Array<{
      sha256: string
      bytes: number
      mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
      effect: 'upload' | 'reuse' | 'conflict'
      referencedBy: string[]
    }>
  } = {},
) {
  const identity = {
    collection: document.collection,
    canonicalKey: document.canonicalKey,
    locale: document.locale,
  }
  const itemPayload = {
    identity,
    expectedDraftSha256: options.expectedDraftSha256 ?? null,
    effect: options.effect ?? ('create' as const),
    documentSha256: await hashCanonicalJson(document),
    dependencyKeys: [],
  }
  const itemKey = await hashCanonicalJson(identity)
  const inputSha256 = await hashCanonicalJson(itemPayload)
  const assets = await Promise.all(
    (options.assets ?? []).map(async (asset) => ({
      assetKey: asset.sha256,
      inputSha256: await hashCanonicalJson(asset),
      payload: asset,
    })),
  )
  const payload = {
    format: 'ginko-cms-portability-plan' as const,
    version: 1 as const,
    mode: 'import' as const,
    deploymentId: 'test-deployment',
    scope: { collections: [document.collection] },
    targetContractSha256,
    sourceManifestSha256: '1'.repeat(64),
    sourceContractSha256: targetContractSha256,
    itemCount: 1,
    itemRootSha256: await hashCanonicalJson([itemPayload]),
    assetCount: assets.length,
    assetRootSha256: await hashCanonicalJson(assets.map((asset) => asset.payload)),
  }
  const payloadSha256 = await hashCanonicalJson(payload)
  const planId = options.planId ?? 'plan-1'

  await operator.mutation(api.portability.createImportPlan, {
    planId,
    payload,
    payloadSha256,
  })
  await operator.mutation(api.portability.appendImportPlanItems, {
    planId,
    payloadSha256,
    items: [{ applyOrder: 0, itemKey, inputSha256, payload: itemPayload, document }],
  })
  if (assets.length > 0) {
    await operator.mutation(api.portability.appendImportPlanAssets, {
      planId,
      payloadSha256,
      assets,
    })
  }
  const run = await operator.action(api.portability.sealImportPlan, {
    planId,
    payloadSha256,
  })
  return { ...run, itemKey, inputSha256, payloadSha256, document }
}

describe('portable draft import', () => {
  it('seals exact immutable upload asset rows into the bound run', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = 'a'.repeat(64)

    const plan = await createPlan(owner, contractSha256, documentFixture, {
      assets: [
        {
          sha256,
          bytes: 68,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      ],
    })

    expect(plan.state).toBe('planned')
    expect(await ctx.readAll('portableImportPlanAssets' as never)).toEqual([
      expect.objectContaining({ planId: 'plan-1', assetKey: sha256 }),
    ])
    expect(await ctx.readAll('portableRuns' as never)).toEqual([
      expect.objectContaining({ runId: plan.runId, attachedAssetCount: 0 }),
    ])
    expect(await ctx.readAll('portableAssetStages' as never)).toEqual([
      expect.objectContaining({
        runId: plan.runId,
        sha256,
        state: 'awaiting-upload',
        storageId: null,
        assetId: null,
      }),
    ])
    await expect(
      owner.mutation(api.portability.beginImportApply, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
      }),
    ).rejects.toThrow(/asset.*attached/i)
  })

  it('fences host-mediated upload attempts by caller, token hash, generation, and lease', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = 'a'.repeat(64)
    const tokenHash = 'b'.repeat(64)
    const plan = await createPlan(owner, contractSha256, documentFixture, {
      assets: [
        {
          sha256,
          bytes: 68,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      ],
    })

    const attempt = await owner.mutation(api.portability.beginPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash: tokenHash,
      storageOrigin: 'https://some-deployment.convex.cloud',
    })
    expect(attempt).toMatchObject({ attemptGeneration: 1 })
    await expect(
      owner.mutation(api.portability.beginPortableAssetUpload, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: 'c'.repeat(64),
        storageOrigin: 'https://some-deployment.convex.cloud',
      }),
    ).rejects.toThrow(/lease|attempt/i)
    await expect(
      owner.mutation(api.portability.issuePortableAssetUploadUrl, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: tokenHash,
        attemptGeneration: 1,
      }),
    ).resolves.toMatchObject({
      state: 'awaiting-upload',
      uploadUrl: expect.any(String),
      byteLength: 68,
      mediaType: 'image/png',
      storageOrigin: 'https://some-deployment.convex.cloud',
    })

    const storageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob(['not-yet-verified'], { type: 'image/png' })),
    )) as string
    await expect(
      owner.mutation(api.portability.recordPortableAssetUpload, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: 'c'.repeat(64),
        attemptGeneration: 1,
        storageId,
      }),
    ).rejects.toThrow(/attempt|token/i)
    await owner.mutation(api.portability.recordPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash: tokenHash,
      attemptGeneration: 1,
      storageId,
    })
    expect(await ctx.readAll('portableAssetStages' as never)).toEqual([
      expect.objectContaining({ state: 'uploaded', storageId, attemptGeneration: 1 }),
    ])
    await expect(
      owner.mutation(api.portability.issuePortableAssetUploadUrl, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: tokenHash,
        attemptGeneration: 1,
      }),
    ).resolves.toMatchObject({ state: 'uploaded' })

    await ctx.raw.run(async (innerCtx) => {
      const member = await innerCtx.db
        .query('members')
        .withIndex('by_userId', (query) => query.eq('userId', 'owner-1'))
        .unique()
      if (member) await innerCtx.db.delete(member._id)
    })
    await expect(
      owner.mutation(api.portability.issuePortableAssetUploadUrl, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: tokenHash,
        attemptGeneration: 1,
      }),
    ).rejects.toThrow(/Manage portability|member/i)
  })

  it('verifies staged bytes through the storage origin and atomically attaches one managed asset', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const tokenHash = 'b'.repeat(64)
    const plan = await createPlan(owner, contractSha256, documentFixture, {
      assets: [
        {
          sha256,
          bytes: validPng.byteLength,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      ],
    })
    const storageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob([validPng], { type: 'image/png' })),
    )) as string
    const storageUrl = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.getUrl(storageId as never),
    )) as string
    const storageOrigin = new URL(storageUrl).origin
    await owner.mutation(api.portability.beginPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash: tokenHash,
      storageOrigin,
    })
    await owner.mutation(api.portability.recordPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash: tokenHash,
      attemptGeneration: 1,
      storageId,
    })
    const fetch = vi.fn(
      async () => new Response(validPng, { headers: { 'content-type': 'image/png' } }),
    )
    vi.stubGlobal('fetch', fetch)

    const result = await owner.action(api.portability.verifyPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash: tokenHash,
      attemptGeneration: 1,
    })

    expect(result).toMatchObject({ state: 'attached', assetId: expect.any(String) })
    expect(fetch).toHaveBeenCalledWith(storageUrl, expect.objectContaining({ redirect: 'error' }))
    expect(await ctx.readAll('assets')).toEqual([
      expect.objectContaining({
        storageId,
        sha256,
        size: validPng.byteLength,
        mimeType: 'image/png',
      }),
    ])
    expect(await ctx.readAll('portableRuns' as never)).toEqual([
      expect.objectContaining({ attachedAssetCount: 1 }),
    ])
    await expect(
      owner.mutation(api.portability.issuePortableAssetUploadUrl, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: tokenHash,
        attemptGeneration: 1,
      }),
    ).resolves.toEqual({ state: 'attached', assetId: result.assetId })
    await expect(
      owner.mutation(api.portability.beginPortableAssetUpload, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash: 'd'.repeat(64),
        storageOrigin,
      }),
    ).resolves.toEqual({ state: 'attached', assetId: result.assetId })
    await owner.mutation(api.portability.abortImport, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    expect(await ctx.readAll('assets')).toEqual([])
    expect(await ctx.readAll('portableAssetStages' as never)).toContainEqual(
      expect.objectContaining({
        runId: plan.runId,
        state: 'cleanup-required',
        storageId,
        assetId: null,
      }),
    )
  })

  it('structurally rewrites typed and MDC local references to the attached CMS asset ID', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const storageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob([validPng], { type: 'image/png' })),
    )) as string
    const assetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'hero.png',
        mimeType: 'image/png',
        size: validPng.byteLength,
        sha256,
        width: 1,
        height: 1,
        frames: 1,
        alt: null,
        caption: null,
        scope: 'global',
        entryId: null,
        collectionId: null,
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    const reference = {
      kind: 'local' as const,
      path: `/ginko-assets/${sha256}.png` as const,
      sha256,
      bytes: validPng.byteLength,
      mediaType: 'image/png' as const,
      originalFilename: 'hero.png',
    }
    const document = {
      ...documentFixture,
      shared: { title: 'Hello', hero: reference },
      body: { kind: 'mdc' as const, source: `![Hero](${reference.path})` },
    }
    const plan = await createPlan(owner, contractSha256, document, {
      assets: [
        {
          sha256,
          bytes: validPng.byteLength,
          mediaType: 'image/png',
          effect: 'reuse',
          referencedBy: [],
        },
      ],
    })
    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    const drafts = await ctx.readAll('entryDrafts')
    expect(drafts.find((row) => row.locale === null)?.shared).toMatchObject({ hero: assetId })
    expect(drafts.find((row) => row.locale === 'en')?.bodyMdc).toContain(String(assetId))
    expect(drafts.find((row) => row.locale === 'en')?.bodyMdc).not.toContain('/ginko-assets/')
    const identity = {
      collection: document.collection,
      canonicalKey: document.canonicalKey,
      locale: document.locale,
    }
    const itemKey = await hashCanonicalJson(identity)
    await expect(
      owner.query(api.portability.inspectPortableDrafts, {
        items: [{ itemKey, identity }],
      }),
    ).resolves.toEqual([{ itemKey, currentDraftSha256: await hashCanonicalJson(document) }])
  })

  it('preserves a run-owned attached asset once an imported draft references it', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const reference = {
      kind: 'local' as const,
      path: `/ginko-assets/${sha256}.png` as const,
      sha256,
      bytes: validPng.byteLength,
      mediaType: 'image/png' as const,
      originalFilename: 'hero.png',
    }
    const document = { ...documentFixture, shared: { title: 'Hello', hero: reference } }
    const plan = await createPlan(owner, contractSha256, document, {
      planId: 'referenced-upload-plan',
      assets: [
        {
          sha256,
          bytes: validPng.byteLength,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      ],
    })
    const storageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob([validPng], { type: 'image/png' })),
    )) as string
    const storageUrl = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.getUrl(storageId as never),
    )) as string
    const attemptTokenHash = 'd'.repeat(64)
    await owner.mutation(api.portability.beginPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash,
      storageOrigin: new URL(storageUrl).origin,
    })
    await owner.mutation(api.portability.recordPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash,
      attemptGeneration: 1,
      storageId,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(validPng, { headers: { 'content-type': 'image/png' } })),
    )
    const attached = await owner.action(api.portability.verifyPortableAssetUpload, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      sha256,
      attemptTokenHash,
      attemptGeneration: 1,
    })
    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    await owner.mutation(api.portability.abortImport, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    expect(await ctx.readAll('assets')).toContainEqual(
      expect.objectContaining({ _id: attached.assetId, storageId }),
    )
    expect(await ctx.readAll('portableAssetStages' as never)).toContainEqual(
      expect.objectContaining({ runId: plan.runId, state: 'attached', storageId }),
    )
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Boolean(await innerCtx.storage.get(storageId as never)),
      ),
    ).toBe(true)
  })

  it.each(['publisher', 'editor', 'viewer'] as const)(
    'rejects the %s role before creating portability state',
    async (role) => {
      const ctx = createCtx()
      await seedMember(ctx, { userId: `${role}-1`, role })
      const { contractSha256 } = await installFixture(ctx)
      const member = ctx.asCmsUser(`${role}-1`)

      await expect(createPlan(member, contractSha256)).rejects.toThrow('Manage portability')
      expect(await ctx.readAll('portablePlans' as never)).toEqual([])
    },
  )

  it('does not grant bulk portability to an MCP credential', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    await ctx.seed(
      'mcpCredentialSettings' as never,
      {
        apiKeyId: 'portability-key',
        ownerUserId: 'owner-1',
        label: 'Portability test',
        scopes: ['cms.portability.manage'],
        status: 'active',
        createdBy: 'owner-1',
        createdAt: Date.now(),
        updatedBy: 'owner-1',
        updatedAt: Date.now(),
      } as never,
    )
    const mcp = ctx.asMcpApiKey('portability-key', 'owner-1')

    await expect(createPlan(mcp, contractSha256)).rejects.toThrow('Manage portability')
    expect(await ctx.readAll('portablePlans' as never)).toEqual([])
  })

  it('commits one server-owned batch and replays a lost successful response', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const plan = await createPlan(owner, contractSha256)

    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    const first = await owner.action(api.portability.applyImportBatch, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    const replay = await owner.action(api.portability.applyImportBatch, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    expect(replay).toEqual(first)
    expect(first).toEqual({ committed: 1, complete: true })
    expect(await ctx.readAll('entries')).toEqual([
      expect.objectContaining({ stableId: 'hello', status: 'draft', publishedAt: null }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('portableItemReceipts' as never)).toHaveLength(1)
  })

  it('rejects an oversized document before it enters the immutable plan', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      createPlan(owner, contractSha256, {
        ...documentFixture,
        body: { kind: 'mdc', source: 'x'.repeat(257 * 1024) },
      }),
    ).rejects.toThrow(/document exceeds 256 KiB/i)
    expect(await ctx.readAll('portableImportPlanItems' as never)).toEqual([])
  })

  it('rejects an import plan above the exact entry envelope', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const payload = {
      format: 'ginko-cms-portability-plan' as const,
      version: 1 as const,
      mode: 'import' as const,
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      targetContractSha256: contractSha256,
      sourceManifestSha256: '1'.repeat(64),
      sourceContractSha256: contractSha256,
      itemCount: 100_001,
      itemRootSha256: await hashCanonicalJson([]),
      assetCount: 0,
      assetRootSha256: await hashCanonicalJson([]),
    }

    await expect(
      owner.mutation(api.portability.createImportPlan, {
        planId: 'oversized-plan',
        payload,
        payloadSha256: await hashCanonicalJson(payload),
      }),
    ).rejects.toThrow(/plan payload is invalid/i)
    expect(await ctx.readAll('portablePlans' as never)).toEqual([])
  })

  it('seals only the exact immutable plan rows and finalizes without publishing', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const plan = await createPlan(owner, contractSha256)

    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    await owner.mutation(api.portability.beginImportVerification, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    const receipt = await owner.mutation(api.portability.finalizeImport, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    expect(receipt).toMatchObject({ documentCount: 1, assetCount: 0 })
    expect(await ctx.readAll('publicEntries')).toEqual([])
    await expect(
      owner.mutation(api.portability.beginImportApply, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
      }),
    ).resolves.toEqual({ runId: plan.runId, state: 'complete' })
    await expect(
      owner.mutation(api.portability.finalizeImport, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
      }),
    ).resolves.toEqual(receipt)
  })

  it('guards updates with the exact portable draft hash and never changes publication state', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const create = await createPlan(owner, contractSha256)
    await owner.mutation(api.portability.beginImportApply, {
      runId: create.runId,
      payloadSha256: create.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: create.runId,
      payloadSha256: create.payloadSha256,
    })

    const expectedDraftSha256 = await hashCanonicalJson(documentFixture)
    const changed = {
      ...documentFixture,
      shared: { title: 'Changed' },
      body: { kind: 'mdc' as const, source: '# Changed' },
    }
    const update = await createPlan(owner, contractSha256, changed, {
      planId: 'plan-2',
      expectedDraftSha256,
      effect: 'update',
    })
    await owner.mutation(api.portability.beginImportApply, {
      runId: update.runId,
      payloadSha256: update.payloadSha256,
    })
    const batch = await owner.action(api.portability.applyImportBatch, {
      runId: update.runId,
      payloadSha256: update.payloadSha256,
    })

    expect(batch).toEqual({ committed: 1, complete: true })
    expect(await ctx.readAll('portableItemReceipts' as never)).toContainEqual(
      expect.objectContaining({ runId: update.runId, effect: 'updated-draft' }),
    )
    expect(await ctx.readAll('entries')).toEqual([
      expect.objectContaining({ status: 'draft', publishedAt: null, draftVersion: 2 }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('resolves structural portable relations to canonical stored ids', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const author = await createPlan(
      owner,
      contractSha256,
      {
        ...documentFixture,
        collection: 'authors',
        canonicalKey: 'ada',
        slug: 'ada',
        shared: { title: 'Ada' },
      },
      { planId: 'author-plan' },
    )
    await owner.mutation(api.portability.beginImportApply, {
      runId: author.runId,
      payloadSha256: author.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: author.runId,
      payloadSha256: author.payloadSha256,
    })

    const post = await createPlan(
      owner,
      contractSha256,
      {
        ...documentFixture,
        shared: {
          title: 'Hello',
          author: { collection: 'authors', canonicalKey: 'ada' },
        },
      },
      { planId: 'post-relation-plan' },
    )
    await owner.mutation(api.portability.beginImportApply, {
      runId: post.runId,
      payloadSha256: post.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: post.runId,
      payloadSha256: post.payloadSha256,
    })

    expect(await ctx.readAll('portablePlans' as never)).toContainEqual(
      expect.objectContaining({
        planId: 'post-relation-plan',
        stagedLocales: ['en'],
        stagedFieldValueCount: 4,
        stagedRelationEdgeCount: 1,
      }),
    )

    expect(await ctx.readAll('entryDrafts')).toContainEqual(
      expect.objectContaining({ locale: null, shared: { title: 'Hello', author: 'ada' } }),
    )
    const identity = {
      collection: post.document.collection,
      canonicalKey: post.document.canonicalKey,
      locale: post.document.locale,
    }
    const itemKey = await hashCanonicalJson(identity)
    await expect(
      owner.query(api.portability.inspectPortableDrafts, {
        items: [{ itemKey, identity }],
      }),
    ).resolves.toEqual([{ itemKey, currentDraftSha256: await hashCanonicalJson(post.document) }])
  })

  it('rejects a stale guarded update before creating a run', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const create = await createPlan(owner, contractSha256)
    await owner.mutation(api.portability.beginImportApply, {
      runId: create.runId,
      payloadSha256: create.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: create.runId,
      payloadSha256: create.payloadSha256,
    })

    await expect(
      createPlan(
        owner,
        contractSha256,
        { ...documentFixture, shared: { title: 'Stale' } },
        {
          planId: 'plan-stale',
          expectedDraftSha256: 'e'.repeat(64),
          effect: 'update',
        },
      ),
    ).rejects.toThrow(/conflict/i)
    expect(await ctx.readAll('portableRuns' as never)).toHaveLength(1)
  })

  it('keeps aborted and expired imports closed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T08:00:00.000Z'))
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const aborted = await createPlan(owner, contractSha256, documentFixture, {
      planId: 'abort-plan',
      assets: [
        {
          sha256,
          bytes: validPng.byteLength,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      ],
    })
    const storageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob([validPng], { type: 'image/png' })),
    )) as string
    const attemptTokenHash = 'a'.repeat(64)
    await owner.mutation(api.portability.beginPortableAssetUpload, {
      runId: aborted.runId,
      payloadSha256: aborted.payloadSha256,
      sha256,
      attemptTokenHash,
      storageOrigin: 'https://storage.example.test',
    })
    await owner.mutation(api.portability.recordPortableAssetUpload, {
      runId: aborted.runId,
      payloadSha256: aborted.payloadSha256,
      sha256,
      attemptTokenHash,
      attemptGeneration: 1,
      storageId,
    })

    await expect(
      owner.mutation(api.portability.abortImport, {
        runId: aborted.runId,
        payloadSha256: aborted.payloadSha256,
      }),
    ).resolves.toEqual({ runId: aborted.runId, state: 'aborted' })
    expect(await ctx.readAll('portableAssetStages' as never)).toContainEqual(
      expect.objectContaining({ runId: aborted.runId, state: 'cleanup-required', storageId }),
    )
    await ctx.raw.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Boolean(await innerCtx.storage.get(storageId as never)),
      ),
    ).toBe(false)
    expect(await ctx.readAll('portableAssetStages' as never)).toContainEqual(
      expect.objectContaining({ runId: aborted.runId, state: 'cleaned', storageId: null }),
    )
    await expect(
      owner.mutation(api.portability.abortImport, {
        runId: aborted.runId,
        payloadSha256: aborted.payloadSha256,
      }),
    ).resolves.toEqual({ runId: aborted.runId, state: 'aborted' })
    await expect(
      owner.mutation(api.portability.beginImportApply, {
        runId: aborted.runId,
        payloadSha256: aborted.payloadSha256,
      }),
    ).rejects.toThrow(/state is aborted/i)

    const expired = await createPlan(owner, contractSha256, documentFixture, {
      planId: 'expire-plan',
      assets: [
        {
          sha256,
          bytes: validPng.byteLength,
          mediaType: 'image/png',
          effect: 'upload',
          referencedBy: [],
        },
      ],
    })
    const expiredStorageId = (await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob([validPng], { type: 'image/png' })),
    )) as string
    const expiredTokenHash = 'e'.repeat(64)
    await owner.mutation(api.portability.beginPortableAssetUpload, {
      runId: expired.runId,
      payloadSha256: expired.payloadSha256,
      sha256,
      attemptTokenHash: expiredTokenHash,
      storageOrigin: 'https://storage.example.test',
    })
    await owner.mutation(api.portability.recordPortableAssetUpload, {
      runId: expired.runId,
      payloadSha256: expired.payloadSha256,
      sha256,
      attemptTokenHash: expiredTokenHash,
      attemptGeneration: 1,
      storageId: expiredStorageId,
    })
    await ctx.raw.run(async (innerCtx) => {
      const run = await innerCtx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', expired.runId))
        .unique()
      await innerCtx.db.patch(run!._id, { expiresAt: Date.now() - 1 })
    })
    await expect(
      owner.mutation(api.portability.expireImport, {
        runId: expired.runId,
        payloadSha256: expired.payloadSha256,
      }),
    ).resolves.toEqual({ runId: expired.runId, state: 'expired' })
    expect(await ctx.readAll('portableAssetStages' as never)).toContainEqual(
      expect.objectContaining({
        runId: expired.runId,
        state: 'cleanup-required',
        storageId: expiredStorageId,
      }),
    )
    await ctx.raw.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Boolean(await innerCtx.storage.get(expiredStorageId as never)),
      ),
    ).toBe(false)
    await expect(
      owner.mutation(api.portability.expireImport, {
        runId: expired.runId,
        payloadSha256: expired.payloadSha256,
      }),
    ).resolves.toEqual({ runId: expired.runId, state: 'expired' })
    await expect(
      owner.mutation(api.portability.beginImportApply, {
        runId: expired.runId,
        payloadSha256: expired.payloadSha256,
      }),
    ).rejects.toThrow(/expired/i)
  })

  it('closes aborted asset stages in bounded scheduled pages', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T09:00:00.000Z'))
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const assets = Array.from({ length: 101 }, (_, index) => ({
      sha256: index.toString(16).padStart(64, '0'),
      bytes: 1,
      mediaType: 'image/png' as const,
      effect: 'upload' as const,
      referencedBy: [],
    }))
    const plan = await createPlan(owner, contractSha256, documentFixture, {
      planId: 'paged-cleanup-plan',
      assets,
    })

    await owner.mutation(api.portability.abortImport, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    const beforeContinuation = await ctx.readAll('portableAssetStages' as never)
    expect(beforeContinuation.filter((stage) => stage.state === 'cleaned')).toHaveLength(100)
    expect(beforeContinuation.filter((stage) => stage.state === 'awaiting-upload')).toHaveLength(1)
    await ctx.raw.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(
      (await ctx.readAll('portableAssetStages' as never)).filter(
        (stage) => stage.state === 'cleaned',
      ),
    ).toHaveLength(101)
  })

  it('seals large plans and resumes them through bounded server-owned batches', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const rows = []
    for (let index = 0; index < 251; index += 1) {
      const identity = {
        collection: 'posts',
        canonicalKey: `page-${String(index).padStart(3, '0')}`,
        locale: 'en',
      }
      const document = { ...documentFixture, ...identity, slug: identity.canonicalKey }
      const payload = {
        identity,
        expectedDraftSha256: null,
        effect: 'create' as const,
        documentSha256: await hashCanonicalJson(document),
        dependencyKeys: [],
      }
      rows.push({
        applyOrder: -1,
        itemKey: await hashCanonicalJson(identity),
        inputSha256: await hashCanonicalJson(payload),
        payload,
        document,
      })
    }
    rows.sort((left, right) => left.itemKey.localeCompare(right.itemKey))
    rows.forEach((row, applyOrder) => (row.applyOrder = applyOrder))
    const payload = {
      format: 'ginko-cms-portability-plan' as const,
      version: 1 as const,
      mode: 'import' as const,
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      targetContractSha256: contractSha256,
      sourceManifestSha256: '1'.repeat(64),
      sourceContractSha256: contractSha256,
      itemCount: rows.length,
      itemRootSha256: await hashCanonicalJson(rows.map((row) => row.payload)),
      assetCount: 0,
      assetRootSha256: await hashCanonicalJson([]),
    }
    const payloadSha256 = await hashCanonicalJson(payload)
    await owner.mutation(api.portability.createImportPlan, {
      planId: 'paged-plan',
      payload,
      payloadSha256,
    })
    for (let offset = 0; offset < rows.length; offset += 10) {
      await owner.mutation(api.portability.appendImportPlanItems, {
        planId: 'paged-plan',
        payloadSha256,
        items: rows.slice(offset, offset + 10),
      })
    }

    await expect(
      owner.action(api.portability.sealImportPlan, {
        planId: 'paged-plan',
        payloadSha256,
      }),
    ).resolves.toEqual({ runId: 'portable-import:paged-plan', state: 'planned' })
    await owner.mutation(api.portability.beginImportApply, {
      runId: 'portable-import:paged-plan',
      payloadSha256,
    })
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: 'portable-import:paged-plan',
        payloadSha256,
      }),
    ).resolves.toEqual({ committed: 10, complete: false })
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: 'portable-import:paged-plan',
        payloadSha256,
      }),
    ).resolves.toEqual({ committed: 20, complete: false })
  })
})
