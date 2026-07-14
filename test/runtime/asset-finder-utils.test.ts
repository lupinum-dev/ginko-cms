import { describe, expect, it } from 'vitest'

import {
  mimeTypeMatches,
  normalizeAssetTags,
  parseAspectRatio,
} from '../../packages/cms/studio-app/src/composables/internal/assetFinderUtils'

describe('asset finder value helpers', () => {
  it('normalizes tags once and matches exact or family MIME constraints', () => {
    expect(normalizeAssetTags([' Hero ', 'hero', '', 'PHOTO'])).toEqual(['hero', 'photo'])
    expect(mimeTypeMatches('image/*', 'image/webp')).toBe(true)
    expect(mimeTypeMatches('image/png', 'image/webp')).toBe(false)
  })

  it('parses only positive aspect-ratio constraints', () => {
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9)
    expect(parseAspectRatio('4/3')).toBeCloseTo(4 / 3)
    expect(parseAspectRatio('0:3')).toBeNull()
    expect(parseAspectRatio('wide')).toBeNull()
  })
})
