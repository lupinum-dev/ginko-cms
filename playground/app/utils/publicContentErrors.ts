import { createError } from 'h3'

export function throwPublicContentFailure(error: unknown, statusMessage: string): void {
  if (!error) return
  throw createError({
    statusCode: 502,
    statusMessage,
    cause: error,
  })
}
