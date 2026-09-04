import { describe, expect, it } from 'vitest'

import { resolveCmsCaller } from '#component/functions.js'

function createCtx(identity: Record<string, unknown> | null) {
  return {
    auth: { getUserIdentity: async () => identity },
  } as Parameters<typeof resolveCmsCaller>[0]
}

describe('CMS Convex auth caller resolution', () => {
  it('accepts only Better Convex Nuxt session identities', async () => {
    await expect(
      resolveCmsCaller(
        createCtx({
          subject: 'user_1',
          email: 'owner@example.com',
          token_use: 'convex-session',
          sessionId: 'browser-session-must-not-be-an-agent',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'user', userId: 'user_1' })
  })

  it('keeps anonymous requests anonymous', async () => {
    await expect(resolveCmsCaller(createCtx(null))).resolves.toEqual({
      kind: 'anonymous',
      subject: 'system:anonymous',
    })
  })

  it.each(['mcp-api-key', 'user-session', undefined])(
    'rejects legacy or unmarked authenticated identities (%s)',
    async (legacyKind) => {
      await expect(
        resolveCmsCaller(
          createCtx({
            subject: 'user_1',
            ginkoCredentialKind: legacyKind,
            sessionId: 'legacy-session',
          }),
        ),
      ).rejects.toThrow('supported credential kind')
    },
  )
})
