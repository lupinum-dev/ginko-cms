import { createError, defineEventHandler, getRequestHeader, getRequestIP, type H3Event } from 'h3'

import { components } from '#convex/api'

import { createAdminConvexCaller } from '../mcp/_shared/convex-caller'
import {
  authenticateMcpRequestContext,
  getMcpAuthStorageNamespace,
} from '../mcp/_shared/request-auth'

export default defineEventHandler(async (event) => {
  await authenticateMcpRequest(event)
})

export async function authenticateMcpRequest(event: H3Event) {
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
      consumeToken: async ({ hash, seenAt, clientIp }) => {
        const convex = createAdminConvexCaller(event)
        return await convex.mutation(components.ginkoCms.mcpKeys.consumeToken, {
          hash,
          seenAt,
          clientIp,
        })
      },
    },
  )
}

export function resolveMcpClientIp(event: H3Event): string | null {
  return getRequestIP(event) ?? null
}
