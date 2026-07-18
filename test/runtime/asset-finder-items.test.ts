import { describe, expect, it } from 'vitest'

import { buildAssetFinderItems } from '../../packages/cms/studio-app/src/composables/internal/assetFinderItems'
import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'

function asset(id: string, overrides: Partial<FinderAssetRecord> = {}): FinderAssetRecord {
  return {
    id,
    filename: `${id}.png`,
    mimeType: 'image/png',
    size: 100,
    width: 1,
    height: 1,
    scope: 'global',
    entryId: null,
    collection: null,
    collectionLabel: null,
    entryTitle: null,
    ownerPath: [],
    url: null,
    thumbnailUrl: null,
    createdAt: 100,
    updatedAt: null,
    deletedAt: null,
    alt: null,
    caption: null,
    tags: [],
    referenceCertainty: {
      state: 'unknown-stale',
      proofCurrent: false,
      canonicalGeneration: 0,
      verifiedRunId: null,
      verifiedAt: null,
    },
    ...overrides,
  }
}

describe('asset finder item projection', () => {
  it('preserves the exact server page order without synthesizing local folders', () => {
    const shared = asset('shared')
    const collection = asset('collection', { scope: 'collection', collection: 'pages' })
    const entry = asset('entry', {
      scope: 'entry',
      collection: 'pages',
      entryId: 'entry-1',
    })

    const result = buildAssetFinderItems([entry, collection, shared])

    expect(result.filter((item) => item.type === 'asset').map((item) => item.asset.id)).toEqual([
      'entry',
      'collection',
      'shared',
    ])
    expect(result.filter((item) => item.type === 'folder')).toHaveLength(0)
  })

  it('does not re-filter or re-sort a server-owned page', () => {
    const result = buildAssetFinderItems([
      asset('older-large', { size: 2_000_000, createdAt: 100, updatedAt: 200 }),
      asset('newer-small', { size: 3, createdAt: 200, updatedAt: 300 }),
    ])

    expect(result.filter((item) => item.type === 'asset').map((item) => item.asset.id)).toEqual([
      'older-large',
      'newer-small',
    ])
  })
})
