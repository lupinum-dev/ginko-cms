/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, publishEntry, seedOwner, seedSettings, seedEditorFixture } from './helpers'

const api = anyApi

describe('editor read queries', () => {
  it('returns stableId in editor entry lists for relation pickers', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const createdEntryId = await owner.mutation(api.editor.createEntry, {
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

    const secondEntryId = await owner.mutation(api.editor.createEntry, {
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
      await owner.mutation(api.editor.createEntry, {
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
      await owner.mutation(api.editor.createEntry, {
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
})
