import type { Doc, Id } from '../../../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../../../lib/types.js'
import {
  MAX_PUBLIC_TREE_DEPTH,
  PublicTreeInvariantError,
  type PublicTreePathOptions,
} from './model.js'

export type PublicPathValidation =
  | { ok: true; path: string; segments: string[] }
  | { ok: false; reason: string }

function decodedSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

function hasControlCharacterOrBackslash(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127 || character === '\\') return true
  }
  return false
}

/**
 * Normalizes only harmless leading/trailing slash differences. Ambiguous or
 * unsafe spellings are rejected instead of being silently rewritten into a
 * different route.
 */
export function validatePublicPath(path: string): PublicPathValidation {
  const trimmed = path.trim()
  if (!trimmed) return { ok: true, path: '/', segments: [] }
  if (trimmed.includes('?') || trimmed.includes('#')) {
    return { ok: false, reason: 'Route paths must not contain a query string or fragment.' }
  }
  if (hasControlCharacterOrBackslash(trimmed)) {
    return { ok: false, reason: 'Route paths must not contain control characters or backslashes.' }
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.startsWith('//') || /\/{2,}/u.test(withLeadingSlash)) {
    return { ok: false, reason: 'Route paths must not contain empty path segments.' }
  }

  const withoutTrailingSlash =
    withLeadingSlash === '/' ? '/' : withLeadingSlash.replace(/\/+$/u, '')
  const segments = withoutTrailingSlash.split('/').filter(Boolean)
  if (segments.length > MAX_PUBLIC_TREE_DEPTH) {
    return {
      ok: false,
      reason: `Route paths may contain at most ${MAX_PUBLIC_TREE_DEPTH} segments.`,
    }
  }

  for (const segment of segments) {
    const decoded = decodedSegment(segment)
    if (
      decoded === null ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      /\s/u.test(decoded) ||
      hasControlCharacterOrBackslash(decoded)
    ) {
      return { ok: false, reason: `Unsafe route segment: ${segment}` }
    }
  }

  return {
    ok: true,
    path: segments.length ? `/${segments.join('/')}` : '/',
    segments,
  }
}

export function normalizePublicPath(path: string): string {
  const result = validatePublicPath(path)
  if (!result.ok) throw new Error(result.reason)
  return result.path
}

function normalizedOptions(options: PublicTreePathOptions | undefined) {
  const prefix = options?.pathPrefix ? normalizePublicPath(options.pathPrefix) : '/'
  const rootSlug = options?.rootSlug?.trim() || null
  if (rootSlug) {
    const root = validatePublicPath(`/${rootSlug}`)
    if (!root.ok || root.segments.length !== 1 || root.segments[0] !== rootSlug) {
      throw new Error(`Unsafe public root slug: ${rootSlug}`)
    }
  }
  return {
    prefix: prefix === '/' ? '' : prefix,
    rootSlug,
  }
}

function treeSegmentsFromPublicPath(
  path: string,
  options?: PublicTreePathOptions,
): string[] | null {
  const normalizedPath = normalizePublicPath(path)
  const { prefix, rootSlug } = normalizedOptions(options)
  if (prefix && normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) return null

  const relative = prefix ? normalizedPath.slice(prefix.length) || '/' : normalizedPath
  const result = validatePublicPath(relative)
  if (!result.ok) return null
  if (!result.segments.length && rootSlug) return [rootSlug]
  return result.segments
}

export function publicPathFromTreeSegments(
  segments: string[],
  options?: PublicTreePathOptions,
): string {
  const { prefix, rootSlug } = normalizedOptions(options)
  if (rootSlug && segments.length === 1 && segments[0] === rootSlug) return prefix || '/'
  const joined = [...(prefix ? prefix.split('/').filter(Boolean) : []), ...segments]
  return joined.length ? `/${joined.join('/')}` : '/'
}

export function sameId(left: string | null | undefined, right: string | null | undefined) {
  return String(left ?? '') === String(right ?? '')
}

async function publicRowForEntryLocale(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locale: string,
): Promise<Doc<'publicEntries'> | null> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId).eq('locale', locale))
    .take(2)
  if (rows.length > 1) {
    throw new PublicTreeInvariantError(
      'duplicate-entry-locale',
      `Entry ${entryId} has more than one ${locale} public row.`,
    )
  }
  return rows[0] ?? null
}

export async function publicSiblingForSlug(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    parentEntryId: Id<'entries'> | null
    slug: string
  },
): Promise<Doc<'publicEntries'> | null> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_slug', (query) =>
      query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('parentEntryId', args.parentEntryId)
        .eq('slug', args.slug),
    )
    .take(2)
  if (rows.length > 1) {
    throw new PublicTreeInvariantError(
      'duplicate-sibling-slug',
      `Published siblings in ${args.collection}/${args.locale} share slug ${args.slug}.`,
    )
  }
  return rows[0] ?? null
}

