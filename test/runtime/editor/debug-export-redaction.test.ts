import { describe, expect, it } from 'vitest'

import { redactDebugValue } from '../../../packages/cms/studio-app/src/editor/model/useDebugExport'

describe('debug export redaction', () => {
  it('[QUA-06] redacts token-like and credential-like diagnostic values recursively', () => {
    const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZWJ1Zy1leHBvcnQifQ.signaturePart0123456789'
    const redacted = redactDebugValue({
      authorization: 'Bearer secret-token-value',
      content: {
        markdown: [
          'Visible draft copy should remain',
          'mcp_abcdefghijklmnopqrstuvwxyz',
          'ba_raw_secret',
          jwtLike,
          'confirmation-token: abcdefghijklmnop',
        ].join(' '),
        sessionToken: 'session-secret',
      },
      events: [
        {
          payload: {
            apiKey: 'cms_abcdefghijklmnopqrstuvwxyz',
            clientId: 'oauth_public_client_identifier',
            nested: {
              secretEnv: 'CMS_SECRET',
            },
          },
        },
      ],
    })

    const serialized = JSON.stringify(redacted)

    expect(redacted).toEqual({
      authorization: '[redacted]',
      content: {
        markdown: 'Visible draft copy should remain [redacted] [redacted] [redacted] [redacted]',
        sessionToken: '[redacted]',
      },
      events: [
        {
          payload: {
            apiKey: '[redacted]',
            clientId: 'oauth_public_client_identifier',
            nested: {
              secretEnv: '[redacted]',
            },
          },
        },
      ],
    })
    expect(serialized).not.toContain('mcp_abcdefghijklmnopqrstuvwxyz')
    expect(serialized).not.toContain('ba_raw_secret')
    expect(serialized).not.toContain(jwtLike)
    expect(serialized).not.toContain('abcdefghijklmnop')
  })
})
