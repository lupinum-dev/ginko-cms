import { createError, type H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'

type McpAuthContext = {
  apiKeyId: string
  authUserId: string
  convexAuthToken: string
}

function resolveEvent(event?: H3Event) {
  return event ?? useEvent()
}

export function getMcpAuth(event?: H3Event): McpAuthContext | null {
  const currentEvent = resolveEvent(event)
  const auth = currentEvent.context.mcpAuth as Partial<McpAuthContext> | undefined
  if (
    !auth?.apiKeyId ||
    typeof auth.apiKeyId !== 'string' ||
    !auth.authUserId ||
    typeof auth.authUserId !== 'string' ||
    !auth.convexAuthToken ||
    typeof auth.convexAuthToken !== 'string'
  ) {
    return null
  }
  return {
    apiKeyId: auth.apiKeyId,
    authUserId: auth.authUserId,
    convexAuthToken: auth.convexAuthToken,
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
