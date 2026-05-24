import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { ConvexError } from 'convex/values'

export type CmsErrorData = {
  code: string
  message: string
  details?: Record<string, JsonValue> | null
}

export function cmsError(
  code: string,
  message: string,
  details?: Record<string, JsonValue> | null,
): ConvexError<CmsErrorData> {
  return new ConvexError({
    code,
    message,
    details: details ?? null,
  })
}

export function throwCmsError(
  code: string,
  message: string,
  details?: Record<string, JsonValue> | null,
): never {
  throw cmsError(code, message, details)
}

export function throwInvalidCursorOrRethrow(
  error: unknown,
  message: string,
  cursor: string | null | undefined,
): never {
  if (cursor != null) {
    throwCmsError('INVALID_CURSOR', message, { cursor })
  }
  throw error
}

type ManualPaginationOptions<T> = {
  cursor: string | null | undefined
  getCursor: (item: T) => string
  invalidCursorMessage: string
  numItems: number
}

export function paginateCollected<T>(
  items: T[],
  options: ManualPaginationOptions<T>,
): {
  page: T[]
  isDone: boolean
  continueCursor: string | null
} {
  const limit = Math.max(1, options.numItems)
  let startIndex = 0

  if (options.cursor != null) {
    startIndex = items.findIndex((item) => options.getCursor(item) === options.cursor)
    if (startIndex === -1) {
      throwCmsError('INVALID_CURSOR', options.invalidCursorMessage, {
        cursor: options.cursor,
      })
    }
    startIndex += 1
  }

  const slice = items.slice(startIndex, startIndex + limit + 1)
  const hasMore = slice.length > limit
  const page = hasMore ? slice.slice(0, limit) : slice

  return {
    page,
    isDone: !hasMore,
    continueCursor: hasMore ? options.getCursor(page[page.length - 1]!) : null,
  }
}
