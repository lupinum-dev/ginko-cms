type CmsErrorData = {
  code: string
  message: string
  details?: Record<string, unknown> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCmsErrorData(data: unknown): CmsErrorData | null {
  if (typeof data === 'string') {
    try {
      return normalizeCmsErrorData(JSON.parse(data))
    } catch {
      return null
    }
  }

  if (!isRecord(data)) return null
  if (typeof data.code !== 'string' || typeof data.message !== 'string') return null

  return {
    code: data.code,
    message: data.message,
    details: isRecord(data.details) ? data.details : null,
  }
}

export function getCmsErrorData(error: unknown): CmsErrorData | null {
  if (!isRecord(error) || !('data' in error)) return null
  return normalizeCmsErrorData(error.data)
}

export function getCmsErrorCode(error: unknown): string | null {
  return getCmsErrorData(error)?.code ?? null
}

export function getCmsErrorMessage(error: unknown, fallback: string): string {
  const cmsError = getCmsErrorData(error)
  if (cmsError) return cmsError.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
