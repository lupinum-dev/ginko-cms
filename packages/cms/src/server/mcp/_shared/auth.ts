import { createError, type H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'

import type { ExchangedMcpCredential } from './request-auth.js'

export type McpConvexCaller = ExchangedMcpCredential['caller']

type McpAuthContext = {
  apiKeyId: string
  authUserId: string
  caller: McpConvexCaller
}

function resolveEvent(event?: H3Event) {
  return event ?? useEvent()
}

function isMcpConvexCaller(value: unknown): value is McpConvexCaller {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as McpConvexCaller).query === 'function' &&
    typeof (value as McpConvexCaller).mutation === 'function' &&
    typeof (value as McpConvexCaller).action === 'function'
  )
}

export function getMcpAuth(event?: H3Event): McpAuthContext | null {
  const currentEvent = resolveEvent(event)
  const auth = currentEvent.context.mcpAuth as Partial<McpAuthContext> | undefined
  if (
    !auth?.apiKeyId ||
    typeof auth.apiKeyId !== 'string' ||
    !auth.authUserId ||
    typeof auth.authUserId !== 'string' ||
    !isMcpConvexCaller(auth.caller)
  ) {
    return null
  }
  return {
    apiKeyId: auth.apiKeyId,
    authUserId: auth.authUserId,
    caller: auth.caller,
  }
}

export function requireMcpAuth(event?: H3Event): McpAuthContext {
  const auth = getMcpAuth(event)
  if (!auth) {
    throw createError({
      statusCode: 401,
      statusMessage: 'MCP authentication required',
    })
  }
  return auth
}
