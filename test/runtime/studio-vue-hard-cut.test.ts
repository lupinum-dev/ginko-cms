import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const studio = (path: string) =>
  readFileSync(resolve(root, 'packages/cms/studio-app/src', path), 'utf8')
const host = (path: string) => readFileSync(resolve(root, 'packages/cms/src', path), 'utf8')

describe('Studio Vue hard-cut source boundary', () => {
  it('mounts the shared runtime and never carries a raw client or foreign Vue refs', () => {
    expect(studio('main.ts')).toContain('createBetterConvex({ runtime: studioHost.runtime })')
    expect(studio('boundary/studio-host-context.ts')).toContain('createBetterConvexAttachment')
    const publicTypes = host('public/types.ts')
    expect(publicTypes).toContain('BetterConvexAttachedRuntime')
    expect(publicTypes).not.toContain('GinkoCmsConvexClientHandle')
    expect(publicTypes).not.toMatch(/ComputedRef<.*ConvexAuth|Ref<.*ConvexAuth/u)
  })

  it('keeps generic lifecycle ownership out of Ginko adapters', () => {
    for (const path of [
      'composables/useCmsStudioQuery.ts',
      'composables/useCmsStudioPaginatedQuery.ts',
      'composables/useCmsStudioAccess.ts',
    ]) {
      const source = studio(path)
      expect(source).not.toContain('.onUpdate(')
      expect(source).not.toMatch(/requestGeneration|subscriptionGeneration|loadedTailPageSizes/u)
    }
    expect(studio('composables/useStudioConvex.ts')).not.toContain('useStudioOperationScope')
  })

  it('keeps CMS facets in a dedicated application query', () => {
    expect(studio('composables/internal/useStudioAssetFinder.ts')).toContain(
      'getAssetManagerFacets',
    )
    expect(studio('composables/useCmsStudioPaginatedQuery.ts')).not.toContain('pageData')
  })
})
