import { describe, expect, it } from 'vitest'

import { sitemapRouteHref } from '../../packages/cms/src/server/routes/sitemap-url'

describe('CMS sitemap URLs', () => {
  it('prefixes non-default locale routes even when the CMS route has an href', () => {
    expect(
      sitemapRouteHref(
        {
          locale: 'de',
          path: '/dokumentation/codebloecke',
          href: '/dokumentation/codebloecke',
        },
        'en',
      ),
    ).toBe('/de/dokumentation/codebloecke')
  })

  it('does not double-prefix already-prefixed locale routes', () => {
    expect(
      sitemapRouteHref(
        {
          locale: 'de',
          path: '/de/dokumentation/codebloecke',
          href: '/de/dokumentation/codebloecke',
        },
        'en',
      ),
    ).toBe('/de/dokumentation/codebloecke')
  })

  it('keeps default locale routes unprefixed', () => {
    expect(
      sitemapRouteHref(
        {
          locale: 'en',
          path: '/docs/code-blocks',
          href: '/docs/code-blocks',
        },
        'en',
      ),
    ).toBe('/docs/code-blocks')
  })
})