export type PublicTreeResolution = {
  row: Doc<'publicEntries'>
  /** Canonical public path, including the locale-specific collection prefix. */
  path: string
  /** Root-to-leaf published rows. */
  chain: Doc<'publicEntries'>[]
}

/**
 * Public routes are derived from the published tree. A route lookup performs
 * one indexed sibling lookup per path segment and never scans the collection.
 */
export async function resolvePublicTreePath(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    path: string
    options?: PublicTreePathOptions
  },
): Promise<PublicTreeResolution | null> {
  const normalizedPath = normalizePublicPath(args.path)
  const segments = treeSegmentsFromPublicPath(normalizedPath, args.options)
  if (!segments?.length) return null

  let parentEntryId: Id<'entries'> | null = null
  const chain: Doc<'publicEntries'>[] = []
  for (const slug of segments) {
    const row = await publicSiblingForSlug(ctx, {
      collection: args.collection,
      locale: args.locale,
      parentEntryId,
      slug,
    })
    if (!row) return null
    chain.push(row)
    parentEntryId = row.entryId
  }

  const canonicalPath = publicPathFromTreeSegments(
    chain.map((row) => row.slug),
    args.options,
  )
  if (canonicalPath !== normalizedPath) return null
  return { row: chain[chain.length - 1]!, path: canonicalPath, chain }
}

/** Stable consumer name for path-based provider reads. */
export async function resolvePublicPath(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    path: string
    options?: PublicTreePathOptions
  },
): Promise<PublicTreeResolution | null> {
  return await resolvePublicTreePath(ctx, args)
}

export type PublicEntryReachability =
  | {
      reachable: true
      row: Doc<'publicEntries'>
      path: string
      chain: Doc<'publicEntries'>[]
    }
  | {
      reachable: false
      reason:
        | 'missing-entry'
        | 'missing-parent'
        | 'collection-mismatch'
        | 'parent-cycle'
        | 'depth-exceeded'
      row: Doc<'publicEntries'> | null
      problemEntryId: string
    }

export async function inspectPublicEntryReachability(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId: Id<'entries'>
    options?: PublicTreePathOptions
  },
): Promise<PublicEntryReachability> {
  const leaf = await publicRowForEntryLocale(ctx, args.entryId, args.locale)
  if (!leaf) {
    return {
      reachable: false,
      reason: 'missing-entry',
      row: null,
      problemEntryId: String(args.entryId),
    }
  }

  const reverseChain: Doc<'publicEntries'>[] = []
  const seen = new Set<string>()
  let current: Doc<'publicEntries'> | null = leaf
  while (current) {
    if (current.collection !== args.collection || current.locale !== args.locale) {
      return {
        reachable: false,
        reason: 'collection-mismatch',
        row: leaf,
        problemEntryId: String(current.entryId),
      }
    }

    const currentId = String(current.entryId)
    if (seen.has(currentId)) {
      return {
        reachable: false,
        reason: 'parent-cycle',
        row: leaf,
        problemEntryId: currentId,
      }
    }
    if (reverseChain.length >= MAX_PUBLIC_TREE_DEPTH) {
      return {
        reachable: false,
        reason: 'depth-exceeded',
        row: leaf,
        problemEntryId: currentId,
      }
    }
    seen.add(currentId)
    reverseChain.push(current)

    if (current.parentEntryId === null) break
    const parentId = current.parentEntryId
    current = await publicRowForEntryLocale(ctx, parentId, args.locale)
    if (!current) {
      return {
        reachable: false,
        reason: 'missing-parent',
        row: leaf,
        problemEntryId: String(parentId),
      }
    }
  }

  const chain = reverseChain.reverse()
  return {
    reachable: true,
    row: leaf,
    path: publicPathFromTreeSegments(
      chain.map((row) => row.slug),
      args.options,
    ),
    chain,
  }
}

export async function currentPublicPathForEntry(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId: Id<'entries'>
    options?: PublicTreePathOptions
  },
): Promise<string | null> {
  const result = await inspectPublicEntryReachability(ctx, args)
  return result.reachable ? result.path : null
}

export async function publicPathForEntry(
  ctx: QueryOrMutationCtx,
  row: Pick<Doc<'publicEntries'>, 'entryId' | 'collection' | 'locale'>,
  options?: PublicTreePathOptions,
): Promise<string | null> {
  return await currentPublicPathForEntry(ctx, {
    collection: row.collection,
    locale: row.locale,
    entryId: row.entryId,
    options,
  })
}

export async function isPubliclyReachable(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId: Id<'entries'>
    options?: PublicTreePathOptions
  },
): Promise<boolean> {
  return (await inspectPublicEntryReachability(ctx, args)).reachable
}
