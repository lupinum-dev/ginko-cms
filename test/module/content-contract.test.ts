import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { hashCanonicalJson } from '@lupinum/ginko-content/cms-contract'
import { afterEach, describe, expect, it } from 'vitest'

import {
  loadGinkoContentContract,
  projectContractCollections,
} from '../../packages/cms/src/module/content-contract'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const contentConfigImport = resolve(packageRoot, '../ginko-content/packages/content/src/config')

describe('ginko-content contract derivation', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  function fixture(source: string) {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-content-contract-'))
    tempDirs.push(rootDir)
    writeFileSync(join(rootDir, 'content.config.ts'), source, 'utf8')
    return rootDir
  }

  it('loads the exact semantic contract and projects CMS operations from it', async () => {
    const rootDir = fixture(`
      import { z } from 'zod'
      import { defineCollection, defineContentConfig, fields, reference } from '${contentConfigImport}'

      const posts = defineCollection({
        type: 'page',
        source: 'content/posts/**/*.md',
        i18n: true,
        route: { en: '/posts', de: '/beitraege' },
        schema: z.object({
          authors: z.array(reference('authors')),
          hero: fields.image({ aspectRatio: '16:9', accept: ['image/webp'] }),
        }),
      })
      const authors = defineCollection({ type: 'page', source: 'content/authors/**/*.md', route: '/authors' })
      export default defineContentConfig({ collections: { posts, authors } })
    `)

    const contract = await loadGinkoContentContract({
      rootDir,
      content: {
        defaultLocale: 'en',
        locales: ['en', 'de'],
        fallback: { de: ['en'] },
      },
    })
    const projected = projectContractCollections(contract)

    expect(contract).toMatchObject({
      format: 'ginko-content-contract',
      version: 1,
      defaultLocale: 'en',
      locales: ['en', 'de'],
      localeFallbacks: { en: [], de: ['en'] },
    })
    expect(JSON.stringify(contract)).not.toMatch(/"(?:label|icon|hidden|width)":/)
    expect(projected.posts).toMatchObject({
      label: 'Posts',
      type: 'flat',
      locales: ['en', 'de'],
      routing: { pathPrefix: '/posts', slugMode: 'shared' },
      settings: { defaultLocale: 'en' },
    })
    expect(projected.posts?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'authors',
          type: 'relations',
          relation: { collectionId: 'authors', multiple: true },
        }),
        expect.objectContaining({
          key: 'hero',
          type: 'image',
          media: { aspectRatio: '16:9', accept: ['image/webp'] },
        }),
      ]),
    )
  })

  it('takes translated slug policy only from Content i18n config', async () => {
    const rootDir = fixture(`
      import { defineCollection, defineContentConfig } from '${contentConfigImport}'
      const docs = defineCollection({
        type: 'page', source: 'content/docs/**/*.md', i18n: true,
        route: { en: '/docs', de: '/dokumentation' }, cms: { type: 'tree' }
      })
      export default defineContentConfig({ collections: { docs } })
    `)

    const contract = await loadGinkoContentContract({
      rootDir,
      content: { defaultLocale: 'en', locales: ['en', 'de'], translatedSlugs: true },
    })

    expect(contract.collections.docs?.routing.slugMode).toBe('localized')
    expect(projectContractCollections(contract).docs?.routing.slugMode).toBe('localized')
  })

  it('keeps presentation-only layout outside the canonical contract', async () => {
    const rootDir = fixture(`
      import { defineCollection, defineContentConfig } from '${contentConfigImport}'
      const pages = defineCollection({ type: 'page', source: 'content/pages/**/*.md', route: '/' })
      export default defineContentConfig({ collections: { pages } })
    `)
    const contract = await loadGinkoContentContract({ rootDir })
    const before = await hashCanonicalJson(contract)
    const projected = projectContractCollections(contract, {
      collections: {
        pages: {
          label: 'Marketing Pages',
          icon: 'lucide:file',
          fields: { title: { label: 'Page title', width: 'half' } },
        },
      },
    })

    expect(projected.pages).toMatchObject({ label: 'Marketing Pages', icon: 'lucide:file' })
    expect(projected.pages?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'title', label: 'Page title', width: 'half' }),
      ]),
    )
    expect(await hashCanonicalJson(contract)).toBe(before)
    expect(() =>
      projectContractCollections(contract, {
        collections: { missing: { fields: {} } },
      }),
    ).toThrow(/unknown collection "missing"/)
    expect(() =>
      projectContractCollections(contract, {
        collections: {
          pages: { fields: {}, routing: { pathPrefix: '/override' } } as never,
        },
      }),
    ).toThrow(/unknown key "routing"/)
  })
})
