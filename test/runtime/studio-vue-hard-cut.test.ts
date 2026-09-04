import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const studio = (path: string) =>
  readFileSync(resolve(root, 'packages/cms/studio-app/src', path), 'utf8')
const host = (path: string) => readFileSync(resolve(root, 'packages/cms/src', path), 'utf8')
const playground = (path: string) => readFileSync(resolve(root, 'playground', path), 'utf8')

describe('Studio Vue hard-cut source boundary', () => {
  it('mounts the shared runtime and never carries a raw client or foreign Vue refs', () => {
    expect(studio('main.ts')).toContain('createBetterConvex({ attachment: studioHost.attachment })')
    expect(studio('boundary/studio-host-context.ts')).not.toContain('createBetterConvexAttachment')
    const publicTypes = host('public/types.ts')
    expect(publicTypes).toContain('BetterConvexAttachment')
    expect(publicTypes).not.toContain('GinkoCmsConvexClientHandle')
    expect(publicTypes).not.toContain('isAuthenticated: boolean')
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
    const calls = studio('composables/useStudioConvex.ts')
    expect(calls).toContain(
      "export { useConvexAction, useConvexForm, useConvexMutation } from '@lupinum/better-convex-vue'",
    )
    expect(calls).not.toMatch(/StudioMutationReturn|StudioActionReturn|\.safe\b|Object\.assign/u)
    const pagination = studio('composables/useCmsStudioPaginatedQuery.ts')
    expect(pagination).not.toMatch(
      /\bresults\b|hasNextPage|isExhausted|\breset\b|CheckedPaginatedQuery/u,
    )
    expect(pagination).toContain('initialNumItems: number')
    const query = studio('composables/useCmsStudioQuery.ts')
    expect(query).toContain('UseConvexQueryParameters')
    expect(query).not.toMatch(/\bclear\b|transform:|args\?: MaybeRefOrGetter/u)
  })

  it('keeps CMS facets in a dedicated application query', () => {
    expect(studio('composables/internal/useStudioAssetFinder.ts')).toContain(
      'getAssetManagerFacets',
    )
    expect(studio('composables/useCmsStudioPaginatedQuery.ts')).not.toContain('pageData')
  })

  it('uses the 1.0 auth status contract in the packed preview consumer', () => {
    const preview = playground('app/pages/preview/[collection]/[id].vue')
    expect(preview).toContain("auth.status.value === 'authenticated'")
    expect(preview).not.toContain('auth.isAuthenticated')
  })
})
