/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { compareOrderRank } from '#component/lib/ordering'
import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  seedEditorFixture,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
  seedTreeFixture,
} from './helpers'

const api = anyApi

describe('editor tree mutations', () => {
  it('rejects assigning a parent inside flat collections', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.createEntry({
        collection: 'posts',
        parentEntryId: entryId,
        slug: 'child-in-flat',
        localized: { title: 'Child in flat collection' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_PARENT_NOT_ALLOWED'
    })

    await expect(
      owner.mutation(api.editor.reparentEntry, {
        entryId,
        parentEntryId: entryId,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_PARENT_NOT_ALLOWED'
    })
  })

  it('creates a tree entry with resolved placement and draft path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const entryId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: rootAId,
      slug: 'new-child',
      localized: { title: 'New child' },
    })

    const entry = await owner.query(api.editor.getEntry, {
      id: entryId,
      locale: 'en',
    })
    expect(entry?.parentEntryId).toBe(rootAId)
    expect(entry?.path).toBe('/docs/root-a/new-child')
    expect(entry?.data.title).toBe('New child')
    expect(entry?.stableId).toMatch(/^[0-9a-z]{5,6}$/)
  })

  it('reorders sibling entries through the shared movement flow', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { childId, siblingId, rootAId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.editor.reorderEntry, {
      entryId: siblingId,
      parentEntryId: rootAId,
      beforeEntryId: childId,
    })

    const sibling = await owner.query(api.editor.getEntry, {
      id: siblingId,
      locale: 'en',
    })
    const child = await owner.query(api.editor.getEntry, {
      id: childId,
      locale: 'en',
    })
    expect(sibling?.parentEntryId).toBe(child?.parentEntryId)
    expect(compareOrderRank(sibling?.orderRank ?? null, child?.orderRank ?? null)).toBeLessThan(0)
  })

  it('reparents an entry and recomputes descendant paths', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { childId, grandchildId, rootBId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.editor.reparentEntry, {
      entryId: childId,
      parentEntryId: rootBId,
    })

    const child = await owner.query(api.editor.getEntry, {
      id: childId,
      locale: 'en',
    })
    const grandchild = await owner.query(api.editor.getEntry, {
      id: grandchildId,
      locale: 'en',
    })
    expect(child?.parentEntryId).toBe(rootBId)
    expect(child?.path).toBe('/docs/root-b/child')
    expect(grandchild?.path).toBe('/docs/root-b/child/grandchild')
  })

  it('rejects reparenting when recursive localized paths would conflict', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)

    const now = Date.now()
    await ctx.seed(
      'collections' as never,
      {
        slug: 'docs',
        label: { en: 'Docs' },
        icon: null,
        type: 'tree',
        routing: {
          pathPrefix: '/docs',
          slugMode: 'localized',
          rootSlug: null,
          singleton: false,
        },
        locales: ['en', 'de'],
        fields: [{ key: 'title', type: 'text', localized: true, searchable: true }],
        settings: { maxDepth: 4 },
        createdAt: now,
        updatedAt: now,
        updatedBy: 'owner-1',
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    const rootAId = await owner.createEntry({
      collection: 'docs',
      slug: 'root-a',
      localized: { title: 'Root A' },
    })
    const rootBId = await owner.createEntry({
      collection: 'docs',
      slug: 'root-b',
      localized: { title: 'Root B' },
    })
    const leftId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: rootAId,
      slug: 'left',
      localized: { title: 'Left' },
    })
    const rightId = await owner.createEntry({
      collection: 'docs',
      parentEntryId: rootBId,
      slug: 'right',
      localized: { title: 'Right' },
    })

    await owner.mutation(api.editor.createLocaleVariant, {
      entryId: leftId,
      locale: 'de',
    })
    await owner.mutation(api.editor.createLocaleVariant, {
      entryId: rightId,
      locale: 'de',
    })

    const leftDe = await owner.query(api.editor.getEntry, {
      id: leftId,
      locale: 'de',
    })
    await owner.saveEntryDraft({
      entryId: leftId,
      expectedDraftVersion: leftDe.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'gemeinsam',
          },
        },
      },
    })

    const rightDe = await owner.query(api.editor.getEntry, {
      id: rightId,
      locale: 'de',
    })
    await owner.saveEntryDraft({
      entryId: rightId,
      expectedDraftVersion: rightDe.draftVersion,
      patch: {
        locales: {
          de: {
            slug: 'gemeinsam',
          },
        },
      },
    })

    await expect(
      owner.mutation(api.editor.reparentEntry, {
        entryId: rightId,
        parentEntryId: rootAId,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_PATH_CONFLICT'
    })

    const [leftEntry, rightEntry] = await Promise.all([
      owner.query(api.editor.getEntry, { id: leftId, locale: 'de' }),
      owner.query(api.editor.getEntry, { id: rightId, locale: 'de' }),
    ])
    expect(leftEntry?.path).toBe('/docs/root-a/gemeinsam')
    expect(rightEntry?.path).toBe('/docs/root-b/gemeinsam')
  })
})

describe('tree cycle detection', () => {
  it('rejects creating an entry with a nonexistent parentEntryId (prevents self-reference at creation)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.createEntry({
        collection: 'docs',
        parentEntryId: 'nonexistent_id_that_cannot_exist',
        slug: 'will-fail',
        localized: { title: 'Should fail' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_PARENT_NOT_FOUND'
    })
  })

  it('rejects reparenting an entry under itself (A->A cycle)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.editor.reparentEntry, {
        entryId: rootAId,
        parentEntryId: rootAId,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_INVALID_TREE_MOVE'
    })
  })

  it('rejects reparenting an entry under its child (A->B->A cycle)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, childId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    // rootA is parent of child; moving rootA under child would create A->B->A
    await expect(
      owner.mutation(api.editor.reparentEntry, {
        entryId: rootAId,
        parentEntryId: childId,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_INVALID_TREE_MOVE'
    })
  })

  it('rejects reparenting an entry under its own grandchild (A->B->C->A cycle)', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { rootAId, grandchildId } = await seedTreeFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')

    // rootA -> child -> grandchild; moving rootA under grandchild would create A->B->C->A
    await expect(
      owner.mutation(api.editor.reparentEntry, {
        entryId: rootAId,
        parentEntryId: grandchildId,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return getCmsErrorData(error)?.code === 'ENTRY_INVALID_TREE_MOVE'
    })
  })
})
