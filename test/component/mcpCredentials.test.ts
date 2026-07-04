import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, executeConfirmedOperation, seedMember, seedOwner } from '../helpers'

const api = anyApi

describe('component: MCP credential settings', () => {
  it('rejects CMS credential scopes that exceed the owner member role', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })

    const owner = ctx.asCmsUser('owner-1')

    await expect(
      owner.mutation(api.mcpCredentials.upsertSettings, {
        apiKeyId: 'ba_key_editor',
        ownerUserId: 'editor-1',
        scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
      }),
    ).resolves.toMatchObject({
      apiKeyId: 'ba_key_editor',
      ownerUserId: 'editor-1',
      status: 'active',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    await expect(
      owner.mutation(api.mcpCredentials.upsertSettings, {
        apiKeyId: 'ba_key_editor_publish',
        ownerUserId: 'editor-1',
        scopes: [cmsPermissionKeys.publishEntries],
      }),
    ).rejects.toThrow('Credential scope exceeds current member role.')
  })

  it('limits owner credentials to explicitly granted scopes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner_edit_only',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccess, {
        apiKeyId: 'ba_key_owner_edit_only',
      }),
    ).resolves.toMatchObject({
      ownerUserId: 'owner-1',
      role: 'owner',
      effectivePermissions: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.editEntries]: true,
        [cmsPermissionKeys.publishEntries]: false,
        [cmsPermissionKeys.manageMembers]: false,
      },
    })
  })

  it('lists only the current owner credential settings', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'owner-2', role: 'owner' })

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner_1',
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_owner_2',
      ownerUserId: 'owner-2',
      scopes: [cmsPermissionKeys.read],
    })

    await expect(owner.query(api.mcpCredentials.listOwnSettings, {})).resolves.toEqual([
      expect.objectContaining({
        apiKeyId: 'ba_key_owner_1',
        ownerUserId: 'owner-1',
      }),
    ])
  })

  it('recomputes effective access from the current owner role', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'publisher-1', role: 'publisher' })

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_publisher',
      ownerUserId: 'publisher-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.publishEntries],
    })

    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccess, {
        apiKeyId: 'ba_key_publisher',
      }),
    ).resolves.toMatchObject({
      ownerUserId: 'publisher-1',
      role: 'publisher',
      effectivePermissions: {
        [cmsPermissionKeys.publishEntries]: true,
      },
    })

    await owner.mutation(api.members.updateMemberRole, {
      userId: 'publisher-1',
      role: 'viewer',
    })

    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccess, {
        apiKeyId: 'ba_key_publisher',
      }),
    ).resolves.toMatchObject({
      ownerUserId: 'publisher-1',
      role: 'viewer',
      effectivePermissions: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.publishEntries]: false,
      },
    })
  })

  it('revokes credential settings when the owner member is removed', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, { userId: 'editor-1', role: 'editor' })

    const owner = ctx.asCmsUser('owner-1')
    await owner.mutation(api.mcpCredentials.upsertSettings, {
      apiKeyId: 'ba_key_removed_editor',
      ownerUserId: 'editor-1',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    await executeConfirmedOperation(owner, {
      operationId: 'ginko-cms.remove-member',
      preview: api.members.previewRemoveMemberOperation,
      execute: api.members.removeMemberOperationExecute,
      args: { userId: 'editor-1' },
    })

    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccess, {
        apiKeyId: 'ba_key_removed_editor',
      }),
    ).resolves.toBeNull()

    const rows = await ctx.readAll('mcpCredentialSettings')
    expect(rows).toEqual([
      expect.objectContaining({
        apiKeyId: 'ba_key_removed_editor',
        status: 'revoked',
        revokedAt: expect.any(Number),
      }),
    ])
  })
})
