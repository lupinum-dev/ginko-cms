export function parseMcpBearerApiKey(authorizationHeader?: string | null): string | null {
  const prefix = 'Bearer '
  if (!authorizationHeader?.startsWith(prefix)) return null

  const token = authorizationHeader.slice(prefix.length).trim()
  return token.length > 0 ? token : null
}
