import { normalizeFields } from '@lupinum/ginko-cms-contract/shared/fields/normalize.js'
import { describe, expect, it } from 'vitest'

import { buildSearchText } from '#component/lib/search.js'

describe('component lib search', () => {
  it('builds search text from system and searchable fields', () => {
    const fields = normalizeFields([
      { key: 'title', type: 'text', searchable: true, localized: true },
      {
        key: 'description',
        type: 'textarea',
        searchable: true,
        localized: true,
      },
      { key: 'bodyMdc', type: 'richtext', searchable: true, localized: true },
      { key: 'category', type: 'select', searchable: true },
      { key: 'hidden', type: 'text', searchable: false },
    ])

    const searchText = buildSearchText({
      values: {
        title: 'Hello **World**',
        description: 'Intro with [link](https://example.com)',
        bodyMdc: '# Heading\n\n`code`\n\nActual body',
        category: ['guides', 'release'],
        hidden: 'secret',
      },
      fields,
    })

    expect(searchText).toContain('Hello World')
    expect(searchText).toContain('Intro with link')
    expect(searchText).toContain('Heading')
    expect(searchText).toContain('Actual body')
    expect(searchText).toContain('guides')
    expect(searchText).not.toContain('secret')
    expect(searchText).not.toContain('https://example.com')
  })
})
