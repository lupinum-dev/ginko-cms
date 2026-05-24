import { describe, expect, it } from 'vitest'

import { parseStableIdFromPath } from '#component/lib/paths.js'

describe('component lib paths', () => {
  it('extracts stable ids from valid paths only', () => {
    expect(parseStableIdFromPath('/blog/about-me-k8x2f')).toBe('k8x2f')
    expect(parseStableIdFromPath('/docs/quickstart')).toBeNull()
    expect(parseStableIdFromPath('/blog/about-me-K8X2F')).toBeNull()
  })
})
