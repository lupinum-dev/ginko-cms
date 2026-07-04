import { describe, expect, it } from 'vitest'

import { redactMcpResponse } from '../../packages/cms/src/server/mcp/_shared/response-redaction'

describe('MCP response redaction', () => {
  it('redacts credential fields and internal metadata from successful structured output', async () => {
    const result = redactMcpResponse({
      visible: 'kept',
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
})
