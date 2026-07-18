/// <reference types="vite/client" />

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  currentDraftVersion,
  installTestContract,
  publishEntry,
  seedMember,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
  seedStorageObject,
} from './helpers'

const api = anyApi

function rowsForEntry(rows: Array<Record<string, unknown>>, entryId: string) {
  return rows.filter((row) => String(row.entryId ?? row._id ?? '') === entryId)
}

async function installSingletonContract(ctx: ReturnType<typeof createCtx>) {
  const content = buildResolvedContentContract(
    {
      collections: {
        homepage: {
          type: 'page',
          source: 'content/homepage.md',
          i18n: true,
          route: { en: '/' },
          cms: {
            type: 'flat',
            route: { singleton: true },
            fields: {
              title: { type: 'text', localized: true, required: true },
            },
          },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
  const presentation = { collections: {} }
  await ctx.raw.mutation(api.contract.installCmsContract, {
    content,
    contentHash: await hashCanonicalJson(content),
    presentation,
    presentationHash: await hashCanonicalJson(presentation),
  })
}

describe('intentional entry duplication', () => {
  it('[CON-04] copies selected localized drafts, relations, and asset references into a private fresh identity', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const editor = ctx.asCmsUser('editor-1')

    const authorId = await owner.createEntry({
      collection: 'authors',
      slug: 'ada-lovelace',
      localized: { name: 'Ada Lovelace' },
    })
    const author = (await ctx.readAll('entries')).find((row) => String(row._id) === authorId)!
    const storageId = await seedStorageObject(ctx, {
      bytes: 'shared hero bytes',
      type: 'image/png',
    })
    const now = Date.now()
    const assetId = await ctx.seed('assets', {
      storageId,
      filename: 'shared-hero.png',
      mimeType: 'image/png',
      size: 17,
      width: 1200,
      height: 630,
      alt: null,
      caption: null,
      scope: 'global',
      entryId: null,
      collection: null,
      tags: ['hero'],
      createdBy: 'owner-1',
      updatedBy: null,
      createdAt: now,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
    })
    const sourceEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'reliability-notes',
      shared: { featured: true, hero: assetId, author: author.stableId },
      localized: { title: 'Reliability notes', description: 'English description' },
      bodyMdc: '# English body',
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: sourceEntryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId: sourceEntryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          de: {
            values: { title: 'Zuverlässigkeitsnotizen', description: 'Deutsche Beschreibung' },
            bodyMdc: '# Deutscher Inhalt',
          },
        },
      },
    })
    await publishEntry(owner, sourceEntryId, ['en', 'de'])
    await owner.mutation(api.reviewRequests.requestPublishReview, {
      entryId: sourceEntryId,
      expectedVersion: 3,
      locales: ['en', 'de'],
      title: 'Source review state',
      summary: 'This state belongs only to the source.',
    })

    const sourceEntryBefore = structuredClone(
      (await ctx.readAll('entries')).find((row) => String(row._id) === sourceEntryId),
    )
    const sourceDraftsBefore = structuredClone(
      rowsForEntry(await ctx.readAll('entryLocaleDrafts'), sourceEntryId),
    )
    const sourceActivityBefore = rowsForEntry(await ctx.readAll('activity'), sourceEntryId)
    const assetsBefore = structuredClone(await ctx.readAll('assets'))

    const result = await editor.mutation(api.entries.tree.duplicateEntry, {
      sourceEntryId,
      expectedSourceDraftVersion: 3,
      variants: [
        { locale: 'en', title: 'Reliability notes copy', slug: 'reliability-notes-copy' },
        {
          locale: 'de',
          title: 'Kopie der Zuverlässigkeitsnotizen',
          slug: 'reliability-notes-copy',
        },
      ],
    })

    expect(result).toMatchObject({
      entryId: expect.any(String),
      stableId: expect.any(String),
      slug: 'reliability-notes-copy',
      locales: ['en', 'de'],
      parentEntryId: null,
      draftVersion: 1,
    })
    expect(result.entryId).not.toBe(sourceEntryId)
    expect(result.stableId).not.toBe(sourceEntryBefore?.stableId)
    expect((await ctx.readAll('entries')).find((row) => String(row._id) === sourceEntryId)).toEqual(
      sourceEntryBefore,
    )
    expect(rowsForEntry(await ctx.readAll('entryLocaleDrafts'), sourceEntryId)).toEqual(
      sourceDraftsBefore,
    )

    const destination = (await ctx.readAll('entries')).find(
      (row) => String(row._id) === result.entryId,
    )!
    expect(destination).toMatchObject({
      stableId: result.stableId,
      lifecycle: 'active',
      slug: 'reliability-notes-copy',
      shared: {
        featured: true,
        hero: assetId,
        author: author.stableId,
      },
      draftVersion: 1,
      sharedVersion: 1,
      activePublications: [],
      latestEditorialRevisionId: null,
      createdBy: 'editor-1',
      updatedBy: 'editor-1',
    })
    const destinationDrafts = rowsForEntry(
      await ctx.readAll('entryLocaleDrafts'),
      result.entryId,
    ).sort((left, right) => String(left.locale).localeCompare(String(right.locale)))
    expect(destinationDrafts).toEqual([
      expect.objectContaining({
        locale: 'de',
        slug: null,
        version: 1,
        values: {
          title: 'Kopie der Zuverlässigkeitsnotizen',
          description: 'Deutsche Beschreibung',
        },
        bodyMdc: '# Deutscher Inhalt',
        updatedBy: 'editor-1',
      }),
      expect.objectContaining({
        locale: 'en',
        slug: null,
        version: 1,
        values: { title: 'Reliability notes copy', description: 'English description' },
        bodyMdc: '# English body',
        updatedBy: 'editor-1',
      }),
    ])
    expect(await ctx.readAll('assets')).toEqual(assetsBefore)
    expect(rowsForEntry(await ctx.readAll('contentAssetRefs'), result.entryId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId, sourceKind: 'draft', fieldPath: 'hero' }),
      ]),
    )
    expect(rowsForEntry(await ctx.readAll('entryRevisions'), result.entryId)).toEqual([])
    expect(rowsForEntry(await ctx.readAll('reviewRequests'), result.entryId)).toEqual([])
    expect(rowsForEntry(await ctx.readAll('publicEntries'), result.entryId)).toEqual([])
    expect(rowsForEntry(await ctx.readAll('activity'), sourceEntryId)).toEqual(sourceActivityBefore)
    expect(rowsForEntry(await ctx.readAll('activity'), result.entryId)).toEqual([
      expect.objectContaining({
        kind: 'entry.duplicated',
        appIdentityId: 'editor-1',
        detail: { sourceEntryId, locales: ['en', 'de'] },
      }),
    ])
  })

  it('[CON-04] duplicates one hierarchical document beside its source without copying descendants', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const rootId = await owner.createEntry({
      collection: 'docs',
      slug: 'guides',
      localized: { title: 'Guides' },
    })
    const sourceEntryId = await owner.createEntry({
      collection: 'docs',
      slug: 'reliability',
      parentEntryId: rootId,
      nodeKind: 'section',
      localized: { title: 'Reliability' },
      bodyMdc: '# Reliable systems',
    })
    const siblingId = await owner.createEntry({
      collection: 'docs',
      slug: 'operations',
      parentEntryId: rootId,
      localized: { title: 'Operations' },
    })
    const grandchildId = await owner.createEntry({
      collection: 'docs',
      slug: 'failure-modes',
      parentEntryId: sourceEntryId,
      localized: { title: 'Failure modes' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: sourceEntryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId: sourceEntryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          de: {
            slug: 'zuverlaessigkeit',
            values: { title: 'Zuverlässigkeit' },
            bodyMdc: '# Zuverlässige Systeme',
          },
        },
      },
    })
    const sourceBefore = structuredClone(
      (await ctx.readAll('entries')).find((row) => String(row._id) === sourceEntryId),
    )
    const siblingBefore = (await ctx.readAll('entries')).find(
      (row) => String(row._id) === siblingId,
    )!

    const result = await owner.mutation(api.entries.tree.duplicateEntry, {
      sourceEntryId,
      expectedSourceDraftVersion: 3,
      variants: [
        { locale: 'en', title: 'Reliability copy', slug: 'reliability-copy' },
        { locale: 'de', title: 'Zuverlässigkeit Kopie', slug: 'zuverlaessigkeit-kopie' },
      ],
    })

    const destination = (await ctx.readAll('entries')).find(
      (row) => String(row._id) === result.entryId,
    )!
    expect(destination).toMatchObject({
      parentEntryId: rootId,
      nodeKind: 'section',
      activePublications: [],
    })
    expect(destination.orderRank > sourceBefore!.orderRank).toBe(true)
    expect(destination.orderRank < siblingBefore.orderRank).toBe(true)
    expect(
      (await ctx.readAll('entries')).find((row) => String(row._id) === grandchildId),
    ).toMatchObject({ parentEntryId: sourceEntryId })
    expect(
      (await ctx.readAll('entries')).filter((row) => String(row.parentEntryId) === result.entryId),
    ).toEqual([])
    expect((await ctx.readAll('entries')).find((row) => String(row._id) === sourceEntryId)).toEqual(
      sourceBefore,
    )
    expect(
      rowsForEntry(await ctx.readAll('entryLocaleDrafts'), result.entryId)
        .map((row) => [row.locale, row.slug, row.bodyMdc])
        .sort(),
    ).toEqual([
      ['de', 'zuverlaessigkeit-kopie', '# Zuverlässige Systeme'],
      ['en', 'reliability-copy', '# Reliable systems'],
    ])
    expect(rowsForEntry(await ctx.readAll('publicEntries'), result.entryId)).toEqual([])
  })

  it('[CON-04] rejects a duplicate route collision transactionally', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sourceEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'source-post',
      localized: { title: 'Source post' },
    })
    await owner.createEntry({
      collection: 'posts',
      slug: 'reserved-copy',
      localized: { title: 'Existing destination' },
    })
    const before = {
      entries: await ctx.readAll('entries'),
      drafts: await ctx.readAll('entryLocaleDrafts'),
      activity: await ctx.readAll('activity'),
      assetRefs: await ctx.readAll('contentAssetRefs'),
      search: await ctx.readAll('draftSearchEntries'),
    }

    await expect(
      owner.mutation(api.entries.tree.duplicateEntry, {
        sourceEntryId,
        expectedSourceDraftVersion: 1,
        variants: [{ locale: 'en', title: 'Copy', slug: 'reserved-copy' }],
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_PATH_CONFLICT')
    expect(await ctx.readAll('entries')).toEqual(before.entries)
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before.drafts)
    expect(await ctx.readAll('activity')).toEqual(before.activity)
    expect(await ctx.readAll('contentAssetRefs')).toEqual(before.assetRefs)
    expect(await ctx.readAll('draftSearchEntries')).toEqual(before.search)
  })

  it('[CON-04] requires an intentionally new title and slug', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sourceEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'identity-source',
      localized: { title: 'Identity source' },
    })

    await expect(
      owner.mutation(api.entries.tree.duplicateEntry, {
        sourceEntryId,
        expectedSourceDraftVersion: 1,
        variants: [{ locale: 'en', title: 'Identity source', slug: 'new-identity-source' }],
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_DUPLICATE_TITLE_UNCHANGED',
    )
    await expect(
      owner.mutation(api.entries.tree.duplicateEntry, {
        sourceEntryId,
        expectedSourceDraftVersion: 1,
        variants: [{ locale: 'en', title: 'New identity source', slug: 'identity-source' }],
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_DUPLICATE_SLUG_UNCHANGED',
    )
    expect(await ctx.readAll('entries')).toHaveLength(1)
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(1)
  })

  it('[CON-04] fences source changes and denies viewers while allowing editors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sourceEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'permission-source',
      localized: { title: 'Permission source' },
    })
    const args = {
      sourceEntryId,
      expectedSourceDraftVersion: 1,
      variants: [{ locale: 'en', title: 'Permission copy', slug: 'permission-copy' }],
    }

    await expect(
      ctx.asCmsUser('viewer-1').mutation(api.entries.tree.duplicateEntry, args),
    ).rejects.toThrow(/Create entries/i)
    await owner.saveEntryDraft({
      entryId: sourceEntryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Changed source' } } } },
    })
    await expect(
      ctx.asCmsUser('editor-1').mutation(api.entries.tree.duplicateEntry, args),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_CONCURRENT_EDIT',
    )
    await expect(
      ctx.asCmsUser('editor-1').mutation(api.entries.tree.duplicateEntry, {
        ...args,
        expectedSourceDraftVersion: await currentDraftVersion(owner, sourceEntryId),
      }),
    ).resolves.toMatchObject({ slug: 'permission-copy', locales: ['en'] })
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('[CON-04] allows data-only drafts with a fresh identity and no public output', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const owner = ctx.asCmsUser('owner-1')
    const sourceEntryId = await owner.createEntry({
      collection: 'authors',
      slug: 'grace-hopper',
      localized: { name: 'Grace Hopper' },
    })
    const source = (await ctx.readAll('entries')).find((row) => String(row._id) === sourceEntryId)!

    const result = await owner.mutation(api.entries.tree.duplicateEntry, {
      sourceEntryId,
      expectedSourceDraftVersion: 1,
      variants: [{ locale: 'en', title: 'Grace Hopper copy', slug: 'grace-hopper-copy' }],
    })

    expect(result.stableId).not.toBe(source.stableId)
    expect(rowsForEntry(await ctx.readAll('entryLocaleDrafts'), result.entryId)).toEqual([
      expect.objectContaining({ values: { name: 'Grace Hopper copy' } }),
    ])
    expect(rowsForEntry(await ctx.readAll('publicEntries'), sourceEntryId)).toEqual([])
    expect(rowsForEntry(await ctx.readAll('publicEntries'), result.entryId)).toEqual([])
  })

  it('[CON-04] rejects singleton duplication without creating a second entry', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installSingletonContract(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const sourceEntryId = await owner.createEntry({
      collection: 'homepage',
      slug: 'ignored-for-singleton',
      localized: { title: 'Homepage' },
    })

    await expect(
      owner.mutation(api.entries.tree.duplicateEntry, {
        sourceEntryId,
        expectedSourceDraftVersion: 1,
        variants: [{ locale: 'en', title: 'Homepage copy', slug: 'homepage-copy' }],
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_DUPLICATE_SINGLETON',
    )
    expect(await ctx.readAll('entries')).toHaveLength(1)
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(1)
  })
})
