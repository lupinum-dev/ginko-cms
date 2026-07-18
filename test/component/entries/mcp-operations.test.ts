/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedEditorFixture,
  seedMultiLocaleSettings,
  seedOwner,
  seedSettings,
} from './helpers'

const api = anyApi

describe('component: MCP publish boundary', () => {
  it('allows a run-bound impact preview but never issues confirmation or changes public output', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner_ops',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })
    const agent = ctx.asMcpApiKey('ba_key_owner_ops', 'owner-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Preview publish' })
    const expectedVersion = await currentDraftVersion(agent, entryId)

    await expect(
      agent.mutation(api.editor.mcpPreviewPublishEntry, {
        agentRunId: run._id,
        entryId,
        expectedVersion,
        locales: ['en'],
      }),
    ).resolves.toMatchObject({ allowed: true, confirm: null, confirmation: null })
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('destructiveConfirmations')).toEqual([])
  })

  it('[AGT-07] denies MCP callers on every human public-output and lifecycle operation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner_ops',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })
    const agent = ctx.asMcpApiKey('ba_key_owner_ops', 'owner-1')
    const expectedVersion = await currentDraftVersion(agent, entryId)

    await expect(
      agent.mutation(api.editor.previewPublishEntryOperation, {
        entryId,
        expectedVersion,
        locales: ['en'],
      }),
    ).rejects.toThrow('Forbidden: Publish entries')
    await expect(
      agent.mutation(api.editor.previewArchiveEntryOperation, { entryId }),
    ).rejects.toThrow('Forbidden: Archive entries')
    await expect(
      agent.mutation(api.editor.previewUnpublishEntryOperation, { entryId, locales: ['en'] }),
    ).rejects.toThrow('Forbidden: Publish entries')
    await expect(
      agent.mutation(api.editor.previewRestoreEntryOperation, { entryId }),
    ).rejects.toThrow('Forbidden: Archive entries')
    await expect(
      agent.mutation(api.editor.previewPermanentlyDeleteEntryOperation, {
        entryId,
        confirmationPhrase: 'DELETE unreachable',
      }),
    ).rejects.toThrow('Forbidden: Delete entries')
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })

  it('[AGT-04][COL-01] attributes delegated draft work to its responsible member and immutable agent run without a forgeable activity path', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_activity',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })
    const agent = ctx.asMcpApiKey('ba_key_activity', 'owner-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Edit draft' })
    const expectedDraftVersion = await currentDraftVersion(agent, entryId)

    await agent.mutation(api.editor.mcpSaveEntryDraft, {
      agentRunId: run._id,
      entryId,
      expectedDraftVersion,
      patch: { locales: { en: { values: { title: 'Updated by agent' } } } },
    })

    const activity = await ctx.readAll('activity')
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'entry.draft-saved',
          entryId,
          appIdentityId: 'owner-1',
          detail: expect.objectContaining({ agentRunId: run._id }),
        }),
      ]),
    )
    expect(activity).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'agentRun.write' })]),
    )
    await expect(agent.query(api.agentRuns.listRuns, { limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        _id: run._id,
        credentialApiKeyId: 'ba_key_activity',
        delegatedUserId: 'owner-1',
        lastWriteAt: expect.any(Number),
      }),
    ])
  })

  it('[AGT-05] writes only the requested translation draft and leaves public output unchanged', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMultiLocaleSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId, ['en'])
    const publicBefore = await ctx.readAll('publicEntries')
    const entryBefore = (await ctx.readAll('entries')).find(
      (entry: { _id: string }) => String(entry._id) === entryId,
    )!

    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_translator',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })
    const agent = ctx.asMcpApiKey('ba_key_translator', 'owner-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Translate to German' })
    await agent.mutation(api.editor.mcpSaveEntryDraft, {
      agentRunId: run._id,
      entryId,
      expectedDraftVersion: await currentDraftVersion(agent, entryId),
      patch: {
        locales: {
          de: {
            values: { title: 'Hallo Welt', description: 'Deutscher Entwurf' },
            bodyMdc: '# Hallo Welt',
          },
        },
      },
    })

    const germanDraft = (await ctx.readAll('entryLocaleDrafts')).find(
      (draft: { entryId: string; locale: string }) =>
        String(draft.entryId) === entryId && draft.locale === 'de',
    )
    const entryAfter = (await ctx.readAll('entries')).find(
      (entry: { _id: string }) => String(entry._id) === entryId,
    )!
    expect(germanDraft).toMatchObject({
      locale: 'de',
      values: { title: 'Hallo Welt', description: 'Deutscher Entwurf' },
      bodyMdc: '# Hallo Welt',
    })
    expect(entryAfter.shared).toEqual(entryBefore.shared)
    expect(entryAfter.activePublications).toEqual(entryBefore.activePublications)
    expect(await ctx.readAll('publicEntries')).toEqual(publicBefore)
    expect(publicBefore).toHaveLength(1)
    expect(publicBefore[0]).toMatchObject({ locale: 'en' })
  })
})
