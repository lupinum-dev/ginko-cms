import { describe, expect, it, vi } from 'vitest'

import { readTranslationsByEntryId } from '../../packages/convex/src/publicProjectionReads.js'

function createReadContext(rows: Array<Record<string, unknown>>) {
  const take = vi.fn(async () => rows)
  const withIndex = vi.fn(() => ({ take }))
  const query = vi.fn(() => ({ withIndex }))
  return {
    ctx: { db: { query } },
    query,
  }
}

describe('public projection query budgets', () => {
  it.each([1, 1000])('loads translation variants with one query for %i entries', async (count) => {
    const collectionId = 'collection-1'
    const input = Array.from({ length: count }, (_, index) => ({
      entryId: `entry-${index}`,
    }))
    const { ctx, query } = createReadContext(
      input.map(({ entryId }) => ({
        entryId,
        locale: 'en',
        slug: entryId,
        path: `/articles/${entryId}`,
        href: `/articles/${entryId}`,
      })),
    )

    const result = await readTranslationsByEntryId(
      ctx as never,
      collectionId as never,
      input as never,
    )

    expect(result.size).toBe(count)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
