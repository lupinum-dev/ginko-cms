import type { JSONContent } from '@tiptap/vue-3'

export type ConversionPhase =
  | 'parse_mdc'
  | 'mdc_to_tiptap'
  | 'tiptap_to_mdc'
  | 'stringify_mdc'
  | 'set_content'
  | 'validate'

export type ConversionSeverity = 'error' | 'warn'

export interface ConversionIssue {
  code: string
  severity: ConversionSeverity
  phase: ConversionPhase
  message: string
  detail?: unknown
  context?: Record<string, unknown>
}

export interface ConversionTraceEvent {
  at: string
  kind: 'finish' | 'issue' | 'phase' | 'start'
  phase?: ConversionPhase
  data?: Record<string, unknown>
  issueCode?: string
  message?: string
  severity?: ConversionSeverity
}

export interface ConversionResult<T> {
  ok: boolean
  value?: T
  issues: ConversionIssue[]
  traceId: string
  timeline: ConversionTraceEvent[]
  fallbackUsed: boolean
}

export interface ConversionHealthState {
  status: 'degraded' | 'failed' | 'ok'
  lastGoodMarkdown: string
  lastGoodDoc: JSONContent | null
  lastError?: ConversionIssue
}

export interface ConversionErrorPayload {
  traceId: string
  phase: ConversionPhase
  code: string
  message: string
  recoverable: boolean
  issues: ConversionIssue[]
  timeline: ConversionTraceEvent[]
}

export interface ConversionRecoveredPayload {
  traceId: string
  fromStatus: ConversionHealthState['status']
  toStatus: ConversionHealthState['status']
}
