/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, executeConfirmedOperation, seedMember, seedOwner } from '../helpers'

const api = anyApi

describe('component: members CRUD', () => {
  it('reads existing members through the protected member API', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, {
      userId: 'editor-1',
      role: 'editor',
      displayName: 'Editor One',
      email: 'editor@example.com',
    })

    const owner = ctx.asCmsUser('owner-1')

    const member = await owner.query(api.members.getMember, {
      userId: 'editor-1',
    })

    expect(member).toMatchObject({
      userId: 'editor-1',
      role: 'editor',
      displayName: 'Editor One',
      email: 'editor@example.com',
    })
  })

  it('[ADM-01] updates member roles and removes access through protected operations with canonical audit evidence', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })

    const owner = ctx.asCmsUser('owner-1')

    await owner.mutation(api.members.updateMemberRole, {
      userId: 'editor-1',
      role: 'viewer',
    })

    await expect(
      owner.query(api.members.getMember, {
        userId: 'editor-1',
      }),
    ).resolves.toMatchObject({
      userId: 'editor-1',
      role: 'viewer',
    })

    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.remove-member',
      preview: api.members.previewRemoveMemberOperation,
      execute: api.members.removeMemberOperationExecute,
      args: { userId: 'editor-1' },
    })

    await expect(
      owner.query(api.members.getMember, {
        userId: 'editor-1',
      }),
    ).resolves.toBeNull()

    expect(await ctx.readAll('activity')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'member.roleChanged',
          appIdentityId: 'owner-1',
          detail: { userId: 'editor-1', from: 'editor', to: 'viewer' },
        }),
        expect.objectContaining({
          kind: 'member.removed',
          appIdentityId: 'owner-1',
          detail: expect.objectContaining({ userId: 'editor-1' }),
        }),
      ]),
    )
  })

  it('[ADM-01] rejects invented roles and demoting the last remaining owner', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.members.updateMemberRole, {
        userId: 'owner-1',
        role: 'editor',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const cmsError = getCmsErrorData(error)
      return (
        cmsError?.code === 'MEMBER_LAST_OWNER' &&
        cmsError.message === 'Cannot demote the last owner'
      )
    })

    await expect(
      owner.mutation(api.members.updateMemberRole, {
        userId: 'owner-1',
        role: 'administrator',
      } as never),
    ).rejects.toThrow()
  })

  it('[ADM-01] rejects removing the last remaining owner during canonical preview', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const preview = await owner.mutation(api.members.previewRemoveMemberOperation, {
      userId: 'owner-1',
    })
    expect(preview).toMatchObject({
      allowed: false,
      blockers: [expect.objectContaining({ code: 'member-last-owner' })],
      confirmation: null,
    })
  })

  it('[ADM-01] revokes MCP OAuth delegations when removing a member', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    const settingsId = await ctx.seed(
      'mcpOAuthDelegations' as never,
      {
        delegationId: 'mcpd_editor',
        oauthClientId: 'client-editor',
        ownerUserId: 'editor-1',
        label: 'Editor delegation',
        scopes: ['cms.entries.edit'],
        status: 'active',
        createdBy: 'owner-1',
        createdAt: Date.now(),
        updatedBy: 'owner-1',
        updatedAt: Date.now(),
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.remove-member',
      preview: api.members.previewRemoveMemberOperation,
      execute: api.members.removeMemberOperationExecute,
      args: { userId: 'editor-1' },
    })

    const settings = await ctx.raw.run(
      async (innerCtx) => await innerCtx.db.get(settingsId as never),
    )
    expect(settings).toMatchObject({
      status: 'revoked',
      revokedAt: expect.any(Number),
      updatedBy: 'owner-1',
    })
  })
})
