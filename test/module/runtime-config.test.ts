import { describe, expect, it } from 'vitest'

import { buildPublicRuntimeCollections } from '../../packages/cms/src/module/runtime-config.js'

describe('module public runtime config', () => {
  it('exposes collection fields and settings for studio fallback metadata', () => {
    const collections = buildPublicRuntimeCollections(
      {
        collections: {
          docs: {
            label: 'Docs',
            icon: 'book',
            type: 'tree',
            routing: { pathPrefix: '/docs', slugMode: 'shared', rootSlug: null },
            fields: [{ key: 'summary', type: 'text' }],
            settings: { editorPreview: true },
          },
        },
      } as never,
      {
        defaultLocale: 'en',
        locales: [{ code: 'en', label: 'English', isDefault: true }],
      },
    )

    expect(collections.docs).toEqual({
      label: 'Docs',
      icon: 'book',
      type: 'tree',
      routing: { pathPrefix: '/docs', slugMode: 'shared', rootSlug: null },
      locales: ['en'],
      fields: [{ key: 'summary', type: 'text' }],
      settings: { editorPreview: true },
    })
  })
})
