/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  publishEntry,
  revertDraftToPublished,
  seedMultiLocaleSettings,
  seedOwner,
} from './helpers'

const api = anyApi

async function setGermanSlug(
  owner: ReturnType<ReturnType<typeof createCtx>['asCmsUser']>,
  entryId: string,
  slug: string,
) {
  await owner.mutation(api.entries.draft.createLocaleVariant, {
    entryId,
    locale: 'de',
    source: { kind: 'blank' },
  })
  const entry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'de' })
  await owner.saveEntryDraft({
    entryId,
    expectedDraftVersion: entry.draftVersion,
    patch: { locales: { de: { slug, values: { title: `German ${slug}` } } } },
  })
}

describe('indexed draft sibling path conflicts', () => {
  it('allows a canonical sibling after the previous owner has a draft move-out', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const parentId = await owner.createEntry({
      collection: 'docs',
      slug: 'parent',
      localized: { title: 'Parent' },
    })
    const replacementParentId = await owner.createEntry({
      collection: 'docs',
      slug: 'replacement-parent',
      localized: { title: 'Replacement parent' },
    })
    const movingId = await owner.createEntry({
      collection: 'docs',
      slug: 'moving',
      localized: { title: 'Moving' },
    })
    const replacementId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: replacementParentId,
      slug: 'replacement',
      localized: { title: 'Replacement' },
    })
    await setGermanSlug(owner, movingId, 'gemeinsam')
    await setGermanSlug(owner, replacementId, 'gemeinsam')

    const moving = await owner.query(api.editor.getEntry, { id: movingId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: movingId,
      expectedDraftVersion: moving.draftVersion,
      patch: { shared: { parentEntryId: parentId } },
    })
    const replacement = await owner.query(api.editor.getEntry, { id: replacementId, locale: 'de' })
    await expect(
      owner.saveEntryDraft({
        entryId: replacementId,
        expectedDraftVersion: replacement.draftVersion,
        patch: { shared: { parentEntryId: null } },
      }),
    ).resolves.toBeDefined()
  })

  it('allows only one of two concurrent draft move-ins to claim a sibling path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const parentAId = await owner.createEntry({
      collection: 'docs',
      slug: 'parent-a',
      localized: { title: 'Parent A' },
    })
    const parentBId = await owner.createEntry({
      collection: 'docs',
      slug: 'parent-b',
      localized: { title: 'Parent B' },
    })
    const leftId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: parentAId,
      slug: 'left',
      localized: { title: 'Left' },
    })
    const rightId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: parentBId,
      slug: 'right',
      localized: { title: 'Right' },
    })
    await setGermanSlug(owner, leftId, 'gemeinsam')
    await setGermanSlug(owner, rightId, 'gemeinsam')
    const [left, right] = await Promise.all([
      owner.query(api.editor.getEntry, { id: leftId, locale: 'de' }),
      owner.query(api.editor.getEntry, { id: rightId, locale: 'de' }),
    ])

    const results = await Promise.allSettled([
      owner.saveEntryDraft({
        entryId: leftId,
        expectedDraftVersion: left.draftVersion,
        patch: { shared: { parentEntryId: null } },
      }),
      owner.saveEntryDraft({
        entryId: rightId,
        expectedDraftVersion: right.draftVersion,
        patch: { shared: { parentEntryId: null } },
      }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status).toBe('rejected')
    if (rejected?.status === 'rejected') {
      expect(getCmsErrorData(rejected.reason)?.code).toBe('ENTRY_PATH_CONFLICT')
    }
  })

  it('rejects a revert that would reclaim a draft route another entry took', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const parentAId = await owner.createEntry({
      collection: 'docs',
      slug: 'parent-a',
      localized: { title: 'Parent A' },
    })
    const parentBId = await owner.createEntry({
      collection: 'docs',
      slug: 'parent-b',
      localized: { title: 'Parent B' },
    })
    const originalId = await owner.createEntry({
      collection: 'docs',
      slug: 'original',
      localized: { title: 'Original' },
    })
    const replacementId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: parentBId,
      slug: 'replacement',
      localized: { title: 'Replacement' },
    })
    await setGermanSlug(owner, originalId, 'gemeinsam')
    await setGermanSlug(owner, replacementId, 'gemeinsam')
    await publishEntry(owner, originalId, ['en', 'de'])

    const original = await owner.query(api.editor.getEntry, { id: originalId, locale: 'de' })
    await owner.saveEntryDraft({
      entryId: originalId,
      expectedDraftVersion: original.draftVersion,
      patch: { shared: { parentEntryId: parentAId } },
    })
    const replacement = await owner.query(api.editor.getEntry, {
      id: replacementId,
      locale: 'de',
    })
    await owner.saveEntryDraft({
      entryId: replacementId,
      expectedDraftVersion: replacement.draftVersion,
      patch: { shared: { parentEntryId: null } },
    })

    await expect(revertDraftToPublished(owner, originalId)).rejects.toSatisfy((cause: unknown) => {
      return getCmsErrorData(cause)?.code === 'ENTRY_PATH_CONFLICT'
    })
  })
})
