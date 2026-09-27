/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { assetDiscoveryFields } from '../../packages/convex/src/assets/scope'
import { imageAuthoring } from '../../playground/image-authoring'
import {
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedOwner,
  seedStorageObject,
} from './entries/helpers'

const api = anyApi

// EDT-10: guarded draft preview. The preview query reads CURRENT draft rows,
// never public projections, and requires an authorized Studio identity.
describe('draftPreview.getDraftPreview', () => {
  async function installContract(
    ctx: ReturnType<typeof createCtx>,
    collections: Parameters<typeof buildResolvedContentContract>[0]['collections'] = {
      posts: {
        type: 'page',
        source: 'content/posts/**/*.md',
        route: '/posts',
        i18n: true,
        cms: { type: 'flat' },
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

  async function seedPostsWithDraft(ctx: ReturnType<typeof createCtx>) {
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'preview-me',
      shared: { title: 'Draft preview title' },
      bodyMdc: '# Draft heading\n\nDraft-only paragraph.',
    })
    return { owner, entryId }
  }

  it('returns the draft body for a never-published entry without touching public output', async () => {
    const ctx = createCtx()
    const { owner, entryId } = await seedPostsWithDraft(ctx)

    const preview = await owner.query(api.draftPreview.getDraftPreview, {
      entryId,
      locale: 'en',
    })

    expect(preview).toMatchObject({
      entryId,
      collection: 'posts',
      locale: 'en',
      status: 'draft',
      title: 'Draft preview title',
      path: '/posts/preview-me',
      publishedPath: null,
    })
    expect(preview.bodyAstJson).toContain('Draft-only paragraph.')

    // The draft stays invisible to the public provider.
    const page = await ctx.published.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/posts/preview-me',
    })
    expect(page.status).toBe('not-found')
    expect(await ctx.readAll('publicEntries')).toHaveLength(0)
  })

  it('previews the draft (not the live version) for a published entry with changes', async () => {
    const ctx = createCtx()
    const { owner, entryId } = await seedPostsWithDraft(ctx)
    await publishEntry(owner, entryId)

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: {
        shared: { shared: { title: 'Unpublished new title' } },
        locales: {
          en: {
            bodyMdc: '# Draft heading\n\nUnpublished revision.',
          },
        },
      },
    })

    const preview = await owner.query(api.draftPreview.getDraftPreview, {
      entryId,
      locale: 'en',
    })

    expect(preview.title).toBe('Unpublished new title')
    expect(preview.bodyAstJson).toContain('Unpublished revision.')
    expect(preview.publishedPath).toBe('/posts/preview-me')

    // Public output still serves the published revision.
    const page = await ctx.published.query(api.public.page, {
      collection: 'posts',
      locale: 'en',
      path: '/posts/preview-me',
    })
    expect(page.status).toBe('found')
    expect(page.page.title).toBe('Draft preview title')
  })

  it('resolves the actual Editor image source while preserving metadata and stored identity', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx, {
      posts: {
        type: 'page',
        source: 'content/posts/**/*.md',
        route: '/posts',
        i18n: true,
        cms: { type: 'flat', fields: { hero: { type: 'image', localized: false } } },
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
      shared: { hero: assetId, title: 'Private garden' },
      bodyMdc,
    })
    const preview = await owner.query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' })
    const image = JSON.parse(preview.bodyAstJson).children.find(
      (node: { tag?: string }) => node.tag === 'image',
    )
    expect(image.props).toMatchObject({
      id: assetId,
      filename: 'canopy.png',
      alt: 'Illustrated green tree canopies seen from above',
      title: 'Synthetic local image for editorial testing',
      width: '960',
      height: '640',
    })
    expect(preview.bodyAstJson).toContain('"$"')
    expect(image.props.src).toBe(`/api/_ginko/assets/${assetId}`)
    expect(preview.data.hero).toBe(`/api/_ginko/assets/${assetId}`)
    const rawStorageUrl = await ctx.raw.run(async (inner) => {
      const asset = await inner.db.get(assetId)
      return asset ? await inner.storage.getUrl(asset.storageId) : null
    })
    expect(rawStorageUrl).toBeTruthy()
    expect(JSON.stringify(preview)).not.toContain(rawStorageUrl)
    expect(image.props.src).not.toBe(assetId)
    const stored = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(stored.localeData.draft.bodyMdc).toBe(bodyMdc)
    expect(await ctx.readAll('publicEntries')).toHaveLength(0)
    await publishEntry(owner, entryId)
    const published = (await ctx.readAll('publicEntries'))[0]!
    expect(published.assetFacts).toHaveLength(2)
    expect(published.assetFacts.every((fact) => fact.url === rawStorageUrl)).toBe(true)
    await ctx.raw.run(async (dbCtx) => {
      await dbCtx.db.patch(assetId, { deletedAt: Date.now() })
    })
    await expect(
      owner.query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' }),
    ).rejects.toThrow()
  })

  it('denies callers without CMS read access', async () => {
    const ctx = createCtx()
    const { entryId } = await seedPostsWithDraft(ctx)

    const stranger = ctx.asCmsUser('not-a-member')
    await expect(
      stranger.query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' }),
    ).rejects.toThrow()
  })

  it('rejects data-only collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx, {
      settingsBlocks: {
        type: 'data',
        source: 'content/settings/**/*.json',
        i18n: true,
        cms: { type: 'flat' },
      },
    })
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'settingsBlocks',
      slug: 'footer',
      localized: { title: 'Footer' },
    })

    const error = await owner
      .query(api.draftPreview.getDraftPreview, { entryId, locale: 'en' })
      .then(() => null)
      .catch((caught: unknown) => getCmsErrorData(caught))
    expect(error?.code).toBe('DRAFT_PREVIEW_NOT_ROUTE_BACKED')
  })

  it('rejects locales the collection does not know', async () => {
    const ctx = createCtx()
    const { owner, entryId } = await seedPostsWithDraft(ctx)

    const error = await owner
      .query(api.draftPreview.getDraftPreview, { entryId, locale: 'fr' })
      .then(() => null)
      .catch((caught: unknown) => getCmsErrorData(caught))
    expect(error?.code).toBe('DRAFT_PREVIEW_LOCALE_MISSING')
  })
})
