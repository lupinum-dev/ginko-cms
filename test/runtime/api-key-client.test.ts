import { describe, expect, it } from 'vitest'

import {
  GINKO_API_KEY_CLIENT_ERROR,
  requireGinkoApiKeyClient,
} from '../../packages/cms/src/runtime/api-key-client'

// §10.5 / "Ginko tests": typed API-key client test — a host-defined
// `useConvexAuth().client` is narrowed to `{ apiKey: { create, ... } }` before
// Ginko's Studio API-key management touches it, and an actionable error is
// thrown (naming `apiKeyClient()` and `convex-auth.ts`) when the plugin is
// absent, instead of a raw `TypeError: apiKey.create is not a function`.

describe('requireGinkoApiKeyClient (vNext §10.2/§10.5)', () => {
  it('accepts a client with the apiKeyClient() plugin registered', () => {
    const create = () => Promise.resolve({ key: 'mcp_x', id: 'ba_key_1' })
    const client = { apiKey: { create, delete: () => Promise.resolve() } }

    const narrowed = requireGinkoApiKeyClient(client)

    expect(narrowed.apiKey.create).toBe(create)
  })

  it('throws the exact actionable error when the client has no apiKey namespace at all', () => {
    const client = { signIn: { email: () => {} } }

    expect(() => requireGinkoApiKeyClient(client)).toThrow(GINKO_API_KEY_CLIENT_ERROR)
  })

  it('throws when apiKey exists but create is not a function', () => {
    const client = { apiKey: { create: 'not-a-function' } }

    expect(() => requireGinkoApiKeyClient(client)).toThrow(GINKO_API_KEY_CLIENT_ERROR)
  })

  it('throws for null, undefined, and non-object clients without touching .apiKey', () => {
    expect(() => requireGinkoApiKeyClient(null)).toThrow(GINKO_API_KEY_CLIENT_ERROR)
    expect(() => requireGinkoApiKeyClient(undefined)).toThrow(GINKO_API_KEY_CLIENT_ERROR)
    expect(() => requireGinkoApiKeyClient('not-a-client')).toThrow(GINKO_API_KEY_CLIENT_ERROR)
  })

  it('names both apiKeyClient() and convex-auth.ts in the error so hosts know exactly what to add', () => {
    expect(GINKO_API_KEY_CLIENT_ERROR).toContain('apiKeyClient()')
    expect(GINKO_API_KEY_CLIENT_ERROR).toContain('convex-auth.ts')
  })
})
