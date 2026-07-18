/// <reference types="vite/client" />

import { createHash } from 'node:crypto'

import { portableSharedDraftState } from '@lupinum/ginko-cms-contract/shared/placementGraph.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import { anyApi } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPortableDraftImportPlan } from '../../packages/cms/src/portability/plan.js'
import { createCtx, readTestContractWriteToken, seedMember } from './entries/helpers'

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

function localizedContractFixture() {
  return buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          route: { en: '/posts', de: '/beitraege' },
          i18n: true,
          cms: {
            type: 'flat',
            fields: { title: { type: 'text', localized: false, required: true } },
          },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en', 'de'] },
  )
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
  return await installContractFixture(ctx, contract)
}

async function installContractFixture(
  ctx: ReturnType<typeof createCtx>,
  contract: ResolvedContentContractV1,
) {
  const contentHash = await hashCanonicalJson(contract)
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content: contract,
    contentHash,
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
  return { contract, contentHash }
}

async function createPlan(
  ctx: ReturnType<typeof createCtx>,
  operator: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  targetContentHash: string,
  document: PortableDocumentV1 = documentFixture,
  options: {
    planId?: string
    expectedDraftSha256?: string | null
    expectedSharedSha256?: string | null
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
  const itemKey = await hashCanonicalJson(identity)
  const [inspection] = await operator.query(api.portability.inspectPortableDrafts, {
    items: [{ itemKey, identity }],
  })
  const expectedDraftSha256 = Object.hasOwn(options, 'expectedDraftSha256')
    ? (options.expectedDraftSha256 ?? null)
    : inspection.currentDraftSha256
  const expectedSharedSha256 = Object.hasOwn(options, 'expectedSharedSha256')
    ? (options.expectedSharedSha256 ?? null)
    : inspection.currentSharedSha256
  const itemPayload = {
    identity,
    expectedDraftSha256,
    expectedSharedSha256,
    effect: options.effect ?? ('create' as const),
    documentSha256: await hashCanonicalJson(document),
    sharedSha256: await hashCanonicalJson(portableSharedDraftState(document)),
    dependencyKeys: [],
  }
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
    targetContentHash,
    sourceManifestSha256: '1'.repeat(64),
    sourceContentHash: targetContentHash,
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
  const alreadyUsingFakeTimers = vi.isFakeTimers()
  if (!alreadyUsingFakeTimers) vi.useFakeTimers({ now: Date.now() })
  try {
    let run = await operator.action(api.portability.sealImportPlan, {
      planId,
      payloadSha256,
    })
    if (run.state === 'sealing') {
      await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
      run = await operator.action(api.portability.sealImportPlan, {
        planId,
        payloadSha256,
      })
    }
    if (run.state !== 'planned') throw new Error(`Portable test plan did not seal: ${run.state}`)
    return { ...run, itemKey, inputSha256, payloadSha256, document }
  } finally {
    if (!alreadyUsingFakeTimers) vi.useRealTimers()
  }
}

async function stagePagedPlan(
  operator: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  targetContentHash: string,
  options: { planId: string; itemCount: number },
) {
  const rows = []
  for (let index = 0; index < options.itemCount; index += 1) {
    const identity = {
      collection: 'posts',
      canonicalKey: `page-${String(index).padStart(4, '0')}`,
      locale: 'en',
    }
    const document = { ...documentFixture, ...identity, slug: identity.canonicalKey }
    const payload = {
      identity,
      expectedDraftSha256: null,
      expectedSharedSha256: null,
      effect: 'create' as const,
      documentSha256: await hashCanonicalJson(document),
      sharedSha256: await hashCanonicalJson(portableSharedDraftState(document)),
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
    targetContentHash,
    sourceManifestSha256: '1'.repeat(64),
    sourceContentHash: targetContentHash,
    itemCount: rows.length,
    itemRootSha256: await hashCanonicalJson(rows.map((row) => row.payload)),
    assetCount: 0,
    assetRootSha256: await hashCanonicalJson([]),
  }
  const payloadSha256 = await hashCanonicalJson(payload)
  await operator.mutation(api.portability.createImportPlan, {
    planId: options.planId,
    payload,
    payloadSha256,
  })
  for (let offset = 0; offset < rows.length; offset += 10) {
    await operator.mutation(api.portability.appendImportPlanItems, {
      planId: options.planId,
      payloadSha256,
      items: rows.slice(offset, offset + 10),
    })
  }
  return { payloadSha256, rows }
}

async function createDocumentsPlan(
  ctx: ReturnType<typeof createCtx>,
  operator: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  contract: ResolvedContentContractV1,
  targetContentHash: string,
  documents: PortableDocumentV1[],
  planId: string,
) {
  const identities = await Promise.all(
    documents.map(async (document) => {
      const identity = {
        collection: document.collection,
        canonicalKey: document.canonicalKey,
        locale: document.locale,
      }
      return { itemKey: await hashCanonicalJson(identity), identity }
    }),
  )
  const currentDraftSha256ByItemKey = new Map<string, string | null>()
  const currentSharedSha256ByItemKey = new Map<string, string | null>()
  for (let offset = 0; offset < identities.length; offset += 250) {
    const inspected = await operator.query(api.portability.inspectPortableDrafts, {
      items: identities.slice(offset, offset + 250),
    })
    for (const row of inspected) {
      currentDraftSha256ByItemKey.set(row.itemKey, row.currentDraftSha256)
      currentSharedSha256ByItemKey.set(row.itemKey, row.currentSharedSha256)
    }
  }
  const plan = await createPortableDraftImportPlan(
    {
      contract,
      documents: documents.map((document) => ({
        file: `content/${document.collection}/${document.canonicalKey}/${document.locale}.md`,
        bytes: new Uint8Array(),
        document,
      })),
      assets: [],
      manifest: {
        format: 'ginko-content-portable',
        version: 1,
        contract: { file: '.ginko/content-contract.json', sha256: targetContentHash },
        documents: [],
        assets: [],
      },
    },
    {
      deploymentId: 'test-deployment',
      targetContentHash,
      currentDraftSha256ByItemKey,
      currentSharedSha256ByItemKey,
    },
  )
  if (plan.blockers.length > 0) throw new Error(plan.blockers.join(' '))
  await operator.mutation(api.portability.createImportPlan, {
    planId,
    payload: plan.payload,
    payloadSha256: plan.payloadSha256,
  })
  for (let offset = 0; offset < plan.items.length; offset += 10) {
    await operator.mutation(api.portability.appendImportPlanItems, {
      planId,
      payloadSha256: plan.payloadSha256,
      items: plan.items.slice(offset, offset + 10),
    })
  }
  const alreadyUsingFakeTimers = vi.isFakeTimers()
  if (!alreadyUsingFakeTimers) vi.useFakeTimers({ now: Date.now() })
  try {
    let run = await operator.action(api.portability.sealImportPlan, {
      planId,
      payloadSha256: plan.payloadSha256,
    })
    if (run.state === 'sealing') {
      await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
      run = await operator.action(api.portability.sealImportPlan, {
        planId,
        payloadSha256: plan.payloadSha256,
      })
    }
    if (run.state !== 'planned') throw new Error(`Portable test plan did not seal: ${run.state}`)
    return { ...run, plan }
  } finally {
    if (!alreadyUsingFakeTimers) vi.useRealTimers()
  }
}

describe('portable draft import', () => {
  it('seals exact immutable upload asset rows into the bound run', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = 'a'.repeat(64)

    const plan = await createPlan(ctx, owner, contentHash, documentFixture, {
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
    expect(await ctx.readAll('portableAssets' as never)).toEqual([
      expect.objectContaining({ runId: plan.runId, sha256, mode: 'import' }),
    ])
    expect(await ctx.readAll('portableRuns' as never)).toEqual([
      expect.objectContaining({ runId: plan.runId, attachedAssetCount: 0 }),
    ])
    expect(await ctx.readAll('portableAssets' as never)).toEqual([
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
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = 'a'.repeat(64)
    const tokenHash = 'b'.repeat(64)
    const plan = await createPlan(ctx, owner, contentHash, documentFixture, {
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
    expect(await ctx.readAll('portableAssets' as never)).toEqual([
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

  it.each(['asset', 'upload session', 'recovery artifact', 'portability stage'] as const)(
    'rejects a storage id owned by an existing %s and never deletes its bytes during cleanup',
    async (ownerKind) => {
      const ctx = createCtx()
      await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
      const { contentHash } = await installFixture(ctx)
      const owner = ctx.asCmsUser('owner-1')
      const sha256 = createHash('sha256').update(validPng).digest('hex')
      const target = await createPlan(ctx, owner, contentHash, documentFixture, {
        planId: `storage-owner-target-${ownerKind.replaceAll(' ', '-')}`,
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
      const targetToken = '7'.repeat(64)
      await owner.mutation(api.portability.beginPortableAssetUpload, {
        runId: target.runId,
        payloadSha256: target.payloadSha256,
        sha256,
        attemptTokenHash: targetToken,
        storageOrigin: new URL(storageUrl).origin,
      })

      if (ownerKind === 'asset') {
        await ctx.seed(
          'assets' as never,
          {
            storageId,
            filename: 'existing.png',
            mimeType: 'image/png',
            size: validPng.byteLength,
            sha256: 'e'.repeat(64),
            width: 1,
            height: 1,
            frames: 1,
            alt: null,
            caption: null,
            scope: 'global',
            entryId: null,
            collection: null,
            tags: [],
            createdBy: 'owner-1',
            updatedBy: null,
            createdAt: Date.now(),
            updatedAt: null,
            deletedAt: null,
            deletedBy: null,
          } as never,
        )
      } else if (ownerKind === 'upload session') {
        const session = await owner.mutation(api.assets.createAssetUploadSession, {})
        await owner.mutation(api.assets.claimAssetUploadSession, {
          sessionId: session.sessionId,
          token: session.token,
          storageId,
        })
      } else if (ownerKind === 'recovery artifact') {
        await ctx.seed(
          'assetRecoveryArtifacts' as never,
          {
            artifactId: 'existing-recovery-artifact',
            assetId: 'existing-asset',
            collection: null,
            entryId: null,
            checksum: 'a'.repeat(64),
            storageRef: storageId,
            generation: 1,
            byteSize: validPng.byteLength,
            bytesSha256: sha256,
            assetFactsHash: 'b'.repeat(64),
            assetUpdatedAt: 1,
            createdBy: 'owner-1',
            createdAt: Date.now(),
          } as never,
        )
      } else {
        const existing = await createPlan(ctx, owner, contentHash, documentFixture, {
          planId: 'existing-storage-stage',
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
        const existingToken = '8'.repeat(64)
        await owner.mutation(api.portability.beginPortableAssetUpload, {
          runId: existing.runId,
          payloadSha256: existing.payloadSha256,
          sha256,
          attemptTokenHash: existingToken,
          storageOrigin: new URL(storageUrl).origin,
        })
        await owner.mutation(api.portability.recordPortableAssetUpload, {
          runId: existing.runId,
          payloadSha256: existing.payloadSha256,
          sha256,
          attemptTokenHash: existingToken,
          attemptGeneration: 1,
          storageId,
        })
      }

      await expect(
        owner.mutation(api.portability.recordPortableAssetUpload, {
          runId: target.runId,
          payloadSha256: target.payloadSha256,
          sha256,
          attemptTokenHash: targetToken,
          attemptGeneration: 1,
          storageId,
        }),
      ).rejects.toThrow(/already claimed/i)

      const targetStage = await ctx.raw.run(async (innerCtx) =>
        innerCtx.db
          .query('portableAssets')
          .withIndex('by_run_sha256', (query) =>
            query.eq('runId', target.runId).eq('sha256', sha256),
          )
          .unique(),
      )
      if (!targetStage || targetStage.mode !== 'import') throw new Error('Target stage missing')
      expect(targetStage).toMatchObject({ state: 'awaiting-upload', storageId: null })

      // Simulate a legacy false claim and run the real cleanup action. The other
      // canonical owner must fence deletion while this stale stage is relinquished.
      await ctx.raw.run(async (innerCtx) =>
        innerCtx.db.patch(targetStage._id, {
          state: 'cleanup-required',
          storageId: storageId as never,
        }),
      )
      await ctx.raw.action(api['portability/assets'].cleanupPortableAssetStage, {
        stageId: targetStage._id,
        storageId,
        attempt: 1,
      })

      expect(
        await ctx.raw.run(async (innerCtx) => {
          const blob = await innerCtx.storage.get(storageId as never)
          return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null
        }),
      ).toEqual(Array.from(validPng))
      expect(await ctx.raw.run(async (innerCtx) => innerCtx.db.get(targetStage._id))).toMatchObject(
        {
          state: 'cleaned',
          storageId: null,
        },
      )
    },
  )

  it('rechecks exclusive ownership at atomic asset insertion and preserves aliased bytes', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const plan = await createPlan(ctx, owner, contentHash, documentFixture, {
      planId: 'atomic-storage-owner-recheck',
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
    const attemptTokenHash = '9'.repeat(64)
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
    const originalAssetId = await ctx.seed(
      'assets' as never,
      {
        storageId,
        filename: 'concurrent-owner.png',
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
        collection: null,
        tags: [],
        createdBy: 'owner-1',
        updatedBy: null,
        createdAt: Date.now(),
        updatedAt: null,
        deletedAt: null,
        deletedBy: null,
      } as never,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(validPng, { headers: { 'content-type': 'image/png' } })),
    )

    await expect(
      owner.action(api.portability.verifyPortableAssetUpload, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        sha256,
        attemptTokenHash,
        attemptGeneration: 1,
      }),
    ).rejects.toThrow(/already claimed/i)
    const stage = await ctx.raw.run(async (innerCtx) =>
      innerCtx.db
        .query('portableAssets')
        .withIndex('by_run_sha256', (query) => query.eq('runId', plan.runId).eq('sha256', sha256))
        .unique(),
    )
    if (!stage || stage.mode !== 'import') throw new Error('Portable stage missing')
    expect(stage.state).toBe('cleanup-required')
    await ctx.raw.action(api['portability/assets'].cleanupPortableAssetStage, {
      stageId: stage._id,
      storageId,
      attempt: 1,
    })

    expect(await ctx.readAll('assets')).toEqual([
      expect.objectContaining({ _id: originalAssetId, storageId }),
    ])
    expect(
      await ctx.raw.run(async (innerCtx) => {
        const blob = await innerCtx.storage.get(storageId as never)
        return blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null
      }),
    ).toEqual(Array.from(validPng))
  })

  it('verifies staged bytes through the storage origin and atomically attaches one managed asset', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const tokenHash = 'b'.repeat(64)
    const plan = await createPlan(ctx, owner, contentHash, documentFixture, {
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
    expect(await ctx.readAll('portableAssets' as never)).toContainEqual(
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
    const { contentHash } = await installFixture(ctx)
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
        collection: null,
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
    const plan = await createPlan(ctx, owner, contentHash, document, {
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

    const entries = await ctx.readAll('entries')
    expect(entries[0]?.shared).toMatchObject({ hero: assetId })
    const drafts = await ctx.readAll('entryLocaleDrafts')
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
    ).resolves.toEqual([
      {
        itemKey,
        currentDraftSha256: await hashCanonicalJson(document),
        currentSharedSha256: await hashCanonicalJson(portableSharedDraftState(document)),
      },
    ])
  })

  it('preserves a run-owned attached asset once an imported draft references it', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
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
    const plan = await createPlan(ctx, owner, contentHash, document, {
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
    expect(await ctx.readAll('portableAssets' as never)).toContainEqual(
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
      const { contentHash } = await installFixture(ctx)
      const member = ctx.asCmsUser(`${role}-1`)

      await expect(createPlan(ctx, member, contentHash)).rejects.toThrow('Manage portability')
      expect(await ctx.readAll('portableRuns' as never)).toEqual([])
    },
  )

  it('does not grant bulk portability to an MCP credential', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
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

    await expect(createPlan(ctx, mcp, contentHash)).rejects.toThrow('Manage portability')
    expect(await ctx.readAll('portableRuns' as never)).toEqual([])
  })

  it('[IMP-02] commits one idempotent server-owned import batch and replays a lost successful response', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const plan = await createPlan(ctx, owner, contentHash)

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
      expect.objectContaining({
        stableId: 'hello',
        lifecycle: 'active',
        activePublications: [],
      }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('portableItems' as never)).toEqual([
      expect.objectContaining({ state: 'committed' }),
    ])
  })

  it('creates one canonical entry and both EN/DE locale drafts atomically', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contract, contentHash } = await installContractFixture(ctx, localizedContractFixture())
    const owner = ctx.asCmsUser('owner-1')
    const documents = [
      documentFixture,
      {
        ...documentFixture,
        locale: 'de',
        slug: 'hallo',
        body: { kind: 'mdc' as const, source: '# Hallo' },
      },
    ]
    const plan = await createDocumentsPlan(
      ctx,
      owner,
      contract,
      contentHash,
      documents,
      'fresh-en-de',
    )

    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.plan.payloadSha256,
    })
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: plan.runId,
        payloadSha256: plan.plan.payloadSha256,
      }),
    ).resolves.toEqual({ committed: 2, complete: true })

    expect(await ctx.readAll('entries')).toHaveLength(1)
    expect(
      (await ctx.readAll('entryLocaleDrafts'))
        .sort((left, right) => left.locale.localeCompare(right.locale))
        .map((row) => [row.locale, row.slug]),
    ).toEqual([
      ['de', 'hallo'],
      ['en', 'hello'],
    ])
  })

  it('adds a missing locale to an existing canonical entry without a create conflict', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contract, contentHash } = await installContractFixture(ctx, localizedContractFixture())
    const owner = ctx.asCmsUser('owner-1')
    const initial = await createPlan(ctx, owner, contentHash)
    await owner.mutation(api.portability.beginImportApply, {
      runId: initial.runId,
      payloadSha256: initial.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: initial.runId,
      payloadSha256: initial.payloadSha256,
    })
    const german = {
      ...documentFixture,
      locale: 'de',
      slug: 'hallo',
      body: { kind: 'mdc' as const, source: '# Hallo' },
    }
    const plan = await createDocumentsPlan(
      ctx,
      owner,
      contract,
      contentHash,
      [german],
      'add-de-locale',
    )
    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.plan.payloadSha256,
    })
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: plan.runId,
        payloadSha256: plan.plan.payloadSha256,
      }),
    ).resolves.toEqual({ committed: 1, complete: true })

    expect(await ctx.readAll('entries')).toEqual([
      expect.objectContaining({ stableId: 'hello', shared: { title: 'Hello' } }),
    ])
    expect((await ctx.readAll('entryLocaleDrafts')).map((row) => row.locale).sort()).toEqual([
      'de',
      'en',
    ])
  })

  it('updates shared and localized state across multiple pages without self-staleness', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contract, contentHash } = await installContractFixture(ctx, localizedContractFixture())
    const owner = ctx.asCmsUser('owner-1')
    const documents = Array.from({ length: 6 }, (_, index) =>
      (['en', 'de'] as const).map((locale) => ({
        ...documentFixture,
        canonicalKey: `entry-${index}`,
        locale,
        slug: `${locale}-entry-${index}`,
        shared: { title: `Entry ${index}` },
        body: { kind: 'mdc' as const, source: `# ${locale} ${index}` },
      })),
    ).flat()
    const initial = await createDocumentsPlan(
      ctx,
      owner,
      contract,
      contentHash,
      documents,
      'multi-page-initial',
    )
    await owner.mutation(api.portability.beginImportApply, {
      runId: initial.runId,
      payloadSha256: initial.plan.payloadSha256,
    })
    vi.useFakeTimers({ now: Date.now() })
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: initial.runId,
        payloadSha256: initial.plan.payloadSha256,
      }),
    ).resolves.toEqual({ committed: 10, complete: false })
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: initial.runId,
        payloadSha256: initial.plan.payloadSha256,
      }),
    ).resolves.toEqual({ committed: 12, complete: true })

    const changed = documents.map((document) => ({
      ...document,
      slug: `${document.slug}-changed`,
      shared: { title: `${document.shared.title} changed` },
      body: { kind: 'mdc' as const, source: `${document.body!.source}\n\nChanged` },
    }))
    const update = await createDocumentsPlan(
      ctx,
      owner,
      contract,
      contentHash,
      changed,
      'multi-page-update',
    )
    await owner.mutation(api.portability.beginImportApply, {
      runId: update.runId,
      payloadSha256: update.plan.payloadSha256,
    })
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: update.runId,
        payloadSha256: update.plan.payloadSha256,
      }),
    ).resolves.toEqual({ committed: 10, complete: false })
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: update.runId,
        payloadSha256: update.plan.payloadSha256,
      }),
    ).resolves.toEqual({ committed: 12, complete: true })
    expect(await ctx.readAll('entries')).toHaveLength(6)
    expect(
      (await ctx.readAll('entries')).every((entry) =>
        String(entry.shared.title).endsWith('changed'),
      ),
    ).toBe(true)
  })

  it('fails closed when the installed content hash changes between apply pages', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contract, contentHash } = await installContractFixture(ctx, localizedContractFixture())
    const owner = ctx.asCmsUser('owner-1')
    const documents = Array.from({ length: 6 }, (_, index) =>
      (['en', 'de'] as const).map((locale) => ({
        ...documentFixture,
        canonicalKey: `fenced-${index}`,
        locale,
        slug: `${locale}-fenced-${index}`,
        shared: { title: `Fenced ${index}` },
      })),
    ).flat()
    const plan = await createDocumentsPlan(
      ctx,
      owner,
      contract,
      contentHash,
      documents,
      'contract-change-between-pages',
    )
    vi.useFakeTimers({ now: Date.now() })
    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.plan.payloadSha256,
    })
    await owner.action(api.portability.applyImportBatch, {
      runId: plan.runId,
      payloadSha256: plan.plan.payloadSha256,
    })
    await ctx.raw.run(async (innerCtx) => {
      const installed = await innerCtx.db
        .query('cmsContract')
        .withIndex('by_key', (query) => query.eq('key', 'active'))
        .unique()
      if (installed) await innerCtx.db.patch(installed._id, { contentHash: 'f'.repeat(64) })
    })

    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: plan.runId,
        payloadSha256: plan.plan.payloadSha256,
      }),
    ).rejects.toThrow(/target content hash/i)
    expect(await ctx.readAll('entries')).toHaveLength(5)
    expect(await ctx.readAll('portableRuns' as never)).toContainEqual(
      expect.objectContaining({ runId: plan.runId, committedItemCount: 10 }),
    )
  })

  it('rejects a worker completion that arrives after its lease expiry', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const plan = await createPlan(ctx, owner, contentHash, documentFixture, {
      planId: 'expired-worker-completion',
    })
    vi.useFakeTimers({ now: Date.now() })
    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    const run = (await ctx.readAll('portableRuns' as never)).find(
      (candidate: { runId?: string }) => candidate.runId === plan.runId,
    ) as { _id: string; workGeneration: number; workToken: string | null }
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(run._id as never, { workLeaseExpiresAt: Date.now() - 1 })
    })
    const contractWriteToken = await readTestContractWriteToken(ctx)
    await expect(
      ctx.raw.mutation(api['portability/runs'].processImportWorkPage, {
        runId: plan.runId,
        generation: run.workGeneration,
        token: run.workToken!,
        contractWriteToken,
      }),
    ).resolves.toEqual({ status: 'stale' })
    expect(await ctx.readAll('entries')).toEqual([])
    expect(await ctx.readAll('portableItems' as never)).toContainEqual(
      expect.objectContaining({ runId: plan.runId, state: 'staged' }),
    )
  })

  it('rejects an oversized document before it enters the immutable plan', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      createPlan(ctx, owner, contentHash, {
        ...documentFixture,
        body: { kind: 'mdc', source: 'x'.repeat(257 * 1024) },
      }),
    ).rejects.toThrow(/document exceeds 256 KiB/i)
    expect(await ctx.readAll('portableItems' as never)).toEqual([])
  })

  it('rejects a server-staged import whose final tree reaches depth six', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const owner = ctx.asCmsUser('owner-1')
    const contract = buildResolvedContentContract(
      {
        collections: {
          pages: {
            type: 'page',
            source: 'content/pages/**/*.md',
            route: '/pages',
            cms: { type: 'tree', route: { allowMultipleRoots: true } },
            fields: { title: { type: 'text', required: true } },
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const contentHash = await hashCanonicalJson(contract)
    const presentation = { collections: {} }
    await ctx.raw.mutation(api.contract.installCmsContract, {
      content: contract,
      contentHash,
      presentation,
      presentationHash: await hashCanonicalJson(presentation),
    })
    const rows = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => {
        const canonicalKey = `depth-${index + 1}`
        const identity = { collection: 'pages', canonicalKey, locale: 'en' }
        const document = {
          ...documentFixture,
          ...identity,
          slug: canonicalKey,
          parentCanonicalKey: index === 0 ? null : `depth-${index}`,
          order: index.toString(16).toUpperCase().padStart(16, '0'),
          shared: { title: canonicalKey },
        }
        const payload = {
          identity,
          expectedDraftSha256: null,
          expectedSharedSha256: null,
          effect: 'create' as const,
          documentSha256: await hashCanonicalJson(document),
          sharedSha256: await hashCanonicalJson(portableSharedDraftState(document)),
          dependencyKeys: [],
        }
        return {
          applyOrder: index,
          itemKey: await hashCanonicalJson(identity),
          inputSha256: await hashCanonicalJson(payload),
          payload,
          document,
        }
      }),
    )
    const payload = {
      format: 'ginko-cms-portability-plan' as const,
      version: 1 as const,
      mode: 'import' as const,
      deploymentId: 'test-deployment',
      scope: { collections: ['pages'] },
      targetContentHash: contentHash,
      sourceManifestSha256: '1'.repeat(64),
      sourceContentHash: contentHash,
      itemCount: rows.length,
      itemRootSha256: await hashCanonicalJson(
        [...rows]
          .sort((left, right) => left.itemKey.localeCompare(right.itemKey))
          .map((row) => row.payload),
      ),
      assetCount: 0,
      assetRootSha256: await hashCanonicalJson([]),
    }
    const payloadSha256 = await hashCanonicalJson(payload)
    await owner.mutation(api.portability.createImportPlan, {
      planId: 'server-depth-six',
      payload,
      payloadSha256,
    })
    await owner.mutation(api.portability.appendImportPlanItems, {
      planId: 'server-depth-six',
      payloadSha256,
      items: rows,
    })

    await expect(
      owner.action(api.portability.sealImportPlan, {
        planId: 'server-depth-six',
        payloadSha256,
      }),
    ).rejects.toThrow(/tree depth of 5/i)
    expect(await ctx.readAll('entries')).toEqual([])
  })

  it('rejects an import plan above the exact entry envelope', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const payload = {
      format: 'ginko-cms-portability-plan' as const,
      version: 1 as const,
      mode: 'import' as const,
      deploymentId: 'test-deployment',
      scope: { collections: ['posts'] },
      targetContentHash: contentHash,
      sourceManifestSha256: '1'.repeat(64),
      sourceContentHash: contentHash,
      itemCount: 5_001,
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
    expect(await ctx.readAll('portableRuns' as never)).toEqual([])
  })

  it('[IMP-02] seals only the reviewed immutable plan rows and finalizes canonical drafts without publishing', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const plan = await createPlan(ctx, owner, contentHash)

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
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const create = await createPlan(ctx, owner, contentHash)
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
    const update = await createPlan(ctx, owner, contentHash, changed, {
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
    expect(await ctx.readAll('portableItems' as never)).toContainEqual(
      expect.objectContaining({ runId: update.runId, effect: 'updated-draft' }),
    )
    expect(await ctx.readAll('entries')).toEqual([
      expect.objectContaining({ lifecycle: 'active', activePublications: [], draftVersion: 2 }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('resolves structural portable relations to canonical stored ids', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const author = await createPlan(
      ctx,
      owner,
      contentHash,
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
      ctx,
      owner,
      contentHash,
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

    expect(await ctx.readAll('portableRuns' as never)).toContainEqual(
      expect.objectContaining({
        planId: 'post-relation-plan',
        stagedLocales: ['en'],
        stagedItemCount: 1,
        stagedAssetCount: 0,
      }),
    )

    expect(await ctx.readAll('entries')).toContainEqual(
      expect.objectContaining({ shared: { title: 'Hello', author: 'ada' } }),
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
    ).resolves.toEqual([
      {
        itemKey,
        currentDraftSha256: await hashCanonicalJson(post.document),
        currentSharedSha256: await hashCanonicalJson(portableSharedDraftState(post.document)),
      },
    ])
  })

  it('rejects a stale guarded update and records its resumable worker failure', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const create = await createPlan(ctx, owner, contentHash)
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
        ctx,
        owner,
        contentHash,
        { ...documentFixture, shared: { title: 'Stale' } },
        {
          planId: 'plan-stale',
          expectedDraftSha256: 'e'.repeat(64),
          effect: 'update',
        },
      ),
    ).rejects.toThrow(/conflict/i)
    expect(await ctx.readAll('portableRuns' as never)).toEqual([
      expect.objectContaining({ runId: create.runId, state: 'applying' }),
      expect.objectContaining({
        runId: 'portable-import:plan-stale',
        state: 'sealing',
        workPhase: 'seal-items',
        workAttempts: 1,
        workLastError: expect.stringMatching(/conflict/i),
      }),
    ])
  })

  it('keeps aborted and expired imports closed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T08:00:00.000Z'))
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sha256 = createHash('sha256').update(validPng).digest('hex')
    const aborted = await createPlan(ctx, owner, contentHash, documentFixture, {
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
    expect(await ctx.readAll('portableAssets' as never)).toContainEqual(
      expect.objectContaining({ runId: aborted.runId, state: 'cleanup-required', storageId }),
    )
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    expect(
      await ctx.raw.run(async (innerCtx) =>
        Boolean(await innerCtx.storage.get(storageId as never)),
      ),
    ).toBe(false)
    expect(await ctx.readAll('portableAssets' as never)).toContainEqual(
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

    const expired = await createPlan(ctx, owner, contentHash, documentFixture, {
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
    expect(await ctx.readAll('portableAssets' as never)).toContainEqual(
      expect.objectContaining({
        runId: expired.runId,
        state: 'cleanup-required',
        storageId: expiredStorageId,
      }),
    )
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
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

  it('resumes a failed aborted-stage cleanup without replaying its first page', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T09:00:00.000Z'))
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const assets = Array.from({ length: 101 }, (_, index) => ({
      sha256: index.toString(16).padStart(64, '0'),
      bytes: 1,
      mediaType: 'image/png' as const,
      effect: 'upload' as const,
      referencedBy: [],
    }))
    const plan = await createPlan(ctx, owner, contentHash, documentFixture, {
      planId: 'paged-cleanup-plan',
      assets,
    })

    await owner.mutation(api.portability.abortImport, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })

    const beforeContinuation = await ctx.readAll('portableAssets' as never)
    expect(beforeContinuation.filter((stage) => stage.state === 'cleaned')).toHaveLength(100)
    expect(beforeContinuation.filter((stage) => stage.state === 'awaiting-upload')).toHaveLength(1)
    const contractWriteToken = await readTestContractWriteToken(ctx)
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const [run] = await ctx.readAll('portableRuns' as never)
      await ctx.raw.mutation(api.portability.runs.recordImportWorkFailure, {
        runId: run.runId,
        generation: run.workGeneration,
        token: run.workToken,
        contractWriteToken,
        error: `injected cleanup crash ${attempt}`,
      })
    }
    await expect(
      owner.query(api.portability.getPortabilityRunStatus, { runId: plan.runId }),
    ).resolves.toMatchObject({ state: 'failed', phase: 'cleanup', attempts: 5 })
    await expect(
      owner.action(api.portability.resumePortabilityRun, { runId: plan.runId }),
    ).resolves.toMatchObject({ state: 'aborted', phase: null, attempts: 0 })
    expect(
      (await ctx.readAll('portableAssets' as never)).filter((stage) => stage.state === 'cleaned'),
    ).toHaveLength(101)
  })

  it('seals large plans and resumes them through bounded server-owned batches', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const { payloadSha256 } = await stagePagedPlan(owner, contentHash, {
      planId: 'paged-plan',
      itemCount: 251,
    })

    vi.useFakeTimers({ now: Date.now() })
    const sealing = await owner.action(api.portability.sealImportPlan, {
      planId: 'paged-plan',
      payloadSha256,
    })
    expect(sealing).toEqual({ runId: 'portable-import:paged-plan', state: 'sealing' })
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    const sealed = await owner.action(api.portability.sealImportPlan, {
      planId: 'paged-plan',
      payloadSha256,
    })
    expect(sealed).toEqual({ runId: 'portable-import:paged-plan', state: 'planned' })
    await owner.mutation(api.portability.beginImportApply, {
      runId: 'portable-import:paged-plan',
      payloadSha256,
    })
    const first = await owner.action(api.portability.applyImportBatch, {
      runId: 'portable-import:paged-plan',
      payloadSha256,
    })
    expect(first).toEqual({ committed: 10, complete: false })
    await ctx.raw.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
    await expect(
      owner.action(api.portability.applyImportBatch, {
        runId: 'portable-import:paged-plan',
        payloadSha256,
      }),
    ).resolves.toEqual({ committed: 251, complete: true })
    expect(
      (await ctx.readAll('portableItems' as never)).filter((item) => item.state === 'committed'),
    ).toHaveLength(251)
  })

  it('pages 1,205 receipts without loss or duplication and filters blocked, failed, and skipped', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    await seedMember(ctx, { userId: 'owner-2', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const planId = 'receipt-pagination-plan'
    const runId = `portable-import:${planId}`
    await stagePagedPlan(owner, contentHash, {
      planId,
      itemCount: 1_205,
    })
    const readReceipts = async (filter: 'all' | 'blocked' | 'failed' | 'skipped') => {
      const receipts: Array<{ index: number; outcome: string }> = []
      let cursor: number | null = null
      for (let page = 0; page < 14; page += 1) {
        const result = await owner.query(api.portability.listPortabilityItemReceipts, {
          runId,
          cursor,
          limit: 100,
          filter,
        })
        receipts.push(...result.receipts)
        if (result.cursor === null) return receipts
        expect(result.cursor).toBeGreaterThan(cursor ?? -1)
        cursor = result.cursor
      }
      throw new Error('Receipt pagination did not terminate.')
    }

    const all = await readReceipts('all')
    expect(all.map(({ index }) => index)).toEqual(
      Array.from({ length: 1_205 }, (_, index) => index),
    )
    expect(new Set(all.map(({ index }) => index)).size).toBe(1_205)
    await expect(
      ctx.asCmsUser('owner-2').query(api.portability.listPortabilityItemReceipts, {
        runId,
        cursor: null,
        limit: 100,
        filter: 'all',
      }),
    ).rejects.toThrow(/another caller/i)

    await ctx.raw.run(async (innerCtx) => {
      const run = await innerCtx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', runId))
        .unique()
      await innerCtx.db.patch(run!._id, {
        state: 'sealing',
        workPhase: 'seal-items',
        workAttempts: 5,
        workLastError: 'blocked fixture',
        workDeadLetteredAt: Date.now(),
      })
    })
    const blocked = await readReceipts('blocked')
    expect(blocked).toHaveLength(1_205)
    expect(blocked.every(({ outcome }) => outcome === 'blocked')).toBe(true)

    await ctx.raw.run(async (innerCtx) => {
      const run = await innerCtx.db
        .query('portableRuns')
        .withIndex('by_run_id', (query) => query.eq('runId', runId))
        .unique()
      const skipped = await innerCtx.db
        .query('portableItems')
        .withIndex('by_run_index', (query) => query.eq('runId', runId))
        .take(3)
      for (const item of skipped) {
        await innerCtx.db.patch(item._id, {
          state: 'committed',
          effect: 'skipped',
          resultId: `entry-${item.index}`,
          committedAt: Date.now(),
        })
      }
      await innerCtx.db.patch(run!._id, {
        state: 'applying',
        workPhase: 'apply',
        committedItemCount: 3,
        workLastError: 'failed fixture',
      })
    })
    expect((await readReceipts('skipped')).map(({ index }) => index)).toEqual([0, 1, 2])
    const failed = await readReceipts('failed')
    expect(failed).toHaveLength(1_202)
    expect(failed[0]?.index).toBe(3)
    expect(failed.at(-1)?.index).toBe(1_204)
  }, 15_000)

  it('applies a durable page once and fences duplicate delivery with its generation token', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-14T10:00:00.000Z') })
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const { payloadSha256 } = await stagePagedPlan(owner, contentHash, {
      planId: 'duplicate-delivery-plan',
      itemCount: 251,
    })

    await expect(
      owner.action(api.portability.sealImportPlan, {
        planId: 'duplicate-delivery-plan',
        payloadSha256,
      }),
    ).resolves.toEqual({
      runId: 'portable-import:duplicate-delivery-plan',
      state: 'sealing',
    })
    const [leased] = await ctx.readAll('portableRuns' as never)
    expect(leased).toMatchObject({
      sealItemCount: 250,
      state: 'sealing',
      workPhase: 'seal-items',
    })
    const delivery = {
      runId: leased.runId,
      generation: leased.workGeneration,
      token: leased.workToken,
      contractWriteToken: await readTestContractWriteToken(ctx),
    }
    await expect(
      ctx.raw.mutation(api.portability.runs.processImportWorkPage, delivery),
    ).resolves.toEqual({ status: 'applied' })
    const [applied] = await ctx.readAll('portableRuns' as never)
    expect(applied).toMatchObject({ state: 'planned', sealItemCount: 251, workToken: null })

    await expect(
      ctx.raw.mutation(api.portability.runs.processImportWorkPage, delivery),
    ).resolves.toEqual({ status: 'stale' })
    const [afterDuplicate] = await ctx.readAll('portableRuns' as never)
    expect(afterDuplicate).toEqual(applied)
  })

  it('dead-letters repeated page failures without losing the cursor and resumes explicitly', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-14T11:00:00.000Z') })
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contentHash } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const { payloadSha256 } = await stagePagedPlan(owner, contentHash, {
      planId: 'dead-letter-plan',
      itemCount: 251,
    })
    await owner.action(api.portability.sealImportPlan, {
      planId: 'dead-letter-plan',
      payloadSha256,
    })
    const [firstLease] = await ctx.readAll('portableRuns' as never)
    const durablePage = {
      cursor: firstLease.workCursor,
      count: firstLease.sealItemCount,
      hash: firstLease.sealItemHash,
    }
    const staleDelivery = {
      runId: firstLease.runId,
      generation: firstLease.workGeneration,
      token: firstLease.workToken,
      contractWriteToken: await readTestContractWriteToken(ctx),
    }

    const contractWriteToken = staleDelivery.contractWriteToken

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const [run] = await ctx.readAll('portableRuns' as never)
      const error =
        attempt === 5
          ? 'injected crash 5 Bearer top-secret-worker-token'
          : `injected crash ${attempt}`
      await expect(
        ctx.raw.mutation(api.portability.runs.recordImportWorkFailure, {
          runId: run.runId,
          generation: run.workGeneration,
          token: run.workToken,
          contractWriteToken,
          error,
        }),
      ).resolves.toEqual({ status: attempt === 5 ? 'dead-lettered' : 'retrying' })
    }

    await expect(
      ctx.raw.mutation(api.portability.runs.processImportWorkPage, staleDelivery),
    ).resolves.toEqual({ status: 'stale' })
    const [deadLettered] = await ctx.readAll('portableRuns' as never)
    expect(deadLettered).toMatchObject({
      state: 'sealing',
      workAttempts: 5,
      workToken: null,
      workLeaseExpiresAt: null,
      workLastError: 'injected crash 5 Bearer [redacted]',
      workDeadLetteredAt: expect.any(Number),
      workCursor: durablePage.cursor,
      sealItemCount: durablePage.count,
      sealItemHash: durablePage.hash,
    })
    await expect(
      owner.query(api.portability.getPortabilityRunStatus, { runId: firstLease.runId }),
    ).resolves.toMatchObject({
      runId: firstLease.runId,
      mode: 'import',
      state: 'failed',
      phase: 'seal-items',
      attempts: 5,
      lastError: 'injected crash 5 Bearer [redacted]',
      itemCount: 251,
      committedItemCount: 0,
    })
    expect(JSON.stringify(deadLettered)).not.toContain('top-secret-worker-token')

    const resumedStatus = await owner.action(api.portability.resumePortabilityRun, {
      runId: firstLease.runId,
    })
    expect(resumedStatus).toMatchObject({
      runId: firstLease.runId,
      state: 'planned',
      phase: null,
      attempts: 0,
      itemCount: 251,
    })
    const [resumed] = await ctx.readAll('portableRuns' as never)
    expect(resumed).toMatchObject({
      state: 'planned',
      sealItemCount: 251,
      workAttempts: 0,
      workToken: null,
      workDeadLetteredAt: null,
    })
  })
})
