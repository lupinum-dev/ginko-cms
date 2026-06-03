import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { loadGinkoContentCollections } from '../../packages/cms/src/module/content-contract'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const contentConfigImport = resolve(packageRoot, '../ginko-content/packages/content/src/config')

describe('ginko-content contract derivation', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('derives CMS collections from content.config.ts without duplicated ginkoCms.collections', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-content-contract-'))
    tempDirs.push(rootDir)
    writeFileSync(
      join(rootDir, 'content.config.ts'),
      `
        import { z } from 'zod'
        import { defineCollection, defineContentConfig, fields, reference } from '${contentConfigImport}'

        export const docs = defineCollection({
          type: 'page',
          source: '1.docs/**/*',
          i18n: true,
          route: { en: '/docs', de: '/dokumentation' },
          cms: { type: 'tree', icon: 'lucide:book-open' }
        })

        export const posts = defineCollection({
          type: 'page',
          source: '3.blog/**/*',
          i18n: true,
          route: '/blog',
          schema: z.object({
            image: z.object({ src: z.string() }),
            authors: z.array(reference('authors')),
            links: z.array(z.object({
              label: z.string(),
              to: z.string(),
              icon: z.string().optional()
            })),
            tags: z.array(z.string()),
            date: z.coerce.date(),
            featured: z.boolean().optional()
          })
        })

        export const authors = defineCollection({
          type: 'page',
          source: '5.authors/**/*',
          i18n: true,
          route: { en: '/authors', de: '/autoren' },
          schema: z.object({
            name: z.string(),
            description: z.string(),
            avatar: fields.object({
              src: fields.image({ aspectRatio: '1:1', accept: ['image/png'] }).required(),
              alt: fields.text()
            }).required(),
            bio: fields.richtext().label('Biography'),
            primaryAuthor: fields.relation('authors')
          })
        })

        export const pricing = defineCollection({
          type: 'page',
          source: '2.pricing.yml',
          i18n: true,
          route: { en: '/pricing', de: '/preise' }
        })

        export default defineContentConfig({ collections: { docs, posts, authors, pricing } })
      `,
      'utf8',
    )

    const collections = await loadGinkoContentCollections({
      rootDir,
      defaultLocale: 'en',
      locales: [
        { code: 'en', isDefault: true },
        { code: 'de', fallback: 'en' },
      ],
    })

    expect(collections.docs).toMatchObject({
      label: 'Docs',
      icon: 'lucide:book-open',
      type: 'tree',
      locales: ['en', 'de'],
      routing: {
        pathPrefix: '/docs',
        slugMode: 'shared',
      },
      settings: {
        localizedPathPrefixes: {
          en: '/docs',
          de: '/dokumentation',
        },
      },
    })
    expect(collections.docs.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'title', type: 'text', localized: true }),
        expect.objectContaining({ key: 'description', type: 'textarea', localized: true }),
        expect.objectContaining({ key: 'bodyMdc', type: 'richtext', localized: true }),
      ]),
    )
    expect(collections.posts.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'authors',
          type: 'relations',
          localized: false,
          relation: { collectionId: 'authors', multiple: true },
        }),
        expect.objectContaining({
          key: 'links',
          type: 'array',
          fields: expect.arrayContaining([
            expect.objectContaining({ key: 'label', type: 'text' }),
            expect.objectContaining({ key: 'to', type: 'text' }),
            expect.objectContaining({ key: 'icon', type: 'text', required: false }),
          ]),
        }),
        expect.objectContaining({ key: 'tags', type: 'json' }),
        expect.objectContaining({ key: 'date', type: 'date', localized: false }),
        expect.objectContaining({ key: 'featured', type: 'toggle', required: false }),
      ]),
    )
    expect(collections.authors).toMatchObject({
      settings: {
        localizedPathPrefixes: {
          en: '/authors',
          de: '/autoren',
        },
      },
    })
    expect(collections.authors.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'avatar',
          type: 'object',
          required: true,
          fields: expect.arrayContaining([
            expect.objectContaining({
              key: 'src',
              type: 'image',
              required: true,
              localized: false,
              media: {
                aspectRatio: '1:1',
                accept: ['image/png'],
              },
            }),
            expect.objectContaining({ key: 'alt', type: 'text', required: false }),
          ]),
        }),
        expect.objectContaining({
          key: 'bio',
          type: 'richtext',
          label: 'Biography',
          required: false,
        }),
        expect.objectContaining({
          key: 'primaryAuthor',
          type: 'relation',
          relation: { collectionId: 'authors', multiple: false },
          localized: false,
          required: false,
        }),
      ]),
    )
    expect(collections.pricing).toMatchObject({
      routing: {
        pathPrefix: '/pricing',
        singleton: true,
      },
      settings: {
        localizedSingletonPaths: {
          en: '/pricing',
          de: '/preise',
        },
      },
    })
  })

  it('applies the Nuxt content translated-slug mode to derived i18n collections', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-content-contract-slugs-'))
    tempDirs.push(rootDir)
    writeFileSync(
      join(rootDir, 'content.config.ts'),
      `
        import { defineCollection, defineContentConfig } from '${contentConfigImport}'

        export const docs = defineCollection({
          type: 'page',
          source: '1.docs/**/*',
          i18n: true,
          route: { en: '/docs', de: '/dokumentation' },
          cms: { type: 'tree' }
        })

        export default defineContentConfig({ collections: { docs } })
      `,
      'utf8',
    )

    const collections = await loadGinkoContentCollections({
      rootDir,
      defaultLocale: 'en',
      locales: [
        { code: 'en', isDefault: true },
        { code: 'de', fallback: 'en' },
      ],
      translatedSlugs: true,
    })

    expect(collections.docs?.routing.slugMode).toBe('localized')
  })

  it('uses explicit overrides as the escape hatch', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-content-contract-overrides-'))
    tempDirs.push(rootDir)
    writeFileSync(
      join(rootDir, 'content.config.ts'),
      `
        import { defineCollection, defineContentConfig } from '${contentConfigImport}'
        export const pages = defineCollection({
          type: 'page',
          source: '*.md',
          route: '/'
        })
        export default defineContentConfig({ collections: { pages } })
      `,
      'utf8',
    )

    const collections = await loadGinkoContentCollections({
      rootDir,
      defaultLocale: 'en',
      locales: [{ code: 'en', isDefault: true }],
      overrides: {
        pages: {
          label: 'Marketing Pages',
          routing: { singleton: true },
        },
      },
    })

    expect(collections.pages).toMatchObject({
      label: 'Marketing Pages',
      routing: {
        pathPrefix: '/',
        singleton: true,
      },
    })
  })
})
