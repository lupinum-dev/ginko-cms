import {
  assertCmsCallerConsistency,
  cmsCallerFromConvexAuthIdentity,
  cmsMcpConvexAuthIssuer,
  cmsAnonymousCaller,
  cmsMcpCaller,
  cmsUserCaller,
  getCmsComponentForwardingKey,
  getExpectedCmsCallerSubject,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import { describe, expect, it } from 'vitest'

describe('cms caller helpers', () => {
  it('builds canonical subjects for each caller kind', () => {
    expect(cmsAnonymousCaller()).toEqual({
      kind: 'anonymous',
      subject: 'system:anonymous',
    })
    expect(cmsUserCaller('user_123')).toEqual({
      kind: 'user',
      userId: 'user_123',
      subject: 'user:user_123',
    })
    expect(cmsMcpCaller('key_123')).toEqual({
      kind: 'mcp',
      mcpKeyId: 'key_123',
      subject: 'agent:key_123',
    })
  })

  it('derives the canonical subject from caller identity fields', () => {
    expect(getExpectedCmsCallerSubject(cmsAnonymousCaller())).toBe('system:anonymous')
    expect(
      getExpectedCmsCallerSubject({
        kind: 'user',
        userId: 'user_123',
        subject: 'user:user_123',
      }),
    ).toBe('user:user_123')
    expect(
      getExpectedCmsCallerSubject({
        kind: 'mcp',
        mcpKeyId: 'key_123',
        subject: 'agent:key_123',
      }),
    ).toBe('agent:key_123')
  })

  it('rejects callers whose subject does not match their identity fields', () => {
    expect(() =>
      assertCmsCallerConsistency({
        kind: 'user',
        userId: 'user_123',
        subject: 'user:someone_else',
      }),
    ).toThrow('CMS user caller subject must match the userId.')

    expect(() =>
      assertCmsCallerConsistency({
        kind: 'mcp',
        mcpKeyId: 'key_123',
        subject: 'agent:other_key',
      }),
    ).toThrow('CMS MCP caller subject must match the mcpKeyId.')
  })

  it('maps Convex admin MCP identities back to MCP callers', () => {
    expect(
      cmsCallerFromConvexAuthIdentity({
        subject: 'key_123',
        issuer: cmsMcpConvexAuthIssuer,
      }),
    ).toEqual(cmsMcpCaller('key_123'))
    expect(
      cmsCallerFromConvexAuthIdentity({
        subject: 'user_123',
        issuer: 'https://auth.example.test',
        email: 'editor@example.test',
      }),
    ).toEqual(cmsUserCaller('user_123', { email: 'editor@example.test' }))
  })

  it('resolves component forwarding keys from explicit env objects', () => {
    expect(() => getCmsComponentForwardingKey({})).toThrow(
      'Ginko CMS component forwarding requires CONVEX_IDENTITY_FORWARDING_KEY or GINKO_CMS_COMPONENT_FORWARDING_KEY.',
    )
    expect(
      getCmsComponentForwardingKey({
        CONVEX_IDENTITY_FORWARDING_KEY: ' convex-key ',
        GINKO_CMS_COMPONENT_FORWARDING_KEY: 'ginko-key',
      }),
    ).toBe('convex-key')
    expect(
      getCmsComponentForwardingKey({
        GINKO_CMS_COMPONENT_FORWARDING_KEY: ' ginko-key ',
      }),
    ).toBe('ginko-key')
    expect(getCmsComponentForwardingKey({ VITEST: 'true' })).toBe(
      'test-ginko-cms-component-forwarding-key',
    )
  })
})
