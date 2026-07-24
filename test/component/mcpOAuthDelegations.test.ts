import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, installTestContract, seedMember, seedOwner } from '../helpers'

const api = anyApi

describe('component: CMS-owned MCP OAuth delegations', () => {
  it('creates an application delegation without minting or storing a bearer credential', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const created = await ctx
      .asCmsUser('owner-1')
      .mutation(api.mcpOAuthDelegations.createDelegation, {
        ownerUserId: 'owner-1',
        oauthClientId: 'client-codex',
        label: 'Codex',
        scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
      })

    expect(created).toMatchObject({
      delegationId: expect.stringMatching(/^mcpd_/),
      oauthClientId: 'client-codex',
      ownerUserId: 'owner-1',
      label: 'Codex',
      status: 'active',
    })
    const serialized = JSON.stringify(await ctx.readAll('mcpOAuthDelegations'))
    expect(serialized).not.toMatch(/bearer|secretHash|token/i)
  })

  it('intersects token scope, current delegation scope, and current member role on every call', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await ctx.asCmsUser('owner-1').mutation(api.mcpOAuthDelegations.createDelegation, {
      ownerUserId: 'editor-1',
      oauthClientId: 'client-editor',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    const readOnlyToken = ctx.asMcpOAuth('client-editor', 'editor-1', [cmsPermissionKeys.read])
    await expect(readOnlyToken.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      userId: 'editor-1',
      can: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.editEntries]: false,
      },
    })

    await ctx.asCmsUser('owner-1').mutation(api.members.updateMemberRole, {
      userId: 'editor-1',
      role: 'viewer',
    })
    const fullToken = ctx.asMcpOAuth('client-editor', 'editor-1')
    await expect(fullToken.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      role: 'viewer',
      can: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.editEntries]: false,
      },
    })
  })

  it('revokes immediately and a replacement delegation cannot resume an old agent run', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const owner = ctx.asCmsUser('owner-1')
    const first = await owner.mutation(api.mcpOAuthDelegations.createDelegation, {
      ownerUserId: 'owner-1',
      oauthClientId: 'client-owner',
      scopes: [cmsPermissionKeys.read],
    })
    const oauth = ctx.asMcpOAuth('client-owner', 'owner-1', [cmsPermissionKeys.read])
    const run = await oauth.mutation(api.agentRuns.startRun, { taskName: 'First generation' })

    await owner.mutation(api.mcpOAuthDelegations.revokeDelegation, {
      delegationId: first.delegationId,
    })
    await expect(oauth.query(api.members.getAccessContext, {})).resolves.toBeNull()

    const second = await owner.mutation(api.mcpOAuthDelegations.createDelegation, {
      ownerUserId: 'owner-1',
      oauthClientId: 'client-owner',
      scopes: [cmsPermissionKeys.read],
    })
    expect(second.delegationId).not.toBe(first.delegationId)
    await expect(oauth.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      userId: 'owner-1',
    })
    await expect(
      oauth.mutation(api.agentRuns.completeRun, { agentRunId: run._id }),
    ).rejects.toThrow('different MCP OAuth delegation')
  })

  it('rejects malformed clients, duplicate active mappings, and expired delegations', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    await expect(
      owner.mutation(api.mcpOAuthDelegations.createDelegation, {
        ownerUserId: 'owner-1',
        oauthClientId: ' client ',
        scopes: [cmsPermissionKeys.read],
      }),
    ).rejects.toThrow('client ID is invalid')
    await expect(
      owner.mutation(api.mcpOAuthDelegations.createDelegation, {
        ownerUserId: 'owner-1',
        oauthClientId: 'client-expired',
        scopes: [cmsPermissionKeys.read],
        expiresAt: Date.now() - 1,
      }),
    ).rejects.toThrow('expiry must be in the future')

    await owner.mutation(api.mcpOAuthDelegations.createDelegation, {
      ownerUserId: 'owner-1',
      oauthClientId: 'client-active',
      scopes: [cmsPermissionKeys.read],
    })
    await expect(
      owner.mutation(api.mcpOAuthDelegations.createDelegation, {
        ownerUserId: 'owner-1',
        oauthClientId: 'client-active',
        scopes: [cmsPermissionKeys.read],
      }),
    ).rejects.toThrow('already exists')
  })

  it('commits at most one active delegation under synchronized creation', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        owner.mutation(api.mcpOAuthDelegations.createDelegation, {
          ownerUserId: 'owner-1',
          oauthClientId: 'client-concurrent',
          scopes: [cmsPermissionKeys.read],
        }),
      ),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(7)
    const active = (await ctx.readAll('mcpOAuthDelegations')).filter(
      (delegation) =>
        delegation.ownerUserId === 'owner-1' &&
        delegation.oauthClientId === 'client-concurrent' &&
        delegation.status === 'active',
    )
    expect(active).toHaveLength(1)
  })

  it('does not let caller metadata retarget a delegation to another subject', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await ctx.asCmsUser('owner-1').mutation(api.mcpOAuthDelegations.createDelegation, {
      ownerUserId: 'editor-1',
      oauthClientId: 'client-editor',
      scopes: [cmsPermissionKeys.read],
    })

    await expect(
      ctx.asMcpOAuth('client-editor', 'outsider-1').query(api.members.getAccessContext, {}),
    ).resolves.toBeNull()
  })
})
