/// <reference types="vite/client" />

/**
 * Gate 1 — workflow backend spine integration test.
 *
 * Proves the new command core works end-to-end on one collection across
 * two locales. Exercises the invariants the plan calls out as the Gate 1
 * pass bar:
 *
 *   #1  draft saves never alter public output
 *   #2  publish atomically writes one revision + public projection
 *   #3  publish requires current operation preview state
 *   #6  locale isolation under concurrent secondary-locale save
 *   #7  draft concurrency uses entries.draftVersion (not revisionId)
 *   #15 contentAssetRefs covers draft (asset purge protection includes drafts)
 *   #16 publicEntries rows are upsert-or-delete (no inactive rows)
 *
 * Skipped because it depends on later gates for restore/provider parity (#4, #11):
 *   #4  restore-as-published creates a new revision, never mutates history
 *   #11 round-trip filesystem provider equality
 */

import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner } from '../component/entries/helpers'

const api = anyApi
type CmsOperationRef = {
  id: string
  executeRef: FunctionReference<'mutation'>
  previewRef?: FunctionReference<'mutation'>
}

const createEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.create-entry',
  executeRef: api.entries.tree.createEntry,
}
const saveEntryDraftOperation: CmsOperationRef = {
  id: 'ginko-cms.save-entry-draft',
  executeRef: api.entries.draft.saveEntryDraft,
}
const publishEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.publish-entry',
  executeRef: api.entries.publish.publishEntryOperationExecute,
  previewRef: api.entries.publish.previewPublishEntryOperation,
}
const unpublishEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.unpublish-entry',
  executeRef: api.entries.publish.unpublishEntryOperationExecute,
  previewRef: api.entries.publish.previewUnpublishEntryOperation,
}
const archiveEntryOperation: CmsOperationRef = {
  id: 'ginko-cms.archive-entry',
  executeRef: api.entries.publish.archiveEntryOperationExecute,
  previewRef: api.entries.publish.previewArchiveEntryOperation,
}
const rollbackVersionOperation: CmsOperationRef = {
  id: 'ginko-cms.rollback-version',
  executeRef: api.entries.publish.rollbackVersionOperationExecute,
  previewRef: api.entries.publish.previewRollbackVersionOperation,
}

function workflowClient(ctx: ReturnType<typeof createCtx>, userId: string) {
  return ctx.asCmsUser(userId)
}

type WorkflowClient = ReturnType<typeof workflowClient>

async function createEntry(owner: WorkflowClient, args: Record<string, unknown>) {
  return (await owner.operation(createEntryOperation).execute(args)) as string
}

async function saveEntryDraft(owner: WorkflowClient, args: Record<string, unknown>) {
  return await owner.operation(saveEntryDraftOperation).execute(args)
}

async function seedFixture(ctx: ReturnType<typeof createCtx>) {
  const now = Date.now()
  await ctx.seed(
    'cmsSettings' as never,
    {
      key: 'site',
      locales: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'de', label: 'German', fallback: 'en' },
      ],
      updatedBy: 'owner-1',
      updatedAt: now,
    } as never,
  )
  const collectionId = await ctx.seed(
    'collections' as never,
    {
      slug: 'posts',
      label: { en: 'Posts' },
      icon: null,
      type: 'flat',
      routing: {
        pathPrefix: '/posts',
        slugMode: 'shared',
        rootSlug: null,
        singleton: false,
      },
      locales: ['en', 'de'],
      fields: [
        { key: 'title', type: 'text', localized: true, searchable: true },
        { key: 'description', type: 'textarea', localized: true },
        { key: 'hero', type: 'image', localized: true },
        { key: 'gallery', type: 'images', localized: true },
      ],
      settings: {},
      createdAt: now,
      updatedAt: now,
      updatedBy: 'owner-1',
    } as never,
  )

  const entryId = await ctx.seed(
    'entries' as never,
    {
      collectionId,
      baseSlug: 'hello',
      stableId: null,
      status: 'draft',
      dirtyLocales: ['en', 'de'],
      parentEntryId: null,
      orderRank: 'a0',
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      latestRevisionId: null,
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      firstPublishedAt: null,
    } as never,
  )

  return {
    collectionId: collectionId as string,
    entryId: entryId as string,
  }
}

async function seedCollection(
  ctx: ReturnType<typeof createCtx>,
  args: { slug: string; pathPrefix: string },
) {
  const now = Date.now()
  return (await ctx.seed(
    'collections' as never,
    {
      slug: args.slug,
      label: { en: args.slug },
      icon: null,
      type: 'flat',
      routing: {
        pathPrefix: args.pathPrefix,
        slugMode: 'shared',
        rootSlug: null,
        singleton: false,
      },
      locales: ['en', 'de'],
      fields: [
        { key: 'title', type: 'text', localized: true, searchable: true },
        { key: 'description', type: 'textarea', localized: true },
      ],
      settings: {},
      createdAt: now,
      updatedAt: now,
      updatedBy: 'owner-1',
    } as never,
  )) as string
}

