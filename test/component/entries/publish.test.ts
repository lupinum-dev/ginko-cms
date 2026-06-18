/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  archiveEntry,
  createCtx,
  previewArchiveEntry,
  previewPublishEntryWithArgs,
  previewUnpublishEntry,
  publishEntry,
  publishEntryWithArgs,
  seedOwner,
  seedSettings,
  seedMultiLocaleSettings,
  seedEditorFixture,
  seedTreeFixture,
  unpublishEntry,
  currentDraftVersion,
} from './helpers'

const api = anyApi

describe('editor publish operations', () => {
  it('publishes an entry and clears published state on unpublish', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const publishResult = await publishEntry(owner, entryId)

    expect(publishResult).toMatchObject({
      draftVersion: 1,
      dirtyLocales: [],
    })
    expect(typeof publishResult.versionId).toBe('string')

    const publishedEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(publishedEntry?.status).toBe('published')
    expect(publishedEntry?.localeData?.published?.values.title).toBe('Hello world')
    expect(publishedEntry?.dirtyLocales).toEqual([])
    const rawPublishedEntry = (await ctx.readAll('entries')).find(
      (row: { _id: string }) => row._id === entryId,
    )
    expect(rawPublishedEntry?.latestRevisionId).toBe(publishResult.versionId)

    const publishOutbox = (await ctx.readAll('outboxEvents')).filter(
      (row: { type: string; status: string }) =>
        row.type === 'content.revalidate' && row.status === 'pending',
    )
    expect(publishOutbox).toHaveLength(1)
    expect(publishOutbox[0]).toMatchObject({
      versionId: publishResult.versionId,
      tags: expect.arrayContaining([
        'collection:posts',
        `entry:posts:${entryId}`,
        `entry:posts:${entryId}:en`,
        'nav:posts:en',
        'search:en',
        'sitemap',
      ]),
      paths: expect.arrayContaining(['/posts', '/posts/hello-world']),
      attempts: 0,
      lastError: null,
    })

    const publishedVersions = await owner.query(api.editor.listVersions, {
      entryId,
    })
    expect(publishedVersions[0]).toMatchObject({
      action: 'publish',
      isCurrentPublished: true,
      publishedLocales: ['en'],
    })

    const unpublishPreview = await previewUnpublishEntry(owner, entryId)
    expect(unpublishPreview.allowed).toBe(true)
    expect(unpublishPreview.summary).toContain('Hello world')
    expect(unpublishPreview.warnings[0]?.message).toContain('en:')

    await unpublishEntry(owner, entryId)

    const unpublishedEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(unpublishedEntry?.status).toBe('draft')
    expect(unpublishedEntry?.published).toBeNull()
    expect(unpublishedEntry?.localeData?.published).toBeNull()
    expect(unpublishedEntry?.dirtyLocales).toEqual([])

    const outboxAfterUnpublish = (await ctx.readAll('outboxEvents')).filter(
      (row: { type: string }) => row.type === 'content.revalidate',
    )
    expect(outboxAfterUnpublish).toHaveLength(2)
    const unpublishOutbox = outboxAfterUnpublish.find(
      (row: { payload?: { reason?: string } }) => row.payload?.reason === 'unpublish',
    )
    expect(unpublishOutbox).toMatchObject({
      status: 'pending',
      payload: expect.objectContaining({
        reason: 'unpublish',
        collection: 'posts',
        entryId,
      }),
      paths: expect.arrayContaining(['/posts', '/posts/hello-world']),
    })

    const versionsAfterUnpublish = await owner.query(api.editor.listVersions, {
      entryId,
    })
    expect(versionsAfterUnpublish.map((version: { action: string }) => version.action)).toEqual([
      'unpublish',
      'publish',
    ])
  })

  it('revalidates both old and new direct paths when a published route changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)
    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: {
        shared: {
          slug: 'hello-again',
        },
      },
    })

    const republishResult = await publishEntry(owner, entryId)

    const outbox = (await ctx.readAll('outboxEvents')).find(
      (row: { versionId?: string | null }) => row.versionId === republishResult.versionId,
    )
    expect(outbox).toMatchObject({
      paths: expect.arrayContaining(['/posts', '/posts/hello-world', '/posts/hello-again']),
    })
  })

  it('binds active public projections to the immutable published version', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)

    const activeEntries = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(activeEntries).toHaveLength(1)
    expect(activeEntries[0]?.path).toBe('/posts/hello-world')
    expect(activeEntries[0]?.revisionId).toBeTruthy()

    const activeRoutes = (await ctx.readAll('publicRoutes')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(activeRoutes).toHaveLength(1)
    expect(activeRoutes[0]?.path).toBe('/posts/hello-world')
    expect(activeRoutes[0]?.revisionId).toBe(activeEntries[0]?.revisionId)
  })

  it('stores bodyMdc as the authoring source and derives public body artifacts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: {
        locales: {
          en: {
            values: { title: 'Published body' },
            bodyMdc: '# Published body\n\nVisible body text.',
          },
        },
      },
    })

    const publishResult = await publishEntry(owner, entryId)

    const publicRow = (await ctx.readAll('publicEntries')).find(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(publicRow).toMatchObject({
      entryId,
      revisionId: publishResult.versionId,
      bodyMdc: '# Published body\n\nVisible body text.',
    })
    expect(typeof publicRow?.bodyAst).toBe('string')
    const publicBodyAst = JSON.parse(publicRow?.bodyAst as string)
    expect(publicBodyAst).toMatchObject({ type: 'root' })
    expect(publicBodyAst.children.length).toBeGreaterThan(0)
    expect(publicRow?.searchText).toContain('Visible body text')

    const revisionRow = (await ctx.readAll('entryRevisions')).find(
      (row: { _id: string }) => row._id === publishResult.versionId,
    )
    expect(revisionRow?.snapshot.locales.en).toMatchObject({
      bodyMdc: '# Published body\n\nVisible body text.',
      searchText: expect.stringContaining('Visible body text'),
    })
    expect(revisionRow?.snapshot.locales.en).not.toHaveProperty('bodyAst')
  })

  it('does not rewrite active public projections when a draft is saved', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)

    const beforeEntry = (await ctx.readAll('publicEntries')).find(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    const beforeRoute = (await ctx.readAll('publicRoutes')).find(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(beforeEntry).toBeTruthy()
    expect(beforeRoute).toBeTruthy()

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: {
        locales: {
          en: {
            values: { title: 'Draft-only title' },
          },
        },
      },
    })

    const afterEntry = (await ctx.readAll('publicEntries')).find(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    const afterRoute = (await ctx.readAll('publicRoutes')).find(
      (row: { entryId: string }) => row.entryId === entryId,
    )

    expect(afterEntry?._id).toBe(beforeEntry?._id)
    expect(afterEntry?.title).toBe(beforeEntry?.title)
    expect(afterRoute?._id).toBe(beforeRoute?._id)
  })

  it('rejects publish when the observed draft version is stale', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      publishEntryWithArgs(owner, {
        entryId,
        locales: ['en'],
        expectedVersion: 0,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const data = getCmsErrorData(error)
      return (
        data?.code === 'ENTRY_CONCURRENT_EDIT' &&
        data.details?.expectedVersion === 0 &&
        data.details?.currentVersion === 1 &&
        data.details?.retryable === true
      )
    })
  })

  it('returns a structured error when publishing an unknown locale', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      publishEntryWithArgs(owner, {
        entryId,
        expectedVersion: await currentDraftVersion(owner, entryId),
        locales: ['de'],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'UNSUPPORTED_LOCALE'
    })
  })

  it('archives a published entry through the shared transition flow', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)
    const archivePreview = await previewArchiveEntry(owner, entryId)
    expect(archivePreview.allowed).toBe(true)
    expect(archivePreview.warnings[0]?.message).toContain('en:')

    await archiveEntry(owner, entryId)

    const archivedEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(archivedEntry?.status).toBe('archived')
    expect(archivedEntry?.published).toBeNull()
    expect(archivedEntry?.localeData?.published).toBeNull()
    expect(archivedEntry?.dirtyLocales).toEqual([])

    const archiveOutbox = (await ctx.readAll('outboxEvents')).find(
      (row: { payload?: { reason?: string } }) => row.payload?.reason === 'archive',
    )
    expect(archiveOutbox).toMatchObject({
      paths: expect.arrayContaining(['/posts', '/posts/hello-world']),
    })

    const versions = await owner.query(api.editor.listVersions, { entryId })
    expect(versions.map((version: { action: string }) => version.action)).toEqual([
      'archive',
      'publish',
    ])
  })

  it('publishes child paths from published ancestry instead of draft ancestry', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)

    const parent = await owner.query(api.editor.getEntry, {
      id: rootAId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: parent.draftVersion,
      patch: {
        shared: {
          slug: 'root-a-draft',
        },
      },
    })

    const child = await owner.query(api.editor.getEntry, {
      id: childId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: childId,
      expectedDraftVersion: child.draftVersion,
      patch: {
        locales: {
          en: {
            values: { title: 'Child updated' },
          },
        },
      },
    })
    await publishEntry(owner, childId)

    const childLocale = (await ctx.readAll('publicEntries')).find(
      (row: { entryId: string; locale: string; path?: string | null }) =>
        row.entryId === childId && row.locale === 'en',
    )
    expect(childLocale?.path).toBe('/docs/root-a/child')
  })

  it('rejects publishing when published ancestry would create a localized path conflict', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'docs',
        label: { en: 'Docs' },
        icon: null,
        type: 'tree',
        routing: {
          pathPrefix: '/docs',
          slugMode: 'localized',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [],
        settings: { maxDepth: 4 },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    const parentId = await owner.createEntry({
      collection: 'docs',
      slug: 'parent',
      localized: { title: 'Parent' },
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId: parentId, locale: 'de' })
    const parent = await owner.query(api.editor.getEntry, { id: parentId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: parentId,
      expectedDraftVersion: parent.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'live',
          },
        },
      },
    })
    await publishEntry(owner, parentId, ['de'])

    const leftId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: parentId,
      slug: 'left',
      localized: { title: 'Left' },
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId: leftId, locale: 'de' })
    const left = await owner.query(api.editor.getEntry, { id: leftId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: leftId,
      expectedDraftVersion: left.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'gemeinsam',
          },
        },
      },
    })
    await publishEntry(owner, leftId, ['de'])

    const rightId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: parentId,
      slug: 'right',
      localized: { title: 'Right' },
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId: rightId, locale: 'de' })
    const right = await owner.query(api.editor.getEntry, { id: rightId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: rightId,
      expectedDraftVersion: right.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'gemeinsam',
          },
        },
      },
    })

    const conflictPreview = await previewPublishEntryWithArgs(owner, {
      entryId: rightId,
      expectedVersion: await currentDraftVersion(owner, rightId),
      locales: ['de'],
    })

    expect(conflictPreview.allowed).toBe(false)
    expect(conflictPreview.blockers).toContainEqual(
      expect.objectContaining({
        code: 'publish-blocker',
        message: expect.stringContaining('claimed by 2 public routes'),
      }),
    )
    expect(conflictPreview.details.locales[0]?.blockingDiagnostics[0]?.code).toBe('route_collision')
  })
})
