export const OPERATOR_CONVEX_TOKEN_ROUTE = '/api/_ginko/operator/convex-token'
export const OPERATOR_TOKEN_EXCHANGE_TIMEOUT_MS = 5_000
export const MAX_OPERATOR_SESSION_COOKIE_BYTES = 4 * 1024
export const MAX_OPERATOR_CONVEX_TOKEN_BYTES = 64 * 1024
export const MAX_OPERATOR_TOKEN_RESPONSE_BYTES = MAX_OPERATOR_CONVEX_TOKEN_BYTES + 1024

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
