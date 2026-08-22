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
  seedMember,
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

    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
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
    const divergence = await owner.query(api.entries.history.getDraftVsPublishedDiff, { entryId })
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
    await expect(
      ctx.raw.query(api.public.count, { collection: 'posts', locale: 'en' }),
    ).resolves.toBe(0)
    expect(
      (await ctx.readAll('entries')).find((entry: { _id: string }) => entry._id === childId),
    ).toMatchObject({
      lifecycle: 'active',
      activePublications: [expect.objectContaining({ locale: 'en' })],
    })
  })

  it('[DOC-05] archives and restores one documentation section without silently archiving or republishing descendants', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const parentId = await owner.createEntry({
      collection: 'posts',
      slug: 'operations',
      localized: { title: 'Operations' },
    })
    const childId = await owner.createEntry({
      collection: 'posts',
      slug: 'recovery',
      parentEntryId: parentId,
      localized: { title: 'Recovery' },
    })
    await publishEntry(owner, parentId)
    await publishEntry(owner, childId)

    await archiveEntry(owner, parentId)
    const archivedRows = await ctx.readAll('publicEntries')
    expect(archivedRows).not.toContainEqual(expect.objectContaining({ entryId: parentId }))
    const archivedChild = archivedRows.find((row) => row.entryId === childId)!
    expect(archivedChild).toBeTruthy()
    await expect(
      ctx.raw.run(async (innerCtx) =>
        publicPathForEntry(innerCtx, archivedChild as never, { pathPrefix: '/posts' }),
      ),
    ).resolves.toBeNull()
    expect((await ctx.readAll('entries')).find((entry) => entry._id === childId)).toMatchObject({
      lifecycle: 'active',
      activePublications: [expect.any(Object)],
    })

    const restore = owner.operation(restoreEntryOperation)
    const preview = await restore.preview({ entryId: parentId })
    expect(preview).toMatchObject({ allowed: true, confirmation: { token: expect.any(String) } })
    await expect(
      restore.execute({ entryId: parentId }, { confirmation: preview.confirmation }),
    ).resolves.toMatchObject({ status: 'applied' })

    expect((await ctx.readAll('entries')).find((entry) => entry._id === parentId)).toMatchObject({
      lifecycle: 'active',
      activePublications: [],
    })
    await expect(
      ctx.raw.run(async (innerCtx) =>
        publicPathForEntry(innerCtx, archivedChild as never, { pathPrefix: '/posts' }),
      ),
    ).resolves.toBeNull()

    await publishEntry(owner, parentId)
    await expect(
      ctx.raw.query(api.public.count, { collection: 'posts', locale: 'en' }),
    ).resolves.toBe(2)
    await expect(
      ctx.published.query(api.public.page, {
        collection: 'posts',
        locale: 'en',
        path: '/posts/operations/recovery',
      }),
    ).resolves.toMatchObject({ status: 'found', page: { id: childId } })
  })

  it('[LIF-01] previews archive effects across locales, assets, discovery, redirects, and revalidation before canonical removal', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob(['archive-asset'], { type: 'image/png' })),
    )
    const assetId = await ctx.seed('assets', {
      storageId,
      filename: 'archive.png',
      mimeType: 'image/png',
      size: 13,
      sha256: 'b'.repeat(64),
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
    })
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'archive-impact',
      localized: { title: 'Archive impact' },
      bodyMdc: `![Archive](${String(assetId)})`,
    })
    await publishEntry(owner, entryId)
    await ctx.seed('redirects', {
      redirectId: 'redirect_archive_impact',
      collection: 'posts',
      locale: 'en',
      kind: 'exact',
      fromPath: '/posts/old-archive-impact',
      targetEntryId: entryId,
      state: 'active',
      statusCode: 308,
      source: 'manual',
      operationId: 'test-redirect',
      createdBy: 'owner-1',
      createdAt: Date.now(),
      retiredBy: null,
      retiredAt: null,
      updatedAt: Date.now(),
    })

    const preview = await owner.mutation(api.entries.publish.previewArchiveEntryOperation, {
      entryId,
    })
    expect(preview.allowed).toBe(true)
    expect(preview.details).toMatchObject({
      assetImpact: { minimumCount: 1 },
      discoveryImpact: {
        navigationLocales: ['en'],
        searchLocales: ['en'],
        sitemapLocales: ['en'],
      },
      redirects: { minimumCount: 1 },
      revalidation: { eventCount: 1 },
    })
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'redirect-target-temporarily-unavailable' }),
        expect.objectContaining({ code: 'assets-retained-with-archive' }),
      ]),
    )
  })

  it('[LIF-02] restores an archived stable identity only through a current confirmed operation and never republishes it', async () => {
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
    await expect(operation.execute({ entryId })).resolves.toMatchObject({
      status: 'blocked',
      code: 'CONFIRMATION_REQUIRED',
    })
    const preview = await operation.preview({ entryId })
    expect(preview.allowed).toBe(true)
    await expect(
      operation.execute({ entryId }, { confirmation: preview.confirmation }),
    ).resolves.toMatchObject({ status: 'applied', value: null })

    expect((await ctx.readAll('entries'))[0]).toMatchObject({
      lifecycle: 'active',
      activePublications: [],
    })
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect((await ctx.readAll('entryRevisions')).at(-1)).toMatchObject({ kind: 'restore' })
  })

  it('lets a publisher archive and restore without coupling lifecycle writes to MCP authority', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const publisher = ctx.asCmsUser('publisher-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'publisher-lifecycle',
      localized: { title: 'Publisher lifecycle' },
    })

    await archiveEntry(publisher, entryId)
    const operation = publisher.operation(restoreEntryOperation)
    const preview = await operation.preview({ entryId })
    expect(preview.allowed).toBe(true)
    await expect(
      operation.execute({ entryId }, { confirmation: preview.confirmation }),
    ).resolves.toMatchObject({ status: 'applied', value: null })

    expect((await ctx.readAll('entries'))[0]).toMatchObject({ lifecycle: 'active' })
  })

  it('rejects a restore confirmation when a sibling claims the archived route', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'reused-route',
      localized: { title: 'Original' },
    })
    await archiveEntry(owner, entryId)
    const operation = owner.operation(restoreEntryOperation)
    const preview = await operation.preview({ entryId })
    expect(preview.allowed).toBe(true)

    await ctx.raw.run(async (innerCtx) => {
      const now = Date.now()
      const conflictId = await innerCtx.db.insert('entries', {
        collection: 'posts',
        stableId: 'posts-conflicting-route',
        lifecycle: 'active',
        slug: 'reused-route',
        parentEntryId: null,
        orderRank: 'conflict',
        nodeKind: 'page',
        shared: {},
        draftVersion: 1,
        sharedVersion: 1,
        activePublications: [],
        latestEditorialRevisionId: null,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        createdAt: now,
        updatedAt: now,
      })
      await innerCtx.db.insert('entryLocaleDrafts', {
        entryId: conflictId,
        locale: 'en',
        slug: null,
        values: { title: 'Conflict' },
        bodyMdc: '',
        version: 1,
        updatedBy: 'owner-1',
        updatedAt: now,
      })
    })

    await expect(
      operation.execute({ entryId }, { confirmation: preview.confirmation }),
    ).resolves.toMatchObject({ status: 'stale', code: 'OPERATION_NO_LONGER_ALLOWED' })
    expect(
      (await ctx.readAll('entries')).find(
        (entry: { _id: string }) => String(entry._id) === entryId,
      ),
    ).toMatchObject({ lifecycle: 'archived' })
  })

  it('blocks restore when canonical draft content references missing asset bytes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const storageId = await ctx.raw.run(async (innerCtx) =>
      innerCtx.storage.store(new Blob(['asset-bytes'], { type: 'image/png' })),
    )
    const assetId = await ctx.seed('assets', {
      storageId,
      filename: 'restore.png',
      mimeType: 'image/png',
      size: 11,
      sha256: 'a'.repeat(64),
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
    })
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'missing-asset',
      localized: { title: 'Missing asset' },
      bodyMdc: `![Missing](${String(assetId)})`,
    })
    await archiveEntry(owner, entryId)
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.delete(assetId)
      await innerCtx.storage.delete(storageId)
    })

    const preview = await owner.operation(restoreEntryOperation).preview({ entryId })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PUBLIC_ASSET_MISSING' })]),
    )
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
      owner.mutation(api.entries.draft.createLocaleVariant, {
        entryId,
        locale: 'de',
        source: { kind: 'blank' },
      }),
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

    const firstPage = await ctx.published.query(api.public.routes, {
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
      ctx.published.query(api.public.routes, {
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

    const firstPage = await ctx.published.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Search Entry',
      limit: 2,
      cursor: null,
    })
    expect(firstPage.results).toHaveLength(2)
    expect(firstPage.pageInfo.hasNextPage).toBe(true)
    expect(JSON.parse(firstPage.pageInfo.endCursor!)).toMatchObject({
      v: 2,
      kind: 'publicSearch',
      collection: 'posts',
      locale: 'en',
      query: 'Search Entry',
      generation: expect.any(String),
      offset: 2,
    })

    const secondPage = await ctx.published.query(api.public.search, {
      collection: 'posts',
      locale: 'en',
      query: 'Search Entry',
      limit: 2,
      cursor: firstPage.pageInfo.endCursor,
    })
    const thirdPage = await ctx.published.query(api.public.search, {
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
