/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { rewriteStoredRelationData } from '#component/entries/relations'

describe('entry relation helpers', () => {
  it('keeps canonical stable relation ids across nested object, array, and blocks fields', async () => {
    const fields = [
      {
        key: 'author',
        type: 'relation',
        relation: { collectionId: 'authors' },
        fields: [],
      },
      {
        key: 'seo',
        type: 'object',
        fields: [
          {
            key: 'reviewer',
            type: 'relation',
            relation: { collectionId: 'authors' },
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
            relation: { collectionId: 'authors' },
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
                relation: { collectionId: 'authors' },
                fields: [],
              },
            ],
          },
        ],
      },
      {
        key: 'relatedAuthors',
        type: 'relations',
        relation: { collectionId: 'authors' },
        fields: [],
      },
    ] as any

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
      async (collectionSlug: string) => {
        if (collectionSlug !== 'authors') return null
        return {
          stableIds: new Set(['stable_a', 'stable_b', 'stable_c']),
        }
      },
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
})
