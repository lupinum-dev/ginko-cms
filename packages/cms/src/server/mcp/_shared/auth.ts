import { createError, type H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'

type McpAuthContext = {
  mcpKeyId: string
}

function resolveEvent(event?: H3Event) {
  return event ?? useEvent()
}

export function getMcpAuth(event?: H3Event): McpAuthContext | null {
  const currentEvent = resolveEvent(event)
  const auth = currentEvent.context.mcpAuth as Partial<McpAuthContext> | undefined
  if (!auth?.mcpKeyId || typeof auth.mcpKeyId !== 'string') {
    return null
  }
  return {
    mcpKeyId: auth.mcpKeyId,
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
