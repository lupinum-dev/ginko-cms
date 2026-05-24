const FORBIDDEN_REDIRECT_RANGES = [
  [0, 31],
  [127, 127],
  [8203, 8207],
  [8234, 8238],
  [8288, 8297],
  [65279, 65279],
] as const

function hasForbiddenRedirectCodepoint(value: string): boolean {
  for (const char of value) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) {
      continue
    }

    if (FORBIDDEN_REDIRECT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)) {
      return true
    }
  }

  return false
}

function safeDecodeOnce(value: string): null | string {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function hasEncodedSlashOrBackslash(value: string): boolean {
  const normalized = value.toLowerCase()
  return normalized.includes('%2f') || normalized.includes('%5c')
}

export function validateRedirectPath(raw: null | string | undefined): null | string {
  if (!raw || typeof raw !== 'string') {
    return null
  }

  const trimmed = raw.trim()
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null
  }

  if (trimmed.includes('//') || trimmed.includes('\\') || hasForbiddenRedirectCodepoint(trimmed)) {
    return null
  }

  const decoded = safeDecodeOnce(trimmed)
  if (
    decoded === null ||
    decoded.startsWith('//') ||
    decoded.includes('//') ||
    decoded.includes('\\') ||
    hasEncodedSlashOrBackslash(decoded) ||
    hasForbiddenRedirectCodepoint(decoded)
  ) {
    return null
  }

  try {
    const url = new URL(trimmed, 'http://localhost')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
  } catch {
    return null
  }

  return trimmed
}

function stripQuery(path: string): string {
  const separator = path.indexOf('?')
  return separator >= 0 ? path.slice(0, separator) : path
}

export function resolveRedirectTarget(
  raw: null | string | undefined,
  fallbackPath: string,
  loginPath?: string,
): string {
  const target = validateRedirectPath(raw) ?? validateRedirectPath(fallbackPath) ?? '/'
  if (loginPath && stripQuery(target) === stripQuery(loginPath)) {
    return '/'
  }

  return target
}
