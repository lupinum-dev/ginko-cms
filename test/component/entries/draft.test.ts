/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  publishEntry,
  revertDraftToPublished,
  seedOwner,
  seedSettings,
  seedEditorFixture,
  seedMultiLocaleSettings,
  unpublishEntry,
} from './helpers'

type EntryDraftRow = {
  entryId: string
  locale: string | null
  values?: Record<string, unknown>
}
type EntryLocaleView = {
  locale: string
  publishedData?: Record<string, unknown>
}

const api = anyApi

describe('editor draft mutations', () => {
  it('saves shared draft changes without creating autosave history', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const saveResult = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          shared: { featured: true },
        },
      },
    })

    expect(saveResult).toEqual({
      draftVersion: 2,
      dirtyLocales: ['en'],
    })

    const savedEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(savedEntry?.draft).toMatchObject({ featured: true })
    expect(savedEntry?.draftVersion).toBe(2)
    expect(savedEntry?.dirtyLocales).toEqual(['en'])

    expect(await ctx.readAll('entryRevisions')).toEqual([])
  })

  it('returns a structured error for concurrent shared draft saves', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.editor.saveEntryDraft, {
        entryId,
        expectedDraftVersion: 999,
        patch: {
          shared: {
            shared: { featured: true },
          },
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_CONCURRENT_EDIT'
    })
  })

  it('saves localized draft state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: {
              title: 'Updated title',
              description: 'Short summary',
            },
          },
        },
      },
    })

    expect(result).toEqual({
      draftVersion: 2,
      dirtyLocales: ['en'],
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.data.title).toBe('Updated title')
    expect(entry?.data.description).toBe('Short summary')
    expect(entry?.localeData?.draft.values.title).toBe('Updated title')
    expect(entry?.draftVersion).toBe(2)

    expect(await ctx.readAll('entryRevisions')).toEqual([])
  })

  it('returns rich text draft state separately from localized values', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: {
              title: 'Updated title',
              description: 'Short summary',
            },
            bodyMdc: '# Updated title\n\nRich text body.',
          },
        },
      },
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })

    expect(entry?.localeData?.draft.bodyMdc).toBe('# Updated title\n\nRich text body.')
    expect(entry?.localeData?.draft.values).not.toHaveProperty('bodyMdc')
    expect(entry?.locales[0]?.draft.bodyMdc).toBe('# Updated title\n\nRich text body.')
    expect(entry?.locales[0]?.draft.values).not.toHaveProperty('bodyMdc')
  })

  it('saves slug, shared, and localized draft state through one command', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          slug: 'updated-slug',
          shared: { featured: true },
        },
        locales: {
          en: {
            values: {
              title: 'Updated title',
              description: 'Short summary',
            },
          },
        },
      },
    })

    expect(result).toEqual({
      draftVersion: 2,
      dirtyLocales: ['en'],
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.slug).toBe('updated-slug')
    expect(entry?.draft).toMatchObject({ featured: true })
    expect(entry?.data.title).toBe('Updated title')
    expect(entry?.data.description).toBe('Short summary')
    expect(entry?.draftVersion).toBe(2)
    expect(await ctx.readAll('entryRevisions')).toEqual([])
  })

  it('skips save when shared draft has no changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          shared: {},
        },
      },
    })

    expect(result.draftVersion).toBe(1)
  })

  it('skips save when localized draft has no changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: {
              title: 'Hello world',
            },
          },
        },
      },
    })

    expect(result.draftVersion).toBe(1)
  })

  it('skips save when slug draft has no changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          slug: 'hello-world',
        },
      },
    })

    expect(result.draftVersion).toBe(1)
  })

  it('saves shared slugs and recomputes the draft path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const result = await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        shared: {
          slug: 'renamed-post',
        },
      },
    })

    expect(result).toEqual({
      draftVersion: 2,
      dirtyLocales: ['en'],
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.baseSlug).toBe('renamed-post')
    expect(entry?.path).toBe('/posts/renamed-post')
    expect(entry?.draftVersion).toBe(2)
  })

  it('revertDraftToPublished removes draft-only locale variants before reporting clean', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'posts',
        label: { en: 'Posts' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/posts',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.mutation(api.editor.createEntry, {
      collection: 'posts',
      slug: 'hello-world',
      localized: { title: 'Hello world' },
    })

    await publishEntry(owner, entryId)
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId,
      locale: 'de',
    })

    const reverted = await revertDraftToPublished(owner, entryId)
    expect(reverted.dirtyLocales).toEqual([])

    const localeRows = ((await ctx.readAll('entryDrafts')) as EntryDraftRow[]).filter(
      (row) => row.entryId === entryId,
    )
    expect(new Set(localeRows.map((row) => row.locale))).toEqual(new Set([null, 'en']))

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.dirtyLocales).toEqual([])
  })

  it('rebuilds localized search text after localized draft save', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: {
              title: 'Updated title',
            },
          },
        },
      },
    })
    const localeRow = ((await ctx.readAll('entryDrafts')) as EntryDraftRow[]).find(
      (row) => row.entryId === entryId && row.locale === 'en',
    )
    expect(localeRow?.values.title).toBe('Updated title')
  })

  it('rejects localized locale creation when the localized path already exists', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'pages',
        label: { en: 'Pages' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/pages',
          slugMode: 'localized',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const leftId = await owner.mutation(api.editor.createEntry, {
      collection: 'pages',
      slug: 'left',
      localized: { title: 'Left' },
    })
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId: leftId,
      locale: 'de',
    })
    const leftEntry = await owner.query(api.editor.getEntry, {
      id: leftId,
      locale: 'de',
    })
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId: leftId,
      expectedDraftVersion: leftEntry.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'gemeinsam',
          },
        },
      },
    })

    const rightId = await owner.mutation(api.editor.createEntry, {
      collection: 'pages',
      slug: 'gemeinsam',
      localized: { title: 'Right' },
    })

    await expect(
      owner.mutation(api.editor.createLocaleVariant, {
        entryId: rightId,
        locale: 'de',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_PATH_CONFLICT'
    })
  })
})

