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
})
