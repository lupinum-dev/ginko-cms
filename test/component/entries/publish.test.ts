/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  computePublishDraftHash,
  publishCurrentDraft,
} from '../../../packages/convex/src/entries/workflow/commands'
import { publicPathForLocaleSnapshot } from '../../../packages/convex/src/entries/workflow/path'
import {
  archiveEntry,
  createCtx,
  previewArchiveEntry,
  previewPublishEntryWithArgs,
  previewUnpublishEntry,
  publishEntry,
  publishEntryWithArgs,
  rollbackVersion,
  seedMember,
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
  it('blocks publishing data-only entries with missing required fields', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'authors',
        label: { en: 'Authors' },
        icon: null,
        type: 'flat',
        routing: {
          mode: 'none',
          pathPrefix: '',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'name', type: 'text', localized: true, required: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'authors',
      slug: 'author',
      localized: {},
    })
    const expectedVersion = await currentDraftVersion(owner, entryId)

    const preview = await previewPublishEntryWithArgs(owner, {
      entryId,
      expectedVersion,
      locales: ['en'],
    })
    expect(preview.allowed).toBe(false)
    expect(preview.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Required field "name"'),
        }),
      ]),
    )

    await expect(
      ctx.raw.run(async (innerCtx) => {
        const expectedDraftHash = await computePublishDraftHash(innerCtx, {
          entryId: entryId as never,
          locales: ['en'],
        })
        return await publishCurrentDraft(innerCtx, {
          entryId: entryId as never,
          locales: ['en'],
          expectedDraftVersion: expectedVersion,
          expectedDraftHash,
          appIdentity: 'owner-1',
        })
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_PUBLISH_NOT_READY',
    )
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

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
        'entry:posts:hello-world',
        'entry:posts:hello-world:en',
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

  it('publishes through the same projection, audit, and revalidation semantics for MCP publishers', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_publish',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.publishEntries],
    })

    const agentPublisher = ctx.asMcpApiKey('ba_key_publish', 'owner-1')
    const publishResult = await publishEntry(agentPublisher, entryId)

    const publicRows = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(publicRows).toHaveLength(1)
    expect(publicRows[0]).toMatchObject({
      revisionId: publishResult.versionId,
      path: '/posts/hello-world',
      locale: 'en',
      title: 'Hello world',
    })

    const revisions = (await ctx.readAll('entryRevisions')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(revisions).toEqual([
      expect.objectContaining({
        _id: publishResult.versionId,
        kind: 'publish',
        createdBy: 'owner-1',
      }),
    ])

    const auditRows = await ctx.readAll('destructiveAuditLog')
    expect(auditRows).toEqual([
      expect.objectContaining({
        operationId: 'ginko-cms.publish-entry',
        executePath: 'entries/publish:publishEntryOperationExecute',
        callerKey: 'mcp:ba_key_publish',
        scopeKey: 'ginko-cms',
      }),
    ])

    const publishOutbox = (await ctx.readAll('outboxEvents')).filter(
      (row: { type: string; status: string }) =>
        row.type === 'content.revalidate' && row.status === 'pending',
    )
    expect(publishOutbox).toEqual([
      expect.objectContaining({
        versionId: publishResult.versionId,
        tags: expect.arrayContaining([
          'collection:posts',
          'entry:posts:hello-world',
          'entry:posts:hello-world:en',
          'nav:posts:en',
          'search:en',
          'sitemap',
        ]),
        paths: expect.arrayContaining(['/posts', '/posts/hello-world']),
      }),
    ])
  })

  it('does not let an edit-only MCP credential publish directly', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_edit_only',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    const editOnlyAgent = ctx.asMcpApiKey('ba_key_edit_only', 'owner-1')
    await expect(publishEntry(editOnlyAgent, entryId)).rejects.toThrow(/Publish entries/i)

    expect(await ctx.readAll('publicEntries')).toHaveLength(0)
    expect(await ctx.readAll('destructiveAuditLog')).toHaveLength(0)
    expect(await ctx.readAll('outboxEvents')).toHaveLength(0)
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

  it('publishes one locale without activating or rewriting other locale drafts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'blog',
        label: { en: 'Blog', de: 'Blog' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/blog',
          slugMode: 'localized',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'blog',
      slug: 'launch',
      locale: 'en',
      localized: { title: 'Launch' },
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: {
        locales: {
          de: {
            slug: 'start',
            values: { title: 'Start' },
          },
        },
      },
    })

    await publishEntry(owner, entryId, ['en'])

    await expect(
      owner.query(api.public.page, {
        collection: 'blog',
        locale: 'en',
        path: '/blog/launch',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: expect.objectContaining({
        title: 'Launch',
        route: expect.objectContaining({ path: '/blog/launch' }),
      }),
    })
    await expect(
      owner.query(api.public.page, {
        collection: 'blog',
        locale: 'de',
        path: '/blog/start',
      }),
    ).resolves.toMatchObject({ status: 'not-found', page: null })
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({
        entryId,
        locale: 'en',
        path: '/blog/launch',
        title: 'Launch',
      }),
    ])

    const readinessAfterEnglish = await owner.query(api.editor.getEntryReadinessDetail, { entryId })
    expect(readinessAfterEnglish.locales).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'en', state: 'live', canPublish: false }),
        expect.objectContaining({ locale: 'de', state: 'ready', canPublish: true }),
      ]),
    )
    expect(
      readinessAfterEnglish.locales.map((locale: { locale: string }) => locale.locale),
    ).toEqual(['en', 'de'])

    await publishEntry(owner, entryId, ['de'])

    await expect(
      owner.query(api.public.page, {
        collection: 'blog',
        locale: 'de',
        path: '/blog/start',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: expect.objectContaining({
        title: 'Start',
        route: expect.objectContaining({ path: '/blog/start', href: '/de/blog/start' }),
      }),
    })
    await expect(
      owner.query(api.public.page, {
        collection: 'blog',
        locale: 'en',
        path: '/blog/launch',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: expect.objectContaining({
        title: 'Launch',
        route: expect.objectContaining({ path: '/blog/launch', href: '/blog/launch' }),
      }),
    })
  })

  it('keeps the previous public output active when a confirmed publish becomes blocked', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)

    const beforeEntries = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    const beforeRoutes = (await ctx.readAll('publicRoutes')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    expect(beforeEntries).toHaveLength(1)
    expect(beforeRoutes).toHaveLength(1)

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: {
        shared: {
          slug: 'claimed-later',
        },
        locales: {
          en: {
            values: { title: 'Claimed later' },
          },
        },
      },
    })

    const publishArgs = {
      entryId,
      expectedVersion: await currentDraftVersion(owner, entryId),
      locales: ['en'],
    }
    const publishPreview = await previewPublishEntryWithArgs(owner, publishArgs)
    expect(publishPreview.allowed).toBe(true)
    expect(publishPreview.confirmation?.token).toEqual(expect.any(String))

    const conflictingEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'claimed-later',
      localized: { title: 'Conflicting route owner' },
    })
    await publishEntry(owner, conflictingEntryId)

    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        ...publishArgs,
        _confirmationToken: publishPreview.confirmation?.token,
      }),
    ).rejects.toThrow(/no longer allowed/i)

    const afterEntries = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )
    const afterRoutes = (await ctx.readAll('publicRoutes')).filter(
      (row: { entryId: string }) => row.entryId === entryId,
    )

    expect(afterEntries).toEqual(beforeEntries)
    expect(afterRoutes).toEqual(beforeRoutes)
  })

  it('rejects confirmed route-backed publish when required fields become invalid after preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId, collectionId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const publishArgs = {
      entryId,
      expectedVersion: await currentDraftVersion(owner, entryId),
      locales: ['en'],
    }
    const publishPreview = await previewPublishEntryWithArgs(owner, publishArgs)
    expect(publishPreview.allowed).toBe(true)
    expect(publishPreview.confirmation?.token).toEqual(expect.any(String))

    await ctx.raw.run(async (innerCtx) => {
      const collection = await innerCtx.db.get(collectionId as never)
      if (!collection) throw new Error('Missing collection fixture.')
      await innerCtx.db.patch(
        collectionId as never,
        {
          fields: [
            ...((collection as { fields: unknown[] }).fields ?? []),
            { key: 'summary', type: 'text', localized: true, required: true },
          ],
        } as never,
      )
    })

    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        ...publishArgs,
        _confirmationToken: publishPreview.confirmation?.token,
      }),
    ).rejects.toThrow(/no longer allowed/i)
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('publicRoutes')).toEqual([])
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

  it('requires publish permission when rollback also publishes the restored version', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const firstPublish = await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: {
        locales: {
          en: {
            values: { title: 'Second title' },
          },
        },
      },
    })
    await publishEntry(owner, entryId)

    const editor = ctx.asCmsUser('editor-1')
    await expect(
      rollbackVersion(editor, {
        entryId,
        versionId: firstPublish.versionId,
        publish: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ROLLBACK_PUBLISH_FORBIDDEN',
    )

    const publisher = ctx.asCmsUser('publisher-1')
    await expect(
      rollbackVersion(publisher, {
        entryId,
        versionId: firstPublish.versionId,
        publish: true,
      }),
    ).resolves.toMatchObject({
      versionId: expect.any(String),
    })

    const publicRows = await ctx.readAll('publicEntries')
    expect(publicRows).toEqual([
      expect.objectContaining({
        entryId,
        title: 'Hello world',
      }),
    ])
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
    expect(archivePreview.version).toMatchObject({
      publicRevisionIdsByLocale: {
        en: expect.any(String),
      },
      publicDescendantRouteCount: 0,
    })

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

  it('rejects archive execution when public state moved after preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)
    const archivePreview = await previewArchiveEntry(owner, entryId)
    expect(archivePreview.confirmation?.token).toBeTruthy()

    const entry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: {
        locales: {
          en: {
            values: { title: 'Hello world updated' },
          },
        },
      },
    })
    await publishEntry(owner, entryId)

    await expect(
      owner.mutation(api.entries.publish.archiveEntryOperationExecute, {
        entryId,
        _confirmationToken: archivePreview.confirmation?.token,
      }),
    ).rejects.toThrow(/confirmation .*mismatch/i)

    const stillPublished = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(stillPublished?.status).toBe('published')
    expect(await ctx.readAll('publicEntries')).toHaveLength(1)
  })

  it('blocks archiving a published parent with published descendants', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)

    const archivePreview = await previewArchiveEntry(owner, rootAId)
    expect(archivePreview.allowed).toBe(false)
    expect(archivePreview.confirmation).toBeNull()
    expect(archivePreview.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'published-descendants',
        }),
      ]),
    )
    expect(archivePreview.details).toMatchObject({
      publicDescendantRoutes: expect.arrayContaining([
        expect.objectContaining({
          entryId: childId,
          path: '/docs/root-a/child',
        }),
        expect.objectContaining({
          entryId: grandchildId,
          path: '/docs/root-a/child/grandchild',
        }),
      ]),
    })
    expect(await ctx.readAll('publicEntries')).toHaveLength(3)
  })

  it('blocks unpublishing a published parent with published descendants', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)

    const unpublishPreview = await previewUnpublishEntry(owner, rootAId)
    expect(unpublishPreview.allowed).toBe(false)
    expect(unpublishPreview.confirmation).toBeNull()
    expect(unpublishPreview.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'published-descendants',
        }),
      ]),
    )
    expect(unpublishPreview.details).toMatchObject({
      publicDescendantRoutes: expect.arrayContaining([
        expect.objectContaining({
          entryId: childId,
          path: '/docs/root-a/child',
        }),
        expect.objectContaining({
          entryId: grandchildId,
          path: '/docs/root-a/child/grandchild',
        }),
      ]),
    })
    expect(await ctx.readAll('publicEntries')).toHaveLength(3)
  })

  it('only restores archived entries and leaves draft or published state unchanged', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(owner.restoreEntry({ entryId })).rejects.toThrow('Only archived entries')
    expect(await ctx.readAll('publicEntries')).toEqual([])

    await publishEntry(owner, entryId)
    const publicRowsBeforePublishedRestore = await ctx.readAll('publicEntries')
    const activityBeforePublishedRestore = await ctx.readAll('activity')
    await expect(owner.restoreEntry({ entryId })).rejects.toThrow('Only archived entries')
    expect(await ctx.readAll('publicEntries')).toEqual(publicRowsBeforePublishedRestore)
    expect(await ctx.readAll('activity')).toEqual(activityBeforePublishedRestore)

    await archiveEntry(owner, entryId)
    await expect(owner.restoreEntry({ entryId })).resolves.toBeNull()
    const restoredEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(restoredEntry?.status).toBe('draft')
    expect(await ctx.readAll('publicEntries')).toEqual([])
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

  it('previews descendant URL changes when a published parent route changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)

    const child = await owner.query(api.editor.getEntry, {
      id: childId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: childId,
      expectedDraftVersion: child.draftVersion,
      patch: {
        shared: {
          parentEntryId: rootBId,
        },
        locales: {
          en: {
            values: { title: 'Child draft only' },
          },
        },
      },
    })
    await owner.mutation(api.editor.createCheckpoint, {
      entryId: childId,
      message: 'Draft move before route rebuild',
    })

    const parent = await owner.query(api.editor.getEntry, {
      id: rootAId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: parent.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })

    const preview = await previewPublishEntryWithArgs(owner, {
      entryId: rootAId,
      expectedVersion: await currentDraftVersion(owner, rootAId),
      locales: ['en'],
    })

    expect(preview.allowed).toBe(true)
    expect(preview.details.publishImpact.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'route',
          label: expect.stringContaining('Descendant public route'),
          before: '/docs/root-a/child',
          after: '/docs/root-renamed/child',
        }),
        expect.objectContaining({
          kind: 'route',
          label: expect.stringContaining('Descendant public route'),
          before: '/docs/root-a/child/grandchild',
          after: '/docs/root-renamed/child/grandchild',
        }),
      ]),
    )
    expect(await owner.query(api.editor.getEntry, { id: childId, locale: 'en' })).toMatchObject({
      dirtyLocales: ['en'],
      localeData: {
        published: expect.objectContaining({
          values: expect.objectContaining({ title: 'Child' }),
        }),
      },
    })
  })

  it('blocks preview when a descendant rebuilt route would collide', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'landing',
        label: { en: 'Landing' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/docs/root-renamed',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const collidingId = await owner.createEntry({
      collection: 'landing',
      slug: 'child',
      localized: { title: 'Colliding child route' },
    })
    await publishEntry(owner, collidingId)

    const parent = await owner.query(api.editor.getEntry, {
      id: rootAId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: parent.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })

    const preview = await previewPublishEntryWithArgs(owner, {
      entryId: rootAId,
      expectedVersion: await currentDraftVersion(owner, rootAId),
      locales: ['en'],
    })

    expect(preview.allowed).toBe(false)
    expect(preview.details.publishImpact.locales[0]?.blockingDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'route_collision',
        path: '/docs/root-renamed',
        details: expect.objectContaining({
          claims: expect.arrayContaining([
            expect.objectContaining({ entryId: childId, path: '/docs/root-renamed/child' }),
            expect.objectContaining({ entryId: collidingId, path: '/docs/root-renamed/child' }),
          ]),
        }),
      }),
    )
    expect(await ctx.readAll('publicEntries')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: childId, path: '/docs/root-a/child' }),
      ]),
    )
  })

  it('rejects confirmed parent publish when a descendant rebuilt route collides after preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)

    const parent = await owner.query(api.editor.getEntry, {
      id: rootAId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: parent.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })

    const publishArgs = {
      entryId: rootAId,
      expectedVersion: await currentDraftVersion(owner, rootAId),
      locales: ['en'],
    }
    const publishPreview = await previewPublishEntryWithArgs(owner, publishArgs)
    expect(publishPreview.allowed).toBe(true)
    expect(publishPreview.confirmation?.token).toEqual(expect.any(String))

    const beforeTargetRows = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) =>
        row.entryId === rootAId || row.entryId === childId || row.entryId === grandchildId,
    )

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'landing',
        label: { en: 'Landing' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/docs/root-renamed',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
    const collidingId = await owner.createEntry({
      collection: 'landing',
      slug: 'child',
      localized: { title: 'Colliding child route' },
    })
    await publishEntry(owner, collidingId)

    await expect(
      owner.mutation(api.entries.publish.publishEntryOperationExecute, {
        ...publishArgs,
        _confirmationToken: publishPreview.confirmation?.token,
      }),
    ).rejects.toThrow(/no longer allowed/i)
    expect(
      (await ctx.readAll('publicEntries')).filter(
        (row: { entryId: string }) =>
          row.entryId === rootAId || row.entryId === childId || row.entryId === grandchildId,
      ),
    ).toEqual(beforeTargetRows)
  })

  it('rebuilds published descendant routes when publishing a parent route change', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, rootAId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)
    const childBeforeRouteRebuild = (await ctx.readAll('entries')).find(
      (row: { _id: string }) => row._id === childId,
    )
    const grandchildBeforeRouteRebuild = (await ctx.readAll('entries')).find(
      (row: { _id: string }) => row._id === grandchildId,
    )

    const child = await owner.query(api.editor.getEntry, {
      id: childId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: childId,
      expectedDraftVersion: child.draftVersion,
      patch: {
        shared: {
          parentEntryId: rootBId,
        },
        locales: {
          en: {
            values: { title: 'Child draft only' },
          },
        },
      },
    })
    const childCheckpointId = await owner.mutation(api.entries.publish.createCheckpoint, {
      entryId: childId,
      message: 'Checkpoint before parent route rebuild',
    })

    const parent = await owner.query(api.editor.getEntry, {
      id: rootAId,
      locale: 'en',
    })
    await owner.saveEntryDraft({
      entryId: rootAId,
      expectedDraftVersion: parent.draftVersion,
      patch: {
        shared: {
          slug: 'root-renamed',
        },
      },
    })

    const publishResult = await publishEntry(owner, rootAId)

    expect(
      (await ctx.readAll('publicEntries')).filter(
        (row: { entryId: string }) => row.entryId === childId || row.entryId === grandchildId,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: childId,
          path: '/docs/root-renamed/child',
          title: 'Child',
        }),
        expect.objectContaining({
          entryId: grandchildId,
          path: '/docs/root-renamed/child/grandchild',
          title: 'Grandchild',
        }),
      ]),
    )
    const collection = (await ctx.readAll('collections')).find(
      (row: { slug: string }) => row.slug === 'docs',
    )
    expect(collection).toBeTruthy()
    const descendantRows = (await ctx.readAll('publicEntries')).filter(
      (row: { entryId: string }) => row.entryId === childId || row.entryId === grandchildId,
    )
    const revisions = await ctx.readAll('entryRevisions')
    for (const row of descendantRows as Array<{
      entryId: string
      locale: string
      parentEntryId?: string | null
      path: string
      revisionId: string
    }>) {
      const revision = revisions.find(
        (candidate: { _id: string }) => candidate._id === row.revisionId,
      ) as
        | {
            kind: string
            message?: string | null
            parentRevisionId?: string | null
            snapshot: {
              parentEntryId?: string | null
              locales: Record<string, { path: string } | null>
            }
          }
        | undefined
      expect(revision).toMatchObject({
        kind: 'route_rebuild',
        message: 'Updated public route after parent publish',
      })
      const localeSnapshot = revision?.snapshot.locales[row.locale] ?? null
      expect(localeSnapshot).toBeTruthy()
      expect(
        publicPathForLocaleSnapshot(collection as never, localeSnapshot!.path, row.locale),
      ).toBe(row.path)
      if (row.entryId === childId) {
        expect(row.parentEntryId).toBe(rootAId)
        expect(revision?.parentRevisionId).toBe(childCheckpointId)
        expect(revision?.snapshot.parentEntryId).toBe(rootAId)
      }
    }
    expect(
      (await ctx.readAll('entries')).find((row: { _id: string }) => row._id === childId),
    ).toMatchObject({
      publishedAt: childBeforeRouteRebuild?.publishedAt,
      publishedBy: childBeforeRouteRebuild?.publishedBy,
    })
    expect(
      (await ctx.readAll('entries')).find((row: { _id: string }) => row._id === grandchildId),
    ).toMatchObject({
      publishedAt: grandchildBeforeRouteRebuild?.publishedAt,
      publishedBy: grandchildBeforeRouteRebuild?.publishedBy,
    })
    await expect(owner.query(api.editor.listVersions, { entryId: childId })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'route_rebuild',
          displayAction: 'routeUpdated',
          isCurrentPublished: true,
        }),
      ]),
    )
    expect(
      await owner.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-a/child',
      }),
    ).toMatchObject({ status: 'not-found', page: null })
    expect(
      await owner.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-renamed/child',
      }),
    ).toMatchObject({
      status: 'found',
      page: expect.objectContaining({
        id: childId,
        title: 'Child',
      }),
    })
    const publicRoutes = (await ctx.readAll('publicRoutes')).filter(
      (row: { entryId: string }) => row.entryId === childId || row.entryId === grandchildId,
    )
    expect(publicRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: childId,
          path: '/docs/root-renamed/child',
        }),
        expect.objectContaining({
          entryId: grandchildId,
          path: '/docs/root-renamed/child/grandchild',
        }),
      ]),
    )
    expect(publicRoutes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/docs/root-a/child' }),
        expect.objectContaining({ path: '/docs/root-a/child/grandchild' }),
      ]),
    )

    const nav = await owner.query(api.public.nav, {
      collection: 'docs',
      locale: 'en',
    })
    const rootRenamed = nav.tree.find(
      (node: { entry: { route: { path: string } } }) =>
        node.entry.route.path === '/docs/root-renamed',
    )
    expect(rootRenamed?.children[0]?.entry.route.path).toBe('/docs/root-renamed/child')
    expect(rootRenamed?.children[0]?.children[0]?.entry.route.path).toBe(
      '/docs/root-renamed/child/grandchild',
    )

    const search = await owner.query(api.public.search, {
      collection: 'docs',
      locale: 'en',
      query: 'Child',
    })
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: childId,
          route: expect.objectContaining({ path: '/docs/root-renamed/child' }),
        }),
      ]),
    )

    const sitemap = await owner.query(api.public.sitemap, {
      collection: 'docs',
      locale: 'en',
    })
    expect(sitemap.urls.map((url: { route: { path: string } }) => url.route.path)).toEqual(
      expect.arrayContaining(['/docs/root-renamed/child', '/docs/root-renamed/child/grandchild']),
    )
    expect(sitemap.urls.map((url: { route: { path: string } }) => url.route.path)).not.toEqual(
      expect.arrayContaining(['/docs/root-a/child', '/docs/root-a/child/grandchild']),
    )
    expect(await owner.query(api.editor.getEntry, { id: childId, locale: 'en' })).toMatchObject({
      parentEntryId: rootBId,
      dirtyLocales: ['en'],
      localeData: {
        draft: expect.objectContaining({
          values: expect.objectContaining({ title: 'Child draft only' }),
        }),
        published: expect.objectContaining({
          values: expect.objectContaining({ title: 'Child' }),
        }),
      },
    })

    const outbox = (await ctx.readAll('outboxEvents')).find(
      (row: { versionId?: string | null }) => row.versionId === publishResult.versionId,
    )
    expect(outbox).toMatchObject({
      paths: expect.arrayContaining([
        '/docs/root-a',
        '/docs/root-renamed',
        '/docs/root-a/child',
        '/docs/root-renamed/child',
        '/docs/root-a/child/grandchild',
        '/docs/root-renamed/child/grandchild',
      ]),
    })
  })

  it('rebuilds only the published locale subtree when a localized parent route changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'docs',
        label: { en: 'Docs', de: 'Dokumentation' },
        icon: null,
        type: 'tree',
        routing: {
          pathPrefix: '/docs',
          slugMode: 'localized',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: { maxDepth: 4 },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const parentId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      localized: { title: 'Parent' },
      slug: 'parent',
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId: parentId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: parentId,
      expectedDraftVersion: await currentDraftVersion(owner, parentId),
      patch: {
        locales: {
          de: {
            slug: 'eltern',
            values: { title: 'Eltern' },
          },
        },
      },
    })

    const childId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      localized: { title: 'Child' },
      parentEntryId: parentId,
      slug: 'child',
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId: childId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: childId,
      expectedDraftVersion: await currentDraftVersion(owner, childId),
      patch: {
        locales: {
          de: {
            slug: 'kind',
            values: { title: 'Kind' },
          },
        },
      },
    })

    const grandchildId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      localized: { title: 'Grandchild' },
      parentEntryId: childId,
      slug: 'grandchild',
    })
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId: grandchildId,
      locale: 'de',
    })
    await owner.saveEntryDraft({
      entryId: grandchildId,
      expectedDraftVersion: await currentDraftVersion(owner, grandchildId),
      patch: {
        locales: {
          de: {
            slug: 'enkel',
            values: { title: 'Enkel' },
          },
        },
      },
    })

    await publishEntry(owner, parentId, ['en', 'de'])
    await publishEntry(owner, childId, ['en', 'de'])
    await publishEntry(owner, grandchildId, ['en', 'de'])

    const navPaths = (nodes: Array<{ entry: { route: { path: string } }; children: unknown[] }>) =>
      nodes.flatMap((node) => [
        node.entry.route.path,
        ...navPaths(
          node.children as Array<{ entry: { route: { path: string } }; children: unknown[] }>,
        ),
      ])
    const snapshotGermanPublicState = async () => {
      const entries = (await ctx.readAll('publicEntries'))
        .filter((row: { locale: string }) => row.locale === 'de')
        .map(
          (row: {
            entryId: string
            href: string
            locale: string
            parentEntryId?: string | null
            path: string
            title?: string | null
          }) => ({
            entryId: row.entryId,
            href: row.href,
            locale: row.locale,
            parentEntryId: row.parentEntryId ?? null,
            path: row.path,
            title: row.title ?? null,
          }),
        )
        .sort((left, right) => left.path.localeCompare(right.path))
      const routes = (await ctx.readAll('publicRoutes'))
        .filter((row: { locale: string }) => row.locale === 'de')
        .map((row: { entryId: string; href: string; locale: string; path: string }) => ({
          entryId: row.entryId,
          href: row.href,
          locale: row.locale,
          path: row.path,
        }))
        .sort((left, right) => left.path.localeCompare(right.path))
      const nav = await owner.query(api.public.nav, { collection: 'docs', locale: 'de' })
      const search = await owner.query(api.public.search, {
        collection: 'docs',
        locale: 'de',
        query: 'Kind',
      })
      const sitemap = await owner.query(api.public.sitemap, { collection: 'docs', locale: 'de' })
      return {
        entries,
        routes,
        navPaths: navPaths(nav.tree).sort(),
        searchPaths: search.results
          .map((result: { route: { path: string } }) => result.route.path)
          .sort(),
        sitemapPaths: sitemap.urls.map((url: { route: { path: string } }) => url.route.path).sort(),
      }
    }

    const germanBefore = await snapshotGermanPublicState()

    await owner.saveEntryDraft({
      entryId: parentId,
      expectedDraftVersion: await currentDraftVersion(owner, parentId),
      patch: {
        locales: {
          en: {
            slug: 'parent-renamed',
          },
        },
      },
    })
    await publishEntry(owner, parentId, ['en'])

    expect(
      (await ctx.readAll('publicEntries')).filter(
        (row: { entryId: string; locale: string }) =>
          row.locale === 'en' && (row.entryId === childId || row.entryId === grandchildId),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: childId,
          path: '/docs/parent-renamed/child',
          title: 'Child',
        }),
        expect.objectContaining({
          entryId: grandchildId,
          path: '/docs/parent-renamed/child/grandchild',
          title: 'Grandchild',
        }),
      ]),
    )
    await expect(
      owner.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/parent/child',
      }),
    ).resolves.toMatchObject({ page: null, status: 'not-found' })
    await expect(
      owner.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/parent-renamed/child',
      }),
    ).resolves.toMatchObject({
      page: expect.objectContaining({ id: childId, title: 'Child' }),
      status: 'found',
    })

    expect(await snapshotGermanPublicState()).toEqual(germanBefore)
    await expect(
      owner.query(api.public.page, {
        collection: 'docs',
        locale: 'de',
        path: '/docs/eltern/kind',
      }),
    ).resolves.toMatchObject({
      page: expect.objectContaining({ id: childId, title: 'Kind' }),
      status: 'found',
    })
    await expect(
      owner.query(api.public.page, {
        collection: 'docs',
        locale: 'de',
        path: '/docs/parent-renamed/kind',
      }),
    ).resolves.toMatchObject({ page: null, status: 'not-found' })
  })

  it('publishes draft placement from the shared draft instead of stale entry placement', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, childId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, rootAId)
    await publishEntry(owner, rootBId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)

    await owner.saveEntryDraft({
      entryId: childId,
      expectedDraftVersion: await currentDraftVersion(owner, childId),
      patch: {
        shared: {
          parentEntryId: rootBId,
        },
        locales: {
          en: {
            values: { title: 'Child under Root B' },
          },
        },
      },
    })

    const preview = await previewPublishEntryWithArgs(owner, {
      entryId: childId,
      expectedVersion: await currentDraftVersion(owner, childId),
      locales: ['en'],
    })
    expect(preview.allowed).toBe(true)
    expect(preview.details.publishImpact.locales[0]).toMatchObject({
      currentPath: '/docs/root-a/child',
      nextPath: '/docs/root-b/child',
    })

    const publishResult = await publishEntry(owner, childId)

    const entries = await ctx.readAll('entries')
    expect(entries.find((row: { _id: string }) => row._id === childId)).toMatchObject({
      parentEntryId: rootBId,
      status: 'published',
      dirtyLocales: [],
    })

    const childPublic = (await ctx.readAll('publicEntries')).find(
      (row: { entryId: string; locale: string }) => row.entryId === childId && row.locale === 'en',
    )
    expect(childPublic).toMatchObject({
      entryId: childId,
      parentEntryId: rootBId,
      path: '/docs/root-b/child',
      title: 'Child under Root B',
    })
    expect(
      (await ctx.readAll('publicEntries')).find(
        (row: { entryId: string; locale: string }) =>
          row.entryId === grandchildId && row.locale === 'en',
      ),
    ).toMatchObject({
      entryId: grandchildId,
      parentEntryId: childId,
      path: '/docs/root-b/child/grandchild',
    })

    const revision = (await ctx.readAll('entryRevisions')).find(
      (row: { _id: string }) => row._id === publishResult.versionId,
    ) as
      | {
          snapshot: {
            parentEntryId?: string | null
            locales: Record<string, { path: string } | null>
          }
        }
      | undefined
    expect(revision?.snapshot.parentEntryId).toBe(rootBId)
    expect(revision?.snapshot.locales.en?.path).toBe('/root-b/child')
    await expect(
      owner.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-a/child',
      }),
    ).resolves.toMatchObject({ status: 'not-found', page: null })
    await expect(
      owner.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-b/child',
      }),
    ).resolves.toMatchObject({
      status: 'found',
      page: expect.objectContaining({
        id: childId,
        title: 'Child under Root B',
      }),
    })
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

    const expectedVersion = await currentDraftVersion(owner, rightId)
    const conflictPreview = await previewPublishEntryWithArgs(owner, {
      entryId: rightId,
      expectedVersion,
      locales: ['de'],
    })

    expect(conflictPreview.allowed).toBe(false)
    expect(conflictPreview.blockers).toContainEqual(
      expect.objectContaining({
        code: 'publish-blocker',
        message: expect.stringContaining('claimed by 2 public routes'),
      }),
    )
    expect(conflictPreview.details.publishImpact.locales[0]?.blockingDiagnostics[0]?.code).toBe(
      'route_collision',
    )
    const readiness = await owner.query(api.editor.getEntryReadinessDetail, { entryId: rightId })
    const de = readiness.locales.find((locale: { locale: string }) => locale.locale === 'de')
    expect(de).toMatchObject({
      state: 'needs_work',
      canPublish: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({
          code: 'route_collision',
          severity: 'blocker',
          locale: 'de',
        }),
      ]),
    })
    await expect(
      ctx.raw.run(async (innerCtx) => {
        const expectedDraftHash = await computePublishDraftHash(innerCtx, {
          entryId: rightId as never,
          locales: ['de'],
        })
        return await publishCurrentDraft(innerCtx, {
          entryId: rightId as never,
          locales: ['de'],
          expectedDraftVersion: expectedVersion,
          expectedDraftHash,
          appIdentity: 'owner-1',
        })
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_PUBLISH_NOT_READY',
    )
  })
})
