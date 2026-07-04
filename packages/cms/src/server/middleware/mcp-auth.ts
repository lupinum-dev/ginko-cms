import { createError, defineEventHandler, getRequestHeader, getRequestIP, type H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

import { components } from '#convex/api'

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
        const ginkoCms = components.ginkoCms as typeof components.ginkoCms & {
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
  const response = await fetch(`${authBaseUrl}/api-key/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ key }),
  })
  if (!response.ok) {
    throw new Error(`Better Auth API-key verification failed with HTTP ${response.status}.`)
  }

  const body = (await response.json()) as {
    valid?: unknown
    key?: {
      id?: unknown
      referenceId?: unknown
    } | null
  }
  return {
    valid: body.valid === true,
    key:
      body.key && typeof body.key.id === 'string' && typeof body.key.referenceId === 'string'
        ? {
            id: body.key.id,
            referenceId: body.key.referenceId,
          }
        : null,
  }
}
