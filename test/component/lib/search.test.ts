import { normalizeFields } from '@lupinum/ginko-cms-contract/shared/fields/normalize.js'
import { describe, expect, it } from 'vitest'

import { buildSearchText } from '#component/lib/search.js'

describe('component lib search', () => {
  it('builds search text from text-like and opted-in fields', () => {
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
      { key: 'tone', type: 'select' },
    ])

    const searchText = buildSearchText({
      values: {
        title: 'Hello **World**',
        description: 'Intro with [link](https://example.com)',
        bodyMdc: '# Heading\n\n`code`\n\nActual body',
        category: ['guides', 'release'],
        tone: 'confidential-tone',
      },
      fields,
    })

    expect(searchText).toContain('Hello World')
    expect(searchText).toContain('Intro with link')
    expect(searchText).toContain('Heading')
    expect(searchText).toContain('Actual body')
    expect(searchText).toContain('guides')
    expect(searchText).not.toContain('confidential-tone')
    expect(searchText).not.toContain('https://example.com')
  })

  it('indexes text-like fields even when normalization stored searchable: false', () => {
    // Contract normalizers (ginko-content resolved contracts and shared
    // normalizeField) persist `searchable ?? false`, so fields the author
    // never opted in arrive as a concrete `false`. Text-like types must
    // still be indexed — treating that `false` as opt-out left titles and
    // descriptions out of every search index.
    const fields = normalizeFields([
      { key: 'title', type: 'text', localized: true },
      { key: 'description', type: 'textarea', localized: true },
      { key: 'featured', type: 'toggle' },
    ])
    expect(fields.every((field) => field.searchable === false)).toBe(true)

    const searchText = buildSearchText({
      values: {
        title: 'Designing a calmer CMS',
        description: 'Why quieter defaults win',
        featured: true,
      },
      fields,
    })

    expect(searchText).toContain('Designing a calmer CMS')
    expect(searchText).toContain('Why quieter defaults win')
  })
})
