import { exchangeConvexToken, normalizeSiteUrl, serverConvex } from 'better-convex-nuxt/server'
import { createError, defineEventHandler, getRequestHeader, getRequestIP, type H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#convex/api'

import {
  authenticateMcpRequestContext,
  type ExchangedMcpCredential,
} from '../mcp/_shared/request-auth'

export default defineEventHandler(async (event) => {
  // Global middleware: everything below (site-origin resolution, secret check)
  // must only ever run for MCP requests, or a missing MCP setup 503s the whole
  // host app. The downstream path guard in request-auth runs too late for that.
  if (!event.path?.startsWith('/mcp')) return
  await authenticateMcpRequest(event)
})

export async function authenticateMcpRequest(event: H3Event) {
  const siteOrigin = resolveMcpSiteOrigin(event)
  const limiterSecret = process.env.BETTER_AUTH_SECRET?.trim()
  if (!limiterSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'BETTER_AUTH_SECRET is required for MCP authentication.',
    })
  }
  const limiterCaller = serverConvex(event, { auth: 'none' })
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
      limiterSecret,
      checkFailureBudget: async (args) =>
        await limiterCaller.query(api.ginkoCms.mcpCredentials.checkFailureBudget, args),
      recordFailure: async (args) =>
        await limiterCaller.mutation(api.ginkoCms.mcpCredentials.recordFailure, args),
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
    if (result.status === 429) {
      throw Object.assign(new Error('MCP token exchange rate limited.'), { statusCode: 429 })
    }
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
 * `better-convex-nuxt` owns this normalized runtime value and the security
 * validation applied before token exchange. Ginko must not independently
 * resolve a second auth origin from process environment fallbacks.
 */
export function resolveMcpSiteOrigin(event: H3Event): string {
  const runtimeConfig = useRuntimeConfig(event) as {
    public?: { convex?: { siteUrl?: string } }
  }
  const configured = runtimeConfig.public?.convex?.siteUrl

  if (!configured) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Convex site URL is not configured for MCP token exchange.',
    })
  }

  try {
    return normalizeSiteUrl(configured)
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'Convex site URL is not valid for MCP token exchange.',
    })
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('MCP Convex token payload is missing.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}
