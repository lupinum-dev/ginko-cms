import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type ShallowRef } from 'vue'

import type { FinderAssetRecord } from '../../packages/cms/studio-app/src/composables/internal/assetFinderTypes'
import { useStudioAssetFinder } from '../../packages/cms/studio-app/src/composables/internal/useStudioAssetFinder'

const mocks = vi.hoisted(() => ({
  paginatedCall: 0,
  managerResults: null as ShallowRef<FinderAssetRecord[]> | null,
  queryArgs: [] as unknown[],
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsI18n', () => ({
  useCmsI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioAccess', () => ({
  useCmsStudioAccess: () => ({}),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useStudioConvex', () => ({
  useConvexAction: () => vi.fn(),
  useConvexMutation: () => vi.fn(),
  useConvexUpload: () => ({ upload: vi.fn(), reset: vi.fn() }),
}))

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioQuery', async () => {
  const { shallowRef } = await import('vue')
  return {
    useCmsStudioQuery: (_query: unknown, args: unknown) => {
      mocks.queryArgs.push(args)
      return {
        data: shallowRef({
          activeCount: 0,
          trashedCount: 0,
          globalActiveCount: 0,
          collections: [],
          tags: [],
        }),
      }
    },
  }
})

vi.mock('../../packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery', async () => {
  const { ref: vueRef, shallowRef } = await import('vue')
  return {
    useCmsStudioPaginatedQuery: () => {
      const isManagerQuery = mocks.paginatedCall++ === 0
      const results = shallowRef([])
      if (isManagerQuery) mocks.managerResults = results
      return {
        results,
        status: vueRef('ready'),
        hasNextPage: vueRef(false),
        loadMore: vi.fn(),
      }
    },
  }
})

function asset(id: string): FinderAssetRecord {
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
    ownerPath: ['Global'],
    url: null,
    thumbnailUrl: null,
    createdAt: 1,
    updatedAt: null,
    deletedAt: null,
    alt: null,
    caption: null,
    tags: [],
    referenceCertainty: {
      state: 'unused-verified',
      proofCurrent: true,
      canonicalGeneration: 1,
      verifiedRunId: 'repair-1',
      verifiedAt: 1,
    },
  }
}

beforeEach(() => {
  mocks.paginatedCall = 0
  mocks.managerResults = null
  mocks.queryArgs = []
})

describe('Studio asset finder selection', () => {
  it('executes the no-argument facets query with an explicit empty argument object', () => {
    const scope = effectScope()
    scope.run(() => useStudioAssetFinder())

    expect(mocks.queryArgs).toEqual([{}])
    scope.stop()
  })

  it('[AST-02] keeps explicit selection when a page or filter replaces visible results', async () => {
    const scope = effectScope()
    const finder = scope.run(() => useStudioAssetFinder())!
    const results = mocks.managerResults
    if (!results) throw new Error('Expected the manager results test seam.')

    results.value = [asset('first-page')]
    await nextTick()
    finder.toggleAssetSelection('first-page')
    finder.selectAsset('first-page')
    finder.searchQuery.value = 'second page'

    results.value = [asset('second-page')]
    await nextTick()

    expect(finder.selectedAssetIds.value).toEqual(['first-page'])
    expect(finder.selectedAssetId.value).toBe('first-page')
    expect(finder.searchQuery.value).toBe('second page')

    results.value = [asset('first-page')]
    await nextTick()
    expect(finder.selectedAsset.value?.id).toBe('first-page')
    scope.stop()
  })
})
