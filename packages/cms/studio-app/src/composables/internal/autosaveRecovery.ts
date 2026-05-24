const transientMessages = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'offline',
]

function cmsErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) return null
  const data = (error as { data?: unknown }).data
  if (data && typeof data === 'object' && 'code' in data) {
    return typeof (data as { code?: unknown }).code === 'string'
      ? (data as { code: string }).code
      : null
  }
  if (typeof data === 'string') {
    try {
      return cmsErrorCode({ data: JSON.parse(data) })
    } catch {
      return null
    }
  }
  return null
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase()
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '').toLowerCase()
  }
  return ''
}

export function isConcurrentEditError(error: unknown) {
  return cmsErrorCode(error) === 'ENTRY_CONCURRENT_EDIT'
}

export function isTransientSaveError(error: unknown) {
  if (isConcurrentEditError(error)) return false
  const statusCode =
    error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : Number.NaN
  if (statusCode === 0 || statusCode >= 500) return true
  const message = errorMessage(error)
  return transientMessages.some((fragment) => message.includes(fragment))
}

export class OfflineSaveRetry {
  private pending = false
  private retrying = false

  get hasPendingRetry() {
    return this.pending
  }

  markPending() {
    this.pending = true
  }

  clear() {
    this.pending = false
  }

  async retry(task: () => Promise<boolean>) {
    if (!this.pending || this.retrying) return false
    this.retrying = true
    try {
      const succeeded = await task()
      if (succeeded) this.pending = false
      return succeeded
    } finally {
      this.retrying = false
    }
  }
}
