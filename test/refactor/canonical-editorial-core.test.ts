/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it } from 'vitest'

import { publicPathForEntry } from '../../packages/convex/src/entries/workflow/publicTree'
import {
  api,
  archiveEntry,
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedOwner,
  unpublishEntry,
} from '../helpers'

const restoreEntryOperation = {
  id: 'ginko-cms.restore-entry',
  executeRef: api.entries.publish.restoreEntryOperationExecute,
  previewRef: api.entries.publish.previewRestoreEntryOperation,
}

async function installContract(ctx: ReturnType<typeof createCtx>) {
  const content = buildResolvedContentContract(
    {
      collections: {
        posts: {
          type: 'page',
          source: 'content/posts/**/*.md',
          i18n: true,
          route: { en: '/posts', de: '/beitraege' },
          cms: { type: 'tree' },
        },
      },
    },
    {
      defaultLocale: 'en',
      locales: ['en', 'de'],
      localeFallbacks: { de: ['en'] },
    },
  )
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content,
    contentHash: await hashCanonicalJson(content),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
}

describe('canonical editorial core', () => {
  it('publishes locale snapshots independently and atomically activates shared edits', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'hello',
      localized: { title: 'Hello' },
    })
    await publishEntry(owner, entryId, ['en'])

    const firstEntry = (await ctx.readAll('entries'))[0]!
    const firstEnglish = firstEntry.activePublications.find(
      (publication: { locale: string }) => publication.locale === 'en',
    )!
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({ collection: 'posts', locale: 'en', title: 'Hello' }),
    ])

    await owner.mutation(api.entries.draft.createLocaleVariant, { entryId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: { locales: { de: { values: { title: 'Hallo' } } } },
    })
    await publishEntry(owner, entryId, ['de'])

    const afterGerman = (await ctx.readAll('entries'))[0]!
    expect(
      afterGerman.activePublications.find(
        (publication: { locale: string }) => publication.locale === 'en',
      )?.revisionId,
    ).toBe(firstEnglish.revisionId)
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'en', title: 'Hello' }),
        expect.objectContaining({ locale: 'de', title: 'Hallo' }),
      ]),
    )

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: { shared: { shared: { eyebrow: 'Updated' } } },
    })
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'en', title: 'Hello' }),
        expect.objectContaining({ locale: 'de', title: 'Hallo' }),
      ]),
    )
    const divergence = await owner.query(api.entries.read.getDraftVsPublishedDiff, { entryId })
    expect(divergence.changes.map((change: { field: string }) => change.field)).toEqual(
      expect.arrayContaining(['locale.en.shared.eyebrow', 'locale.de.shared.eyebrow']),
    )

    await publishEntry(owner, entryId, ['en', 'de'])
    const finalEntry = (await ctx.readAll('entries'))[0]!
    expect(finalEntry.activePublications).toHaveLength(2)
    expect(
      new Set(
        finalEntry.activePublications.map(
          (publication: { sharedVersion: number }) => publication.sharedVersion,
        ),
      ),
    ).toEqual(new Set([finalEntry.sharedVersion]))
  })

  it('unpublishes a parent without deleting descendant editorial or publication state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const parentId = await owner.createEntry({
      collection: 'posts',
      slug: 'guide',
      localized: { title: 'Guide' },
    })
    await publishEntry(owner, parentId)
    const childId = await owner.createEntry({
      collection: 'posts',
      slug: 'install',
      parentEntryId: parentId,
      localized: { title: 'Install' },
    })
    await publishEntry(owner, childId)

    await unpublishEntry(owner, parentId)

    const rows = await ctx.readAll('publicEntries')
    expect(rows.some((row: { entryId: string }) => row.entryId === parentId)).toBe(false)
    const child = rows.find((row: { entryId: string }) => row.entryId === childId)!
    expect(child).toBeTruthy()
    await expect(
      ctx.raw.run(async (innerCtx) =>
        publicPathForEntry(innerCtx, child as never, { pathPrefix: '/posts' }),
      ),
    ).resolves.toBeNull()
    expect(
      (await ctx.readAll('entries')).find((entry: { _id: string }) => entry._id === childId),
    ).toMatchObject({
      lifecycle: 'active',
      activePublications: [expect.objectContaining({ locale: 'en' })],
    })
  })

  it('restores an archived record only through a confirmed canonical operation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'archived',
      localized: { title: 'Archived' },
    })
    await publishEntry(owner, entryId)
    await archiveEntry(owner, entryId)

    const operation = owner.operation(restoreEntryOperation)
    await expect(operation.execute({ entryId })).rejects.toThrow(/confirmation/i)
    const preview = await operation.preview({ entryId })
    expect(preview.allowed).toBe(true)
    await operation.execute({ entryId }, { confirmation: preview.confirmation })

    expect((await ctx.readAll('entries'))[0]).toMatchObject({
      lifecycle: 'active',
      activePublications: [],
    })
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect((await ctx.readAll('entryRevisions')).at(-1)).toMatchObject({ kind: 'restore' })
  })

  it('blocks every Studio draft write while a contract transition owns canonical state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'locked',
      localized: { title: 'Locked' },
    })
    await ctx.raw.run(async (innerCtx) => {
      const contract = await innerCtx.db.query('cmsContract').first()
      await innerCtx.db.patch(contract!._id, {
        transitionState: 'locked',
        transitionRunId: 'test-transition',
      })
    })

    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'Must not save' } } } },
      }),
    ).rejects.toThrow(/locked/i)
    await expect(
      owner.mutation(api.entries.draft.createLocaleVariant, { entryId, locale: 'de' }),
    ).rejects.toThrow(/locked/i)
    await expect(
      owner.createEntry({
        collection: 'posts',
        slug: 'also-locked',
        localized: { title: 'Also locked' },
      }),
    ).rejects.toThrow(/locked/i)
  })

  it('fences keyset route cursors when structural publication state changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const firstId = await owner.createEntry({
      collection: 'posts',
      slug: 'first',
      localized: { title: 'First' },
    })
    const secondId = await owner.createEntry({
      collection: 'posts',
      slug: 'second',
      localized: { title: 'Second' },
    })
    await publishEntry(owner, firstId)
    await publishEntry(owner, secondId)

    const firstPage = await ctx.raw.query(api.public.routes, {
      collection: 'posts',
      locale: 'en',
      limit: 1,
      cursor: null,
    })
    expect(firstPage.routes).toHaveLength(1)
    expect(firstPage.pageInfo.hasNextPage).toBe(true)

    await owner.saveEntryDraft({
      entryId: firstId,
      expectedDraftVersion: await currentDraftVersion(owner, firstId),
      patch: { shared: { slug: 'first-renamed' } },
    })
    await publishEntry(owner, firstId)

    await expect(
      ctx.raw.query(api.public.routes, {
        collection: 'posts',
        locale: 'en',
        limit: 1,
        cursor: firstPage.pageInfo.endCursor,
      }),
    ).rejects.toThrow(/cursor.*expired|invalid.*expired/i)
  })

  it('pages public search with a generation-fenced stable identity cursor', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')

    for (let index = 0; index < 5; index += 1) {
      const entryId = await owner.createEntry({
        collection: 'posts',
        slug: `search-entry-${index}`,
        localized: { title: `Search Entry ${index}` },
      })
      await publishEntry(owner, entryId)
    }

    const firstPage = await ctx.raw.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Search Entry',
      limit: 2,
      cursor: null,
    })
    expect(firstPage.results).toHaveLength(2)
    expect(firstPage.pageInfo.hasNextPage).toBe(true)
    expect(JSON.parse(firstPage.pageInfo.endCursor!)).toMatchObject({
      kind: 'publicSearch',
      collection: 'posts',
      locale: 'en',
      canonicalKey: expect.any(String),
      generation: expect.any(String),
      projectionId: expect.any(String),
    })

    const secondPage = await ctx.raw.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Search Entry',
      limit: 2,
      cursor: firstPage.pageInfo.endCursor,
    })
    const thirdPage = await ctx.raw.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Search Entry',
      limit: 2,
      cursor: secondPage.pageInfo.endCursor,
    })

    expect(secondPage.results).toHaveLength(2)
    expect(secondPage.pageInfo.hasNextPage).toBe(true)
    expect(thirdPage.results).toHaveLength(1)
    expect(thirdPage.pageInfo).toEqual({ hasNextPage: false, endCursor: null })
    expect(
      new Set(
        [...firstPage.results, ...secondPage.results, ...thirdPage.results].map(
          (entry) => entry.id,
        ),
      ).size,
    ).toBe(5)
  })
})
