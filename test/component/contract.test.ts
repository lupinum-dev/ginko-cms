/// <reference types="vite/client" />

import { cmsMcpCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { api, createCtx, seedMcpCredential, seedMember } from '../helpers'

function contractFixture(options: { path?: string; includePages?: boolean } = {}) {
  return buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          i18n: true,
          route: { en: options.path ?? '/posts', de: '/beitraege' },
          cms: { type: 'tree' },
        },
        ...(options.includePages
          ? {
              pages: {
                type: 'page' as const,
                source: 'content/pages/**/*.md',
                route: '/pages',
              },
            }
          : {}),
      },
    },
    {
      defaultLocale: 'en',
      locales: ['en', 'de'],
      localeFallbacks: { de: ['en'] },
    },
  )
}

const emptyPresentation = { collections: {} } as const

async function contractPayload(
  content: ReturnType<typeof contractFixture>,
  presentation: JsonValue = emptyPresentation,
) {
  return {
    content,
    contentHash: await hashCanonicalJson(content),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  }
}

describe('canonical CMS contract installation', () => {
  it('accepts the host-verified MCP caller used by write preflight', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMcpCredential(ctx, {
      apiKeyId: 'mcp-contract-preflight',
      ownerUserId: 'editor-1',
      scopes: [cmsPermissionKeys.read],
    })

    await expect(
      ctx.raw.query(api.contract.getInstalledContractStatus, {
        _trustedCaller: cmsMcpCaller('mcp-contract-preflight'),
      }),
    ).resolves.toEqual({
      installedContentHash: null,
      installedPresentationHash: null,
      transitionState: null,
      transitionRunId: null,
    })
  })

  it('[CON-01][ADM-03] exposes the installed content model and drift state to every read-capable role', async () => {
    const ctx = createCtx()
    const members = [
      { userId: 'viewer-1', role: 'viewer' as const },
      { userId: 'editor-1', role: 'editor' as const },
      { userId: 'publisher-1', role: 'publisher' as const },
      { userId: 'owner-1', role: 'owner' as const },
    ]
    for (const member of members) await seedMember(ctx, member)

    for (const member of members) {
      await expect(
        ctx.asCmsUser(member.userId).query(api.contract.getInstalledContractStatus, {}),
      ).resolves.toEqual({
        installedContentHash: null,
        installedPresentationHash: null,
        transitionState: null,
        transitionRunId: null,
      })
    }

    const payload = await contractPayload(contractFixture())
    await ctx.raw.mutation(api.contract.installCmsContract, payload)
    for (const member of members) {
      await expect(
        ctx.asCmsUser(member.userId).query(api.contract.getInstalledContractStatus, {}),
      ).resolves.toEqual({
        installedContentHash: payload.contentHash,
        installedPresentationHash: payload.presentationHash,
        transitionState: 'ready',
        transitionRunId: null,
      })
    }

    await ctx.run(async (mutationCtx) => {
      const installed = await mutationCtx.db
        .query('cmsContract')
        .withIndex('by_key', (query) => query.eq('key', 'active'))
        .unique()
      if (!installed) throw new Error('Expected installed contract fixture.')
      await mutationCtx.db.patch(installed._id, {
        transitionState: 'locked',
        transitionRunId: 'transition-1',
      })
    })
    await expect(
      ctx.asCmsUser('viewer-1').query(api.contract.getInstalledContractStatus, {}),
    ).resolves.toEqual({
      installedContentHash: payload.contentHash,
      installedPresentationHash: payload.presentationHash,
      transitionState: 'locked',
      transitionRunId: 'transition-1',
    })
  })

  it('rejects invalid content and presentation hashes without writing anything', async () => {
    const ctx = createCtx()
    const contract = contractFixture()
    const payload = await contractPayload(contract)

    await expect(
      ctx.raw.mutation(api.contract.installCmsContract, {
        ...payload,
        contentHash: '0'.repeat(64),
      }),
    ).rejects.toThrow(/hash/i)

    await expect(
      ctx.raw.mutation(api.contract.installCmsContract, {
        ...payload,
        presentationHash: '0'.repeat(64),
      }),
    ).rejects.toThrow(/presentation.*hash/i)

    expect(await ctx.readAll('cmsContract')).toEqual([])
    expect(await ctx.readAll('cmsPolicies')).toEqual([])
    expect(await ctx.readAll('cmsSettings')).toEqual([])
    expect(await ctx.readAll('collections')).toEqual([])
  })

  it('stores one contract and projects collections/locales directly from it', async () => {
    const ctx = createCtx()
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    const contract = contractFixture()
    const contentHash = await hashCanonicalJson(contract)
    const presentation = {
      collections: {
        posts: {
          label: { en: 'Articles', de: 'Artikel' },
          icon: 'newspaper',
          fields: { title: { label: 'Headline', description: null, width: 'full' } },
        },
      },
    }
    const presentationHash = await hashCanonicalJson(presentation)

    await expect(
      ctx.raw.mutation(
        api.contract.installCmsContract,
        await contractPayload(contract, presentation),
      ),
    ).resolves.toMatchObject({
      contentHash,
      presentationHash,
      transitionState: 'ready',
      collectionCount: 1,
      localeCount: 2,
      created: 1,
      updated: 0,
      skipped: 0,
    })

    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({
        key: 'active',
        content: contract,
        presentation,
        contentHash,
        presentationHash,
        transitionState: 'ready',
        transitionRunId: null,
      }),
    ])
    expect(await ctx.readAll('cmsPolicies')).toEqual([])
    expect(await ctx.readAll('cmsSettings')).toEqual([])
    expect(await ctx.readAll('collections')).toEqual([])

    const viewer = ctx.asCmsUser('viewer-1')
    await expect(viewer.query(api.collections.listCollections, {})).resolves.toEqual([
      expect.objectContaining({
        _id: 'posts',
        slug: 'posts',
        label: 'Articles',
        labelMap: { en: 'Articles', de: 'Artikel' },
        icon: 'newspaper',
      }),
    ])
    await expect(viewer.query(api.collections.getCollection, { slug: 'posts' })).resolves.toEqual(
      expect.objectContaining({
        _id: 'posts',
        slug: 'posts',
        label: 'Articles',
        contract: { source: 'code', version: contentHash },
        fields: expect.arrayContaining([
          expect.objectContaining({ key: 'title', label: 'Headline', width: 'full' }),
        ]),
      }),
    )
  })

  it('reports content and presentation drift independently', async () => {
    const ctx = createCtx()
    const installed = contractFixture()
    const installedHash = await hashCanonicalJson(installed)
    await ctx.raw.mutation(api.contract.installCmsContract, await contractPayload(installed))

    const expected = contractFixture({ path: '/articles' })
    const expectedHash = await hashCanonicalJson(expected)
    const presentation = { collections: { posts: { label: 'Articles' } } }
    await expect(
      ctx.raw.query(api.contract.checkCmsContract, await contractPayload(expected, presentation)),
    ).resolves.toMatchObject({
      matches: false,
      contentMatches: false,
      presentationMatches: false,
      installedContentHash: installedHash,
      expectedContentHash: expectedHash,
      drift: expect.arrayContaining([
        {
          path: '$.collections.posts.routing.pathPrefix',
          installed: '/posts',
          expected: '/articles',
        },
      ]),
      presentationDrift: expect.arrayContaining([
        {
          path: '$.presentation.collections.posts',
          installed: undefined,
          expected: { label: 'Articles' },
        },
      ]),
    })
  })

  it('installs compatible additions but requires a transition for routing changes', async () => {
    const ctx = createCtx()
    const initial = contractFixture()
    await ctx.raw.mutation(api.contract.installCmsContract, await contractPayload(initial))

    const additive = contractFixture({ includePages: true })
    const additiveHash = await hashCanonicalJson(additive)
    await expect(
      ctx.raw.mutation(api.contract.installCmsContract, await contractPayload(additive)),
    ).resolves.toMatchObject({ created: 1, skipped: 1, contentHash: additiveHash })

    const incompatible = contractFixture({ path: '/articles', includePages: true })
    await expect(
      ctx.raw.mutation(api.contract.installCmsContract, await contractPayload(incompatible)),
    ).rejects.toThrow(/TRANSITION_REQUIRED/)

    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({ content: additive, contentHash: additiveHash }),
    ])
  })

  it('updates presentation without changing content or creating derived rows', async () => {
    const ctx = createCtx()
    const contract = contractFixture()
    const contentHash = await hashCanonicalJson(contract)
    await ctx.raw.mutation(api.contract.installCmsContract, await contractPayload(contract))

    const presentation = { collections: { posts: { label: 'Editorial posts' } } }
    const presentationHash = await hashCanonicalJson(presentation)
    await expect(
      ctx.raw.mutation(
        api.contract.installCmsContract,
        await contractPayload(contract, presentation),
      ),
    ).resolves.toMatchObject({ created: 0, updated: 1, skipped: 0 })

    expect(await ctx.readAll('collections')).toEqual([])
    expect(await ctx.readAll('collectionReindexJobs')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('cmsContract')).toEqual([
      expect.objectContaining({ contentHash, presentation, presentationHash }),
    ])
  })

  it('blocks every direct install while a transition owns the write lock', async () => {
    const ctx = createCtx()
    const contract = contractFixture()
    const payload = await contractPayload(contract)
    await ctx.raw.mutation(api.contract.installCmsContract, payload)
    const [installed] = await ctx.readAll('cmsContract')
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(installed!._id, {
        transitionState: 'locked',
        transitionRunId: 'transition-1',
      })
    })

    await expect(ctx.raw.mutation(api.contract.installCmsContract, payload)).rejects.toThrow(
      /CONTRACT_LOCKED/,
    )
  })
})
