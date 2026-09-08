export const OPERATOR_CONVEX_TOKEN_ROUTE = '/api/_ginko/operator/convex-token'
export const OPERATOR_BROWSER_LOGIN_ROUTE = '/api/_ginko/operator/login'
export const OPERATOR_TOKEN_EXCHANGE_TIMEOUT_MS = 5_000
export const MAX_OPERATOR_SESSION_COOKIE_BYTES = 4 * 1024
export const MAX_OPERATOR_CONVEX_TOKEN_BYTES = 64 * 1024
export const MAX_OPERATOR_TOKEN_RESPONSE_BYTES = MAX_OPERATOR_CONVEX_TOKEN_BYTES + 1024
export const OPERATOR_BROWSER_STATE_PATTERN = /^[\w-]{43}$/u
export const MAX_OPERATOR_BROWSER_REQUEST_BYTES = 2 * 1024

export function encodeOperatorBrowserRequest(input: { callback: string; state: string }): string {
  resolveOperatorLoopbackCallback(input.callback)
  if (!OPERATOR_BROWSER_STATE_PATTERN.test(input.state)) {
    throw new Error('Operator login state is invalid.')
  }
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
}

export function decodeOperatorBrowserRequest(value: unknown): { callback: URL; state: string } {
  if (
    typeof value !== 'string' ||
    !/^[\w-]+$/u.test(value) ||
    value.length > MAX_OPERATOR_BROWSER_REQUEST_BYTES
  ) {
    throw new Error('Operator login request is invalid.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Operator login request is invalid.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Operator login request is invalid.')
  const request = parsed as { callback?: unknown; state?: unknown }
  if (typeof request.state !== 'string' || !OPERATOR_BROWSER_STATE_PATTERN.test(request.state)) {
    throw new Error('Operator login state is invalid.')
  }
  return { callback: resolveOperatorLoopbackCallback(request.callback), state: request.state }
}

export function resolveOperatorLoopbackCallback(value: unknown): URL {
  if (typeof value !== 'string') throw new Error('Operator callback is missing.')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Operator callback is invalid.')
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/callback' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Operator callback must be an exact loopback callback URL.')
  }
  return url
}

export function assertCliOperatorRequest(input: {
  origin?: string | null
  secFetchSite?: string | null
}) {
  if (input.origin || input.secFetchSite) {
    throw Object.assign(new Error('This operation requires a CLI operator request.'), {
      statusCode: 403,
      statusMessage: 'This operation requires a CLI operator request.',
    })
  }
}

export function hasAsciiControlCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) return true
  }
  return false
}

export function isValidOperatorConvexToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_OPERATOR_CONVEX_TOKEN_BYTES &&
    new TextEncoder().encode(value).byteLength <= MAX_OPERATOR_CONVEX_TOKEN_BYTES &&
    !hasAsciiControlCharacters(value)
  )
}

export function cliOperatorAuthToken(authorization: string | null | undefined): string | undefined {
  if (authorization == null) return undefined
  const match = /^Bearer (\S+)$/iu.exec(authorization)
  if (!match || !isValidOperatorConvexToken(match[1])) {
    throw Object.assign(new Error('The CLI operator authorization is invalid.'), {
      statusCode: 401,
      statusMessage: 'The CLI operator authorization is invalid.',
    })
  }
  return match[1]
}
