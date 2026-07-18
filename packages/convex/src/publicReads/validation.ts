import { throwCmsError } from '../errors.js'
import { isRouteBackedCollection } from '../lib/collections.js'
import type { getCollection } from '../lib/collections.js'
import { getLocaleChain } from '../lib/locale.js'
import type { QueryCtx } from '../lib/types.js'

export const LIST_DEFAULT_LIMIT = 20
export const LIST_MAX_LIMIT = 100
export const SEARCH_DEFAULT_LIMIT = 10
export const SEARCH_MAX_LIMIT = 50
export const SITEMAP_DEFAULT_LIMIT = 500
export const SITEMAP_MAX_LIMIT = 1_000

const PUBLIC_QUERY_MAX_LENGTH = 256
const PUBLIC_STRING_MAX_LENGTH = 512
const PUBLIC_CURSOR_MAX_LENGTH = 2_048
const PUBLIC_LOCALE_MAX_LENGTH = 32
const PUBLIC_COLLECTION_MAX_LENGTH = 80

export type CollectionDoc = NonNullable<Awaited<ReturnType<typeof getCollection>>>
export type PublicExplicitSortField =
  | 'orderKey'
  | 'entryCreatedAt'
  | 'firstPublishedAt'
  | 'lastPublishedAt'
export type PublicSortField = PublicExplicitSortField | 'path'

export function assertRouteBackedCollection(collection: Awaited<ReturnType<typeof getCollection>>) {
  if (collection && !isRouteBackedCollection(collection)) {
    throwCmsError('DATA_ONLY_COLLECTION', 'This collection is data-only and has no public routes.')
  }
}

export function validatePublicLimit(value: number | undefined, fallback: number, max: number) {
  const limit = value ?? fallback
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throwCmsError('INVALID_LIMIT', `Limit must be an integer between 1 and ${max}.`)
  }
  return limit
}

function validateLength(value: string | null | undefined, name: string, maxLength: number) {
  if (value === null || value === undefined || value.length <= maxLength) return
  throwCmsError('INVALID_QUERY', `${name} must be at most ${maxLength} characters.`, {
    field: name,
    maxLength,
    length: value.length,
  })
}

export function validatePublicTextArgs(args: {
  collection?: string
  locale?: string | null
  path?: string | null
  ref?: string | null
  cursor?: string | null
  query?: string
  name?: string
  key?: string
  pathPrefix?: string | null
}) {
  validateLength(args.collection, 'collection', PUBLIC_COLLECTION_MAX_LENGTH)
  validateLength(args.name, 'name', PUBLIC_COLLECTION_MAX_LENGTH)
  validateLength(args.key, 'key', PUBLIC_COLLECTION_MAX_LENGTH)
  validateLength(args.locale, 'locale', PUBLIC_LOCALE_MAX_LENGTH)
  validateLength(args.path, 'path', PUBLIC_STRING_MAX_LENGTH)
  validateLength(args.ref, 'ref', PUBLIC_STRING_MAX_LENGTH)
  validateLength(args.cursor, 'cursor', PUBLIC_CURSOR_MAX_LENGTH)
  validateLength(args.query, 'query', PUBLIC_QUERY_MAX_LENGTH)
  validateLength(args.pathPrefix, 'pathPrefix', PUBLIC_STRING_MAX_LENGTH)
}

function isPublicExplicitSortField(field: string | undefined): field is PublicExplicitSortField {
  return (
    field === 'orderKey' ||
    field === 'entryCreatedAt' ||
    field === 'firstPublishedAt' ||
    field === 'lastPublishedAt'
  )
}

export function parsePublicListSort(args: { sort?: string }): {
  sortField: PublicExplicitSortField
  sortDirection: 'asc' | 'desc'
} {
  const [field, direction] = (args.sort ?? 'orderKey:asc').split(':')
  if (!isPublicExplicitSortField(field) || (direction !== 'asc' && direction !== 'desc')) {
    throwCmsError(
      'INVALID_SORT',
      'Public sort supports only orderKey, entryCreatedAt, firstPublishedAt, and lastPublishedAt.',
    )
  }
  return { sortField: field, sortDirection: direction === 'desc' ? 'desc' : 'asc' }
}

export function validatePublicPathPrefix(args: { pathPrefix?: string | null; sort?: string }) {
  if (!args.pathPrefix) return
  if (!args.pathPrefix.startsWith('/')) {
    throwCmsError('INVALID_QUERY', 'pathPrefix must start with "/".', { field: 'pathPrefix' })
  }
  if (args.sort) {
    throwCmsError('INVALID_SORT', 'Public path prefix queries use path-index order.')
  }
}

export function assertPageLookup(args: { path?: string; ref?: string }) {
  if (args.path && args.ref) {
    throwCmsError('INVALID_QUERY', 'Provide either path or ref, not both.')
  }
  if (!args.path && !args.ref) {
    throwCmsError('INVALID_QUERY', 'A public page lookup requires path or ref.')
  }
}

export async function resolvePublicLocaleChain(
  ctx: QueryCtx,
  args: { locale: string; fallback?: boolean | string[] },
) {
  if (args.fallback === false) return [args.locale]
  if (Array.isArray(args.fallback)) return Array.from(new Set([args.locale, ...args.fallback]))
  return (await getLocaleChain(ctx, args.locale)).chain
}
