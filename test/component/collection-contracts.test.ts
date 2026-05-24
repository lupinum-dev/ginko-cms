/// <reference types="vite/client" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCollectionContractsBridge } from '../../packages/cms/src/bridge/collections.js'
import { getCmsErrorData } from '../../packages/cms/src/public/utils/cmsErrors.js'
import { createCtx, seedOwner, seedSettings, seedEditorFixture } from './entries/helpers'

const api = anyApi
const oldSchemaMutationNames = [
  'createCollection',
  'updateCollection',
  'deleteCollection',
  'addField',
  'updateField',
  'removeField',
  'reorderFields',
  'previewFieldRemoval',
] as const

async function syncCollections(
  ctx: ReturnType<typeof createCtx>,
  collections: Array<Record<string, unknown>>,
) {
  return ctx.raw.mutation(api.collections.sync.installCollectionContractsInternal, {
    collections,
  })
}

describe('code-defined collection contracts', () => {
  it('exposes contract sync only through internal generated bridge functions', () => {
    const bridge = createCollectionContractsBridge({
      component: {
        query: (definition: unknown) => ({ visibility: 'public', definition }),
        mutation: (definition: unknown) => ({ visibility: 'public', definition }),
        internalQuery: (definition: unknown) => ({ visibility: 'internal', definition }),
        internalMutation: (definition: unknown) => ({ visibility: 'internal', definition }),
      } as any,
      components: {
        listCollections: {} as any,
        getCollection: {} as any,
        sync: {
          checkCollectionContractsInternal: {} as any,
          installCollectionContractsInternal: {} as any,
        },
      },
    }) as any

    expect(bridge.checkCollectionContracts.visibility).toBe('internal')
    expect(bridge.installCollectionContracts.visibility).toBe('internal')
    expect(bridge.checkCollectionContractsAuthed).toBeUndefined()
    expect(bridge.installCollectionContractsAuthed).toBeUndefined()
  })

  it('installs code-defined collection contract snapshots and skips unchanged ones', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await syncCollections(ctx, [
      {
        slug: 'blog',
        label: { en: 'Blog' },
        type: 'flat',
        routing: { pathPrefix: '/blog' },
        locales: ['en'],
        fields: [],
      },
      {
        slug: 'docs',
        label: { en: 'Docs' },
        type: 'tree',
        routing: { pathPrefix: '/docs', rootSlug: 'intro' },
        locales: ['en'],
        fields: [],
      },
    ])

    expect(result).toEqual({ created: 2, updated: 0, skipped: 0, missingFromConfig: [] })

    const firstBlog = await owner.query(api.collections.getCollection, { slug: 'blog' })
    expect(firstBlog?.contract).toEqual({
      source: 'code',
      version: expect.stringMatching(/^v1-[0-9a-f]{8}$/),
    })

    const secondRun = await syncCollections(ctx, [
      {
        slug: 'blog',
        label: { en: 'Blog' },
        type: 'flat',
        routing: { pathPrefix: '/blog' },
        locales: ['en'],
        fields: [],
      },
    ])

    expect(secondRun).toEqual({ created: 0, updated: 0, skipped: 1, missingFromConfig: [] })

    const secondBlog = await owner.query(api.collections.getCollection, { slug: 'blog' })
    expect(secondBlog?.contract).toEqual(firstBlog?.contract)

    const list = await owner.query(api.collections.listCollections, {})
    expect(list.map((collection: any) => collection.slug).sort()).toEqual(['blog'])
  })

  it('rejects invalid field definitions during collection sync', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    await expect(
      syncCollections(ctx, [
        {
          slug: 'blog',
          label: { en: 'Blog' },
          type: 'flat',
          routing: { pathPrefix: '/blog' },
          locales: ['en'],
          fields: [{ key: 'author', type: 'relation' }],
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      expect(getCmsErrorData(error)).toMatchObject({
        code: 'FIELD_DEFINITION_INVALID_RELATION',
        details: { field: 'author', type: 'relation' },
      })
      return true
    })

    await expect(
      syncCollections(ctx, [
        {
          slug: 'blog',
          label: { en: 'Blog' },
          type: 'flat',
          routing: { pathPrefix: '/blog' },
          locales: ['en'],
          fields: [{ key: 'status', type: 'select' }],
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      expect(getCmsErrorData(error)).toMatchObject({
        code: 'FIELD_DEFINITION_INVALID_OPTIONS',
        details: { field: 'status', type: 'select' },
      })
      return true
    })

    await expect(
      syncCollections(ctx, [
        {
          slug: 'blog',
          label: { en: 'Blog' },
          type: 'flat',
          routing: { pathPrefix: '/blog' },
          locales: ['en'],
          fields: [{ key: 'seo', type: 'object' }],
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      expect(getCmsErrorData(error)).toMatchObject({
        code: 'FIELD_DEFINITION_INVALID_NESTED_FIELDS',
        details: { field: 'seo', type: 'object' },
      })
      return true
    })

    await expect(
      syncCollections(ctx, [
        {
          slug: 'blog',
          label: { en: 'Blog' },
          type: 'flat',
          routing: { pathPrefix: '/blog' },
          locales: ['en'],
          fields: [{ key: 'hero', type: 'image', media: { accept: ['not-a-mime'] } }],
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      expect(getCmsErrorData(error)).toMatchObject({
        code: 'FIELD_DEFINITION_INVALID_MEDIA',
        details: { field: 'hero', type: 'image' },
      })
      return true
    })
  })

  it('reconciles existing synced collections when they have no entries', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await syncCollections(ctx, [
      {
        slug: 'blog',
        label: { en: 'Old Blog' },
        type: 'tree',
        routing: { pathPrefix: '/old-blog', rootSlug: 'start' },
        locales: ['en'],
        fields: [],
      },
    ])

    const result = await syncCollections(ctx, [
      {
        slug: 'blog',
        label: { en: 'Blog' },
        icon: 'lucide:book-open',
        type: 'flat',
        routing: { pathPrefix: '/blog', singleton: true },
        locales: ['en', 'de'],
        fields: [{ key: 'author', type: 'text', order: 0 }],
        settings: { source: 'config' },
      },
    ])

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, missingFromConfig: [] })

    const updated = await owner.query(api.collections.getCollection, { slug: 'blog' })
    expect(updated).toMatchObject({
      label: 'Blog',
      icon: 'lucide:book-open',
      type: 'flat',
      pathPrefix: '/blog',
      slugMode: 'shared',
      rootSlug: null,
      singleton: true,
      locales: ['en', 'de'],
      settings: { source: 'config' },
    })
    expect(updated.fields).toHaveLength(1)
    expect(updated.fields[0]).toMatchObject({ key: 'author', type: 'text' })
  })

  it('rejects incompatible contract changes when entries exist', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    await expect(
      syncCollections(ctx, [
        {
          slug: 'posts',
          label: { en: 'Articles' },
          icon: 'lucide:newspaper',
          type: 'tree',
          routing: {
            pathPrefix: '/articles',
            slugMode: 'localized',
            rootSlug: 'home',
          },
          locales: ['en', 'de'],
          fields: [{ key: 'author', type: 'text', order: 0 }],
          settings: { source: 'config' },
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      const data = getCmsErrorData(error)
      expect(data).toMatchObject({
        code: 'COLLECTION_CONTRACT_CHANGE_REQUIRES_MIGRATION',
        details: {
          slug: 'posts',
          changes: ['type', 'routing', 'fields'],
          docs: 'docs/changing-collections.md#when-a-migration-is-required',
        },
      })
      expect(data?.message).toContain('Run `pnpm exec ginko-cms push --check`')
      expect(data?.message).toContain(
        'Development-only table resets are not a production migration path',
      )
      return true
    })
  })

  it('rejects schema artifact changes when entries exist', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    await expect(
      syncCollections(ctx, [
        {
          slug: 'posts',
          label: { en: 'Posts' },
          type: 'flat',
          routing: { pathPrefix: '/posts' },
          locales: ['en'],
          fields: [
            { key: 'title', type: 'text', localized: true, searchable: true },
            { key: 'hero', type: 'image', localized: false },
            { key: 'description', type: 'textarea', localized: true, searchable: true },
          ],
          settings: {
            cmsSchema: {
              artifactId: 'cms-schema:posts:v2',
              checksum: 'schema-checksum-v2',
              artifact: '{"root":{"kind":"object"}}',
            },
          },
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      const data = getCmsErrorData(error)
      expect(data).toMatchObject({
        code: 'COLLECTION_CONTRACT_CHANGE_REQUIRES_MIGRATION',
        details: {
          slug: 'posts',
          changes: ['schema'],
        },
      })
      return true
    })
  })

  it('reports actionable drift details for live collection changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const result = await ctx.raw.query(api.collections.sync.checkCollectionContractsInternal, {
      collections: [
        {
          slug: 'posts',
          label: { en: 'Articles' },
          type: 'flat',
          routing: { pathPrefix: '/posts' },
          locales: ['en'],
          fields: [
            { key: 'title', type: 'text', localized: true, searchable: true },
            { key: 'summary', type: 'textarea', localized: true, required: true },
          ],
        },
        {
          slug: 'authors',
          label: { en: 'Authors' },
          type: 'flat',
          routing: { pathPrefix: '/authors' },
          locales: ['en'],
          fields: [],
        },
      ],
    })

    expect(result.drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'posts',
          reason: 'different',
          entryCount: 1,
          migrationRequired: true,
          safeToPush: false,
          changes: expect.arrayContaining([
            expect.objectContaining({ kind: 'label_changed', safe: true }),
            expect.objectContaining({
              kind: 'field_added',
              field: 'summary',
              required: true,
              safe: false,
            }),
            expect.objectContaining({ kind: 'field_removed', field: 'hero', safe: false }),
            expect.objectContaining({
              kind: 'field_removed',
              field: 'description',
              safe: false,
            }),
          ]),
        }),
        expect.objectContaining({
          slug: 'authors',
          reason: 'missing',
          entryCount: 0,
          migrationRequired: false,
          safeToPush: true,
        }),
      ]),
    )
  })

  it('allows optional field additions when entries exist', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await syncCollections(ctx, [
      {
        slug: 'posts',
        label: { en: 'Posts' },
        type: 'flat',
        routing: { pathPrefix: '/posts' },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          { key: 'hero', type: 'image', localized: false },
          { key: 'description', type: 'textarea', localized: true, searchable: true },
          { key: 'summary', type: 'textarea', localized: true },
        ],
      },
    ])

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, missingFromConfig: [] })

    const updated = await owner.query(api.collections.getCollection, { slug: 'posts' })
    expect(updated.fields.map((field: any) => field.key)).toEqual([
      'title',
      'hero',
      'description',
      'summary',
    ])
  })

  it('applies safe config changes when entries exist', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await syncCollections(ctx, [
      {
        slug: 'posts',
        label: { en: 'Articles' },
        icon: 'lucide:newspaper',
        type: 'flat',
        routing: { pathPrefix: '/posts' },
        locales: ['en'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          { key: 'hero', type: 'image', localized: false },
          { key: 'description', type: 'textarea', localized: true, searchable: true },
        ],
        settings: { source: 'config' },
      },
    ])

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, missingFromConfig: [] })

    const updated = await owner.query(api.collections.getCollection, { slug: 'posts' })
    expect(updated).toMatchObject({
      label: 'Articles',
      icon: 'lucide:newspaper',
      type: 'flat',
      pathPrefix: '/posts',
      slugMode: 'shared',
      locales: ['en'],
      settings: { source: 'config' },
    })
  })

  it('does not expose old mutable schema mutation APIs', () => {
    const collectionsExports = readFileSync(
      join(process.cwd(), 'packages/convex/src/collections.ts'),
      'utf8',
    )
    const collectionSchemas = readFileSync(
      join(process.cwd(), 'packages/contract/src/schemas/collections.ts'),
      'utf8',
    )
    const collectionsBridge = readFileSync(
      join(process.cwd(), 'packages/cms/src/bridge/collections.ts'),
      'utf8',
    )

    for (const operation of oldSchemaMutationNames) {
      expect(collectionsExports).not.toMatch(new RegExp(`\\b${operation}\\b`))
      expect(collectionSchemas).not.toMatch(new RegExp(`export const ${operation}\\b`))
      expect(collectionsBridge).not.toMatch(new RegExp(`exportName:\\s*['"]${operation}['"]`))
    }
    expect(collectionsBridge).not.toMatch(/exportName:\s*['"]syncCodeDefinedCollections['"]/)
    expect(collectionsBridge).not.toMatch(
      /exportName:\s*['"]cleanupMissingCodeDefinedCollections['"]/,
    )
    expect(collectionsExports).not.toContain('./collections/crud.js')
    expect(collectionsBridge).not.toContain('createCollectionsBridge')
  })
})
