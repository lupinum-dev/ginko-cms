import { describe, expect, it } from 'vitest'

import {
  parseSignedOAuthTransaction,
  requirePublicOAuthClient,
} from '../../packages/cms/src/auth/oauth/transaction'

const siteUrl = 'https://ginko.example.test'

function transactionPath(overrides: Record<string, string> = {}) {
  const parameters = new URLSearchParams({
    client_id: 'client-codex',
    resource: `${siteUrl}/mcp`,
    scope: 'cms.read cms.entries.edit',
    state: 'provider-signed-state',
    ...overrides,
  })
  return `/oauth/consent?${parameters.toString()}`
}

describe('Ginko MCP OAuth transaction projection', () => {
  it('accepts only the exact resource and delegated scope set', () => {
    expect(parseSignedOAuthTransaction(transactionPath(), siteUrl)).toMatchObject({
      clientId: 'client-codex',
      resource: `${siteUrl}/mcp`,
      scopes: ['cms.read', 'cms.entries.edit'],
    })
  })

  it.each([
    'http://localhost:3000',
    'http://studio.localhost:3000',
    'http://127.0.0.1:3211',
    'http://[::1]:3211',
  ])('allows an exact HTTP loopback origin for local development: %s', (loopbackSiteUrl) => {
    const fullPath = transactionPath({ resource: `${loopbackSiteUrl}/mcp` })

    expect(parseSignedOAuthTransaction(fullPath, loopbackSiteUrl)).toMatchObject({
      resource: `${loopbackSiteUrl}/mcp`,
    })
  })

  it.each([
    ['/oauth/consent', siteUrl],
    [transactionPath({ resource: 'https://other.example.test/mcp' }), siteUrl],
    [transactionPath({ scope: 'cms.read cms.read' }), siteUrl],
    [transactionPath({ scope: 'cms.read cms.entries.create' }), siteUrl],
    [transactionPath({ scope: 'cms.read cms.admin' }), siteUrl],
    [transactionPath(), 'http://ginko.example.test'],
    [transactionPath(), `${siteUrl}/nested`],
  ])('rejects invalid transaction %s', (fullPath, configuredSiteUrl) => {
    expect(() => parseSignedOAuthTransaction(fullPath, configuredSiteUrl)).toThrow(
      'OAUTH_TRANSACTION_INVALID',
    )
  })

  it('rejects duplicate security parameters', () => {
    expect(() =>
      parseSignedOAuthTransaction(`${transactionPath()}&client_id=other-client`, siteUrl),
    ).toThrow('OAUTH_TRANSACTION_INVALID')
  })

  it('accepts only the client metadata bound to the signed client ID', () => {
    expect(
      requirePublicOAuthClient({ client_id: 'client-codex', client_name: 'Codex' }, 'client-codex'),
    ).toEqual({ clientId: 'client-codex', clientName: 'Codex' })
    expect(() =>
      requirePublicOAuthClient(
        { client_id: 'different-client', client_name: 'Spoofed' },
        'client-codex',
      ),
    ).toThrow('OAUTH_TRANSACTION_INVALID')
  })
})
