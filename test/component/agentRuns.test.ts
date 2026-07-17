import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember, seedOwner } from '../helpers'

const api = anyApi

async function ownerAgent(ctx: ReturnType<typeof createCtx>, apiKeyId = 'ba_key_owner') {
  await ctx.seed('mcpCredentialSettings', {
    apiKeyId,
    ownerUserId: 'owner-1',
    scopes: [cmsPermissionKeys.read],
    status: 'active',
    createdBy: 'owner-1',
    createdAt: Date.now(),
    updatedBy: 'owner-1',
    updatedAt: Date.now(),
    revokedAt: null,
  })
  return ctx.asMcpApiKey(apiKeyId, 'owner-1')
}

describe('component: agent runs', () => {
  it('allows one credential to create multiple bounded runs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'ba_key_owner',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
      status: 'active',
      createdBy: 'owner-1',
      createdAt: Date.now(),
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
      revokedAt: null,
    })

    const ownerAgent = ctx.asMcpApiKey('ba_key_owner', 'owner-1')
    const first = await ownerAgent.mutation(api.agentRuns.startRun, {
      taskName: 'Draft launch post',
    })
    const second = await ownerAgent.mutation(api.agentRuns.startRun, {
      taskName: 'Translate launch post',
    })

    expect(first._id).not.toBe(second._id)
    expect(first).toMatchObject({
      credentialApiKeyId: 'ba_key_owner',
      delegatedUserId: 'owner-1',
      scopeSnapshot: [cmsPermissionKeys.read],
      status: 'active',
      expiresAt: expect.any(Number),
    })
    expect(second).toMatchObject({
      credentialApiKeyId: 'ba_key_owner',
      delegatedUserId: 'owner-1',
      scopeSnapshot: [cmsPermissionKeys.read],
      status: 'active',
      expiresAt: expect.any(Number),
    })
  })

  it('keeps the effective scope snapshot immutable after credential settings change', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })
    const agent = ctx.asMcpApiKey('ba_key_owner', 'owner-1')
    const run = await agent.mutation(api.agentRuns.startRun, { taskName: 'Historical scope' })

    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    await expect(agent.query(api.agentRuns.listOwnRuns, { limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        _id: run._id,
        scopeSnapshot: [cmsPermissionKeys.read],
      }),
    ])
  })

  it('lists only the current user agent runs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const agent = await ownerAgent(ctx)
    const outsider = ctx.asCmsUser('outsider-1')
    const expiresAt = Date.now() + 60_000
    const first = await agent.mutation(api.agentRuns.startRun, {
      taskName: 'First visible run',
      expiresAt,
    })
    const second = await agent.mutation(api.agentRuns.startRun, {
      taskName: 'Second visible run',
    })

    await expect(owner.query(api.agentRuns.listOwnRuns, { limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        _id: second._id,
        taskName: 'Second visible run',
        delegatedUserId: 'owner-1',
        scopeSnapshot: [cmsPermissionKeys.read],
        expiresAt: expect.any(Number),
        lastWriteAt: null,
      }),
      expect.objectContaining({
        _id: first._id,
        taskName: 'First visible run',
        delegatedUserId: 'owner-1',
        scopeSnapshot: [cmsPermissionKeys.read],
        expiresAt,
        lastWriteAt: null,
      }),
    ])
    await expect(outsider.query(api.agentRuns.listOwnRuns, { limit: 10 })).rejects.toThrow(
      'Forbidden: Read CMS',
    )
  })

  it('blocks other members from completing or revoking a run', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })

    const editor = ctx.asCmsUser('editor-1')
    const agent = await ownerAgent(ctx)
    const run = await agent.mutation(api.agentRuns.startRun, {
      taskName: 'Owner run',
    })

    await expect(
      editor.mutation(api.agentRuns.completeRun, { agentRunId: run._id }),
    ).rejects.toThrow('Agent run belongs to a different user.')
    await expect(editor.mutation(api.agentRuns.revokeRun, { agentRunId: run._id })).rejects.toThrow(
      'Agent run belongs to a different user.',
    )
  })

  it('does not create credential-free agent runs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'ba_key_owner',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
      status: 'active',
      createdBy: 'owner-1',
      createdAt: Date.now(),
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
      revokedAt: null,
    })

    await expect(
      ctx.asCmsUser('owner-1').mutation(api.agentRuns.startRun, {
        taskName: 'Human run',
      }),
    ).rejects.toThrow('Only MCP credentials can start agent runs.')
  })

  it('enforces server-selected expiry and an active-run cap', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const agent = await ownerAgent(ctx)
    const before = Date.now()

    const defaulted = await agent.mutation(api.agentRuns.startRun, {
      taskName: 'Default expiry',
    })
    expect(defaulted.expiresAt).toBeGreaterThan(before)
    expect(defaulted.expiresAt).toBeLessThanOrEqual(before + 4 * 60 * 60 * 1_000 + 1_000)

    await expect(
      agent.mutation(api.agentRuns.startRun, {
        taskName: 'Already expired',
        expiresAt: Date.now() - 1,
      }),
    ).rejects.toThrow('Agent run expiry must be in the future.')
    await expect(
      agent.mutation(api.agentRuns.startRun, {
        taskName: 'Too long',
        expiresAt: Date.now() + 24 * 60 * 60 * 1_000 + 60_000,
      }),
    ).rejects.toThrow('Agent runs cannot last longer than 24 hours.')

    for (let index = 1; index < 10; index += 1) {
      await agent.mutation(api.agentRuns.startRun, { taskName: `Active run ${index}` })
    }
    await expect(
      agent.mutation(api.agentRuns.startRun, { taskName: 'One too many' }),
    ).rejects.toThrow('A credential can have at most 10 active agent runs.')

    await agent.mutation(api.agentRuns.completeRun, { agentRunId: defaulted._id })
    await expect(
      agent.mutation(api.agentRuns.startRun, { taskName: 'Replacement run' }),
    ).resolves.toMatchObject({ status: 'active' })
  })

  it('requires member access before starting runs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const outsider = ctx.asCmsUser('outsider-1')

    await expect(
      outsider.mutation(api.agentRuns.startRun, {
        taskName: 'No access',
      }),
    ).rejects.toThrow('Forbidden: Read CMS')
  })
})
