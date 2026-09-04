/// <reference types="vite/client" />

import { describe, expect, it, vi } from 'vitest'

import {
  createExactRelationReferenceResolver,
  rewriteStoredRelationData,
} from '#component/entries/relations'
import type { CmsField } from '#component/lib/types'

describe('entry relation helpers', () => {
  it('[EDT-06] keeps canonical stable relation ids across nested object, array, and blocks fields', async () => {
    const fields = [
      {
        key: 'author',
        type: 'relation',
        relation: { collection: 'authors' },
        fields: [],
      },
      {
        key: 'seo',
        type: 'object',
        fields: [
          {
            key: 'reviewer',
            type: 'relation',
            relation: { collection: 'authors' },
            fields: [],
          },
        ],
      },
      {
        key: 'contributors',
        type: 'array',
        fields: [
          {
            key: 'person',
            type: 'relation',
            relation: { collection: 'authors' },
            fields: [],
          },
        ],
      },
      {
        key: 'content',
        type: 'blocks',
        fields: [
          {
            key: 'quote',
            type: 'object',
            fields: [
              {
                key: 'speaker',
                type: 'relation',
                relation: { collection: 'authors' },
                fields: [],
              },
            ],
          },
        ],
      },
      {
        key: 'relatedAuthors',
        type: 'relations',
        relation: { collection: 'authors' },
        fields: [],
      },
    ] satisfies CmsField[]

    const rewritten = await rewriteStoredRelationData(
      fields,
      {
        author: 'stable_a',
        seo: { reviewer: 'stable_b' },
        contributors: [{ person: 'stable_a' }, { person: 'missing_entry' }],
        content: [
          { type: 'quote', data: { speaker: 'stable_b' } },
          { type: 'quote', data: { speaker: 'stable_c' } },
        ],
        relatedAuthors: ['stable_a', 'stable_c', 'missing_entry'],
      },
      async (collectionSlug: string, stableId: string) =>
        collectionSlug === 'authors' && new Set(['stable_a', 'stable_b', 'stable_c']).has(stableId),
    )

    expect(rewritten).toEqual({
      author: 'stable_a',
      seo: { reviewer: 'stable_b' },
      contributors: [{ person: 'stable_a' }, { person: null }],
      content: [
        { type: 'quote', data: { speaker: 'stable_b' } },
        { type: 'quote', data: { speaker: 'stable_c' } },
      ],
      relatedAuthors: ['stable_a', 'stable_c'],
    })
  })

  it('uses one exact indexed read per referenced stable id regardless of unrelated rows', async () => {
    const unrelated = new Map(
      Array.from({ length: 1_205 }, (_, index) => [
        `unrelated-${index}`,
        { collection: 'authors', stableId: `unrelated-${index}`, lifecycle: 'active' },
      ]),
    )
    const targets = new Map([
      [
        'authors\u0000stable_a',
        { collection: 'authors', stableId: 'stable_a', lifecycle: 'active' },
      ],
      [
        'authors\u0000stable_b',
        { collection: 'authors', stableId: 'stable_b', lifecycle: 'active' },
      ],
    ])
    const reads: Array<{ index: string; collection: unknown; stableId: unknown }> = []
    const query = vi.fn(() => ({
      withIndex: (index: string, configure: (query: unknown) => unknown) => {
        const conditions = new Map<string, unknown>()
        const builder = {
          eq(field: string, value: unknown) {
            conditions.set(field, value)
            return builder
          },
        }
        configure(builder)
        reads.push({
          index,
          collection: conditions.get('collection'),
          stableId: conditions.get('stableId'),
        })
        return {
          unique: async () =>
            targets.get(`${conditions.get('collection')}\u0000${conditions.get('stableId')}`) ??
            null,
        }
      },
    }))
    const referenceExists = createExactRelationReferenceResolver({ db: { query } } as never)

    await expect(
      Promise.all([
        referenceExists('authors', 'stable_a'),
        referenceExists('authors', 'stable_a'),
        referenceExists('authors', 'stable_b'),
        referenceExists('authors', 'missing'),
      ]),
    ).resolves.toEqual([true, true, true, false])

    expect(unrelated.size).toBe(1_205)
    expect(query).toHaveBeenCalledTimes(3)
    expect(reads).toEqual([
      { index: 'by_collection_stableId', collection: 'authors', stableId: 'stable_a' },
      { index: 'by_collection_stableId', collection: 'authors', stableId: 'stable_b' },
      { index: 'by_collection_stableId', collection: 'authors', stableId: 'missing' },
    ])
  })
})
