/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  seedOwner,
  seedMultiLocaleSettings,
  seedEditorFixture,
  seedMember,
  publishEntry,
  archiveEntry,
  permanentlyDeleteEntry,
} from './helpers'

const api = anyApi
async function setup(source: 'blank' | 'copy' = 'blank') {
  const ctx = createCtx()
  await seedOwner(ctx)
  await seedMultiLocaleSettings(ctx)
  const { entryId } = await seedEditorFixture(ctx)
  const owner = ctx.asCmsUser('owner-1')
  await owner.mutation(api.editor.createLocaleVariant, {
    entryId,
    locale: 'de',
    source: source === 'blank' ? { kind: 'blank' } : { kind: 'locale', locale: 'en' },
  })
  const read = () => owner.query(api.editor.getTranslationReview, { entryId, targetLocale: 'de' })
  const fence = async () => {
    const state = await read()
    return {
      entryId,
      targetLocale: 'de',
      expectedTargetVersion: state.targetVersion,
      expectedTargetDraftId: state.targetDraftId,
      expectedSharedVersion: state.sharedVersion,
      expectedReviewId: state.reviewId,
    }
  }
  const link = async () =>
    owner.mutation(api.editor.setTranslationSource, { ...(await fence()), sourceLocale: 'en' })
  const acknowledge = async () =>
    owner.mutation(api.editor.acknowledgeTranslationReview, {
      ...(await fence()),
      expectedSourceVersion: (await read()).sourceVersion,
      expectedSourceDraftId: (await read()).sourceDraftId,
    })
  const edit = async (locale: string, title: string) => {
    const entry = (await ctx.readAll('entries'))[0]!
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: { locales: { [locale]: { values: { title } } } },
    })
  }
  return { ctx, owner, entryId, read, fence, link, acknowledge, edit }
}

