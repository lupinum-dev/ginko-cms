/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  currentDraftVersion,
  seedEditorFixture,
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

  it('denies MCP callers on the human publish and archive operations', async () => {
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
    expect(await ctx.readAll('publicEntries')).toEqual([])
  })
})
