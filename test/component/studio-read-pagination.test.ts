/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedEditorFixture, seedOwner, seedSettings } from './entries/helpers'

const api = anyApi
const ROW_COUNT = 1_205
const SEED_PAGE_SIZE = 200

describe('bounded Studio history and activity reads', () => {
  it('pages 1,205 versions and entry activity rows without loss or duplication', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const existingActivityIds = (await ctx.readAll('activity'))
      .filter((row) => String(row.entryId) === entryId)
      .map((row) => String(row._id))
    const revisionIds: string[] = []
    const activityIds: string[] = []

    for (let start = 0; start < ROW_COUNT; start += SEED_PAGE_SIZE) {
      const count = Math.min(SEED_PAGE_SIZE, ROW_COUNT - start)
      const seeded = await ctx.raw.run(async (innerCtx) => {
        const revisions: string[] = []
        const activity: string[] = []
        for (let offset = 0; offset < count; offset += 1) {
          const index = start + offset
          const revisionId = await innerCtx.db.insert('entryRevisions', {
            entryId: entryId as never,
            collection: 'posts',
            revisionNumber: index + 1,
            operationId: `history-page-${index}`,
            parentRevisionId: null,
            kind: 'checkpoint',
            snapshots: {
              en: {
                shared: {},
                values: { title: `Version ${index}` },
                bodyMdc: '',
                slug: 'hello-world',
                parentEntryId: null,
                orderRank: '',
                sharedVersion: 1,
                localeVersion: 1,
              },
            },
            affectedLocales: ['en'],
            contentHash: 'pagination-test',
            message: null,
            createdBy: 'owner-1',
            createdAt: 1_700_000_000_000,
          })
          const activityId = await innerCtx.db.insert('activity', {
            kind: 'entry.checkpointed',
            outcome: 'applied',
            summary: `Saved checkpoint ${index}`,
            retention: 'standard',
            entryId: entryId as never,
            collection: 'posts',
            locale: 'en',
            detail: null,
            appIdentityId: 'owner-1',
            actorLabel: 'Owner',
            createdAt: 1_700_000_000_000,
          })
          revisions.push(String(revisionId))
          activity.push(String(activityId))
        }
        return { revisions, activity }
      })
      revisionIds.push(...seeded.revisions)
      activityIds.push(...seeded.activity)
    }

    const owner = ctx.asCmsUser('owner-1')
    const seenVersions: string[] = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const result = await owner.query(api.editor.listVersions, {
        entryId,
        paginationOpts: { cursor, numItems: 100 },
      })
      seenVersions.push(...result.page.map((row: { _id: string }) => row._id))
      cursor = result.continueCursor
      isDone = result.isDone
    }
    expect(seenVersions).toHaveLength(ROW_COUNT)
    expect(new Set(seenVersions).size).toBe(ROW_COUNT)
    expect(seenVersions).toEqual(expect.arrayContaining(revisionIds))

    const seenActivity: string[] = []
    cursor = null
    isDone = false
    while (!isDone) {
      const result = await owner.query(api.editor.getEntryActivity, {
        entryId,
        paginationOpts: { cursor, numItems: 100 },
      })
      seenActivity.push(...result.page.map((row: { _id: string }) => row._id))
      cursor = result.continueCursor
      isDone = result.isDone
    }
    const expectedActivityIds = [...existingActivityIds, ...activityIds]
    expect(seenActivity).toHaveLength(expectedActivityIds.length)
    expect(new Set(seenActivity).size).toBe(expectedActivityIds.length)
    expect(seenActivity).toEqual(expect.arrayContaining(expectedActivityIds))
  }, 20_000)
})
