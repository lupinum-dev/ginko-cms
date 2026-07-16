import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { throwPublicContentFailure } from '../../playground/app/utils/publicContentErrors'

const root = resolve(import.meta.dirname, '../..')

describe('playground public blog failure semantics', () => {
  it('turns provider failures into HTTP 502 errors', () => {
    expect(() =>
      throwPublicContentFailure(new Error('provider unavailable'), 'Posts unavailable'),
    ).toThrow(
      expect.objectContaining({
        statusCode: 502,
        statusMessage: 'Posts unavailable',
      }),
    )
    expect(() => throwPublicContentFailure(null, 'Posts unavailable')).not.toThrow()
  })

  it('handles provider errors before rendering empty or not-found states', async () => {
    const [listPage, detailPage] = await Promise.all([
      readFile(resolve(root, 'playground/app/pages/blog/index.vue'), 'utf8'),
      readFile(resolve(root, 'playground/app/pages/blog/[slug].vue'), 'utf8'),
    ])

    expect(listPage).toContain('error: loadError')
    expect(listPage).toContain('throwPublicContentFailure(loadError.value')
    expect(listPage.indexOf('v-else-if="loadError"')).toBeLessThan(
      listPage.indexOf('blogPosts.length === 0'),
    )

    expect(detailPage).toContain('error: loadError')
    expect(detailPage).toContain('throwPublicContentFailure(loadError.value')
    expect(detailPage.indexOf('throwPublicContentFailure(loadError.value')).toBeLessThan(
      detailPage.indexOf('setResponseStatus(404)'),
    )
  })

  it('keeps sitemap route verification to a bounded deterministic sample', async () => {
    const smoke = await readFile(resolve(root, 'scripts/cms-live-story-smoke.mjs'), 'utf8')
    const sitemapStory = smoke.slice(
      smoke.indexOf("story('public-api.sitemap'"),
      smoke.indexOf("story(\n    'public-api.search-validation'"),
    )

    expect(sitemapStory).toContain(
      'const sampleIndexes = [0, Math.floor(body.length / 2), body.length - 1]',
    )
    expect(sitemapStory).toContain('sampledRoutes.map(async (path)')
    expect(sitemapStory).not.toContain('body.map(async')
  })
})
