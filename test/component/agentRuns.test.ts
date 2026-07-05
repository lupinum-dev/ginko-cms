import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedMember, seedOwner } from '../helpers'

const api = anyApi

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
      requestedScopes: [cmsPermissionKeys.read],
      safetyMode: 'review-gated',
      status: 'active',
    })
    expect(second).toMatchObject({
      credentialApiKeyId: 'ba_key_owner',
      delegatedUserId: 'owner-1',
      requestedScopes: [cmsPermissionKeys.read],
      safetyMode: 'review-gated',
      status: 'active',
    })
  })

  it('blocks writes after a run is completed, revoked, or expired', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const owner = ctx.asCmsUser('owner-1')
    const completed = await owner.mutation(api.agentRuns.startRun, {
      taskName: 'Complete me',
    })
    await expect(
      owner.mutation(api.agentRuns.recordWrite, {
        agentRunId: completed._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).resolves.toMatchObject({ lastWriteAt: expect.any(Number) })
    await owner.mutation(api.agentRuns.completeRun, { agentRunId: completed._id })
    await expect(
      owner.mutation(api.agentRuns.recordWrite, {
        agentRunId: completed._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).rejects.toThrow('Agent run is not active.')

    const revoked = await owner.mutation(api.agentRuns.startRun, {
      taskName: 'Revoke me',
    })
    await owner.mutation(api.agentRuns.revokeRun, { agentRunId: revoked._id })
    await expect(
      owner.mutation(api.agentRuns.recordWrite, {
        agentRunId: revoked._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).rejects.toThrow('Agent run is not active.')

    const expired = await owner.mutation(api.agentRuns.startRun, {
      taskName: 'Expire me',
      expiresAt: Date.now() - 1,
    })
    await expect(
      owner.mutation(api.agentRuns.recordWrite, {
        agentRunId: expired._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).rejects.toThrow('Agent run has expired.')

    const failedRunId = await ctx.seed(
      'agentRuns' as never,
      {
        credentialApiKeyId: null,
        delegatedUserId: 'owner-1',
        taskName: 'Failed run',
        status: 'failed',
        createdBy: 'owner-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: null,
        endedAt: Date.now(),
        lastWriteAt: null,
        lastError: 'Tool failed.',
      } as never,
    )
    await expect(
      owner.mutation(api.agentRuns.recordWrite, {
        agentRunId: failedRunId,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).rejects.toThrow('Agent run is not active.')
  })

  it('keeps write records tied to the delegated user and credential', async () => {
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
    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'ba_key_other',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
      status: 'active',
      createdBy: 'owner-1',
      createdAt: Date.now(),
      updatedBy: 'owner-1',
      updatedAt: Date.now(),
      revokedAt: null,
    })
    const run = await ctx.asMcpApiKey('ba_key_owner', 'owner-1').mutation(api.agentRuns.startRun, {
      taskName: 'Bound run',
    })

    const ownerAgent = ctx.asMcpApiKey('ba_key_owner', 'owner-1')
    await expect(
      ownerAgent.mutation(api.agentRuns.recordWrite, {
        agentRunId: run._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).resolves.toMatchObject({ lastWriteAt: expect.any(Number) })

    await expect(
      ownerAgent.query(api.editor.listActivity, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([
        expect.objectContaining({
          kind: 'agentRun.write',
          appIdentityId: 'owner-1',
          detail: expect.objectContaining({
            agentRunId: run._id,
            operationId: 'ginko-cms.save-entry-draft',
            credentialApiKeyId: 'ba_key_owner',
            callerApiKeyId: 'ba_key_owner',
          }),
        }),
      ]),
    })

    await expect(
      ctx.asMcpApiKey('ba_key_other', 'owner-1').mutation(api.agentRuns.recordWrite, {
        agentRunId: run._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).rejects.toThrow('Agent run belongs to a different MCP credential.')
  })

  it('lists only the current user agent runs', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const outsider = ctx.asCmsUser('outsider-1')
    const expiresAt = Date.now() + 60_000
    const first = await owner.mutation(api.agentRuns.startRun, {
      taskName: 'First visible run',
      expiresAt,
    })
    const second = await owner.mutation(api.agentRuns.startRun, {
      taskName: 'Second visible run',
    })

    await expect(owner.query(api.agentRuns.listOwnRuns, { limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        _id: second._id,
        taskName: 'Second visible run',
        delegatedUserId: 'owner-1',
        requestedScopes: [],
        safetyMode: 'human',
        expiresAt: null,
        lastWriteAt: null,
      }),
      expect.objectContaining({
        _id: first._id,
        taskName: 'First visible run',
        delegatedUserId: 'owner-1',
        requestedScopes: [],
        safetyMode: 'human',
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

    const owner = ctx.asCmsUser('owner-1')
    const editor = ctx.asCmsUser('editor-1')
    const run = await owner.mutation(api.agentRuns.startRun, {
      taskName: 'Owner run',
    })

    await expect(
      editor.mutation(api.agentRuns.completeRun, { agentRunId: run._id }),
    ).rejects.toThrow('Agent run belongs to a different user.')
    await expect(editor.mutation(api.agentRuns.revokeRun, { agentRunId: run._id })).rejects.toThrow(
      'Agent run belongs to a different user.',
    )
  })

  it('blocks MCP callers from using human-started runs', async () => {
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

    const run = await ctx.asCmsUser('owner-1').mutation(api.agentRuns.startRun, {
      taskName: 'Human run',
    })

    await expect(
      ctx.asMcpApiKey('ba_key_owner', 'owner-1').mutation(api.agentRuns.recordWrite, {
        agentRunId: run._id,
        operationId: 'ginko-cms.save-entry-draft',
      }),
    ).rejects.toThrow('Agent run belongs to a different MCP credential.')
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
