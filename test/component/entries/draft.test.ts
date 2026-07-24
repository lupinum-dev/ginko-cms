/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import {
  createCtx,
  publishEntry,
  revertDraftToPublished,
  seedEditorFixture,
  seedMember,
  seedMcpDelegation,
  seedOwner,
  seedSettings,
  seedMultiLocaleSettings,
} from './helpers'

const api = anyApi

describe('canonical draft lifecycle', () => {
  it('treats an explicit null body patch as a clear operation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 1,
      patch: { locales: { en: { bodyMdc: '# Existing body' } } },
    })
    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: 2,
      patch: { locales: { en: { bodyMdc: null } } },
    })

    expect(await ctx.readAll('entryLocaleDrafts')).toEqual([
      expect.objectContaining({ locale: 'en', bodyMdc: '', version: 3 }),
    ])
  })

  it('[EDT-09] rejects stale autosave and never creates editorial history for autosaves', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'First autosave' } } } },
      }),
    ).resolves.toEqual({ draftVersion: 2, dirtyLocales: [] })

    await expect(
      owner.saveEntryDraft({
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'Stale autosave' } } } },
      }),
    ).rejects.toSatisfy(
      (error: unknown) => getCmsErrorData(error)?.code === 'ENTRY_CONCURRENT_EDIT',
    )

    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual([
      expect.objectContaining({
        entryId,
        locale: 'en',
        values: expect.objectContaining({ title: 'First autosave' }),
        version: 2,
      }),
    ])
  })

  it('[EDT-01][EDT-08] saves canonical scalar drafts while immutable public output remains the actual comparison source', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')

    await publishEntry(owner, entryId)
    const publicBefore = structuredClone(await ctx.readAll('publicEntries'))
    const canonicalBefore = (await ctx.readAll('entries'))[0]!

    await owner.saveEntryDraft({
      entryId,
      expectedDraftVersion: canonicalBefore.draftVersion,
      patch: {
        shared: { shared: { featured: true } },
        locales: { en: { values: { title: 'Unpublished rewrite' } } },
      },
    })

    expect(await ctx.readAll('publicEntries')).toEqual(publicBefore)
    const canonicalAfter = (await ctx.readAll('entries'))[0]!
    expect(canonicalAfter.shared).toEqual({ featured: true })
    expect(canonicalAfter.sharedVersion).toBe(canonicalBefore.sharedVersion + 1)
    expect(canonicalAfter.activePublications).toEqual(canonicalBefore.activePublications)
    expect(await ctx.readAll('entryLocaleDrafts')).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ title: 'Unpublished rewrite' }),
      }),
    ])
  })

  it('removes nonpublished locale drafts and their exact derived rows when reverting', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)
    await owner.mutation(api.entries.draft.createLocaleVariant, {
      entryId,
      locale: 'de',
      source: { kind: 'blank' },
    })
    const entry = (await ctx.readAll('entries'))[0]!
    const german = (await ctx.readAll('entryLocaleDrafts')).find((row) => row.locale === 'de')!
    await ctx.seed('contentAssetRefs', {
      sourceKind: 'draft',
      sourceId: `${entryId}:de`,
      sourceFence: { kind: 'draftVersion', version: german.version },
      assetId: 'asset-de-only',
      fieldPath: 'bodyMdc',
      locale: 'de',
      entryId: entry._id,
      collection: entry.collection,
    })
    expect(await ctx.readAll('draftSearchEntries')).toContainEqual(
      expect.objectContaining({ entryId: entry._id, locale: 'de' }),
    )

    await expect(revertDraftToPublished(owner, entryId)).resolves.toMatchObject({
      dirtyLocales: [],
    })
    expect((await ctx.readAll('entryLocaleDrafts')).map((row) => row.locale)).toEqual(['en'])
    expect(await ctx.readAll('contentAssetRefs')).not.toContainEqual(
      expect.objectContaining({ sourceKind: 'draft', sourceId: `${entryId}:de` }),
    )
    expect(await ctx.readAll('draftSearchEntries')).not.toContainEqual(
      expect.objectContaining({ entryId: entry._id, locale: 'de' }),
    )
  })

  it('allows editors to edit but rejects viewer writes and editor publication', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedMember(ctx, { userId: 'viewer-1', role: 'viewer' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const editor = ctx.asCmsUser('editor-1')
    const viewer = ctx.asCmsUser('viewer-1')

    await expect(
      viewer.saveEntryDraft({
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'Forbidden' } } } },
      }),
    ).rejects.toThrow(/Edit entries/i)

    await expect(
      editor.saveEntryDraft({
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'Editor draft' } } } },
      }),
    ).resolves.toEqual({ draftVersion: 2, dirtyLocales: [] })
    await expect(publishEntry(editor, entryId)).rejects.toThrow(/Publish entries/i)
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('fences MCP draft writes by an active run and never grants direct publication', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    await seedMcpDelegation(ctx, {
      oauthClientId: 'client-editor',
      ownerUserId: 'editor-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })
    const agent = ctx.asMcpOAuth('client-editor', 'editor-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Edit draft' })

    await expect(
      agent.mutation(api.editor.mcpSaveEntryDraft, {
        agentRunId: run._id,
        entryId,
        expectedDraftVersion: 1,
        patch: { locales: { en: { values: { title: 'Agent draft' } } } },
      }),
    ).resolves.toEqual({ draftVersion: 2, dirtyLocales: [] })
    await expect(publishEntry(agent, entryId)).rejects.toThrow(/Publish entries/i)

    await agent.mutation(api.agentRuns.completeRun, { agentRunId: run._id })
    await expect(
      agent.mutation(api.editor.mcpSaveEntryDraft, {
        agentRunId: run._id,
        entryId,
        expectedDraftVersion: 2,
        patch: { locales: { en: { values: { title: 'Too late' } } } },
      }),
    ).rejects.toThrow(/not active/i)
    expect(await ctx.readAll('entryRevisions')).toEqual([])
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })
})
