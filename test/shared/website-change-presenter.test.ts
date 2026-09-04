import { describe, expect, it } from 'vitest'

import {
  groupWebsiteChanges,
  type WebsiteChangeInput,
} from '../../packages/cms/studio-app/src/lib/websiteChangePresenter'

const labels = {
  canonicalUrl: 'Canonical URL',
  empty: 'Empty',
  excluded: 'Excluded',
  included: 'Included',
  navigation: 'Navigation',
  notSet: 'Not set',
  oldUrlRedirect: 'Old URL redirect',
  pageUrl: 'Page URL',
  search: 'Search',
  sitemap: 'Sitemap',
}

function change(input: Partial<WebsiteChangeInput> & Pick<WebsiteChangeInput, 'kind' | 'label'>) {
  return {
    locale: 'en',
    before: null,
    after: 'after',
    ...input,
  } satisfies WebsiteChangeInput
}

describe('website change presenter', () => {
  it('groups route and redirect rows', () => {
    const groups = groupWebsiteChanges(
      [
        change({ kind: 'route', label: 'Public route', before: '/old', after: '/new' }),
        change({ kind: 'redirect', label: 'Old route redirect', before: false, after: true }),
      ],
      labels,
    )

    expect(groups.pageAddressRows).toMatchObject([
      { label: 'Page URL', before: '/old', after: '/new' },
      { label: 'Old URL redirect', before: 'Excluded', after: 'Included' },
    ])
    expect(groups.hiddenChangeCount).toBe(0)
  })

  it('groups visibility rows', () => {
    const groups = groupWebsiteChanges(
      [
        change({ kind: 'sitemap', label: 'Sitemap', before: false, after: true }),
        change({ kind: 'search', label: 'Search', before: true, after: false }),
        change({ kind: 'nav', label: 'Navigation', before: false, after: true }),
      ],
      labels,
    )

    expect(groups.visibilityRows.map((row) => row.label)).toEqual([
      'Sitemap',
      'Search',
      'Navigation',
    ])
  })

  it('groups generic SEO rows separately from search-preview SEO rows', () => {
    const groups = groupWebsiteChanges(
      [
        change({ kind: 'seo', label: 'Robots directive', before: 'index', after: 'noindex' }),
        change({ kind: 'seo', label: 'Meta title', before: 'Old title', after: 'New title' }),
      ],
      labels,
    )

    expect(groups.seoSettingRows).toMatchObject([{ label: 'Robots directive' }])
    expect(groups.searchPreviewRows).toMatchObject([{ label: 'Meta title' }])
  })

  it('renders multiple SEO title, description, and canonical changes instead of finding one', () => {
    const groups = groupWebsiteChanges(
      [
        change({ kind: 'seo', label: 'Meta title', before: 'Old title', after: 'New title' }),
        change({
          kind: 'seo',
          label: 'Open Graph title',
          before: 'Old OG title',
          after: 'New OG title',
        }),
        change({
          kind: 'seo',
          label: 'Meta description',
          before: 'Old description',
          after: 'New description',
        }),
        change({
          kind: 'seo',
          label: 'Canonical href',
          before: '/old',
          after: '/new',
        }),
      ],
      labels,
    )

    expect(groups.searchPreviewRows.map((row) => row.label)).toEqual([
      'Meta title',
      'Open Graph title',
      'Meta description',
      'Canonical URL',
    ])
    expect(groups.hiddenChangeCount).toBe(0)
  })

  it('counts only changes that are not rendered by any group as hidden', () => {
    const groups = groupWebsiteChanges(
      [
        change({ kind: 'route', label: 'Public route', before: '/old', after: '/new' }),
        change({ kind: 'unknown', label: 'Custom website flag', before: false, after: true }),
      ],
      labels,
    )

    expect(groups.pageAddressRows).toHaveLength(1)
    expect(groups.otherRows).toHaveLength(1)
    expect(groups.hiddenChangeCount).toBe(0)
  })
})
