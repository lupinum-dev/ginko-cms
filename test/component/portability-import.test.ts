/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { PortableDocumentV1 } from '@lupinum/ginko-content/portability'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember } from './entries/helpers'

const api = anyApi

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
    assetCount: 0,
    assetRootSha256: await hashCanonicalJson([]),
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
    items: [{ itemKey, inputSha256, payload: itemPayload }],
  })
  const run = await operator.action(api.portability.sealImportPlan, {
    planId,
    payloadSha256,
  })
  return { ...run, itemKey, inputSha256, payloadSha256, document }
}

describe('portable draft import', () => {
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

  it('commits one draft transactionally and replays a lost successful response', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const plan = await createPlan(owner, contractSha256)

    await owner.mutation(api.portability.beginImportApply, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
    })
    const first = await owner.mutation(api.portability.applyImportItem, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      itemKey: plan.itemKey,
      inputSha256: plan.inputSha256,
      document: plan.document,
    })
    const replay = await owner.mutation(api.portability.applyImportItem, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      itemKey: plan.itemKey,
      inputSha256: plan.inputSha256,
      document: plan.document,
    })

    expect(replay).toEqual(first)
    expect(first).toMatchObject({ status: 'committed', effect: 'created-draft' })
    expect(await ctx.readAll('entries')).toEqual([
      expect.objectContaining({ stableId: 'hello', status: 'draft', publishedAt: null }),
    ])
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('portableItemReceipts' as never)).toHaveLength(1)

    await expect(
      owner.mutation(api.portability.applyImportItem, {
        runId: plan.runId,
        payloadSha256: plan.payloadSha256,
        itemKey: plan.itemKey,
        inputSha256: 'f'.repeat(64),
        document: plan.document,
      }),
    ).rejects.toThrow(/input.*mismatch/i)
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
    await owner.mutation(api.portability.applyImportItem, {
      runId: plan.runId,
      payloadSha256: plan.payloadSha256,
      itemKey: plan.itemKey,
      inputSha256: plan.inputSha256,
      document: plan.document,
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
    await owner.mutation(api.portability.applyImportItem, {
      runId: create.runId,
      payloadSha256: create.payloadSha256,
      itemKey: create.itemKey,
      inputSha256: create.inputSha256,
      document: create.document,
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
    const receipt = await owner.mutation(api.portability.applyImportItem, {
      runId: update.runId,
      payloadSha256: update.payloadSha256,
      itemKey: update.itemKey,
      inputSha256: update.inputSha256,
      document: changed,
    })

    expect(receipt.effect).toBe('updated-draft')
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
    await owner.mutation(api.portability.applyImportItem, {
      runId: author.runId,
      payloadSha256: author.payloadSha256,
      itemKey: author.itemKey,
      inputSha256: author.inputSha256,
      document: author.document,
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
    await owner.mutation(api.portability.applyImportItem, {
      runId: post.runId,
      payloadSha256: post.payloadSha256,
      itemKey: post.itemKey,
      inputSha256: post.inputSha256,
      document: post.document,
    })

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
    await owner.mutation(api.portability.applyImportItem, {
      runId: create.runId,
      payloadSha256: create.payloadSha256,
      itemKey: create.itemKey,
      inputSha256: create.inputSha256,
      document: create.document,
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
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'owner-1', role: 'owner' })
    const { contractSha256 } = await installFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const aborted = await createPlan(owner, contractSha256, documentFixture, {
      planId: 'abort-plan',
    })

    await expect(
      owner.mutation(api.portability.abortImport, {
        runId: aborted.runId,
        payloadSha256: aborted.payloadSha256,
      }),
    ).resolves.toEqual({ runId: aborted.runId, state: 'aborted' })
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

  it('seals more than one mutation page without collecting the plan into one transaction', async () => {
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
        itemKey: await hashCanonicalJson(identity),
        inputSha256: await hashCanonicalJson(payload),
        payload,
      })
    }
    rows.sort((left, right) => left.itemKey.localeCompare(right.itemKey))
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
    await owner.mutation(api.portability.appendImportPlanItems, {
      planId: 'paged-plan',
      payloadSha256,
      items: rows.slice(0, 250),
    })
    await owner.mutation(api.portability.appendImportPlanItems, {
      planId: 'paged-plan',
      payloadSha256,
      items: rows.slice(250),
    })

    await expect(
      owner.action(api.portability.sealImportPlan, {
        planId: 'paged-plan',
        payloadSha256,
      }),
    ).resolves.toEqual({ runId: 'portable-import:paged-plan', state: 'planned' })
  })
})
