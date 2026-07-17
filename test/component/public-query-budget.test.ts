import { buildResolvedContentContract } from '@lupinum/ginko-content/cms-contract'
import { describe, expect, it, vi } from 'vitest'

import { readTranslationsByEntryId } from '../../packages/convex/src/publicProjectionReads.js'

type PublicRow = {
  entryId: string
  collection: string
  locale: string
  parentEntryId: string | null
  slug: string
}

function createReadContext(rows: PublicRow[]) {
  const content = buildResolvedContentContract(
    {
      collections: {
        articles: {
          type: 'page',
          source: 'content/articles/**/*.md',
          i18n: true,
          route: '/articles',
          cms: { type: 'flat' },
        },
      },
    },
    { defaultLocale: 'en', locales: ['en'], localeFallbacks: { en: [] } },
  )
  const publicIndexCalls: Array<{ index: string; values: Record<string, unknown> }> = []

  const query = vi.fn((table: string) => ({
    withIndex: (index: string, configure: (builder: unknown) => unknown) => {
      const values: Record<string, unknown> = {}
      const builder = {
        eq(field: string, value: unknown) {
          values[field] = value
          return builder
        },
      }
      configure(builder)

      if (table === 'cmsContract') {
        return {
          first: async () => ({
            key: 'active',
            content,
            contentHash: 'content-hash',
            presentation: {},
            presentationHash: 'presentation-hash',
            transitionState: 'ready',
            installedAt: 1,
            installedBy: 'owner-1',
          }),
        }
      }

      expect(table).toBe('publicEntries')
      publicIndexCalls.push({ index, values: { ...values } })
      const matchingRows = rows.filter(
        (row) =>
          row.entryId === values.entryId &&
          (values.locale === undefined || row.locale === values.locale),
      )
      return {
        collect: async () => matchingRows,
        take: async (limit: number) => matchingRows.slice(0, limit),
      }
    },
  }))

  return {
    ctx: {
      db: {
        query,
        normalizeId: (_table: string, value: string) => value,
      },
    },
    publicIndexCalls,
  }
}

describe('public projection query budgets', () => {
  it.each([1, 1000])(
    'loads exact translation variants through entry-scoped indexes for %i entries',
    async (count) => {
      const input = Array.from({ length: count }, (_, index) => ({
        entryId: `entry-${index}`,
      }))
      const rows = input.map(
        ({ entryId }): PublicRow => ({
          entryId,
          collection: 'articles',
          locale: 'en',
          parentEntryId: null,
          slug: entryId,
        }),
      )
      const { ctx, publicIndexCalls } = createReadContext(rows)

      const result = await readTranslationsByEntryId(ctx as never, 'articles', input as never)

      expect(result.size).toBe(count)
      expect(result.get(`entry-${count - 1}`)).toEqual([
        {
          locale: 'en',
          slug: `entry-${count - 1}`,
          path: `/articles/entry-${count - 1}`,
          href: `/articles/entry-${count - 1}`,
          published: true,
        },
      ])
      // One exact alternate lookup plus one indexed tree lookup for each root
      // entry. Collection size never enters either query.
      expect(publicIndexCalls).toHaveLength(count * 2)
      expect(publicIndexCalls).toEqual(
        expect.arrayContaining(
          input.flatMap(({ entryId }) => [
            { index: 'by_entry_locale', values: { entryId } },
            { index: 'by_entry_locale', values: { entryId, locale: 'en' } },
          ]),
        ),
      )
    },
  )
})
