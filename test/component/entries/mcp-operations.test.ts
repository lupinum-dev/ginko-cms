/// <reference types="vite/client" />

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  createCtx,
  currentDraftVersion,
  publishEntry,
  seedEditorFixture,
  seedOwner,
  seedSettings,
} from './helpers'

const api = anyApi

async function seedOwnerMcpCredential(
  ctx: ReturnType<typeof createCtx>,
  apiKeyId: string,
  scopes = [
    cmsPermissionKeys.read,
    cmsPermissionKeys.publishEntries,
    cmsPermissionKeys.archiveEntries,
  ],
) {
  await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.upsertSettings, {
    apiKeyId,
    ownerUserId: 'owner-1',
    scopes,
  })
  return ctx.asMcpApiKey(apiKeyId, 'owner-1')
}

async function mcpPublishEntry(
  agent: ReturnType<ReturnType<typeof createCtx>['asMcpApiKey']>,
  args: { agentRunId: string; entryId: string },
) {
  const expectedVersion = await currentDraftVersion(agent, args.entryId)
  const preview = await agent.mutation(api.editor.mcpPreviewPublishEntryOperation, {
    agentRunId: args.agentRunId,
    entryId: args.entryId,
    expectedVersion,
    locales: ['en'],
  })
  expect(preview).toMatchObject({
    allowed: true,
    confirmation: { token: expect.any(String) },
  })
  return await agent.mutation(api.editor.mcpPublishEntryOperationExecute, {
    agentRunId: args.agentRunId,
    entryId: args.entryId,
    expectedVersion,
    locales: ['en'],
    _confirmationToken: preview.confirmation.token,
  })
}

async function mcpArchiveEntry(
  agent: ReturnType<ReturnType<typeof createCtx>['asMcpApiKey']>,
  args: { agentRunId: string; entryId: string },
) {
  const preview = await agent.mutation(api.editor.mcpPreviewArchiveEntryOperation, {
    agentRunId: args.agentRunId,
    entryId: args.entryId,
  })
  expect(preview).toMatchObject({
    allowed: true,
    confirmation: { token: expect.any(String) },
  })
  return await agent.mutation(api.editor.mcpArchiveEntryOperationExecute, {
    agentRunId: args.agentRunId,
    entryId: args.entryId,
    _confirmationToken: preview.confirmation.token,
  })
}

describe('component: MCP entry operations', () => {
  it('runs publish, archive, and restore only through an active owned agent run and records writes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const agent = await seedOwnerMcpCredential(ctx, 'ba_key_owner_ops')
    const run = await agent.mutation(api.agentRuns.startRun, {
      taskName: 'Ship and restore page',
    })

    await expect(mcpPublishEntry(agent, { agentRunId: run._id, entryId })).resolves.toMatchObject({
      versionId: expect.any(String),
    })
    expect(await ctx.readAll('publicEntries')).toHaveLength(1)

    await expect(mcpArchiveEntry(agent, { agentRunId: run._id, entryId })).resolves.toBeNull()
    expect(await ctx.readAll('publicEntries')).toEqual([])
    expect(await ctx.readAll('publicRoutes')).toEqual([])

    // Restore is the accepted bounded-write exception: it requires an active
    // owned agent run and records agent activity, but does not require a
    // publish-style destructive confirmation.
    await expect(
      agent.mutation(api.editor.mcpRestoreEntry, {
        agentRunId: run._id,
        entryId,
      }),
    ).resolves.toBeNull()
    await expect(agent.query(api.editor.getEntry, { id: entryId })).resolves.toMatchObject({
      status: 'draft',
    })

    const [updatedRun] = await ctx.readAll('agentRuns')
    expect(updatedRun).toMatchObject({
      _id: run._id,
      lastWriteAt: expect.any(Number),
    })
    const writeOperationIds = (await ctx.readAll('activity'))
      .filter((row: { kind: string }) => row.kind === 'agentRun.write')
      .map((row: { detail?: { operationId?: string } | null }) => row.detail?.operationId)
    expect(writeOperationIds).toEqual([
      'ginko-cms.publish-entry',
      'ginko-cms.archive-entry',
      'ginko-cms.restore-entry',
    ])
  })

  it('rejects MCP destructive operations for completed or wrong-credential runs without public changes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedSettings(ctx)
    const { entryId } = await seedEditorFixture(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await publishEntry(owner, entryId)
    const beforePublicEntries = await ctx.readAll('publicEntries')
    const beforePublicRoutes = await ctx.readAll('publicRoutes')

    const ownerAgent = await seedOwnerMcpCredential(ctx, 'ba_key_owner_ops')
    const otherAgent = await seedOwnerMcpCredential(ctx, 'ba_key_other_ops')
    const activeRun = await ownerAgent.mutation(api.agentRuns.startRun, {
      taskName: 'Attempt archive',
    })
    const completedRun = await ownerAgent.mutation(api.agentRuns.startRun, {
      taskName: 'Already completed',
    })
    await ownerAgent.mutation(api.agentRuns.completeRun, { agentRunId: completedRun._id })

    await expect(
      otherAgent.mutation(api.editor.mcpPreviewArchiveEntryOperation, {
        agentRunId: activeRun._id,
        entryId,
      }),
    ).rejects.toThrow('Agent run belongs to a different MCP credential.')
    await expect(
      ownerAgent.mutation(api.editor.mcpPreviewArchiveEntryOperation, {
        agentRunId: completedRun._id,
        entryId,
      }),
    ).rejects.toThrow('Agent run is not active.')

    expect(await ctx.readAll('publicEntries')).toEqual(beforePublicEntries)
    expect(await ctx.readAll('publicRoutes')).toEqual(beforePublicRoutes)
    expect(
      (await ctx.readAll('activity')).filter(
        (row: { kind: string }) => row.kind === 'agentRun.write',
      ),
    ).toEqual([])
  })
})
