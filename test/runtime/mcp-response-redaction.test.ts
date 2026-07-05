import { describe, expect, it, vi } from 'vitest'

import { redactMcpResponse } from '../../packages/cms/src/server/mcp/_shared/response-redaction'

vi.mock('#convex/api', () => ({ api: {} }))
vi.mock('../../packages/cms/src/server/mcp/_shared/auth.js', () => ({ getMcpAuth: () => null }))
vi.mock('../../packages/cms/src/server/mcp/_shared/convex-caller.js', () => ({
  createConvexAuthCaller: () => ({}),
}))
vi.mock('../../packages/cms/src/server/mcp/_shared/runtime.js', () => ({
  getMcpCmsCallerFromAuth: () => ({ kind: 'anonymous' }),
  resolveCmsMcpCapabilitiesForCmsCaller: async () => ({}),
}))

describe('MCP response redaction', () => {
  it('redacts credential fields and internal metadata from successful structured output', async () => {
    const result = redactMcpResponse({
      visible: 'kept',
      publicMarkdown:
        'Visible copy Bearer ba_raw_secret mcp_abcdefghijklmnopqrstuvwxyz confirmation-token: abcdefghijklmnop',
      _id: 'entry-1',
      _creationTime: 123,
      apiKey: 'ba_raw_secret',
      apiKeyId: 'ba_key_public_identifier',
      nested: {
        authorization: 'Bearer ba_raw_secret',
        confirmation: {
          token: 'confirm_secret',
          expiresAt: 456,
        },
        versionHash: 'workflow-hash',
      },
    })

    expect(result).toEqual({
      visible: 'kept',
      publicMarkdown: 'Visible copy [redacted] [redacted] [redacted]',
      _id: 'entry-1',
      _creationTime: '[internal]',
      apiKey: '[redacted]',
      apiKeyId: 'ba_key_public_identifier',
      nested: {
        authorization: '[redacted]',
        confirmation: {
          token: '[redacted]',
          expiresAt: 456,
        },
        versionHash: 'workflow-hash',
      },
    })
  })

  it('redacts credential details from structured errors', async () => {
    const result = redactMcpResponse({
      deployKey: 'deploy_secret',
      tokenHash: 'hashed_secret',
      nested: {
        password: 'secret',
        value: 'kept',
      },
    })

    expect(result).toEqual({
      deployKey: '[redacted]',
      tokenHash: '[redacted]',
      nested: {
        password: '[redacted]',
        value: 'kept',
      },
    })
  })

  it('returns denied-tool reasons without leaking secret detail fields', async () => {
    const { AgentToolError, failFromError } =
      await import('../../packages/cms/src/server/mcp/_shared/agent-tools')
    const result = failFromError(
      new AgentToolError(
        'MCP_CAPABILITY_REQUIRED',
        'Caller does not have the editEntries capability.',
        {
          category: 'auth',
          details: {
            capability: 'editEntries',
            authorization: 'Bearer ba_raw_secret',
            token: 'confirm_secret',
          },
        },
      ),
      'Tool failed.',
    )

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Caller does not have the editEntries capability.' }],
      isError: true,
      structuredContent: {
        ok: false,
        error: {
          category: 'auth',
          code: 'MCP_CAPABILITY_REQUIRED',
          message: 'Caller does not have the editEntries capability.',
          retryable: false,
          details: {
            capability: 'editEntries',
            authorization: '[redacted]',
            token: '[redacted]',
          },
        },
      },
    })
  })
})
