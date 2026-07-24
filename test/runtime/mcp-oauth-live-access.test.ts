import { describe, expect, it } from 'vitest'

import { validateLiveProviderAccess } from '../../playground/convex/ginkoCms/mcp'

const access = {
  clientId: 'client-codex',
  resource: 'https://ginko.example.test/mcp',
  scopes: ['cms.read', 'cms.entries.edit'],
  sessionId: 'session-1',
  subject: 'user-1',
}

function records() {
  return new Map<string, Record<string, unknown>>([
    ['session', { id: access.sessionId, userId: access.subject, expiresAt: Date.now() + 60_000 }],
    ['user', { id: access.subject }],
    [
      'oauthClient',
      {
        clientId: access.clientId,
        disabled: false,
        grantTypes: ['authorization_code'],
        requirePKCE: true,
        responseTypes: ['code'],
        scopes: [...access.scopes],
      },
    ],
    [
      'oauthResource',
      {
        allowedScopes: [...access.scopes],
        disabled: false,
        identifier: access.resource,
        signingAlgorithm: 'RS256',
      },
    ],
    ['oauthClientResource', { clientId: access.clientId, resourceId: access.resource }],
    [
      'oauthConsent',
      {
        clientId: access.clientId,
        resources: [access.resource],
        scopes: [...access.scopes],
        userId: access.subject,
      },
    ],
  ])
}

function context(rows: Map<string, Record<string, unknown>>) {
  return {
    async runQuery(_reference: unknown, args: { model: string }) {
      return rows.get(args.model) ?? null
    },
  }
}

describe('Ginko Better Auth MCP live access', () => {
  it('accepts only a current session, user, client, resource link, and consent', async () => {
    await expect(validateLiveProviderAccess(context(records()), access)).resolves.toBe(true)
  })

  it.each([
    'session',
    'user',
    'oauthClient',
    'oauthResource',
    'oauthClientResource',
    'oauthConsent',
  ])('fails immediately when %s is revoked or removed', async (model) => {
    const rows = records()
    rows.delete(model)
    await expect(validateLiveProviderAccess(context(rows), access)).resolves.toBe(false)
  })

  it('rejects expired sessions, disabled clients, lost consent scopes, and resource drift', async () => {
    const expired = records()
    expired.set('session', { id: access.sessionId, userId: access.subject, expiresAt: Date.now() })
    await expect(validateLiveProviderAccess(context(expired), access)).resolves.toBe(false)

    const disabled = records()
    disabled.set('oauthClient', { ...disabled.get('oauthClient'), disabled: true })
    await expect(validateLiveProviderAccess(context(disabled), access)).resolves.toBe(false)

    const narrowed = records()
    narrowed.set('oauthConsent', {
      ...narrowed.get('oauthConsent'),
      scopes: ['cms.read'],
    })
    await expect(validateLiveProviderAccess(context(narrowed), access)).resolves.toBe(false)

    const drifted = records()
    drifted.set('oauthClientResource', {
      clientId: access.clientId,
      resourceId: 'https://other.example.test/mcp',
    })
    await expect(validateLiveProviderAccess(context(drifted), access)).resolves.toBe(false)
  })
})
