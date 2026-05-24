import { describe, expect, it } from 'vitest'

import {
  getHealthStatusFromIssues,
  maybeBuildRecoveryPayload,
  selectPrimaryIssue,
  toConversionErrorPayload,
} from '../../../packages/cms/studio-app/src/editor/lib/conversionState'

describe('editor conversionState helpers', () => {
  it('selects primary issue preferring errors', () => {
    const issue = selectPrimaryIssue([
      { code: 'warn_1', message: 'warn', phase: 'validate', severity: 'warn' },
      { code: 'error_1', message: 'err', phase: 'parse_mdc', severity: 'error' },
    ])

    expect(issue?.code).toBe('error_1')
  })

  it('builds recoverable payload from conversion result', () => {
    const payload = toConversionErrorPayload(
      {
        fallbackUsed: false,
        issues: [
          {
            code: 'parse_mdc_failed',
            message: 'Failed to parse',
            phase: 'parse_mdc',
            severity: 'error',
          },
        ],
        ok: false,
        timeline: [],
        traceId: 'conv_test',
      },
      {
        fallbackMessage: 'fallback',
        fallbackPhase: 'parse_mdc',
      },
    )

    expect(payload.code).toBe('parse_mdc_failed')
    expect(payload.traceId).toBe('conv_test')
    expect(payload.recoverable).toBe(true)
  })

  it('computes health and recovery transition consistently', () => {
    expect(getHealthStatusFromIssues([])).toBe('ok')
    expect(
      getHealthStatusFromIssues([
        { code: 'warn', message: 'warn', phase: 'validate', severity: 'warn' },
      ]),
    ).toBe('degraded')

    expect(maybeBuildRecoveryPayload('failed', 'degraded', 'conv_1')).toEqual({
      fromStatus: 'failed',
      toStatus: 'degraded',
      traceId: 'conv_1',
    })
    expect(maybeBuildRecoveryPayload('ok', 'ok', 'conv_2')).toBeNull()
  })
})
