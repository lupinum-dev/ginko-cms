/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
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

  it('paginates activity with native Convex cursors', async () => {
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
          displaySummary: 'Invited member "user or connection"',
        }),
        expect.objectContaining({
          kind: 'mcpCredentialSettings.revoked',
          summary: 'MCP credential settings revoked for "ba_secret_connection"',
          displaySummary: 'AI agent connection revoked for "user or connection"',
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
})
