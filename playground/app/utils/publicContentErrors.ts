import { createError } from 'h3'

import { navigateTo } from '#imports'

interface PublicContentRouteFacts {
  route?: {
    requestedPath?: string
    resolvedPath?: string
  }
}

export function throwPublicContentFailure(error: unknown, statusMessage: string): void {
  if (!error) return
  throw createError({
    statusCode: 502,
    statusMessage,
    cause: error,
  })
}

export async function redirectPublicContentAlias(
  page: PublicContentRouteFacts | null | undefined,
): Promise<void> {
  const requestedPath = page?.route?.requestedPath
  const resolvedPath = page?.route?.resolvedPath
  if (!import.meta.server || !requestedPath || !resolvedPath || requestedPath === resolvedPath)
    return
  await navigateTo(resolvedPath, { redirectCode: 308, replace: true })
}
