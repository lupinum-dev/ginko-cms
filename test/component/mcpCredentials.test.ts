import { createHash } from 'node:crypto'

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner } from '../helpers'

const api = anyApi

function secretHash(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

describe('component: CMS-owned MCP credentials', () => {
  it('[AGT-01] generates a secret once and persists only its hash', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)

    const created = await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.createCredential, {
      ownerUserId: 'owner-1',
      label: 'Codex',
      scopes: [cmsPermissionKeys.read, cmsPermissionKeys.editEntries],
    })

    expect(created.bearerToken).toMatch(/^[a-f0-9]{64}$/)
    expect(created.settings).toMatchObject({
      apiKeyId: expect.stringMatching(/^mcp_/),
      ownerUserId: 'owner-1',
      label: 'Codex',
      status: 'active',
    })
    const [stored] = await ctx.readAll('mcpCredentialSettings')
    expect(stored).toMatchObject({
      apiKeyId: created.settings.apiKeyId,
      secretHash: secretHash(created.bearerToken),
    })
    expect(JSON.stringify(await ctx.readAll('mcpCredentialSettings'))).not.toContain(
      created.bearerToken,
    )
    expect(JSON.stringify(await ctx.readAll('activity'))).not.toContain(created.bearerToken)
  })

  it('resolves active credentials by hash without exposing the hash in owner views', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const created = await owner.mutation(api.mcpCredentials.createCredential, {
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })

    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccessBySecretHash, {
        secretHash: secretHash(created.bearerToken),
      }),
    ).resolves.toEqual({ apiKeyId: created.settings.apiKeyId, ownerUserId: 'owner-1' })
    expect(JSON.stringify(await owner.query(api.mcpCredentials.listOwnSettings, {}))).not.toContain(
      secretHash(created.bearerToken),
    )
  })

  it('re-checks current scopes for every trusted MCP call', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const created = await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.createCredential, {
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })

    await expect(
      ctx.asMcpApiKey(created.settings.apiKeyId, 'owner-1').query(api.members.getAccessContext, {}),
    ).resolves.toMatchObject({
      userId: 'owner-1',
      can: {
        [cmsPermissionKeys.read]: true,
        [cmsPermissionKeys.editEntries]: false,
        [cmsPermissionKeys.publishEntries]: false,
      },
    })
  })

  it('[AGT-02] revocation immediately disables hash resolution and MCP access', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const created = await owner.mutation(api.mcpCredentials.createCredential, {
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })
    await owner.mutation(api.mcpCredentials.revokeSettings, {
      apiKeyId: created.settings.apiKeyId,
    })

    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccessBySecretHash, {
        secretHash: secretHash(created.bearerToken),
      }),
    ).resolves.toBeNull()
    await expect(
      ctx.asMcpApiKey(created.settings.apiKeyId, 'owner-1').query(api.members.getAccessContext, {}),
    ).resolves.toBeNull()
  })

  it('rejects expired-at-creation credentials and expires active rows fail closed', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await expect(
      ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.createCredential, {
        ownerUserId: 'owner-1',
        scopes: [cmsPermissionKeys.read],
        expiresAt: Date.now() - 1,
      }),
    ).rejects.toThrow('expiry must be in the future')

    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'mcp_expired',
      secretHash: secretHash('expired-secret'),
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
      status: 'active',
      expiresAt: Date.now() - 1,
      createdBy: 'owner-1',
      createdAt: 1,
      updatedBy: 'owner-1',
      updatedAt: 1,
      revokedAt: null,
    })
    await expect(
      ctx.raw.query(api.mcpCredentials.resolveAccessBySecretHash, {
        secretHash: secretHash('expired-secret'),
      }),
    ).resolves.toBeNull()
  })
})
