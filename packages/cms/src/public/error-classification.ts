export type GinkoErrorCategory =
  | 'auth'
  | 'validation'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'conflict'
  | 'unknown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Classifies Ginko application errors from their structured public payload. */
export function classifyGinkoError(
  data: unknown,
  fallback: { code?: string; status?: number } = {},
): GinkoErrorCategory | null {
  const record = isRecord(data) ? data : null
  const rawCode = typeof record?.code === 'string' ? record.code : fallback.code
  const code = rawCode?.trim().toUpperCase() ?? ''
  const status =
    typeof record?.status === 'number' && Number.isFinite(record.status)
      ? record.status
      : fallback.status

  if (code) {
    if (code.includes('UNAUTH') || code === 'FORBIDDEN') return 'auth'
    if (
      code === 'VALIDATION' ||
      code === 'INVALID_ARGS' ||
      code.startsWith('INVALID_') ||
      code.startsWith('MISSING_') ||
      code.includes('UNSUPPORTED')
    ) {
      return 'validation'
    }
    if (code === 'NOT_FOUND' || code.endsWith('_NOT_FOUND')) return 'not_found'
    if (code.startsWith('LIMIT_') || code.includes('RATE_LIMIT')) return 'rate_limit'
    if (
      code === 'CONFLICT' ||
      code.includes('CONFLICT') ||
      code.includes('VERSION_MISMATCH') ||
      code.startsWith('STALE_')
    ) {
      return 'conflict'
    }
    if (code === 'INTERNAL_ERROR' || code === 'INTERNAL') return 'server'
  }

  if (status === 401 || status === 403) return 'auth'
  if (status === 400 || status === 422) return 'validation'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate_limit'
  if (status !== undefined && status >= 500) return 'server'
  return null
}
