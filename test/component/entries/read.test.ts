/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  archiveEntry,
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedOwner,
  seedSettings,
  seedEditorFixture,
  seedMultiLocaleSettings,
  seedTreeFixture,
} from './helpers'

const api = anyApi

describe('editor read queries', () => {
  it('returns stableId in editor entry lists for relation pickers', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const createdEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'entry-with-stable-id',
      localized: { title: 'Entry with stableId' },
    })

    const entries = await owner.query(api.editor.listEntries, {
      collection: 'posts',
      locale: 'en',
    })

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: createdEntryId,
          stableId: expect.stringMatching(/^[0-9a-z]{5,6}$/),
        }),
      ]),
    )
  })

  it('rejects version diffs across different entries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const firstPublish = await publishEntry(owner, entryId)

    const secondEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'second-post',
      localized: { title: 'Second post' },
    })
    const secondPublish = await publishEntry(owner, secondEntryId)

    await expect(
      owner.query(api.editor.getVersionDiff, {
        leftVersionId: firstPublish.versionId,
        rightVersionId: secondPublish.versionId,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_VERSION_MISMATCH'
    })
  })

  it('rejects invalid studio list cursors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.query(api.editor.listEntriesForStudio, {
        collection: 'posts',
        locale: 'en',
        paginationOpts: { numItems: 20, cursor: 'missing-entry' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'INVALID_CURSOR'
    })
  })

  it('paginates studio entry lists without collecting the full collection', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    for (const slug of ['second-post', 'third-post', 'fourth-post', 'fifth-post']) {
      await owner.createEntry({
        collection: 'posts',
        slug,
        localized: { title: slug },
      })
    }

    const firstPage = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'posts',
      locale: 'en',
      paginationOpts: { numItems: 2, cursor: null },
    })
    const secondPage = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'posts',
      locale: 'en',
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    })

    expect(firstPage.page).toHaveLength(2)
    expect(firstPage.isDone).toBe(false)
    expect(secondPage.page).toHaveLength(2)
    expect(new Set([...firstPage.page, ...secondPage.page].map((entry) => entry._id)).size).toBe(4)
  })

  it('uses indexed search for studio entry list queries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    for (const slug of ['alpha-report', 'alpha-notes', 'beta-report']) {
      await owner.createEntry({
        collection: 'posts',
        slug,
        localized: { title: slug },
      })
    }

    const result = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'posts',
      locale: 'en',
      query: 'alpha',
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page.map((entry) => entry.baseSlug).sort()).toEqual([
      'alpha-notes',
      'alpha-report',
    ])
    expect(result.isDone).toBe(true)
  })

  it('orders tree studio lists by parent-first sibling order', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page.map((entry) => entry.baseSlug)).toEqual([
      'root-a',
      'child',
      'grandchild',
      'sibling',
      'root-b',
    ])
    expect(result.isDone).toBe(true)
  })

  it('orders tree studio lists from draft placement state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootBId, childId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await owner.saveEntryDraft({
      entryId: rootBId,
      expectedDraftVersion: await currentDraftVersion(owner, rootBId),
      patch: {
        shared: {
          parentEntryId: childId,
          orderRank: 'b0',
        },
      },
    })

    const result = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page.map((entry) => entry.baseSlug)).toEqual([
      'root-a',
      'child',
      'grandchild',
      'root-b',
      'sibling',
    ])
  })

  it('keeps tree studio lists coherent when filtered parents are absent', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId } = await seedTreeFixture(ctx)

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(rootAId as never, { status: 'archived' })
    })

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page.map((entry) => entry.baseSlug)).toEqual([
      'child',
      'grandchild',
      'sibling',
      'root-b',
    ])
  })

  it('paginates activity with opaque indexed cursors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    for (let index = 0; index < 5; index += 1) {
      await ctx.seed(
        'activity' as never,
        {
          kind: 'test.activity',
          summary: `Activity ${index}`,
          appIdentityId: 'owner-1',
          createdAt: index,
        } as never,
      )
    }

    const owner = ctx.asCmsUser('owner-1')
    const firstPage = await owner.query(api.editor.listActivity, {
      paginationOpts: { numItems: 2, cursor: null },
    })
    const secondPage = await owner.query(api.editor.listActivity, {
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    })

    expect(firstPage.page.map((row) => row.summary)).toEqual(['Activity 4', 'Activity 3'])
    expect(firstPage.isDone).toBe(false)
    expect(secondPage.page.map((row) => row.summary)).toEqual(['Activity 2', 'Activity 1'])
  })

  it('paginates identical activity timestamps without loss or duplication', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    for (let index = 0; index < 5; index += 1) {
      await ctx.seed(
        'activity' as never,
        {
          kind: 'test.activity',
          summary: `Same-time activity ${index}`,
          appIdentityId: 'owner-1',
          createdAt: 42,
        } as never,
      )
    }

    const owner = ctx.asCmsUser('owner-1')
    const seen: string[] = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const result = await owner.query(api.editor.listActivity, {
        paginationOpts: { numItems: 2, cursor },
      })
      seen.push(...result.page.map((row) => row._id))
      cursor = result.continueCursor
      isDone = result.isDone
    }

    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
  })

  it('captures actor labels at write time and still resolves legacy rows at read time', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)
    const now = Date.now()
    await ctx.seed(
      'members' as never,
      {
        userId: 'named-editor',
        role: 'editor',
        displayName: 'Mara Winter',
        createdAt: now,
        updatedAt: now,
        updatedBy: 'named-editor',
      } as never,
    )

    // New rows: logActivity resolves the label when the row is written.
    const editor = ctx.asCmsUser('named-editor')
    await editor.mutation(api.editor.createEntry, {
      collection: 'posts',
      slug: 'actor-label-entry',
      locale: 'en',
      localized: { title: 'Actor label entry' },
    })

    // Legacy rows (written before the column existed) have no actorLabel and
    // must fall back to the read-time member lookup.
    await ctx.seed(
      'activity' as never,
      {
        kind: 'test.legacy',
        summary: 'Legacy row without stored label',
        appIdentityId: 'named-editor',
        createdAt: now + 1,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.query(api.editor.listActivity, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    const created = result.page.find((row) => row.kind === 'entry.created')
    const legacy = result.page.find((row) => row.kind === 'test.legacy')
    expect(created?.actorLabel).toBe('Mara Winter')
    expect(legacy?.actorLabel).toBe('Mara Winter')
  })

  it('returns editor-safe activity display summaries without rewriting raw summaries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    await ctx.seed(
      'activity' as never,
      {
        kind: 'member.invited',
        summary: 'Invited member "user_secret_123"',
        appIdentityId: 'owner-1',
        createdAt: 1,
      } as never,
    )
    await ctx.seed(
      'activity' as never,
      {
        kind: 'mcpCredentialSettings.revoked',
        summary: 'MCP credential settings revoked for "ba_secret_connection"',
        appIdentityId: 'owner-1',
        createdAt: 2,
      } as never,
    )
    await ctx.seed(
      'activity' as never,
      {
        kind: 'agentRun.write',
        summary: 'Agent run "Draft German launch page" used ginko-cms.save-entry-draft',
        appIdentityId: 'owner-1',
        detail: {
          agentRunId: 'agent-run-1',
          operationId: 'ginko-cms.save-entry-draft',
        },
        createdAt: 3,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const result = await owner.query(api.editor.listActivity, {
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'member.invited',
          summary: 'Invited member "user_secret_123"',
          displaySummary: 'Invited member',
        }),
        expect.objectContaining({
          kind: 'mcpCredentialSettings.revoked',
          summary: 'MCP credential settings revoked for "ba_secret_connection"',
          displaySummary: 'AI agent connection revoked',
        }),
        expect.objectContaining({
          kind: 'agentRun.write',
          summary: 'Agent run "Draft German launch page" used ginko-cms.save-entry-draft',
          displaySummary: 'AI updated content',
        }),
      ]),
    )
  })

  it('returns cheap workflow summaries with list-only work states', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { collectionId, entryId } = await seedEditorFixture(ctx)
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(collectionId as never, { locales: ['en', 'de', 'de-CH'] })
    })

    const owner = ctx.asCmsUser('owner-1')
    const [summary] = await owner.query(api.editor.listEntrySummaries, {
      collection: 'posts',
      locale: 'en',
    })

    expect(summary?.workflowSummary).toMatchObject({
      entryId,
      collection: 'posts',
      primaryLocale: 'en',
      workStatesByLocale: {
        en: 'draft',
        de: 'missing_translation',
        'de-CH': 'missing_translation',
      },
      issueCounts: {
        blocker: 0,
        warning: 0,
        info: 0,
      },
      missingLocales: ['de', 'de-CH'],
      publishedLocales: [],
      nextAction: {
        kind: 'add_locale',
        locale: 'de',
        target: 'locale',
        params: {},
      },
    })
  })

  it('keeps workflow summaries conservative and does not claim exact ready in lists', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: {
        locales: {
          en: {
            values: {
              title: 'Changed after publish',
            },
          },
        },
      },
    })

    const [summary] = await owner.query(api.editor.listEntrySummaries, {
      collection: 'posts',
      locale: 'en',
    })

    expect(summary?.workflowSummary).toMatchObject({
      workStatesByLocale: {
        en: 'changed',
      },
      publishedLocales: ['en'],
      nextAction: {
        kind: 'preview_publish',
        locale: 'en',
        target: 'publish',
        params: {},
      },
    })
    expect(Object.values(summary?.workflowSummary.workStatesByLocale ?? {})).not.toContain('ready')
  })

  it('includes drafts that canonical readiness allows in Studio overview ready-to-preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const overview = await owner.query(api.editor.getStudioOverview, { locale: 'en' })

    expect(overview.readyToPreview.map((entry: { entryId: string }) => entry.entryId)).toContain(
      entryId,
    )
    expect(overview.counts.readyToPreview).toBe(1)
  })

  it('excludes required-field-blocked drafts from Studio overview ready-to-preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { collectionId, entryId } = await seedEditorFixture(ctx)

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(
        collectionId as never,
        {
          fields: [
            { key: 'title', type: 'text', localized: true, required: true, searchable: true },
            { key: 'summary', type: 'textarea', localized: true, required: true },
          ],
        } as never,
      )
    })

    const owner = ctx.asCmsUser('owner-1')
    const overview = await owner.query(api.editor.getStudioOverview, { locale: 'en' })

    expect(
      overview.readyToPreview.map((entry: { entryId: string }) => entry.entryId),
    ).not.toContain(entryId)
    expect(overview.counts.readyToPreview).toBe(0)
  })

  it('excludes route-impact-blocked drafts from Studio overview ready-to-preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const takenEntryId = await owner.createEntry({
      collection: 'posts',
      slug: 'taken',
      localized: { title: 'Taken' },
    })
    await publishEntry(owner, takenEntryId)
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'old',
      localized: { title: 'Old' },
    })
    await publishEntry(owner, entryId)
    // Write validation prevents creating this state through saveEntryDraft.
    // Seed a legacy-invalid draft directly so the overview diagnostic remains
    // a defense for pre-existing corruption.
    await ctx.raw.run(async (innerCtx) => {
      const entry = await innerCtx.db.get(entryId as never)
      const shared = await innerCtx.db
        .query('entryDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId as never).eq('locale', null))
        .first()
      if (!entry || !shared) throw new Error('Missing route-impact fixture')
      await innerCtx.db.patch(shared._id, { slug: 'taken' })
      await innerCtx.db.patch(entry._id, {
        draftVersion: entry.draftVersion + 1,
        dirtyLocales: ['en'],
      })
    })

    const overview = await owner.query(api.editor.getStudioOverview, { locale: 'en' })

    expect(
      overview.readyToPreview.map((entry: { entryId: string }) => entry.entryId),
    ).not.toContain(entryId)
  })

  it('excludes archived entries from Studio overview work queues', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { collectionId, entryId } = await seedEditorFixture(ctx)
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(collectionId as never, { locales: ['en', 'de'] } as never)
    })

    const owner = ctx.asCmsUser('owner-1')
    await archiveEntry(owner, entryId)

    const overview = await owner.query(api.editor.getStudioOverview, { locale: 'en' })

    expect(overview.counts).toMatchObject({
      needsAttention: 0,
      changedDrafts: 0,
      missingTranslations: 0,
    })
    expect(overview.blocked).toEqual([])
    expect(overview.changedDrafts).toEqual([])
    expect(overview.missingTranslations).toEqual([])
    expect(
      overview.collections.find((summary: { slug: string }) => summary.slug === 'posts'),
    ).toMatchObject({
      changedDrafts: 0,
      blocked: 0,
      missingTranslations: 0,
    })
  })

  it('does not describe archived entries as blocked in workflow summaries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await archiveEntry(owner, entryId)

    const [summary] = await owner.query(api.editor.listEntrySummaries, {
      collection: 'posts',
      locale: 'en',
      status: 'archived',
    })

    expect(summary).toMatchObject({ _id: entryId, status: 'archived' })
    expect(summary?.workflowSummary.issueCounts.blocker).toBe(0)
    expect(summary?.workflowSummary.workStatesByLocale.en).not.toBe('blocked')
  })

  it('reports live entries with newer drafts as public, never draft_only', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(owner, entryId),
      patch: {
        locales: {
          en: {
            values: {
              title: 'Changed after publish',
            },
          },
        },
      },
    })

    const [summary] = await owner.query(api.editor.listEntrySummaries, {
      collection: 'posts',
      locale: 'en',
    })

    expect(summary).toMatchObject({
      status: 'published',
      publicState: 'public',
      draftChangedSincePublish: true,
    })
    expect(
      summary?.localeReadiness.find((locale: { locale: string }) => locale.locale === 'en')?.state,
    ).toBe('changed')
  })

  it('excludes missing-language drafts from Studio overview ready-to-preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { collectionId, entryId } = await seedEditorFixture(ctx)
    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(collectionId as never, { locales: ['en', 'de'] } as never)
    })

    const owner = ctx.asCmsUser('owner-1')
    const overview = await owner.query(api.editor.getStudioOverview, { locale: 'en' })

    expect(
      overview.readyToPreview.map((entry: { entryId: string }) => entry.entryId),
    ).not.toContain(entryId)
    expect(overview.counts.readyToPreview).toBe(0)
  })
})
