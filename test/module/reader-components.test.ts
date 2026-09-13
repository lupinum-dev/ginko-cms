import { describe, expect, it } from 'vitest'

import { readerComponentTemplate } from '../../packages/cms/src/module/reader-components'

describe('Studio reader imports', () => {
  it('imports only authoring-selected Nuxt components with the declared export', () => {
    const source = readerComponentTemplate(
      {
        collections: {
          docs: {
            fields: {},
            authoring: {
              implementation: {
                note: { componentName: 'ReaderNote' },
                server: { componentName: 'ServerOnly' },
              },
            },
          },
        },
      },
      [
        {
          pascalName: 'ReaderNote',
          kebabName: 'reader-note',
          filePath: '/components/Note.vue',
          shortPath: 'Note.vue',
          export: 'Note',
          mode: 'all',
          chunkName: 'note',
        },
        {
          pascalName: 'SecretWidget',
          kebabName: 'secret-widget',
          filePath: '/components/Secret.vue',
          shortPath: 'Secret.vue',
          export: 'default',
          mode: 'all',
          chunkName: 'secret',
        },
        {
          pascalName: 'ServerOnly',
          kebabName: 'server-only',
          filePath: '/components/Server.vue',
          shortPath: 'Server.vue',
          export: 'default',
          mode: 'server',
          chunkName: 'server',
        },
      ],
    )
    expect(source).toContain('import("/components/Note.vue")')
    expect(source).toContain('module["Note"]')
    expect(source).not.toContain('Secret')
    expect(source).not.toContain('Server.vue')
  })
})