describe('translation review provenance', () => {
  it('keeps existing provenance unknown and supports independently authored languages', async () => {
    const { ctx, owner, read, fence } = await setup()
    expect(await read()).toMatchObject({
      status: 'unknown',
      sourceLocale: null,
      reviewedSource: null,
    })
    await owner.mutation(api.editor.setTranslationSource, {
      ...(await fence()),
      sourceLocale: null,
    })
    expect(await read()).toMatchObject({ status: 'independent', reviewedAt: null })
    expect(await ctx.readAll('entryLocaleDrafts')).toHaveLength(2)
  })

  it('retains immutable reviewed snapshots and supports confirming an unchanged target after source changes', async () => {
    const { ctx, read, link, acknowledge, edit } = await setup()
    await link()
    expect(await read()).toMatchObject({ status: 'needs-review', reason: 'unreviewed' })
    await acknowledge()
    const original = (await ctx.readAll('entryTranslationReviews')).find((row) => row.reviewed)!
    expect(await read()).toMatchObject({ status: 'reviewed', changedFields: [] })
    await edit('en', 'A clearer source')
    expect(await read()).toMatchObject({
      status: 'needs-review',
      reason: 'source-changed',
      changedFields: expect.arrayContaining(['values.title']),
      reviewedSource: { values: { title: 'Hello world' } },
    })
    const targetBefore = (await read()).target
    await acknowledge()
    expect(await read()).toMatchObject({ status: 'reviewed', target: targetBefore })
    expect(
      (await ctx.readAll('entryTranslationReviews')).find((row) => row._id === original._id),
    ).toEqual(original)
  })

  it.each(['en', 'de'])('rejects acknowledgments when %s changed during review', async (locale) => {
    const { owner, read, fence, link, edit } = await setup()
    await link()
    const stale = {
      ...(await fence()),
      expectedSourceVersion: (await read()).sourceVersion,
      expectedSourceDraftId: (await read()).sourceDraftId,
    }
    await edit(locale, 'Changed while reviewing')
    await expect(owner.mutation(api.editor.acknowledgeTranslationReview, stale)).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'TRANSLATION_REVIEW_STALE',
    )
    expect((await read()).status).toBe('needs-review')
  })

  it('invalidates a review when shared values or the source relationship change', async () => {
    const { ctx, owner, entryId, read, fence, link } = await setup()
    await link()
    const stale = {
      ...(await fence()),
      expectedSourceVersion: (await read()).sourceVersion,
      expectedSourceDraftId: (await read()).sourceDraftId,
    }
    const entry = (await ctx.readAll('entries'))[0]!
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: entry.draftVersion,
      patch: { shared: { shared: { featured: true } } },
    })
    await expect(owner.mutation(api.editor.acknowledgeTranslationReview, stale)).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'TRANSLATION_REVIEW_STALE',
    )
    const changedRelationship = {
      ...(await fence()),
      expectedSourceVersion: (await read()).sourceVersion,
      expectedSourceDraftId: (await read()).sourceDraftId,
    }
    await owner.mutation(api.editor.setTranslationSource, {
      ...(await fence()),
      sourceLocale: null,
    })
    await expect(
      owner.mutation(api.editor.acknowledgeTranslationReview, changedRelationship),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'TRANSLATION_REVIEW_STALE',
    )
  })

  it('does not publish a translation by reviewing it or publishing its source', async () => {
    const { ctx, owner, entryId, link, acknowledge } = await setup()
    await link()
    await acknowledge()
    expect(await ctx.readAll('publicEntries')).toEqual([])
    await publishEntry(owner, entryId)
    expect((await ctx.readAll('publicEntries')).map((row) => row.locale)).toEqual(['en'])
  })

  it('denies anonymous, non-member, read-only and revoked-member review writes', async () => {
    const { ctx, entryId, fence } = await setup()
    const readArgs = { entryId, targetLocale: 'de' }
    const writeArgs = { ...(await fence()), sourceLocale: 'en' }
    await expect(ctx.query(api.editor.getTranslationReview, readArgs)).rejects.toThrow()
    await expect(ctx.mutation(api.editor.setTranslationSource, writeArgs)).rejects.toThrow()
    await expect(
      ctx.asCmsUser('outsider').query(api.editor.getTranslationReview, readArgs),
    ).rejects.toThrow()
    await expect(
      ctx.asCmsUser('outsider').mutation(api.editor.setTranslationSource, writeArgs),
    ).rejects.toThrow()
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    expect(
      await ctx.asCmsUser('viewer-1').query(api.editor.getTranslationReview, readArgs),
    ).toMatchObject({ _can: { edit: false } })
    await expect(
      ctx.asCmsUser('viewer-1').mutation(api.editor.setTranslationSource, writeArgs),
    ).rejects.toThrow()
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await ctx.asCmsUser('editor-1').mutation(api.editor.setTranslationSource, writeArgs)
    await ctx.run(async (inner) => {
      const members = await inner.db.query('members').collect()
      const member = members.find((item) => item.userId === 'editor-1')
      if (member) await inner.db.delete(member._id)
    })
    await expect(
      ctx.asCmsUser('editor-1').query(api.editor.getTranslationReview, readArgs),
    ).rejects.toThrow()
    await expect(
      ctx
        .asCmsUser('editor-1')
        .mutation(api.editor.setTranslationSource, { ...(await fence()), sourceLocale: null }),
    ).rejects.toThrow()
  })
  it('does not reuse a review after a locale draft is deleted and recreated at the same version', async () => {
    const { ctx, owner, entryId, read, fence, link, acknowledge } = await setup()
    await link()
    await acknowledge()
    const stale = {
      ...(await fence()),
      expectedSourceVersion: (await read()).sourceVersion,
      expectedSourceDraftId: (await read()).sourceDraftId,
    }
    await ctx.run(async (inner) => {
      const row = await inner.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) =>
          q.eq('entryId', inner.db.normalizeId('entries', entryId)!).eq('locale', 'de'),
        )
        .unique()
      if (!row) throw new Error('Expected German draft')
      const { _id, _creationTime, ...data } = row
      await inner.db.delete(_id)
      await inner.db.insert('entryLocaleDrafts', data)
    })
    expect(await read()).toMatchObject({ status: 'unknown', reviewId: null })
    await expect(owner.mutation(api.editor.acknowledgeTranslationReview, stale)).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'TRANSLATION_REVIEW_STALE',
    )
  })

  it('purges private review snapshots through the existing confirmed permanent-delete workflow', async () => {
    const { ctx, owner, entryId, link, acknowledge } = await setup()
    await link()
    await acknowledge()
    await ctx.seed('draftSaveReceipts', {
      entryId,
      appIdentityId: 'owner-1',
      requestId: 'retained-save',
      requestHash: 'digest',
      draftVersion: 1,
      dirtyLocales: [],
      createdAt: Date.now(),
    })
    await archiveEntry(owner, entryId)
    const entry = (await ctx.readAll('entries'))[0]!
    await permanentlyDeleteEntry(owner, { entryId, confirmationPhrase: `DELETE ${entry.stableId}` })
    expect(await ctx.readAll('entryTranslationReviews')).toEqual([])
    // Content is gone atomically; contentless retry receipts are reclaimed in bounded batches.
    await ctx.mutation(api.entries.draftReceiptCleanup.cleanupDeletedEntryReceipts, { entryId })
    expect(await ctx.readAll('draftSaveReceipts')).toEqual([])
  })
  it('reports absent-to-null and null-to-absent source fields as focused changes', async () => {
    const { ctx, owner, entryId, link, acknowledge, read } = await setup()
    await link()
    await acknowledge()
    const save = async (description: boolean) => {
      const entry = (await ctx.readAll('entries'))[0]!
      await owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: entry.draftVersion,
        patch: {
          locales: {
            en: { values: { title: 'Hello world', ...(description ? { optional: null } : {}) } },
          },
        },
      })
    }
    await save(false)
    await acknowledge()
    await save(true)
    expect(await read()).toMatchObject({
      status: 'needs-review',
      changedFields: ['values.optional'],
    })
    await acknowledge()
    await save(false)
    expect(await read()).toMatchObject({
      status: 'needs-review',
      changedFields: ['values.optional'],
    })
  })

  it('rejects an oversized combined review without changing provenance or either valid locale draft', async () => {
    const { ctx, read, link, acknowledge, edit } = await setup()
    await link()
    await edit('en', 'Source '.repeat(90_000))
    await edit('de', 'Ziel '.repeat(120_000))
    const drafts = await ctx.readAll('entryLocaleDrafts')
    const provenance = await ctx.readAll('entryTranslationReviews')
    await expect(acknowledge().catch(getCmsErrorData)).resolves.toMatchObject({
      code: 'TRANSLATION_REVIEW_TOO_LARGE',
      message: expect.stringContaining('split this entry'),
      details: { actualBytes: expect.any(Number), maxBytes: expect.any(Number) },
    })
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual(drafts)
    expect(await ctx.readAll('entryTranslationReviews')).toEqual(provenance)
    expect(await read()).toMatchObject({ status: 'needs-review', reviewedAt: null })
  })
  it('records the explicitly copied language as an unreviewed source without asking for it again', async () => {
    const { ctx, owner, entryId, read, edit, acknowledge } = await setup('copy')
    expect(await read()).toMatchObject({
      status: 'needs-review',
      reason: 'unreviewed',
      sourceLocale: 'en',
      reviewedSource: null,
      reviewedAt: null,
    })
    expect(await ctx.readAll('entryTranslationReviews')).toHaveLength(1)
    await edit('en', 'Source changed after copying')
    expect(await read()).toMatchObject({
      status: 'needs-review',
      sourceLocale: 'en',
      reviewedAt: null,
    })
    await acknowledge()
    const reviewed = await read()
    // Repeated locale creation is idempotent and must not rewrite existing provenance.
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    expect(await read()).toEqual(reviewed)
  })
})
