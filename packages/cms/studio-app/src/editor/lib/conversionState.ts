import type {
  ConversionErrorPayload,
  ConversionHealthState,
  ConversionIssue,
  ConversionPhase,
  ConversionRecoveredPayload,
  ConversionResult,
} from './conversionTypes'

export function selectPrimaryIssue(issues: ConversionIssue[]): ConversionIssue | undefined {
  return issues.find((issue) => issue.severity === 'error') ?? issues[0]
}

export function getHealthStatusFromIssues(
  issues: ConversionIssue[],
): ConversionHealthState['status'] {
  return issues.some((issue) => issue.severity === 'warn') ? 'degraded' : 'ok'
}

export function maybeBuildRecoveryPayload(
  previousStatus: ConversionHealthState['status'],
  nextStatus: ConversionHealthState['status'],
  traceId: string,
): ConversionRecoveredPayload | null {
  const recovered =
    previousStatus === 'failed' || (previousStatus === 'degraded' && nextStatus === 'ok')

  if (!recovered) {
    return null
  }

  return {
    fromStatus: previousStatus,
    toStatus: nextStatus,
    traceId,
  }
}

export function toConversionErrorPayload(
  result: ConversionResult<unknown>,
  options: {
    fallbackCode?: string
    fallbackMessage: string
    fallbackPhase: ConversionPhase
    recoverable?: boolean
  },
): ConversionErrorPayload {
  const primaryIssue = selectPrimaryIssue(result.issues)

  return {
    code: primaryIssue?.code ?? options.fallbackCode ?? 'conversion_failed',
    issues: result.issues,
    message: primaryIssue?.message ?? options.fallbackMessage,
    phase: primaryIssue?.phase ?? options.fallbackPhase,
    recoverable: options.recoverable ?? true,
    timeline: result.timeline,
    traceId: result.traceId,
  }
}
