/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  currentDraftVersion,
  installTestContract,
  publishEntry,
  seedMember,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
  seedTreeFixture,
} from './helpers'

const api = anyApi

describe('canonical editor reads', () => {
  it('[CON-02] paginates flat inventory with opaque indexed cursors without loss or duplication', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    for (let index = 0; index < 7; index += 1) {
      await owner.createEntry({
        collection: 'posts',
        slug: `post-${index}`,
        localized: { title: `Post ${index}` },
      })
    }

    const seen: Array<{ _id: string; stableId: string; draftVersion: number }> = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const result = await owner.query(api.editor.listEntriesForStudio, {
        collection: 'posts',
        locale: 'en',
        parentEntryId: null,
        paginationOpts: { numItems: 2, cursor },
      })
      seen.push(...result.page)
      cursor = result.continueCursor
      isDone = result.isDone
    }

    expect(seen).toHaveLength(7)
    expect(new Set(seen.map((entry) => entry._id)).size).toBe(7)
    expect(seen.every((entry) => /^[0-9a-z]{5,6}$/.test(entry.stableId))).toBe(true)
    expect(seen.every((entry) => entry.draftVersion === 1)).toBe(true)

    await expect(
      owner.query(api.editor.listEntriesForStudio, {
        collection: 'posts',
        locale: 'en',
        parentEntryId: null,
        paginationOpts: { numItems: 2, cursor: 'not-a-convex-cursor' },
      }),
    ).rejects.toSatisfy((error: unknown) => getCmsErrorData(error)?.code === 'INVALID_CURSOR')
  })

  it('[LOC-02] creates an independent missing translation while shared relation identity and existing public output stay unchanged', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const authorId = await owner.createEntry({
      collection: 'authors',
      locale: 'en',
      slug: 'ada',
      localized: { name: 'Ada' },
    })
    const author = await owner.query(api.editor.getEntry, { id: authorId, locale: 'en' })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: authorId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId: authorId,
      expectedDraftVersion: await currentDraftVersion(owner, authorId),
      patch: { locales: { de: { values: { name: 'Ada Deutsch' } } } },
    })

    const postId = await owner.createEntry({
      collection: 'posts',
      locale: 'en',
      slug: 'exact-read',
      shared: { author: author.stableId },
      localized: { title: 'English title' },
    })
    await publishEntry(owner, postId, ['en'])
    const publicBeforeTranslation = structuredClone(await ctx.readAll('publicEntries'))
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: postId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    const blankGermanDraft = (await ctx.readAll('entryLocaleDrafts')).find(
      (row) => String(row.entryId) === postId && row.locale === 'de',
    )
    expect(blankGermanDraft).toMatchObject({
      slug: null,
      values: {},
      bodyMdc: '',
      version: 1,
    })
    await owner.saveEntryDraft({
      entryId: postId,
      expectedDraftVersion: await currentDraftVersion(owner, postId),
      patch: { locales: { de: { values: { title: 'Deutscher Titel' } } } },
    })
    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforeTranslation)

    const [english, german] = await Promise.all([
      owner.query(api.editor.getEntry, { id: postId, locale: 'en' }),
      owner.query(api.editor.getEntry, { id: postId, locale: 'de' }),
    ])

    expect(english.data).toMatchObject({ title: 'English title', author: author.stableId })
    expect(german.data).toMatchObject({ title: 'Deutscher Titel', author: author.stableId })
    expect(german.path).toBe('/beitraege/exact-read')
    expect(german.locales.map((locale: { locale: string }) => locale.locale).sort()).toEqual([
      'de',
      'en',
    ])
  })

  it('[LOC-02] explicitly copies localized values, body, and slug without copying publication state', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, {
      userId: 'editor-1',
      role: 'editor',
      displayName: 'Mara Winter',
    })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await installTestContract(ctx, ['en', 'de', 'fr'])
    const owner = ctx.asCmsUser('owner-1')
    const editor = ctx.asCmsUser('editor-1')

    const entryId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      slug: 'reliability',
      localized: { title: 'Reliability' },
      bodyMdc: '# Reliable\n\nEnglish source.',
    })
    await publishEntry(owner, entryId, ['en'])
    const publicBeforeCopy = structuredClone(await ctx.readAll('publicEntries'))

    await editor.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'locale', locale: 'en' },
    })

    const copiedDraft = (await ctx.readAll('entryLocaleDrafts')).find(
      (row) => String(row.entryId) === entryId && row.locale === 'de',
    )
    expect(copiedDraft).toMatchObject({
      locale: 'de',
      slug: 'reliability',
      values: { title: 'Reliability' },
      bodyMdc: '# Reliable\n\nEnglish source.',
      version: 1,
      updatedBy: 'editor-1',
    })
    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforeCopy)

    const german = await editor.query(api.editor.getEntry, { id: entryId, locale: 'de' })
    expect(german.path).toBe('/dokumentation/reliability')
    expect(german.localeData?.published).toBeNull()

    const creationActivity = (await ctx.readAll('activity')).find(
      (row) => row.kind === 'entry.translation-created' && row.locale === 'de',
    )
    expect(creationActivity).toMatchObject({
      appIdentityId: 'editor-1',
      actorLabel: 'Mara Winter',
      entryId,
      collection: 'docs',
      locale: 'de',
      detail: { sourceKind: 'locale', sourceLocale: 'en' },
    })

    const versionBeforeRepeat = await currentDraftVersion(editor, entryId)
    await editor.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    expect(await currentDraftVersion(editor, entryId)).toBe(versionBeforeRepeat)
    expect(
      (await ctx.readAll('activity')).filter(
        (row) => row.kind === 'entry.translation-created' && row.locale === 'de',
      ),
    ).toHaveLength(1)
    expect(
      (await ctx.readAll('entryLocaleDrafts')).find(
        (row) => String(row.entryId) === entryId && row.locale === 'de',
      ),
    ).toEqual(copiedDraft)

    await editor.saveEntryDraft({
      entryId,
      expectedDraftVersion: await currentDraftVersion(editor, entryId),
      patch: {
        locales: {
          de: {
            slug: 'zuverlaessigkeit',
            values: { title: 'Zuverlässigkeit' },
            bodyMdc: '# Zuverlässig\n\nEigenständige deutsche Fassung.',
          },
        },
      },
    })
    const [englishAfterGermanEdit, germanAfterEdit] = await Promise.all([
      editor.query(api.editor.getEntry, { id: entryId, locale: 'en' }),
      editor.query(api.editor.getEntry, { id: entryId, locale: 'de' }),
    ])
    expect(englishAfterGermanEdit.data).toMatchObject({ title: 'Reliability' })
    expect(englishAfterGermanEdit.localeData?.draft.bodyMdc).toBe('# Reliable\n\nEnglish source.')
    expect(germanAfterEdit.data).toMatchObject({ title: 'Zuverlässigkeit' })
    expect(germanAfterEdit.slug).toBe('zuverlaessigkeit')
    expect(germanAfterEdit.localeData?.draft.bodyMdc).toBe(
      '# Zuverlässig\n\nEigenständige deutsche Fassung.',
    )
    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforeCopy)

    await expect(
      ctx.asCmsUser('viewer-1').mutation(api.entries.draft.createLocaleVariant, {
        entryId,
        locale: 'fr',
        source: { kind: 'blank' },
      }),
    ).rejects.toThrow(/Edit entries/i)
  })

  it('[LOC-02] rejects a missing copy source and atomically rolls back a copied route collision', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await installTestContract(ctx, ['en', 'de', 'fr'])
    const owner = ctx.asCmsUser('owner-1')
    const editor = ctx.asCmsUser('editor-1')

    const missingSourceEntryId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      slug: 'missing-source',
      localized: { title: 'Missing source' },
    })
    await expect(
      editor.mutation(api.entries.draft.createLocaleVariant, {
        entryId: missingSourceEntryId,
        locale: 'de',
        source: { kind: 'locale', locale: 'fr' },
      }),
    ).rejects.toSatisfy(
      (cause: unknown) => getCmsErrorData(cause)?.code === 'ENTRY_LOCALE_SOURCE_MISSING',
    )

    const copySourceEntryId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      slug: 'copy-source-original',
      localized: { title: 'Copy source' },
    })
    await owner.saveEntryDraft({
      entryId: copySourceEntryId,
      expectedDraftVersion: await currentDraftVersion(owner, copySourceEntryId),
      patch: {
        locales: {
          en: { slug: 'claimed-route' },
        },
      },
    })
    const routeOwnerEntryId = await owner.createEntry({
      collection: 'docs',
      locale: 'en',
      slug: 'route-owner',
      localized: { title: 'Route owner' },
    })
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId: routeOwnerEntryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    await owner.saveEntryDraft({
      entryId: routeOwnerEntryId,
      expectedDraftVersion: await currentDraftVersion(owner, routeOwnerEntryId),
      patch: {
        locales: {
          de: { slug: 'claimed-route', values: { title: 'Route owner DE' } },
        },
      },
    })

    const sourceVersion = await currentDraftVersion(editor, copySourceEntryId)
    const activityCount = (await ctx.readAll('activity')).length
    await expect(
      editor.mutation(api.entries.draft.createLocaleVariant, {
        entryId: copySourceEntryId,
        locale: 'de',
        source: { kind: 'locale', locale: 'en' },
      }),
    ).rejects.toSatisfy((cause: unknown) => getCmsErrorData(cause)?.code === 'ENTRY_PATH_CONFLICT')
    expect(await currentDraftVersion(editor, copySourceEntryId)).toBe(sourceVersion)
    expect(
      (await ctx.readAll('entryLocaleDrafts')).some(
        (row) => String(row.entryId) === copySourceEntryId && row.locale === 'de',
      ),
    ).toBe(false)
    expect(await ctx.readAll('activity')).toHaveLength(activityCount)
  })

  it('[COL-01] lists only real writes with durable human actor identity and display attribution', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, {
      userId: 'editor-1',
      role: 'editor',
      displayName: 'Mara Winter',
    })
    await seedSettings(ctx)
    const editor = ctx.asCmsUser('editor-1')

    for (let index = 0; index < 5; index += 1) {
      await editor.createEntry({
        collection: 'posts',
        slug: `editor-post-${index}`,
        localized: { title: `Editor post ${index}` },
      })
    }

    const owner = ctx.asCmsUser('owner-1')
    const seen: Array<{
      _id: string
      kind: string
      appIdentityId: string
      actorLabel: string
    }> = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const result = await owner.query(api.editor.listActivity, {
        paginationOpts: { numItems: 2, cursor },
      })
      seen.push(...result.page)
      cursor = result.continueCursor
      isDone = result.isDone
    }

    expect(cursor).toBe('')

    expect(seen).toHaveLength(5)
    expect(new Set(seen.map((activity) => activity._id)).size).toBe(5)
    expect(
      seen.every(
        (activity) =>
          activity.kind === 'entry.created' &&
          activity.appIdentityId === 'editor-1' &&
          activity.actorLabel === 'Mara Winter',
      ),
    ).toBe(true)
  })

  it('[DOC-06] loads a large tree incrementally by exact parent with independent keyset cursors', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, childId, siblingId, grandchildId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const roots = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: null,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(roots.page.map((entry: { _id: string }) => entry._id)).toEqual([rootAId, rootBId])

    const firstChildrenPage = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: rootAId,
      paginationOpts: { numItems: 1, cursor: null },
    })
    const secondChildrenPage = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: rootAId,
      paginationOpts: { numItems: 1, cursor: firstChildrenPage.continueCursor },
    })
    expect(
      [...firstChildrenPage.page, ...secondChildrenPage.page].map(
        (entry: { _id: string }) => entry._id,
      ),
    ).toEqual([childId, siblingId])

    const grandchildren = await owner.query(api.editor.listEntriesForStudio, {
      collection: 'docs',
      locale: 'en',
      parentEntryId: childId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(grandchildren.page.map((entry: { _id: string }) => entry._id)).toEqual([grandchildId])

    await expect(
      owner.query(api.editor.listEntriesForStudio, {
        collection: 'docs',
        locale: 'en',
        parentEntryId: 'not-an-entry-id',
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_PARENT_NOT_FOUND',
    )
  })
})
