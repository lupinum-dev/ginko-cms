/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { compareOrderRank } from '#component/lib/ordering'
import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  currentDraftVersion,
  previewReorderEntry,
  previewReparentEntry,
  publishEntry,
  reorderEntry,
  reparentEntry,
  seedOwner,
  seedSettings,
  seedTreeFixture,
} from './helpers'

const api = anyApi

function hasCmsError(code: string) {
  return (error: unknown) => getCmsErrorData(error)?.code === code
}

describe('canonical editorial tree operations', () => {
  it('[CON-03] creates a stable private draft and rejects route conflicts and viewer creation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const entryId = await owner.createEntry({
      collection: 'posts',
      slug: 'private-draft',
      localized: { title: 'Private draft' },
    })

    const entry = await owner.query(api.editor.getEntry, { id: entryId, locale: 'en' })
    expect(entry).toMatchObject({
      _id: entryId,
      collection: 'posts',
      slug: 'private-draft',
      status: 'draft',
    })
    expect(entry.stableId).toEqual(expect.any(String))
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    await expect(
      owner.createEntry({
        collection: 'posts',
        slug: 'private-draft',
        localized: { title: 'Conflict' },
      }),
    ).rejects.toSatisfy(hasCmsError('ENTRY_SLUG_CONFLICT'))

    await ctx.seed('members', {
      userId: 'viewer-1',
      role: 'viewer',
      createdAt: 1,
      updatedAt: 1,
      updatedBy: 'owner-1',
    })
    await expect(
      ctx.asCmsUser('viewer-1').createEntry({
        collection: 'posts',
        slug: 'forbidden',
        localized: { title: 'Forbidden' },
      }),
    ).rejects.toThrow('Forbidden')
  })

  it('rejects parents in flat collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const parentId = await owner.createEntry({
      collection: 'posts',
      slug: 'flat-parent',
      localized: { title: 'Flat parent' },
    })

    await expect(
      owner.createEntry({
        collection: 'posts',
        parentEntryId: parentId,
        slug: 'flat-child',
        localized: { title: 'Flat child' },
      }),
    ).rejects.toSatisfy(hasCmsError('ENTRY_PARENT_NOT_ALLOWED'))

    await expect(
      previewReparentEntry(owner, {
        entryId: parentId,
        expectedDraftVersion: await currentDraftVersion(owner, parentId),
        parentEntryId: parentId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'ENTRY_PARENT_NOT_ALLOWED', status: 'blocked' })],
    })
  })

  it('[DOC-02] reorders through preview/confirmation and fences a stale draft version', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId, siblingId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const expectedDraftVersion = await currentDraftVersion(owner, siblingId)
    const staleArgs = {
      entryId: siblingId,
      expectedDraftVersion,
      parentEntryId: rootAId,
      beforeEntryId: childId,
    }
    const stalePreview = await previewReorderEntry(owner, staleArgs)
    expect(stalePreview.confirmation?.token).toEqual(expect.any(String))

    await owner.saveEntryDraft({
      entryId: siblingId,
      expectedDraftVersion,
      patch: { locales: { en: { values: { title: 'Changed concurrently' } } } },
    })
    await expect(
      owner.mutation(api.entries.tree.reorderEntryOperationExecute, {
        ...staleArgs,
        _confirmationToken: stalePreview.confirmation?.token,
      }),
    ).resolves.toMatchObject({ status: 'stale', code: 'ENTRY_CONCURRENT_EDIT' })

    const result = await reorderEntry(owner, {
      ...staleArgs,
      expectedDraftVersion: await currentDraftVersion(owner, siblingId),
    })
    const [sibling, child] = await Promise.all([
      owner.query(api.editor.getEntry, { id: siblingId, locale: 'en' }),
      owner.query(api.editor.getEntry, { id: childId, locale: 'en' }),
    ])
    expect(result).toMatchObject({
      draftVersion: sibling.draftVersion,
      parentEntryId: rootAId,
    })
    expect(compareOrderRank(sibling.orderRank, child.orderRank)).toBeLessThan(0)

    const activity = await owner.query(api.editor.getEntryActivity, {
      entryId: siblingId,
      paginationOpts: { cursor: null, numItems: 25 },
    })
    expect(activity.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'entry.reordered',
          appIdentityId: 'owner-1',
        }),
      ]),
    )
  })

  it('[DOC-03] moves one canonical subtree while public routes stay atomic and descendants keep their revisions', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId, grandchildId, rootBId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, rootAId)
    await publishEntry(owner, rootBId)
    await publishEntry(owner, childId)
    await publishEntry(owner, grandchildId)
    const grandchildRevisionBeforeMove = (await ctx.readAll('publicEntries')).find(
      (row) => row.entryId === grandchildId && row.locale === 'en',
    )!.revisionId

    const result = await reparentEntry(owner, {
      entryId: childId,
      expectedDraftVersion: await currentDraftVersion(owner, childId),
      parentEntryId: rootBId,
    })
    const [child, grandchild] = await Promise.all([
      owner.query(api.editor.getEntry, { id: childId, locale: 'en' }),
      owner.query(api.editor.getEntry, { id: grandchildId, locale: 'en' }),
    ])

    expect(result).toMatchObject({ parentEntryId: rootBId })
    expect(child).toMatchObject({ parentEntryId: rootBId, path: '/docs/root-b/child' })
    expect(grandchild.path).toBe('/docs/root-b/child/grandchild')

    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-a/child/grandchild',
      }),
    ).resolves.toMatchObject({ status: 'found', page: { id: grandchildId } })
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-b/child/grandchild',
      }),
    ).resolves.toMatchObject({ status: 'not-found' })

    await publishEntry(owner, childId)
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-b/child/grandchild',
      }),
    ).resolves.toMatchObject({ status: 'found', page: { id: grandchildId } })
    await expect(
      ctx.raw.query(api.public.page, {
        collection: 'docs',
        locale: 'en',
        path: '/docs/root-a/child/grandchild',
      }),
    ).resolves.toMatchObject({
      status: 'redirect',
      redirectTo: { path: '/docs/root-b/child/grandchild' },
    })
    expect(
      (await ctx.readAll('publicEntries')).find(
        (row) => row.entryId === grandchildId && row.locale === 'en',
      )!.revisionId,
    ).toBe(grandchildRevisionBeforeMove)
  })

  it('rejects cycles and sibling route collisions before issuing confirmation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, childId, grandchildId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      previewReparentEntry(owner, {
        entryId: rootAId,
        expectedDraftVersion: await currentDraftVersion(owner, rootAId),
        parentEntryId: grandchildId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'ENTRY_INVALID_TREE_MOVE', status: 'blocked' })],
    })

    await owner.createEntry({
      collection: 'docs',
      parentEntryId: rootBId,
      slug: 'child',
      localized: { title: 'Conflicting child' },
    })
    await expect(
      previewReparentEntry(owner, {
        entryId: childId,
        expectedDraftVersion: await currentDraftVersion(owner, childId),
        parentEntryId: rootBId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'ENTRY_PATH_CONFLICT', status: 'blocked' })],
    })
  })

  it('[DOC-01] creates stable root and child drafts through five supported tree levels and rejects a sixth', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, rootBId, grandchildId } = await seedTreeFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const levelFourId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: grandchildId,
      slug: 'level-four',
      localized: { title: 'Level four' },
    })
    const levelFiveId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: levelFourId,
      slug: 'level-five',
      localized: { title: 'Level five' },
    })
    expect(await owner.query(api.editor.getEntry, { id: levelFiveId, locale: 'en' })).toMatchObject(
      { path: '/docs/root-a/child/grandchild/level-four/level-five' },
    )

    await expect(
      owner.createEntry({
        collection: 'docs',
        parentEntryId: levelFiveId,
        slug: 'level-six',
        localized: { title: 'Level six' },
      }),
    ).rejects.toSatisfy(hasCmsError('ENTRY_MAX_DEPTH_EXCEEDED'))

    const branchTwoId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: rootBId,
      slug: 'branch-two',
      localized: { title: 'Branch two' },
    })
    const branchThreeId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: branchTwoId,
      slug: 'branch-three',
      localized: { title: 'Branch three' },
    })
    await expect(
      previewReparentEntry(owner, {
        entryId: rootAId,
        expectedDraftVersion: await currentDraftVersion(owner, rootAId),
        parentEntryId: branchThreeId,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      confirmation: null,
      blockers: [expect.objectContaining({ code: 'ENTRY_MAX_DEPTH_EXCEEDED', status: 'blocked' })],
    })
  })
})
