import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createCtx } from './entries/helpers'

const api = anyApi

describe('legacy MCP credential bridge cutover', () => {
  it('deletes every legacy token, records one receipt, and is retry-safe', async () => {
    const ctx = createCtx()
    for (const status of ['active', 'revoked'] as const) {
      await ctx.seed(
        'mcpKeys' as never,
        {
          name: `${status} key`,
          prefix: `mcp_${status}`,
          hash: `${status}-secret-hash`,
          boundUserId: 'owner-1',
          issuedBy: 'owner-1',
          status,
          createdAt: 1,
        } as never,
      )
    }

    await expect(
      ctx.raw.mutation(api.legacyCredentialCutover.revokeAndDeleteLegacyMcpKeys, {}),
    ).resolves.toEqual({
      deletedCount: 2,
      activeCount: 1,
      revokedCount: 1,
      alreadyComplete: false,
    })
    expect(await ctx.readAll('mcpKeys')).toEqual([])
    expect(await ctx.readAll('legacyCredentialCutovers')).toEqual([
      expect.objectContaining({
        key: 'mcpKeys-v0.1.3',
        deletedCount: 2,
        activeCount: 1,
        revokedCount: 1,
      }),
    ])

    await expect(
      ctx.raw.mutation(api.legacyCredentialCutover.revokeAndDeleteLegacyMcpKeys, {}),
    ).resolves.toMatchObject({ alreadyComplete: true, deletedCount: 2 })
  })
})
