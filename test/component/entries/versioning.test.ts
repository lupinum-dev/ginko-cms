/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  seedOwner,
  seedSettings,
  publishEntry,
  rollbackVersion,
  seedEditorFixture,
  seedMultiLocaleSettings,
} from './helpers'

type EntryDraftRow = {
  entryId: string
  locale: string | null
}

const api = anyApi

describe('editor version history', () => {
  it('rolls draft state back to a published version without autosave history', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const publishResult = await publishEntry(owner, entryId)
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: {
              title: 'Changed after publish',
            },
          },
        },
      },
    })

    const rollbackResult = await rollbackVersion(owner, {
      entryId,
      versionId: publishResult.versionId,
      publish: false,
    })
    expect(typeof rollbackResult.versionId).toBe('string')

    const rolledBackEntry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(rolledBackEntry?.data.title).toBe('Hello world')
    expect(rolledBackEntry?.localeData?.draft.values.title).toBe('Hello world')

    const versions = await owner.query(api.editor.listVersions, { entryId })
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      action: 'publish',
      isCurrentPublished: true,
    })
  })

  it('lists all versions in chronological order after multiple publishes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    // First publish
    await publishEntry(owner, entryId)

    // Edit and publish again
    // Publish does not bump draftVersion. Save bumps to 2.
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: { title: 'Updated title' },
          },
        },
      },
    })
    // Publish does not bump draftVersion.
    await publishEntry(owner, entryId)

    // Edit and publish a third time
    // Save bumps to 3.
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          en: {
            values: { title: 'Third revision' },
          },
        },
      },
    })
    // After save: draftVersion=5. Publish bumps to 6.
    await publishEntry(owner, entryId)

    const versions = await owner.query(api.editor.listVersions, { entryId })

    // Newest first
    expect(versions).toHaveLength(3)
    expect(versions[0].action).toBe('publish')
    expect(versions[0].isCurrentPublished).toBe(true)
    expect(versions[1].action).toBe('publish')
    expect(versions[1].isCurrentPublished).toBe(false)
    expect(versions[2].action).toBe('publish')
    expect(versions[2].isCurrentPublished).toBe(false)
  })

  it('rollback restores the content of a specific version', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    // Publish v1 with original title
    const v1 = await publishEntry(owner, entryId)

    // Edit and publish v2: publish does not bump draftVersion, save->2.
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: { title: 'Version two title' },
          },
        },
      },
    })
    const v2 = await publishEntry(owner, entryId)

    // Edit and publish v3: save->3.
    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 2,
      patch: {
        locales: {
          en: {
            values: { title: 'Version three title' },
          },
        },
      },
    })
    await publishEntry(owner, entryId)

    // Rollback to v1 (original "Hello world")
    await rollbackVersion(owner, {
      entryId,
      versionId: v1.versionId,
      publish: false,
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.localeData?.draft.values.title).toBe('Hello world')

    // Rollback to v2
    await rollbackVersion(owner, {
      entryId,
      versionId: v2.versionId,
      publish: false,
    })

    const entry2 = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry2?.localeData?.draft.values.title).toBe('Version two title')
  })

  it('restore and publish creates a new live rollback version', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const v1 = await publishEntry(owner, entryId)

    await owner.mutation(api.editor.saveEntryDraft, {
      entryId,
      expectedDraftVersion: 1,
      patch: {
        locales: {
          en: {
            values: { title: 'Version two title' },
          },
        },
      },
    })
    await publishEntry(owner, entryId)

    const rollbackResult = await rollbackVersion(owner, {
      entryId,
      versionId: v1.versionId,
      publish: true,
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.localeData?.draft.values.title).toBe('Hello world')
    expect(entry?.localeData?.published?.values.title).toBe('Hello world')
    const rawEntry = (await ctx.readAll('entries')).find(
      (row: { _id: string }) => row._id === entryId,
    )
    expect(rawEntry?.latestRevisionId).toBe(rollbackResult.versionId)

    const versions = await owner.query(api.editor.listVersions, { entryId })
    expect(versions[0]).toMatchObject({
      action: 'rollback',
      displayAction: 'restoredPublished',
      isCurrentPublished: true,
    })
    expect(versions[1]).toMatchObject({
      action: 'publish',
      isCurrentPublished: false,
    })
  })

  it('rollback removes locale variants that did not exist in the target snapshot', async () => {
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

    const published = await publishEntry(owner, entryId)
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId,
      locale: 'de',
    })

    await rollbackVersion(owner, {
      entryId,
      versionId: published.versionId,
      publish: false,
    })

    const localeRows = ((await ctx.readAll('entryDrafts')) as EntryDraftRow[]).filter(
      (row) => row.entryId === entryId,
    )
    expect(new Set(localeRows.map((row) => row.locale))).toEqual(new Set([null, 'en']))
  })
})