async function seedEntry(
  ctx: ReturnType<typeof createCtx>,
  args: {
    collectionId: string
    slug: string
    orderRank: string
    parentEntryId?: string | null
    createdBy?: string
  },
) {
  const now = Date.now()
  return (await ctx.seed(
    'entries' as never,
    {
      collectionId: args.collectionId,
      baseSlug: args.slug,
      stableId: null,
      status: 'draft',
      dirtyLocales: ['en'],
      parentEntryId: args.parentEntryId ?? null,
      orderRank: args.orderRank,
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      latestRevisionId: null,
      createdBy: args.createdBy ?? 'owner-1',
      updatedBy: args.createdBy ?? 'owner-1',
      publishedBy: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      firstPublishedAt: null,
    } as never,
  )) as string
}

async function readEntryDraftVersion(ctx: ReturnType<typeof createCtx>, entryId: string) {
  const entry = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
  if (!entry || typeof entry.draftVersion !== 'number') {
    throw new Error(`Entry ${entryId} does not expose a draftVersion.`)
  }
  return entry.draftVersion
}

function publishDiffStatus(locale: {
  status?: string
  currentPath?: string | null
  nextPath?: string | null
}) {
  if (locale.status === 'ready') {
    if (!locale.currentPath) return 'new'
    return locale.currentPath === locale.nextPath ? 'unchanged' : 'update'
  }
  if (locale.status === 'no_changes') return 'unchanged'
  if (locale.status === 'not_publishable') return 'missing-draft'
  return locale.status ?? 'blocked'
}

async function previewPublish(
  owner: WorkflowClient,
  ctx: ReturnType<typeof createCtx>,
  entryId: string,
  locales: string[],
) {
  const draftVersion = await readEntryDraftVersion(ctx, entryId)
  const buildPreview = (await owner.operation(publishEntryOperation).preview({
    entryId,
    locales,
    expectedVersion: draftVersion,
  })) as {
    confirm?: unknown
    confirmation?: { token?: string }
    details?: {
      publishImpact?: {
        locales?: Array<{
          locale: string
          status?: string
          currentPath?: string | null
          nextPath?: string | null
          currentRevisionId?: string | null
        }>
      }
    }
  }
  return {
    draftVersion,
    draftHash: stableJson(buildPreview.confirm),
    locales,
    diff: {
      locales: (buildPreview.details?.publishImpact?.locales ?? []).map((locale) => ({
        locale: locale.locale,
        status: publishDiffStatus(locale),
        currentPath: locale.currentPath ?? null,
        nextPath: locale.nextPath ?? null,
        currentRevisionId: locale.currentRevisionId ?? null,
      })),
    },
    buildPreview,
  }
}

async function publishFromPreview(
  owner: WorkflowClient,
  entryId: string,
  preview: { locales: string[]; draftVersion: number; draftHash: string },
  message: string | null = null,
) {
  const args = {
    entryId,
    locales: preview.locales,
    expectedVersion: preview.draftVersion,
    ...(message === null ? {} : { message }),
  }
  const operation = owner.operation(publishEntryOperation)
  const buildPreview = await operation.preview(args)
  return await operation.execute(args, { confirmation: buildPreview.confirmation })
}

