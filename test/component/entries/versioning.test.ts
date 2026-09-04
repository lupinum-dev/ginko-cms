/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  archiveEntry,
  createCtx,
  publishEntry,
  reparentEntry,
  rollbackVersion,
  seedEditorFixture,
  seedOwner,
  seedSettings,
  seedTreeFixture,
} from './helpers'

const api = anyApi

function localeDraft(rows: Array<Record<string, unknown>>, entryId: string, locale = 'en') {
  return rows.find((row) => row.entryId === entryId && row.locale === locale)
}

describe('immutable history, restore, and public rollback', () => {
  it('[LIF-04] lists immutable attributed editorial versions and marks the active public revision', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const published = await publishEntry(owner, entryId)
    const publicBeforeCheckpoint = structuredClone(await ctx.readAll('publicEntries'))

    const checkpointId = await owner.mutation(api.entries.publish.createCheckpoint, {
      entryId,
      message: 'Before structural rewrite',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Later draft' } } } },
    })

    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforeCheckpoint)
    expect(await ctx.readAll('entryRevisions')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: published.versionId,
          kind: 'publish',
          createdBy: 'owner-1',
        }),
        expect.objectContaining({
          _id: checkpointId,
          kind: 'checkpoint',
          createdBy: 'owner-1',
          message: 'Before structural rewrite',
          snapshots: {
            en: expect.objectContaining({
              values: expect.objectContaining({ title: 'Hello world' }),
            }),
          },
        }),
      ]),
    )
    await expect(
      owner.query(api.editor.listVersions, {
        entryId,
        paginationOpts: { cursor: null, numItems: 25 },
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([
        expect.objectContaining({
          _id: checkpointId,
          action: 'checkpoint',
          message: 'Before structural rewrite',
          isCurrentPublished: false,
        }),
        expect.objectContaining({
          _id: published.versionId,
          action: 'publish',
          createdBy: 'owner-1',
          isCurrentPublished: true,
        }),
      ]),
      isDone: true,
    })
  })

  it('[LIF-06] restores a historical immutable revision as a new draft while leaving public output untouched', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const first = await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Second publication' } } } },
    })
    const second = await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'Unpublished work' } } } },
    })
    const publicBeforeRestore = structuredClone(await ctx.readAll('publicEntries'))

    const restored = await rollbackVersion(owner, {
      entryId,
      versionId: first.versionId,
      publish: false,
    })

    expect(await ctx.readAll('publicEntries')).toEqual(publicBeforeRestore)
    expect(publicBeforeRestore).toEqual([expect.objectContaining({ revisionId: second.versionId })])
    expect(localeDraft(await ctx.readAll('entryLocaleDrafts'), entryId)).toMatchObject({
      values: expect.objectContaining({ title: 'Hello world' }),
    })

    const revisions = await ctx.readAll('entryRevisions')
    expect(revisions.map((revision) => revision.kind)).toEqual([
      'publish',
      'publish',
      'checkpoint',
      'restore',
    ])
    expect(revisions[2]).toMatchObject({
      message: 'Before restore of revision 1',
      snapshots: {
        en: expect.objectContaining({
          values: expect.objectContaining({ title: 'Unpublished work' }),
        }),
      },
    })
    expect(revisions[3]).toMatchObject({
      _id: restored.versionId,
      kind: 'restore',
      snapshots: {
        en: expect.objectContaining({ values: expect.objectContaining({ title: 'Hello world' }) }),
      },
    })
    const versionPage = await owner.query(api.editor.listVersions, {
      entryId,
      paginationOpts: { cursor: null, numItems: 25 },
    })
    expect(versionPage.page[0]).toMatchObject({
      _id: restored.versionId,
      action: 'restore',
      displayAction: 'restoredDraft',
      isCurrentPublished: false,
    })
  })

  it('[LIF-07] rolls public output back through a new immutable revision without overwriting current draft work', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const first = await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Second publication' } } } },
    })
    await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { values: { title: 'Keep this draft' } } } },
    })
    const draftBeforeRollback = structuredClone(await ctx.readAll('entryLocaleDrafts'))

    const rollback = await rollbackVersion(owner, {
      entryId,
      versionId: first.versionId,
      publish: true,
    })

    expect(rollback.versionId).not.toBe(first.versionId)
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(draftBeforeRollback)
    expect(localeDraft(draftBeforeRollback, entryId)).toMatchObject({
      values: expect.objectContaining({ title: 'Keep this draft' }),
    })
    expect(await ctx.readAll('publicEntries')).toEqual([
      expect.objectContaining({
        entryId,
        locale: 'en',
        revisionId: rollback.versionId,
        data: expect.objectContaining({ title: 'Hello world' }),
      }),
    ])
    const entry = (await ctx.readAll('entries'))[0]!
    expect(entry.activePublications).toEqual([
      expect.objectContaining({ locale: 'en', revisionId: rollback.versionId }),
    ])
    expect((await ctx.readAll('entryRevisions')).at(-1)).toMatchObject({
      _id: rollback.versionId,
      kind: 'rollback',
      snapshots: {
        en: expect.objectContaining({ values: expect.objectContaining({ title: 'Hello world' }) }),
      },
    })
  })

  it('blocks public rollback for archived entries and incompatible revisions', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const published = await publishEntry(owner, entryId)

    await archiveEntry(owner, entryId)
    const archivedPreview = await owner.mutation(
      api.entries.publicationHistory.previewRollbackVersionOperation,
      { entryId, versionId: published.versionId, publish: true },
    )
    expect(archivedPreview).toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'entry-archived' })],
    })
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect((await ctx.readAll('entries'))[0]).toMatchObject({
      lifecycle: 'archived',
      activePublications: [],
    })

    await ctx.raw.run(async (inner) => {
      const revisionId = inner.db.normalizeId('entryRevisions', published.versionId)
      if (!revisionId) throw new Error('Expected revision id.')
      await inner.db.patch(revisionId, { contentHash: 'incompatible-contract' })
      const entryDocId = inner.db.normalizeId('entries', entryId)
      const entry = entryDocId ? await inner.db.get(entryDocId) : null
      if (!entry) throw new Error('Expected entry.')
      await inner.db.patch(entry._id, { lifecycle: 'active' })
    })
    const incompatiblePreview = await owner.mutation(
      api.entries.publicationHistory.previewRollbackVersionOperation,
      { entryId, versionId: published.versionId, publish: true },
    )
    expect(incompatiblePreview).toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'revision-contract-mismatch' })],
    })
  })

  it('fences public rollback against route-generation drift', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const first = await publishEntry(owner, entryId)
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Second publication' } } } },
    })
    await publishEntry(owner, entryId)

    const args = { entryId, versionId: first.versionId, publish: true }
    const preview = await owner.mutation(
      api.entries.publicationHistory.previewRollbackVersionOperation,
      args,
    )
    expect(preview.confirmation).not.toBeNull()
    await ctx.raw.run(async (inner) => {
      const generations = await inner.db.query('routeGenerations').collect()
      const generation = generations.find((row) => row.collection !== '*')
      if (!generation) throw new Error('Expected route generation.')
      await inner.db.patch(generation._id, { generation: generation.generation + 1 })
    })
    await expect(
      owner.mutation(api.entries.publicationHistory.rollbackVersionOperationExecute, {
        ...args,
        _confirmationToken: preview.confirmation!.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'CONFIRMATION_VERSION_MISMATCH' })
    expect((await ctx.readAll('entryRevisions')).at(-1)).not.toMatchObject({ kind: 'rollback' })
  })

  it('blocks draft restore when historical placement now collides', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, childId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const checkpointId = await owner.mutation(api.entries.publish.createCheckpoint, {
      entryId: childId,
      message: 'Placement before move',
    })
    await reparentEntry(owner, {
      entryId: childId,
      expectedDraftVersion: 1,
      parentEntryId: rootBId,
    })
    await owner.createEntry({
      collection: 'docs',
      slug: 'child',
      parentEntryId: rootAId,
      localized: { title: 'Replacement child' },
    })

    const before = {
      entries: structuredClone(await ctx.readAll('entries')),
      drafts: structuredClone(await ctx.readAll('entryLocaleDrafts')),
      revisions: structuredClone(await ctx.readAll('entryRevisions')),
    }
    const preview = await owner.mutation(
      api.entries.publicationHistory.previewRollbackVersionOperation,
      {
        entryId: childId,
        versionId: checkpointId,
        publish: false,
      },
    )
    expect(preview).toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'ENTRY_PATH_CONFLICT' })],
    })
    expect(await ctx.readAll('entries')).toEqual(before.entries)
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(before.drafts)
    expect(await ctx.readAll('entryRevisions')).toEqual(before.revisions)
  })
})
