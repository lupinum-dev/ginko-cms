/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { inspectInboundEntryRelations } from '../../packages/convex/src/entries/inboundRelations'
import { createCtx, seedSettings } from './entries/helpers'

describe('inbound relation scale boundary', () => {
  it('reserves one operator entry above the certified 1,500-entry dataset', async () => {
    const ctx = createCtx()
    await seedSettings(ctx)
    const target = await ctx.raw.run(async (inner) => {
      let firstEntryId
      for (let index = 0; index < 1_501; index += 1) {
        const entryId = await inner.db.insert('entries', {
          collection: 'unrelated',
          stableId: `entry-${index}`,
          lifecycle: 'active',
          slug: `entry-${index}`,
          parentEntryId: null,
          orderRank: String(index),
          nodeKind: 'page',
          shared: {},
          draftVersion: 1,
          sharedVersion: 1,
          activePublications: [],
          latestEditorialRevisionId: null,
          createdBy: 'test',
          updatedBy: 'test',
          createdAt: index,
          updatedAt: index,
        })
        firstEntryId ??= entryId
      }
      const entry = await inner.db.get(firstEntryId!)
      if (!entry) throw new Error('Expected target entry.')
      return entry
    })

    await expect(
      ctx.raw.run(async (inner) => await inspectInboundEntryRelations(inner, target)),
    ).resolves.toMatchObject({ total: 0, scannedEntries: 1_501 })

    await ctx.seed('entries', {
      collection: 'unrelated',
      stableId: 'entry-over-limit',
      lifecycle: 'active',
      slug: 'entry-over-limit',
      parentEntryId: null,
      orderRank: 'over-limit',
      nodeKind: 'page',
      shared: {},
      draftVersion: 1,
      sharedVersion: 1,
      activePublications: [],
      latestEditorialRevisionId: null,
      createdBy: 'test',
      updatedBy: 'test',
      createdAt: 1_502,
      updatedAt: 1_502,
    })

    await expect(
      ctx.raw.run(async (inner) => await inspectInboundEntryRelations(inner, target)),
    ).rejects.toThrow(/at most 1501 entries/i)
  })
})
