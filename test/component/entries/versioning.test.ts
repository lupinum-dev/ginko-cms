/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  publishEntry,
  rollbackVersion,
  seedEditorFixture,
  seedOwner,
  seedSettings,
} from './helpers'

const api = anyApi

function localeDraft(rows: Array<Record<string, unknown>>, entryId: string, locale = 'en') {
  return rows.find((row) => row.entryId === entryId && row.locale === locale)
}

describe('immutable history, restore, and public rollback', () => {
  it('creates explicit draft checkpoints without changing public output', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const checkpointId = await owner.mutation(api.entries.publish.createCheckpoint, {
      entryId,
      message: 'Before structural rewrite',
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { values: { title: 'Later draft' } } } },
    })

    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('entryRevisions')).toEqual([
      expect.objectContaining({
        _id: checkpointId,
        kind: 'checkpoint',
        message: 'Before structural rewrite',
        snapshots: {
          en: expect.objectContaining({
            values: expect.objectContaining({ title: 'Hello world' }),
          }),
        },
      }),
    ])
    await expect(owner.query(api.editor.listVersions, { entryId })).resolves.toEqual([
      expect.objectContaining({
        _id: checkpointId,
        action: 'checkpoint',
        message: 'Before structural rewrite',
        isCurrentPublished: false,
      }),
    ])
  })

  it('restores a historical revision to draft while leaving public output untouched', async () => {
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
  })

  it('rolls public output back through a new revision without overwriting current draft work', async () => {
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
})
