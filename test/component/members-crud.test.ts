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

  it('revokes MCP credential settings when removing a member', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })
    const settingsId = await ctx.seed(
      'mcpCredentialSettings' as never,
      {
        apiKeyId: 'ba_key_editor',
        ownerUserId: 'editor-1',
        label: 'Editor key',
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
