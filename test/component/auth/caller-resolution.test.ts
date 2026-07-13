import { describe, expect, it } from 'vitest'

import { resolveCmsCaller } from '#component/functions.js'

type Identity = {
  subject: string
  email?: string
  sessionId: string
  ginkoCredentialKind?: string
}

function createCtx(
  identity: Identity,
  settings?: Record<string, unknown>,
  member?: Record<string, unknown>,
) {
  const queriedTables: string[] = []
  const ctx = {
    auth: {
      getUserIdentity: async () => identity,
    },
    db: {
      query(table: string) {
        queriedTables.push(table)
        return {
          withIndex(
            _index: string,
            callback: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
          ) {
            callback({ eq: () => ({}) })
            return {
              first: async () =>
                table === 'mcpCredentialSettings' ? (settings ?? null) : (member ?? null),
            }
          },
        }
      },
    },
  }
  return {
    ctx: ctx as Parameters<typeof resolveCmsCaller>[0],
    queriedTables,
  }
}

describe('trusted CMS credential kind', () => {
  it('never treats a browser sessionId as an MCP credential id', async () => {
    const { ctx, queriedTables } = createCtx({
      subject: 'user_1',
      email: 'owner@example.com',
      sessionId: 'looks-like-an-api-key-id',
      ginkoCredentialKind: 'user-session',
    })

    await expect(resolveCmsCaller(ctx)).resolves.toMatchObject({
      kind: 'user',
      userId: 'user_1',
    })
    expect(queriedTables).toEqual([])
  })

  it('accepts an active MCP credential only when its current owner matches the token subject', async () => {
    const { ctx } = createCtx(
      {
        subject: 'user_1',
        sessionId: 'key_1',
        ginkoCredentialKind: 'mcp-api-key',
      },
      {
        apiKeyId: 'key_1',
        ownerUserId: 'user_1',
        status: 'active',
        scopes: ['cms.read'],
      },
      {
        _id: 'member_1',
        _creationTime: 0,
        userId: 'user_1',
        role: 'owner',
        createdAt: 0,
      },
    )

    await expect(resolveCmsCaller(ctx)).resolves.toMatchObject({
      kind: 'mcp',
      apiKeyId: 'key_1',
    })
  })

  it.each([
    ['missing settings', undefined, undefined],
    [
      'revoked settings',
      { apiKeyId: 'key_1', ownerUserId: 'user_1', status: 'revoked', scopes: [] },
      undefined,
    ],
    [
      'wrong owner',
      { apiKeyId: 'key_1', ownerUserId: 'other_user', status: 'active', scopes: [] },
      { _id: 'member_2', _creationTime: 0, userId: 'other_user', role: 'owner', createdAt: 0 },
    ],
    [
      'expired settings',
      {
        apiKeyId: 'key_1',
        ownerUserId: 'user_1',
        status: 'active',
        scopes: [],
        expiresAt: 0,
      },
      { _id: 'member_1', _creationTime: 0, userId: 'user_1', role: 'owner', createdAt: 0 },
    ],
  ])('fails closed for %s', async (_label, settings, member) => {
    const { ctx } = createCtx(
      {
        subject: 'user_1',
        sessionId: 'key_1',
        ginkoCredentialKind: 'mcp-api-key',
      },
      settings,
      member,
    )

    await expect(resolveCmsCaller(ctx)).rejects.toThrow('MCP credential is not active')
  })

  it('rejects a missing or unknown credential kind', async () => {
    const { ctx } = createCtx({
      subject: 'user_1',
      sessionId: 'session_1',
    })

    await expect(resolveCmsCaller(ctx)).rejects.toThrow('credential kind')
  })

  it('fails closed when credential-state lookup fails', async () => {
    const ctx = {
      auth: {
        getUserIdentity: async () => ({
          subject: 'user_1',
          sessionId: 'key_1',
          ginkoCredentialKind: 'mcp-api-key',
        }),
      },
      db: {
        query: () => {
          throw new Error('credential cleanup unavailable')
        },
      },
    } as Parameters<typeof resolveCmsCaller>[0]

    await expect(resolveCmsCaller(ctx)).rejects.toThrow('credential cleanup unavailable')
  })
})
