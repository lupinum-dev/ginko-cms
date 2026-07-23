import { createHash } from 'node:crypto'

import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx, seedOwner } from '../helpers'

const api = anyApi

function secretHash(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

function admissionArgs(secret: string, requestId: string) {
  return {
    secretHash: secretHash(secret),
    ipBucketKey: 'a'.repeat(64),
    credentialBucketKey: secretHash(`credential:${secret}`),
    requestId,
  }
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

  it('admits active credentials without exposing the hash in owner views', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')
    const created = await owner.mutation(api.mcpCredentials.createCredential, {
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })

    await expect(
      ctx.raw.mutation(
        api.mcpCredentials.admitAccessBySecretHash,
        admissionArgs(created.bearerToken, 'active-request'),
      ),
    ).resolves.toEqual({
      kind: 'access',
      access: {
        apiKeyId: created.settings.apiKeyId,
        ownerUserId: 'owner-1',
        scopes: [cmsPermissionKeys.read],
        expiresAt: null,
      },
    })
    expect(JSON.stringify(await owner.query(api.mcpCredentials.listOwnSettings, {}))).not.toContain(
      secretHash(created.bearerToken),
    )
  })

  it('atomically admits valid credentials and bounds synchronized invalid attempts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const created = await ctx.asCmsUser('owner-1').mutation(api.mcpCredentials.createCredential, {
      ownerUserId: 'owner-1',
      scopes: [cmsPermissionKeys.read],
    })
    const ipBucketKey = 'a'.repeat(64)
    const credentialBucketKey = 'b'.repeat(64)

    await expect(
      ctx.raw.mutation(api.mcpCredentials.admitAccessBySecretHash, {
        secretHash: secretHash(created.bearerToken),
        ipBucketKey,
        credentialBucketKey,
        requestId: 'valid-request',
      }),
    ).resolves.toEqual({
      kind: 'access',
      access: {
        apiKeyId: created.settings.apiKeyId,
        ownerUserId: 'owner-1',
        scopes: [cmsPermissionKeys.read],
        expiresAt: null,
      },
    })
    expect(await ctx.readAll('mcpAuthFailureBuckets')).toEqual([])

    const invalid = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        ctx.raw.mutation(api.mcpCredentials.admitAccessBySecretHash, {
          secretHash: secretHash('invalid-bearer'),
          ipBucketKey,
          credentialBucketKey,
          requestId: `invalid-${index}`,
        }),
      ),
    )
    expect(invalid).toEqual(Array.from({ length: 5 }, () => ({ kind: 'invalid' })))
    await expect(
      ctx.raw.mutation(api.mcpCredentials.admitAccessBySecretHash, {
        secretHash: secretHash('invalid-bearer'),
        ipBucketKey,
        credentialBucketKey,
        requestId: 'limited-request',
      }),
    ).resolves.toEqual({ kind: 'limited' })

    const buckets = (await ctx.readAll('mcpAuthFailureBuckets')) as Array<{
      attempts: Array<{ requestId: string }>
    }>
    expect(buckets).toHaveLength(2)
    expect(buckets.map((bucket) => bucket.attempts.length).sort()).toEqual([5, 5])
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
      ctx.raw.mutation(
        api.mcpCredentials.admitAccessBySecretHash,
        admissionArgs(created.bearerToken, 'revoked-request'),
      ),
    ).resolves.toEqual({ kind: 'invalid' })
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
      ctx.raw.mutation(
        api.mcpCredentials.admitAccessBySecretHash,
        admissionArgs('expired-secret', 'expired-request'),
      ),
    ).resolves.toEqual({ kind: 'invalid' })
  })
})
