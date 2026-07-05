import { createError, defineEventHandler, getRequestHeader, getRequestIP, type H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { api } from '#convex/api'

import { createConvexAuthCaller } from '../mcp/_shared/convex-caller'
import {
  authenticateMcpRequestContext,
  getMcpAuthStorageNamespace,
} from '../mcp/_shared/request-auth'

export default defineEventHandler(async (event) => {
  await authenticateMcpRequest(event)
})

export async function authenticateMcpRequest(event: H3Event) {
  const authBaseUrl = resolveBetterAuthBaseUrl(event)
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
      verifyApiKey: async ({ key }) => await verifyBetterAuthApiKey(authBaseUrl, key),
      getConvexAuthToken: async (key) => await getBetterAuthConvexToken(authBaseUrl, key),
      resolveCredentialAccess: async (apiKeyId, convexAuthToken) => {
        const convex = createConvexAuthCaller(event, convexAuthToken)
        const ginkoCms = api.ginkoCms as typeof api.ginkoCms & {
          mcpCredentials: { resolveAccess: never }
        }
        return await convex.query(ginkoCms.mcpCredentials.resolveAccess, {
          apiKeyId,
        })
      },
    },
  )
}

export function resolveMcpClientIp(event: H3Event): string | null {
  return getRequestIP(event) ?? null
}

export function resolveBetterAuthBaseUrl(event: H3Event): string {
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

  const base = configured.replace(/\/+$/, '')
  return base.endsWith('/api/auth') ? base : `${base}/api/auth`
}

async function getBetterAuthConvexToken(authBaseUrl: string, key: string) {
  const response = await fetch(`${authBaseUrl}/convex/token`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${key}`,
    },
  })
  if (!response.ok) {
    throw new Error(`Better Auth Convex token request failed with HTTP ${response.status}.`)
  }

  const body = (await response.json()) as {
    token?: unknown
  }
  if (typeof body.token !== 'string' || body.token.length === 0) {
    throw new Error('Better Auth Convex token response did not include a token.')
  }
  return body.token
}

async function verifyBetterAuthApiKey(authBaseUrl: string, key: string) {
  const response = await fetch(`${authBaseUrl}/convex/token`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${key}`,
    },
  })
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return { valid: false, key: null }
  }
  if (!response.ok)
    throw new Error(`Better Auth Convex token request failed with HTTP ${response.status}.`)

  const body = (await response.json()) as {
    token?: unknown
  }
  if (typeof body.token !== 'string' || body.token.length === 0) {
    throw new Error('Better Auth Convex token response did not include a token.')
  }

  const payload = decodeJwtPayload(body.token)
  const apiKeyId = payload.sessionId
  const authUserId = payload.sub

  return {
    valid: typeof apiKeyId === 'string' && typeof authUserId === 'string',
    key:
      typeof apiKeyId === 'string' && typeof authUserId === 'string'
        ? {
            id: apiKeyId,
            referenceId: authUserId,
          }
        : null,
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Better Auth Convex token payload is missing.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}
