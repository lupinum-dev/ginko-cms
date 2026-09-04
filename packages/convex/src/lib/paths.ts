// Shared route-prefix and stable-id helpers. Entry tree path assembly lives in
// entries/workflow/path.ts and entries/slugs.ts.
import { throwCmsError } from '../errors.js'
import type { CmsCollection, QueryOrMutationCtx } from './types.js'

const STABLE_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
/** Initial length of generated stable IDs. */
const STABLE_ID_INITIAL_LENGTH = 5
/** Extended length used after several collision retries. */
const STABLE_ID_EXTENDED_LENGTH = 6
/** Maximum number of generation attempts before failing. */
const STABLE_ID_MAX_ATTEMPTS = 6
/** Attempt index at which to switch to the extended length. */
const STABLE_ID_EXTEND_AT_ATTEMPT = 4

export function normalizePathPrefix(pathPrefix: string): string {
  const trimmed = pathPrefix.trim()
  if (!trimmed || trimmed === '/') return ''
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function pathPrefixForLocale(collection: CmsCollection, locale: string): string {
  const settings = isRecord(collection.settings) ? collection.settings : {}
  const prefixes = isRecord(settings.localizedPathPrefixes) ? settings.localizedPathPrefixes : null
  const localized = prefixes?.[locale]
  return normalizePathPrefix(
    typeof localized === 'string' && localized.trim() ? localized : collection.routing.pathPrefix,
  )
}

export function rootSlugForLocale(collection: CmsCollection, locale: string): string | null {
  const settings = isRecord(collection.settings) ? collection.settings : {}
  const slugs = isRecord(settings.localizedRootSlugs) ? settings.localizedRootSlugs : null
  const localized = slugs?.[locale]
  if (typeof localized === 'string' && localized.trim()) return localized.trim()
  return collection.routing.rootSlug ?? null
}

export async function generateStableId(
  ctx: QueryOrMutationCtx,
  collection: string,
): Promise<string> {
  let length = STABLE_ID_INITIAL_LENGTH

  for (let attempt = 0; attempt < STABLE_ID_MAX_ATTEMPTS; attempt += 1) {
    const candidate = Array.from(
      { length },
      () => STABLE_ID_ALPHABET[Math.floor(Math.random() * STABLE_ID_ALPHABET.length)]!,
    ).join('')

    const existing = await ctx.db
      .query('entries')
      .withIndex('by_collection_stableId', (q) =>
        q.eq('collection', collection).eq('stableId', candidate),
      )
      .first()

    if (!existing) return candidate
    if (attempt === STABLE_ID_EXTEND_AT_ATTEMPT) length = STABLE_ID_EXTENDED_LENGTH
  }

  throwCmsError('STABLE_ID_GENERATION_FAILED', 'Failed to generate a stable ID')
}

export function parseStableIdFromPath(path: string): string | null {
  const segment = path.split('/').filter(Boolean).pop()
  if (!segment) return null
  const index = segment.lastIndexOf('-')
  if (index === -1) return null
  const candidate = segment.slice(index + 1)
  return /^[0-9a-z]{5,6}$/.test(candidate) ? candidate : null
}
