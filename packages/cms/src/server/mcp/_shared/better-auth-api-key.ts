export type VerifiedMcpApiKey = {
  betterAuthApiKeyId: string
  authUserId: string
}

export type BetterAuthApiKeyVerification = {
  valid: boolean
  key: {
    id: string
    referenceId: string
  } | null
}

export type BetterAuthApiKeyVerifier = (input: {
  key: string
}) => Promise<BetterAuthApiKeyVerification>

export function parseMcpBearerApiKey(authorizationHeader?: string | null): string | null {
  const prefix = 'Bearer '
  if (!authorizationHeader?.startsWith(prefix)) return null

  const token = authorizationHeader.slice(prefix.length).trim()
  return token.length > 0 ? token : null
}

export async function verifyMcpBearerApiKey(
  authorizationHeader: string | null | undefined,
  verifyApiKey: BetterAuthApiKeyVerifier,
): Promise<VerifiedMcpApiKey | null> {
  const key = parseMcpBearerApiKey(authorizationHeader)
  if (!key) return null

  const result = await verifyApiKey({ key })
  if (!result.valid || !result.key) return null

  return {
    betterAuthApiKeyId: result.key.id,
    authUserId: result.key.referenceId,
  }
}
