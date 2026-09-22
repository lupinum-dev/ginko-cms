import { decodeContentBodyAstJson } from '@lupinum/ginko-cms-contract/shared/publicContent.js'
import {
  buildResolvedContentContract,
  hashCanonicalJson,
  parseCmsPageWireResult,
  parseCmsListWireResult,
  parseCmsSearchWireResult,
} from '@lupinum/ginko-content/cms-contract'
import { convexToJson, jsonToConvex } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { decodeCmsBodyTransport } from '../../packages/cms/src/nuxt-provider/body-transport'
import { toContentEntry } from '../../packages/cms/src/nuxt-provider/content-shaping'
import { assetDiscoveryFields } from '../../packages/convex/src/assets/scope'
import { imageAuthoring } from '../../playground/image-authoring'
import { api, createCtx, publishEntry, seedOwner } from '../helpers'
import { seedStorageObject } from './entries/helpers'

async function installContract(
  ctx: ReturnType<typeof createCtx>,
  collections: Parameters<typeof buildResolvedContentContract>[0]['collections'] = {
    posts: {
      type: 'page',
      source: 'content/posts/**/*.md',
      route: '/posts',
      i18n: true,
      cms: {
        type: 'flat',
        fields: { title: { type: 'text', localized: true, required: true, searchable: true } },
      },
    },
  },
) {
  const content = buildResolvedContentContract(
    { collections },
    { defaultLocale: 'en', locales: ['en'], componentPolicy: imageAuthoring.policy },
  )
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content,
    contentHash: await hashCanonicalJson(content),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
}

describe('public article transport', () => {
  it('preserves actual Editor image markers across Convex and resolves public page, list and search', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx, {
      posts: {
        type: 'page',
        source: 'content/posts/**/*.md',
        route: '/posts',
        i18n: true,
        cms: {
          type: 'flat',
          fields: { title: { type: 'text', localized: true, required: true, searchable: true } },
        },
      },
    })
    const storageId = await seedStorageObject(ctx, { bytes: 'image-fixture', type: 'image/png' })
    const createdAt = Date.now()
    const assetId = await ctx.seed('assets', {
      storageId,
      filename: 'canopy.png',
      mimeType: 'image/png',
      size: 13,
      sha256: 'a'.repeat(64),
      width: 960,
      height: 640,
      frames: 1,
      alt: null,
      caption: null,
      scope: 'collection',
      collection: 'posts',
      entryId: null,
      tags: [],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      ...assetDiscoveryFields({
        filename: 'canopy.png',
        mimeType: 'image/png',
        tags: [],
        createdAt,
        updatedAt: null,
        deletedAt: null,
      }),
    })
    const bodyMdc = `# A garden for everyone

::image
\`\`\`yaml [props]
id: ${assetId}
filename: canopy.png
src: ${assetId}
alt: Illustrated green tree canopies seen from above
title: Synthetic local image for editorial testing
width: 960
height: 640
\`\`\`
::

The garden is open.`
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'garden',
      localized: { title: 'Garden' },
      bodyMdc,
    })

    await publishEntry(owner, entryId)
    const wire = await ctx.raw.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/posts/garden',
    })
    expect(wire.result.page).not.toHaveProperty('bodyAst')
    const parsed = decodeContentBodyAstJson(wire.result.page.bodyAstJson)
    expect(() => convexToJson(parsed)).toThrow(/reserved/)
    // Run the real SDK's outgoing value serializer: convex-test alone accepts reserved keys.
    const delivered = jsonToConvex(convexToJson(wire))
    expect(delivered).toEqual(wire)
    const result = parseCmsPageWireResult(decodeCmsBodyTransport('page', delivered))
    if (!result.page) throw new Error('Missing published page')
    expect(result.page.bodyAst).toEqual(parsed)
    expect(JSON.stringify(result.page.bodyAst)).toContain('"$"')
    const document = await toContentEntry(result.page)
    const image = document.body.children.find((node: { tag?: string }) => node.tag === 'image')
    expect(image.props.src).toMatch(/^https:\/\//)
    expect(image.props.alt).toBe('Illustrated green tree canopies seen from above')
    expect(result.page.assetFacts.some((fact) => fact.fieldPath.startsWith('bodyAst.'))).toBe(true)

    const listWire = await ctx.raw.query(api.public.list, {
      collection: 'posts',
      locale: 'en',
      limit: 10,
    })
    const list = parseCmsListWireResult(
      decodeCmsBodyTransport('list', jsonToConvex(convexToJson(listWire))),
    )
    const searchWire = await ctx.raw.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Garden',
      limit: 10,
    })
    const search = parseCmsSearchWireResult(
      decodeCmsBodyTransport('search', jsonToConvex(convexToJson(searchWire))),
    )
    expect(list.entries).toHaveLength(1)
    expect(search.results).toHaveLength(1)
    for (const summary of [...list.entries, ...search.results]) {
      expect(summary).not.toHaveProperty('bodyAst')
      expect(summary.assetFacts.every((fact) => fact.fieldPath.startsWith('data.'))).toBe(true)
      await expect(toContentEntry(summary)).resolves.toMatchObject({ title: 'Garden' })
    }
    expect((await ctx.readAll('entryRevisions'))[0].snapshots.en.bodyMdc).toBe(bodyMdc)
  })
})
