import { exchangeConvexToken, serverConvex } from 'better-convex-nuxt/server'
import { createError, defineEventHandler, getRequestHeader, getRequestIP, type H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#convex/api'

import {
  authenticateMcpRequestContext,
  getMcpAuthStorageNamespace,
  type ExchangedMcpCredential,
} from '../mcp/_shared/request-auth'

export default defineEventHandler(async (event) => {
  await authenticateMcpRequest(event)
})

export async function authenticateMcpRequest(event: H3Event) {
  const siteOrigin = resolveMcpSiteOrigin(event)
  await authenticateMcpRequestContext(
    {
      path: event.path,
      authorizationHeader: getRequestHeader(event, 'authorization'),
      clientIp: resolveMcpClientIp(event),
      context: event.context as Record<string, unknown>,
    },
    {
      createError: (input) =>
        Object.assign(createError(input), {
          statusCode: input.statusCode,
          statusMessage: input.statusMessage,
        }),
      getStorage: async () => {
        const { useStorage } = await import('nitropack/runtime')
        return useStorage(getMcpAuthStorageNamespace())
      },
      exchangeCredential: (credential) => exchangeMcpCredential(event, siteOrigin, credential),
      resolveCredentialAccess: async (apiKeyId, caller) => {
        return await caller.query(api.ginkoCms.mcpCredentials.resolveAccess, {
          apiKeyId,
        })
      },
    },
  )
}

/**
 * Exchange a bearer API key for a Convex JWT exactly once, decode its claims
 * once, and return a narrow `serverConvex` caller — never the raw JWT.
 *
 * A definitive upstream rejection (401/403) resolves to `null` so the caller
 * consumes the failure budget. A transport failure, or a malformed / claim-less
 * JWT, throws so the caller returns 503 without charging the bad-secret budget.
 */
async function exchangeMcpCredential(
  event: H3Event,
  siteOrigin: string,
  credential: string,
): Promise<ExchangedMcpCredential | null> {
  const result = await exchangeConvexToken({
    siteUrl: siteOrigin,
    credential: { type: 'bearer', value: credential },
  })

  if (!result.token) {
    // Only a definitive upstream rejection is a bad secret; anything else is a
    // transport/infrastructure failure and must not charge the budget.
    if (result.status === 401 || result.status === 403) return null
    throw new Error('MCP token exchange transport failure')
  }

  const claims = decodeJwtPayload(result.token)
  const apiKeyId = claims.sessionId
  const ownerUserId = claims.sub
  if (typeof apiKeyId !== 'string' || typeof ownerUserId !== 'string') {
    throw new TypeError('MCP token exchange returned a JWT without the expected claims.')
  }

  const caller = serverConvex(event, { authToken: result.token })
  return {
    apiKeyId,
    ownerUserId,
    caller: {
      query: caller.query,
      mutation: caller.mutation,
      action: caller.action,
    },
  }
}

export function resolveMcpClientIp(event: H3Event): string | null {
  return getRequestIP(event) ?? null
}

/**
 * Resolve the Convex site origin used for the Better Auth token exchange.
 *
 * The deployment contract allows a value ending in exactly `/api/auth` (the
 * Better Auth base path), which normalizes back to its origin. A root value is
 * used as-is. Every other non-root path is rejected before any exchange, so a
 * misconfigured base URL can never redirect a credential elsewhere.
 */
export function resolveMcpSiteOrigin(event: H3Event): string {
  const runtimeConfig = useRuntimeConfig(event) as {
    ginkoCms?: { betterAuthBaseUrl?: string }
    public?: { convex?: { siteUrl?: string } }
  }
  const configured =
    runtimeConfig.ginkoCms?.betterAuthBaseUrl ??
    process.env.GINKO_CMS_BETTER_AUTH_BASE_URL ??
    process.env.CONVEX_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    runtimeConfig.public?.convex?.siteUrl

  if (!configured) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Better Auth API-key verification URL is not configured for MCP.',
    })
  }

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Better Auth API-key verification URL is not a valid URL.',
    })
  }

  const path = url.pathname.replace(/\/+$/, '')
  if (path === '' || path === '/api/auth') {
    return url.origin
  }

  throw createError({
    statusCode: 503,
    statusMessage:
      'Better Auth API-key verification URL must be a site origin or its /api/auth base.',
  })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('MCP Convex token payload is missing.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}