async function unpublishConfirmed(owner: WorkflowClient, entryId: string) {
  const operation = owner.operation(unpublishEntryOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

async function archiveConfirmed(owner: WorkflowClient, entryId: string) {
  const operation = owner.operation(archiveEntryOperation)
  const args = { entryId }
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

async function rollbackConfirmed(
  owner: WorkflowClient,
  args: { entryId: string; versionId: string; publish?: boolean },
) {
  const operation = owner.operation(rollbackVersionOperation)
  const preview = await operation.preview(args)
  return await operation.execute(args, { confirmation: preview.confirmation })
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function artifactChecksum(source: string): string {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function requiredTitleSchemaRef() {
  const artifactObject = {
    version: 'v1',
    root: {
      kind: 'object',
      required: ['title'],
      shape: {
        title: { kind: 'string', checks: [{ kind: 'min', value: 1 }] },
      },
    },
  }
  const artifact = stableJson(artifactObject)
  return {
    artifactId: 'cms-schema:posts:v1',
    checksum: artifactChecksum(artifact),
    capabilities: { supports: ['object', 'string'], unsupported: [] },
    artifact,
  }
}

describe('Gate 1 — workflow backend spine', () => {
  it('createEntry writes canonical entryDrafts without legacy locale rows', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    const entryId = (await createEntry(owner, {
      collection: 'posts',
      slug: 'created-from-workflow',
      localized: { title: 'Created from workflow' },
    })) as string
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: { bodyMdc: '# Created from workflow' },
        },
      },
    })

    const drafts = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryDrafts')
          .withIndex('by_entry', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(drafts).toHaveLength(2)
    expect(drafts.find((row) => row.locale === null)).toMatchObject({
      slug: 'created-from-workflow',
    })
    expect(drafts.find((row) => row.locale === 'en')).toMatchObject({
      values: { title: 'Created from workflow' },
      bodyMdc: '# Created from workflow',
    })
    const preview = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, preview)
    const publicRow = (await ctx.readAll('publicEntries')).find(
      (row: { entryId: string; locale: string }) => row.entryId === entryId && row.locale === 'en',
    )
    expect(publicRow).toMatchObject({
      path: '/posts/created-from-workflow',
      title: 'Created from workflow',
    })
  })

  it('saveEntryDraft updates entryDrafts + bumps draftVersion (invariants #1, #7)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    const result = await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello\n\nGreetings.' },
        },
      },
    })

    expect(result.draftVersion).toBe(2)
    expect(result.dirtyLocales).toEqual(['de', 'en'])
    const entryAfterSave = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect(entryAfterSave?.dirtyLocales).toEqual(['de', 'en'])

    // Invariant #1: public output unchanged after a draft save.
    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toEqual([])
  })

  it('shared workflow saves mark all current draft locales dirty', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: { values: { title: 'English title' } },
          de: { values: { title: 'Deutscher Titel' } },
        },
      },
    })

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        shared: { shared: { teaser: 'Shared teaser' } },
      },
    })

    const entryAfterSharedSave = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect(entryAfterSharedSave?.dirtyLocales).toEqual(['de', 'en'])
  })

  it('saveEntryDraft does not bump draftVersion for no-op patches', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello' },
        },
      },
    })

    const result = await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello' },
        },
      },
    })

    expect(result).toEqual({
      draftVersion: 2,
      dirtyLocales: ['de', 'en'],
    })
  })

  it('Studio reads current draft state from entryDrafts after workflow save', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'workflow-title', shared: { description: 'Shared description' } },
        locales: {
          en: { values: { title: 'Workflow title' }, bodyMdc: '# Workflow title' },
        },
      },
    })

    const detail = (await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })) as {
      slug: string
      path: string
      draft: Record<string, unknown>
      data: Record<string, unknown>
      localeData: { draft: { values: Record<string, unknown> } } | null
    }
    expect(detail.slug).toBe('workflow-title')
    expect(detail.path).toBe('/posts/workflow-title')
    expect(detail.draft).toEqual({ description: 'Shared description' })
    expect(detail.data).toMatchObject({ title: 'Workflow title' })
    expect(detail.localeData?.draft.values).toEqual({ title: 'Workflow title' })

    const list = (await owner.query(api.editor.listEntriesForStudio, {
      collection: 'posts',
      locale: 'en',
      paginationOpts: { cursor: null, numItems: 10 },
    })) as {
      page: Array<{ _id: string; title: string; path: string; data: Record<string, unknown> }>
    }
    expect(list.page).toEqual([
      expect.objectContaining({
        _id: entryId,
        title: 'Workflow title',
        path: '/posts/workflow-title',
        data: expect.objectContaining({ title: 'Workflow title' }),
      }),
    ])
  })

  it('publish diagnostics preview current entryDrafts state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'diagnostic-preview' },
        locales: {
          en: { values: { title: 'Diagnostic preview' }, bodyMdc: '# Diagnostic preview' },
        },
      },
    })

    const preview = (await owner.query(api.diagnostics.previewPublishImpact, {
      collection: 'posts',
      entryId,
      locale: 'en',
    })) as {
      status: string
      locales: Array<{ locale: string; status: string; nextPath: string | null }>
    }

    expect(preview.status).toBe('ready')
    expect(preview.locales).toEqual([
      expect.objectContaining({
        locale: 'en',
        status: 'ready',
        nextPath: '/posts/diagnostic-preview',
      }),
    ])
  })

  it('rejects stale expectedDraftVersion (invariant #7 — concurrency)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'A' } } } },
    })

    // Second caller using the stale version 1 must be rejected.
    await expect(
      saveEntryDraft(owner, {
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'B' } } } },
      }),
    ).rejects.toThrow(/ENTRY_CONCURRENT_EDIT|expectedVersion/)
  })

  it('preserves locale isolation under concurrent saves (invariant #6)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    // Save EN.
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'English title' } } } },
    })

    // Save DE — uses the new draftVersion=2.
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { de: { values: { title: 'Deutscher Titel' } } } },
    })

    const drafts = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryDrafts')
          .withIndex('by_entry', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    const byLocale = new Map(drafts.map((row) => [row.locale, row]))
    expect(byLocale.get('en')?.values).toEqual({ title: 'English title' })
    expect(byLocale.get('de')?.values).toEqual({ title: 'Deutscher Titel' })
    // EN row was NOT touched by the DE save.
    expect(byLocale.get('en')?.values).not.toMatchObject({ title: 'Deutscher Titel' })
  })

  it('previewPublish returns the draftVersion, draftHash, and route diff', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Hello' }, bodyMdc: '# Hello' } },
      },
    })

    const preview = await previewPublish(owner, ctx, entryId, ['en'])
    expect(preview.draftVersion).toBe(2)
    expect(preview.draftHash).toBeTruthy()
    expect(preview.diff.locales).toEqual([
      {
        locale: 'en',
        status: 'new',
        currentPath: null,
        nextPath: '/posts/hello',
        currentRevisionId: null,
      },
    ])
  })

  it('publishEntry rejects stale preview state and publishes current preview state (invariants #2, #3, #16)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId, collectionId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: {
            values: { title: 'Hello', description: 'Greetings' },
            bodyMdc: '# Hello\n\nGreetings.',
          },
        },
      },
    })

    const preview = await previewPublish(owner, ctx, entryId, ['en'])

    // Mutate the draft after the preview. The token's draftVersion is now stale.
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'Hello (changed)' } } } },
    })

    await expect(
      owner.operation(publishEntryOperation).execute(
        {
          entryId,
          locales: preview.locales,
          expectedVersion: await readEntryDraftVersion(ctx, entryId),
        },
        { confirmation: preview.buildPreview.confirmation },
      ),
    ).rejects.toThrow(/arguments mismatch|preview mismatch|version mismatch/)

    // Re-preview with the current draft and publish successfully.
    const preview2 = await previewPublish(owner, ctx, entryId, ['en'])
    const publishResult = await publishFromPreview(owner, entryId, preview2, 'first publish')

    expect(publishResult.versionId).toEqual(expect.any(String))

    // Invariant #2: exactly one revision row.
    const revisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(revisions).toHaveLength(1)
    expect(revisions[0].kind).toBe('publish')
    expect(revisions[0].revisionNumber).toBe(1)
    expect(revisions[0].affectedLocales).toEqual(['en'])

    // Invariant #16: exactly one publicEntries row, no history rows.
    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toHaveLength(1)
    expect(publicRows[0].entryId).toBe(entryId)
    expect(publicRows[0].locale).toBe('en')
    expect(publicRows[0].revisionId).toBe(publishResult.versionId)
    expect(publicRows[0].title).toBe('Hello (changed)')

    // Invariant #2 (atomicity): exactly one publicRoutes row.
    const routeRows = await ctx.raw.run(async (db) => await db.db.query('publicRoutes').collect())
    expect(routeRows).toHaveLength(1)
    expect(routeRows[0].locale).toBe('en')
    expect(routeRows[0].revisionId).toBe(publishResult.versionId)

    // entries.latestRevisionId points at the new revision.
    const entry = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect((entry as { latestRevisionId?: string } | null)?.latestRevisionId).toBe(
      publishResult.versionId,
    )
    expect((entry as { status?: string } | null)?.status).toBe('published')
    expect((entry as { firstPublishedAt?: number | null } | null)?.firstPublishedAt).toBe(
      publicRows[0].firstPublishedAt,
    )
    expect((entry as { dirtyLocales?: string[] } | null)?.dirtyLocales).toEqual(['de'])

    const activity = await ctx.readAll('activity')
    expect(activity).toEqual([
      expect.objectContaining({
        kind: 'entry.published',
        entryId,
        collectionId,
      }),
    ])
    const outbox = await ctx.readAll('outboxEvents')
    expect(outbox).toEqual([
      expect.objectContaining({
        type: 'content.revalidate',
        status: 'pending',
        versionId: publishResult.versionId,
        paths: expect.arrayContaining(['/posts', '/posts/hello']),
        payload: expect.objectContaining({
          reason: 'publish',
          entryId,
        }),
      }),
    ])

    // Invariant #15: contentAssetRefs writes happen on draft + revision + public.
    // (No assets in this fixture, so the table is empty — but the writers
    // run on every save/publish so the asset refs path is exercised.)
    const refs = await ctx.raw.run(async (db) => await db.db.query('contentAssetRefs').collect())
    expect(refs).toEqual([])
    expect(collectionId).toBeTruthy() // sanity
  })

  it('rejects publish execution when the draft hash does not match the preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Hello' }, bodyMdc: '# Hello' } },
      },
    })

    const preview = await previewPublish(owner, ctx, entryId, ['en'])

    await expect(
      owner.operation(publishEntryOperation).execute({
        entryId,
        locales: preview.locales,
        expectedVersion: preview.draftVersion,
      }),
    ).rejects.toThrow(/Destructive operation requires confirmation/)
  })

  it('validates publish against the installed ginko-content schema artifact', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId, collectionId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    const schemaRef = requiredTitleSchemaRef()
    await ctx.raw.run(async (db) => {
      await db.db.patch(
        collectionId as never,
        {
          settings: { cmsSchema: schemaRef },
        } as never,
      )
    })

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: '' }, bodyMdc: '# Hello' } },
      },
    })
    const invalidPreview = await previewPublish(owner, ctx, entryId, ['en'])
    await expect(publishFromPreview(owner, entryId, invalidPreview)).rejects.toThrow(
      /ENTRY_PUBLISH_SCHEMA_INVALID|collection schema|expected at least/,
    )

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'Valid title' } } } },
    })
    const validPreview = await previewPublish(owner, ctx, entryId, ['en'])
    await expect(publishFromPreview(owner, entryId, validPreview)).resolves.toMatchObject({
      dirtyLocales: ['de'],
    })
  })

  it('rejects publish when schema artifact metadata is missing or has drifted', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId, collectionId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    const schemaRef = requiredTitleSchemaRef()
    await ctx.raw.run(async (db) => {
      await db.db.patch(
        collectionId as never,
        {
          settings: {
            cmsSchema: {
              artifactId: schemaRef.artifactId,
              checksum: schemaRef.checksum,
              capabilities: schemaRef.capabilities,
            },
          },
        } as never,
      )
    })
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Valid title' }, bodyMdc: '# Hello' } },
      },
    })
    const missingPreview = await previewPublish(owner, ctx, entryId, ['en'])
    await expect(publishFromPreview(owner, entryId, missingPreview)).rejects.toThrow(
      /ENTRY_PUBLISH_SCHEMA_ARTIFACT_MISSING|schema artifact missing/,
    )

    await ctx.raw.run(async (db) => {
      await db.db.patch(
        collectionId as never,
        {
          settings: {
            cmsSchema: {
              ...schemaRef,
              checksum: 'fnv1a32:00000000',
            },
          },
        } as never,
      )
    })
    const driftPreview = await previewPublish(owner, ctx, entryId, ['en'])
    await expect(publishFromPreview(owner, entryId, driftPreview)).rejects.toThrow(
      /ENTRY_PUBLISH_SCHEMA_ARTIFACT_MISMATCH|checksum mismatch/,
    )
  })

  it('rejects publish execution for locales without a draft row', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Hello' }, bodyMdc: '# Hello' } },
      },
    })

    const preview = await previewPublish(owner, ctx, entryId, ['de'])
    expect(preview.diff.locales).toEqual([
      expect.objectContaining({
        locale: 'de',
        status: 'blocked',
      }),
    ])
    expect(preview.buildPreview.blockers.length).toBeGreaterThan(0)

    await expect(publishFromPreview(owner, entryId, preview)).rejects.toThrow(
      /Destructive operation requires confirmation/,
    )
  })

  it('publishes child paths from the already-published parent path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const collectionId = await seedCollection(ctx, { slug: 'docs', pathPrefix: '/docs' })
    const owner = workflowClient(ctx, 'owner-1')

    const parentId = await seedEntry(ctx, {
      collectionId,
      slug: 'root-a',
      orderRank: 'a0',
    })
    const childId = await seedEntry(ctx, {
      collectionId,
      slug: 'child',
      orderRank: 'a0',
      parentEntryId: parentId,
    })

    await saveEntryDraft(owner, {
      entryId: parentId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'root-a' },
        locales: { en: { values: { title: 'Root A' }, bodyMdc: '# Root A' } },
      },
    })
    await publishFromPreview(owner, parentId, await previewPublish(owner, ctx, parentId, ['en']))

    await saveEntryDraft(owner, {
      entryId: parentId,
      expectedDraftVersion: 2,
      patch: {
        shared: { slug: 'root-a-draft' },
      },
    })
    await saveEntryDraft(owner, {
      entryId: childId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'child' },
        locales: { en: { values: { title: 'Child' }, bodyMdc: '# Child' } },
      },
    })

    const childPreview = await previewPublish(owner, ctx, childId, ['en'])
    expect(childPreview.diff.locales[0]).toMatchObject({
      locale: 'en',
      nextPath: '/docs/root-a/child',
    })
    await publishFromPreview(owner, childId, childPreview)

    const childPublic = (
      await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    ).find((row) => row.entryId === childId && row.locale === 'en')
    expect(childPublic?.path).toBe('/docs/root-a/child')
  })

  it('rejects public route collisions and rolls back the failed publish', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId, collectionId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'First' }, bodyMdc: '# First' } },
      },
    })
    const firstPreview = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, firstPreview)

    const secondEntryId = await seedEntry(ctx, {
      collectionId,
      slug: 'second',
      orderRank: 'b0',
    })
    await saveEntryDraft(owner, {
      entryId: secondEntryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Second' }, bodyMdc: '# Second' } },
      },
    })
    const secondPreview = await previewPublish(owner, ctx, secondEntryId, ['en'])

    await expect(publishFromPreview(owner, secondEntryId, secondPreview)).rejects.toThrow(
      /Destructive operation requires confirmation|ENTRY_PUBLISHED_PATH_CONFLICT/,
    )

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toHaveLength(1)
    expect(publicRows[0].entryId).toBe(entryId)

    const routeRows = await ctx.raw.run(async (db) => await db.db.query('publicRoutes').collect())
    expect(routeRows).toHaveLength(1)
    expect(routeRows[0].entryId).toBe(entryId)

    const failedRevisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', secondEntryId as never))
          .collect(),
    )
    expect(failedRevisions).toEqual([])
  })

  it('uses the full public path for routes so different collection prefixes do not collide', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Post' }, bodyMdc: '# Post' } },
      },
    })
    const postPreview = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, postPreview)

    const docsCollectionId = await seedCollection(ctx, { slug: 'docs', pathPrefix: '/docs' })
    const docsEntryId = await seedEntry(ctx, {
      collectionId: docsCollectionId,
      slug: 'hello',
      orderRank: 'a0',
    })
    await saveEntryDraft(owner, {
      entryId: docsEntryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Doc' }, bodyMdc: '# Doc' } },
      },
    })
    const docsPreview = await previewPublish(owner, ctx, docsEntryId, ['en'])
    await publishFromPreview(owner, docsEntryId, docsPreview)

    const routeRows = await ctx.raw.run(async (db) => await db.db.query('publicRoutes').collect())
    expect(routeRows.map((row) => row.path).sort()).toEqual(['/docs/hello', '/posts/hello'])
  })

  it('writes contentAssetRefs for draft, revision, and public sources when assets are referenced', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId, collectionId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')
    const seedImage = async (filename: string) => {
      const storageId = await ctx.raw.run(
        async (innerCtx) =>
          await innerCtx.storage.store(new Blob(['image'], { type: 'image/png' })),
      )
      return await ctx.seed('assets' as never, {
        storageId,
        filename,
        mimeType: 'image/png',
        size: 5,
        width: 1,
        height: 1,
        scope: 'collection',
        entryId: null,
        collectionId,
        createdBy: 'owner-1',
        createdAt: Date.now(),
      })
    }
    const heroAssetId = await seedImage('hero.png')
    const galleryAssetId = await seedImage('gallery.png')
    const bodyAssetId = await seedImage('body.png')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: {
            values: {
              title: 'With assets',
              hero: heroAssetId,
              gallery: [galleryAssetId],
            },
            bodyMdc: `# With assets\n\n![Body asset](${bodyAssetId})`,
          },
        },
      },
    })

    const draftRefs = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', heroAssetId))
          .collect(),
    )
    expect(draftRefs.map((row) => row.sourceKind)).toEqual(['draft'])
    expect(draftRefs[0].locale).toBe('en')
    expect(draftRefs[0].fieldPath).toBe('hero')

    const draftBodyRefs = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', bodyAssetId))
          .collect(),
    )
    expect(draftBodyRefs.map((row) => row.sourceKind)).toEqual(['draft'])
    expect(draftBodyRefs[0].fieldPath).toBe('bodyMdc')

    const preview = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, preview)

    const allHeroRefs = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', heroAssetId))
          .collect(),
    )
    expect(allHeroRefs.map((row) => row.sourceKind).sort()).toEqual(['draft', 'public', 'revision'])

    const galleryRefs = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', galleryAssetId))
          .collect(),
    )
    expect(galleryRefs.map((row) => row.sourceKind).sort()).toEqual(['draft', 'public', 'revision'])
    expect(galleryRefs.map((row) => row.fieldPath)).toContain('gallery[0]')

    const allBodyRefs = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', bodyAssetId))
          .collect(),
    )
    expect(allBodyRefs.map((row) => row.sourceKind).sort()).toEqual(['draft', 'public', 'revision'])
    expect(allBodyRefs.map((row) => row.fieldPath)).toContain('bodyMdc')
    expect(allBodyRefs.some((row) => row.fieldPath.startsWith('bodyAst'))).toBe(true)

    await unpublishConfirmed(owner, entryId)

    const refsAfterUnpublish = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('contentAssetRefs')
          .withIndex('by_asset_source', (q) => q.eq('assetId', heroAssetId))
          .collect(),
    )
    expect(refsAfterUnpublish.map((row) => row.sourceKind).sort()).toEqual(['draft', 'revision'])
  })

  it('publishing one locale does not affect another locale (invariant #6)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    // Set up both locales.
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello' },
          de: { values: { title: 'Hallo' }, bodyMdc: '# Hallo' },
        },
      },
    })

    // Publish ONLY EN.
    const preview = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, preview)

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows.map((row) => row.locale)).toEqual(['en'])
    expect(publicRows.find((row) => row.locale === 'de')).toBeUndefined()
  })

  it('uses configured title and description field mappings for public projections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const now = Date.now()
    const collectionId = (await ctx.seed(
      'collections' as never,
      {
        slug: 'news',
        label: { en: 'News' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/news',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [
          { key: 'headline', type: 'text', localized: true, searchable: true },
          { key: 'summary', type: 'textarea', localized: true },
        ],
        settings: { titleField: 'headline', descriptionField: 'summary' },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )) as string
    const entryId = await seedEntry(ctx, {
      collectionId,
      slug: 'mapped-fields',
      orderRank: 'a0',
    })
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'mapped-fields' },
        locales: {
          en: {
            values: {
              headline: 'Mapped headline',
              summary: 'Mapped summary',
            },
            bodyMdc: '# Mapped headline',
          },
        },
      },
    })
    await publishFromPreview(owner, entryId, await previewPublish(owner, ctx, entryId, ['en']))

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toEqual([
      expect.objectContaining({
        title: 'Mapped headline',
        description: 'Mapped summary',
      }),
    ])
  })

  it('replaces the public row on republish (invariant #16 — upsert, not history)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'v1' }, bodyMdc: '# v1' } },
      },
    })

    const p1 = await previewPublish(owner, ctx, entryId, ['en'])
    const r1 = await publishFromPreview(owner, entryId, p1)

    // Edit + republish.
    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'v2' } } } },
    })
    const p2 = await previewPublish(owner, ctx, entryId, ['en'])
    const r2 = await publishFromPreview(owner, entryId, p2)

    expect(r2.versionId).not.toBe(r1.versionId)

    // entryRevisions has TWO rows (history is preserved).
    const revisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(revisions).toHaveLength(2)
    expect(revisions.map((row) => row.revisionNumber)).toEqual([1, 2])

    // publicEntries has ONE row (upserted, not appended).
    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toHaveLength(1)
    expect(publicRows[0].title).toBe('v2')
    expect(publicRows[0].revisionId).toBe(r2.versionId)
    expect(publicRows[0].firstPublishedAt).toBeLessThanOrEqual(publicRows[0].lastPublishedAt)
  })

  it('preserves firstPublishedAt across unpublish and republish', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'v1' }, bodyMdc: '# v1' } },
      },
    })
    const p1 = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, p1)
    const firstPublicRows = await ctx.raw.run(
      async (db) => await db.db.query('publicEntries').collect(),
    )
    const firstPublishedAt = firstPublicRows[0].firstPublishedAt

    await unpublishConfirmed(owner, entryId)
    expect(await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())).toEqual(
      [],
    )

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'v2' }, bodyMdc: '# v2' } } },
    })
    const p2 = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, p2)

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toHaveLength(1)
    expect(publicRows[0].firstPublishedAt).toBe(firstPublishedAt)
    expect(publicRows[0].lastPublishedAt).toBeGreaterThanOrEqual(firstPublishedAt)

    const entry = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect((entry as { firstPublishedAt?: number | null } | null)?.firstPublishedAt).toBe(
      firstPublishedAt,
    )
  })

  it('unpublishEntry removes current public state and appends history', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello' },
          de: { values: { title: 'Hallo' }, bodyMdc: '# Hallo' },
        },
      },
    })
    const preview = await previewPublish(owner, ctx, entryId, ['en', 'de'])
    await publishFromPreview(owner, entryId, preview)

    const unpublishPreview = (await owner.operation(unpublishEntryOperation).preview({
      entryId,
    })) as { allowed: boolean; details?: { publicRoutes?: Array<{ locale: string }> } }
    expect(unpublishPreview.allowed).toBe(true)
    expect(unpublishPreview.details?.publicRoutes?.map((row) => row.locale).sort()).toEqual([
      'de',
      'en',
    ])
    await unpublishConfirmed(owner, entryId)

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toEqual([])

    const routeRows = await ctx.raw.run(async (db) => await db.db.query('publicRoutes').collect())
    expect(routeRows).toEqual([])

    const revisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(revisions.map((row) => row.kind)).toEqual(['publish', 'unpublish'])
    expect(revisions.map((row) => row.revisionNumber)).toEqual([1, 2])
    expect(revisions[1].affectedLocales).toEqual(['de', 'en'])

    const entry = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect((entry as { status?: string } | null)?.status).toBe('draft')
    expect((entry as { latestRevisionId?: string } | null)?.latestRevisionId).toBe(revisions[1]._id)

    const outbox = await ctx.readAll('outboxEvents')
    expect(outbox.map((row: { payload?: { reason?: string } }) => row.payload?.reason)).toEqual([
      'publish',
      'unpublish',
    ])
    expect(outbox[1]).toMatchObject({
      status: 'pending',
      versionId: revisions[1]._id,
      paths: expect.arrayContaining(['/posts']),
    })
    const activity = await ctx.readAll('activity')
    expect(activity.map((row: { kind: string }) => row.kind)).toEqual([
      'entry.published',
      'entry.unpublished',
    ])
  })

  it('unpublishEntry requires a confirmed preview token', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: { en: { values: { title: 'Hello' }, bodyMdc: '# Hello' } },
      },
    })
    const preview = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, preview)

    await expect(
      owner.operation(unpublishEntryOperation).execute({
        entryId,
      }),
    ).rejects.toThrow(/Destructive operation requires confirmation/)
  })

  it('archiveEntry deletes all public state and marks the entry archived', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello' },
          de: { values: { title: 'Hallo' }, bodyMdc: '# Hallo' },
        },
      },
    })
    const preview = await previewPublish(owner, ctx, entryId, ['en', 'de'])
    await publishFromPreview(owner, entryId, preview)

    const archivePreview = (await owner.operation(archiveEntryOperation).preview({
      entryId,
    })) as { allowed: boolean; details?: { publicRoutes?: Array<{ locale: string }> } }
    expect(archivePreview.allowed).toBe(true)
    expect(archivePreview.details?.publicRoutes?.map((row) => row.locale).sort()).toEqual([
      'de',
      'en',
    ])
    await archiveConfirmed(owner, entryId)

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    expect(publicRows).toEqual([])
    const routeRows = await ctx.raw.run(async (db) => await db.db.query('publicRoutes').collect())
    expect(routeRows).toEqual([])

    const revisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(revisions.map((row) => row.kind)).toEqual(['publish', 'archive'])
    expect(revisions.map((row) => row.revisionNumber)).toEqual([1, 2])

    const entry = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect((entry as { status?: string } | null)?.status).toBe('archived')
    expect((entry as { latestRevisionId?: string } | null)?.latestRevisionId).toBe(revisions[1]._id)

    const outbox = await ctx.readAll('outboxEvents')
    expect(outbox.map((row: { payload?: { reason?: string } }) => row.payload?.reason)).toEqual([
      'publish',
      'archive',
    ])
    expect(outbox[1]).toMatchObject({
      status: 'pending',
      versionId: revisions[1]._id,
      paths: expect.arrayContaining(['/posts']),
    })
    const activity = await ctx.readAll('activity')
    expect(activity.map((row: { kind: string }) => row.kind)).toEqual([
      'entry.published',
      'entry.archived',
    ])
  })

  it('archiveEntry requires a confirmed preview token', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'Hello' }, bodyMdc: '# Hello' },
          de: { values: { title: 'Hallo' }, bodyMdc: '# Hallo' },
        },
      },
    })
    const preview = await previewPublish(owner, ctx, entryId, ['en', 'de'])
    await publishFromPreview(owner, entryId, preview)

    await expect(
      owner.operation(archiveEntryOperation).execute({
        entryId,
      }),
    ).rejects.toThrow(/Destructive operation requires confirmation/)
  })

  it('restoreRevision target=draft replaces draft rows without appending history', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'v1 EN' }, bodyMdc: '# v1 EN' },
          de: { values: { title: 'v1 DE' }, bodyMdc: '# v1 DE' },
        },
      },
    })
    const preview = await previewPublish(owner, ctx, entryId, ['en', 'de'])
    const publish = await publishFromPreview(owner, entryId, preview)

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          en: { values: { title: 'dirty EN' }, bodyMdc: '# dirty EN' },
          de: { values: { title: 'dirty DE' }, bodyMdc: '# dirty DE' },
        },
      },
    })

    const restore = (await rollbackConfirmed(owner, {
      entryId,
      versionId: publish.versionId,
      publish: false,
    })) as { versionId: string }
    expect(restore.versionId).toBe(publish.versionId)
    const restoredEntry = await ctx.raw.run(async (db) => await db.db.get(entryId as never))
    expect(restoredEntry?.draftVersion).toBe(4)

    const revisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(revisions).toHaveLength(1)
    expect(revisions[0].kind).toBe('publish')
    expect(revisions[0].revisionNumber).toBe(1)

    const drafts = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryDrafts')
          .withIndex('by_entry', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    const byLocale = new Map(drafts.map((row) => [row.locale, row]))
    expect(byLocale.get('en')?.values).toMatchObject({ title: 'v1 EN' })
    expect(byLocale.get('de')?.values).toMatchObject({ title: 'v1 DE' })
  })

  it('restoreRevision target=published appends rollback and restores public snapshot', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const { entryId } = await seedFixture(ctx)
    const owner = workflowClient(ctx, 'owner-1')

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: { slug: 'hello' },
        locales: {
          en: { values: { title: 'v1 EN' }, bodyMdc: '# v1 EN' },
          de: { values: { title: 'v1 DE' }, bodyMdc: '# v1 DE' },
        },
      },
    })
    const p1 = await previewPublish(owner, ctx, entryId, ['en', 'de'])
    const r1 = await publishFromPreview(owner, entryId, p1)

    await saveEntryDraft(owner, {
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'v2 EN' }, bodyMdc: '# v2 EN' } } },
    })
    const p2 = await previewPublish(owner, ctx, entryId, ['en'])
    await publishFromPreview(owner, entryId, p2)

    const restore = (await rollbackConfirmed(owner, {
      entryId,
      versionId: r1.versionId,
      publish: true,
    })) as { versionId: string }

    expect(restore.versionId).toBeTruthy()

    const publicRows = await ctx.raw.run(async (db) => await db.db.query('publicEntries').collect())
    const titleByLocale = Object.fromEntries(publicRows.map((row) => [row.locale, row.title]))
    expect(titleByLocale).toEqual({ de: 'v1 DE', en: 'v1 EN' })
    expect(new Set(publicRows.map((row) => row.revisionId))).toEqual(new Set([restore.versionId]))

    const revisions = await ctx.raw.run(
      async (db) =>
        await db.db
          .query('entryRevisions')
          .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId as never))
          .collect(),
    )
    expect(revisions.map((row) => row.kind)).toEqual(['publish', 'publish', 'rollback'])
    expect(revisions.map((row) => row.revisionNumber)).toEqual([1, 2, 3])
    expect(revisions[0]._id).toBe(r1.versionId)
    expect(revisions[0].snapshot.locales.en?.values).toMatchObject({ title: 'v1 EN' })
    expect(revisions[0].snapshot.locales.de?.values).toMatchObject({ title: 'v1 DE' })
    expect(revisions[2].snapshot.locales.en?.values).toMatchObject({ title: 'v1 EN' })
    expect(revisions[2].snapshot.locales.de?.values).toMatchObject({ title: 'v1 DE' })
  })
})
