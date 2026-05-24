/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, executeConfirmedOperation, seedMember, seedOwner } from '../helpers'

const api = anyApi

describe('component: members CRUD', () => {
  it('adds and reads members through protected mutations', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const owner = ctx.asCmsUser('owner-1')

    const id = await owner.mutation(api.members.addMember, {
      userId: 'editor-1',
      role: 'editor',
      displayName: 'Editor One',
      email: 'editor@example.com',
    })

    expect(typeof id).toBe('string')

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

  it('updates member roles and removes members through protected mutations', async () => {
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
  })

  it('rejects demoting the last remaining owner', async () => {
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
  })

  it('rejects removing the last remaining owner', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      executeConfirmedOperation(owner, {
        operationId: 'ginko-cms.remove-member',
        preview: api.members.previewRemoveMemberOperation,
        execute: api.members.removeMemberOperationExecute,
        args: { userId: 'owner-1' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const cmsError = getCmsErrorData(error)
      return (
        cmsError?.code === 'MEMBER_LAST_OWNER' &&
        cmsError.message === 'Cannot remove the last owner'
      )
    })
  })

  it('revokes MCP keys when removing a member', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    const activeKeyId = await ctx.seed(
      'mcpKeys' as never,
      {
        name: 'editor key',
        prefix: 'mcp_editor...',
        hash: 'hash_editor',
        boundUserId: 'editor-1',
        issuedBy: 'owner-1',
        status: 'active',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      } as never,
    )

    const owner = ctx.asCmsUser('owner-1')
    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.remove-member',
      preview: api.members.previewRemoveMemberOperation,
      execute: api.members.removeMemberOperationExecute,
      args: { userId: 'editor-1' },
    })

    const key = await ctx.raw.run(async (innerCtx) => await innerCtx.db.get(activeKeyId as never))
    expect(key).toMatchObject({
      status: 'revoked',
      revokedAt: expect.any(Number),
    })

    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    await expect(
      ctx.raw.mutation(api.mcpKeys.consumeToken, {
        hash: 'hash_editor',
        seenAt: Date.now(),
        clientIp: null,
      }),
    ).resolves.toBeNull()
  })
})