describe('studio published shared-field reconstruction', () => {
  async function seedSharedFieldCollection(ctx: ReturnType<typeof createCtx>) {
    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'pages',
        label: { en: 'Pages' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/pages',
          slugMode: 'shared',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [
          { key: 'title', type: 'text', localized: true, searchable: true },
          { key: 'featured', type: 'checkbox', localized: false },
        ],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )
  }

  it('exposes published shared field values in Studio after publish', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    await seedSharedFieldCollection(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.mutation(api.editor.createEntry, {
      collection: 'pages',
      slug: 'hello-world',
      shared: { featured: true },
      localized: { title: 'Hello world' },
    })

    await publishEntry(owner, entryId)

    const published = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(published).not.toBeNull()
    expect(published.published).toEqual(expect.objectContaining({ featured: true }))
    const englishLocale = (published.locales as EntryLocaleView[]).find(
      (row) => row.locale === 'en',
    )
    expect(englishLocale).toBeDefined()
    expect(englishLocale.publishedData).toEqual(
      expect.objectContaining({
        title: 'Hello world',
        featured: true,
      }),
    )
  })

  it('drops published shared state when all locales are unpublished', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    await seedSharedFieldCollection(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.mutation(api.editor.createEntry, {
      collection: 'pages',
      slug: 'hello-world',
      shared: { featured: true },
      localized: { title: 'Hello world' },
    })

    await publishEntry(owner, entryId)
    await unpublishEntry(owner, entryId)

    const afterUnpublish = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(afterUnpublish.published).toBeNull()
    const englishLocale = (afterUnpublish.locales as EntryLocaleView[]).find(
      (row) => row.locale === 'en',
    )
    expect(englishLocale?.publishedData).toEqual({})
  })

  it('does not fabricate published shared data for unpublished locales', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    await seedSharedFieldCollection(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.mutation(api.editor.createEntry, {
      collection: 'pages',
      slug: 'hello-world',
      shared: { featured: true },
      localized: { title: 'Hello world' },
    })
    await owner.mutation(api.editor.createLocaleVariant, { entryId, locale: 'de' })
    const afterVariant = await owner.query(api.editor.getEntry, { id: entryId, locale: 'de' })
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: afterVariant.draftVersion,
      patch: {
        locales: { de: { values: { title: 'Hallo Welt' } } },
      },
    })

    await publishEntry(owner, entryId)

    const view = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(view.published).toEqual(expect.objectContaining({ featured: true }))
    const englishLocale = (view.locales as EntryLocaleView[]).find((row) => row.locale === 'en')
    expect(englishLocale?.publishedData).toEqual(
      expect.objectContaining({
        title: 'Hello world',
        featured: true,
      }),
    )
    const germanLocale = (view.locales as EntryLocaleView[]).find((row) => row.locale === 'de')
    expect(germanLocale?.publishedData).toEqual({})
  })
})

describe('stableId uniqueness', () => {
  it('generates unique stable IDs for entries in stable slug mode collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'blog',
        label: { en: 'Blog' },
        icon: null,
        type: 'flat',
        routing: {
          pathPrefix: '/blog',
          slugMode: 'stable',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')

    const entryId1 = await owner.mutation(api.editor.createEntry, {
      collection: 'blog',
      slug: 'first-post',
      localized: { title: 'First post' },
    })

    const entryId2 = await owner.mutation(api.editor.createEntry, {
      collection: 'blog',
      slug: 'second-post',
      localized: { title: 'Second post' },
    })

    const entry1 = await owner.query(api.editor.getEntry, {
      id: entryId1,
      locale: 'en',
    })
    const entry2 = await owner.query(api.editor.getEntry, {
      id: entryId2,
      locale: 'en',
    })

    expect(entry1?.stableId).toBeTruthy()
    expect(entry2?.stableId).toBeTruthy()
    expect(entry1?.stableId).not.toBe(entry2?.stableId)
  })
})
