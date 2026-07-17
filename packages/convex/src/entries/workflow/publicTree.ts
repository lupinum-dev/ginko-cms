import type { Doc, Id } from '../../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../../lib/types.js'

/**
 * Public routes are derived from the published tree. A route lookup therefore
 * performs one indexed sibling lookup per path segment; it never scans the
 * collection and it never relies on a stored full-path copy.
 */
export const MAX_PUBLIC_TREE_DEPTH = 32

export type PublicTreePathOptions = {
  /** Locale-specific collection prefix, for example `/docs`. */
  pathPrefix?: string | null
  /** A published root slug that canonically maps to the collection prefix. */
  rootSlug?: string | null
}

export type PublicTreeInvariantCode =
  | 'duplicate-entry-locale'
  | 'duplicate-sibling-slug'
  | 'duplicate-active-redirect'

export class PublicTreeInvariantError extends Error {
  readonly code: PublicTreeInvariantCode

  constructor(code: PublicTreeInvariantCode, message: string) {
    super(message)
    this.name = 'PublicTreeInvariantError'
    this.code = code
  }
}

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

function publicPathFromTreeSegments(segments: string[], options?: PublicTreePathOptions): string {
  const { prefix, rootSlug } = normalizedOptions(options)
  if (rootSlug && segments.length === 1 && segments[0] === rootSlug) return prefix || '/'
  const joined = [...(prefix ? prefix.split('/').filter(Boolean) : []), ...segments]
  return joined.length ? `/${joined.join('/')}` : '/'
}

function sameId(left: string | null | undefined, right: string | null | undefined) {
  return String(left ?? '') === String(right ?? '')
}

async function publicRowForEntryLocale(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locale: string,
): Promise<Doc<'publicEntries'> | null> {
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId).eq('locale', locale))
    .take(2)
  if (rows.length > 1) {
    throw new PublicTreeInvariantError(
      'duplicate-entry-locale',
      `Entry ${entryId} has more than one ${locale} public row.`,
    )
  }
  return rows[0] ?? null
}

async function publicSiblingForSlug(
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
    .withIndex('by_collection_locale_parent_slug', (q) =>
      q
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
  // Reject a non-canonical root alias (for example `/docs/root` when `root`
  // canonically maps to `/docs`).
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

/**
 * Computes a prospective route without persisting it. A non-root placement is
 * valid only while its parent is currently reachable in the same public tree.
 */
export async function publicPathForPlacement(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    parentEntryId: Id<'entries'> | null
    slug: string
    options?: PublicTreePathOptions
  },
): Promise<string | null> {
  const slugPath = validatePublicPath(`/${args.slug}`)
  if (!slugPath.ok || slugPath.segments.length !== 1 || slugPath.segments[0] !== args.slug) {
    throw new Error(`Unsafe public slug: ${args.slug}`)
  }

  if (args.parentEntryId === null) {
    return publicPathFromTreeSegments([args.slug], args.options)
  }
  const parent = await inspectPublicEntryReachability(ctx, {
    collection: args.collection,
    locale: args.locale,
    entryId: args.parentEntryId,
    options: args.options,
  })
  if (!parent.reachable) return null
  return publicPathFromTreeSegments(
    [...parent.chain.map((row) => row.slug), args.slug],
    args.options,
  )
}

export async function findPublicSiblingCollision(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    parentEntryId: Id<'entries'> | null
    slug: string
    excludeEntryId?: Id<'entries'> | null
  },
): Promise<Doc<'publicEntries'> | null> {
  const path = validatePublicPath(`/${args.slug}`)
  if (!path.ok || path.segments.length !== 1 || path.segments[0] !== args.slug) {
    throw new Error(`Unsafe public slug: ${args.slug}`)
  }
  const row = await publicSiblingForSlug(ctx, args)
  if (row && args.excludeEntryId && sameId(row.entryId, args.excludeEntryId)) return null
  return row
}

export type PublicPlacementIssue =
  | { code: 'unsafe-slug'; message: string }
  | { code: 'sibling-collision'; message: string; entryId: string }
  | { code: 'unreachable-parent'; message: string; entryId: string }
  | { code: 'parent-cycle'; message: string; entryId: string }

export async function validatePublicPlacement(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId?: Id<'entries'> | null
    parentEntryId: Id<'entries'> | null
    slug: string
    options?: PublicTreePathOptions
  },
): Promise<PublicPlacementIssue[]> {
  const issues: PublicPlacementIssue[] = []
  const slugPath = validatePublicPath(`/${args.slug}`)
  if (!slugPath.ok || slugPath.segments.length !== 1 || slugPath.segments[0] !== args.slug) {
    issues.push({ code: 'unsafe-slug', message: `Unsafe public slug: ${args.slug}` })
    return issues
  }

  const collision = await findPublicSiblingCollision(ctx, {
    ...args,
    excludeEntryId: args.entryId,
  })
  if (collision) {
    issues.push({
      code: 'sibling-collision',
      message: `Published sibling slug ${args.slug} is already used by ${collision.entryId}.`,
      entryId: String(collision.entryId),
    })
  }

  if (args.parentEntryId !== null) {
    const parent = await inspectPublicEntryReachability(ctx, {
      collection: args.collection,
      locale: args.locale,
      entryId: args.parentEntryId,
      options: args.options,
    })
    if (!parent.reachable) {
      issues.push({
        code: 'unreachable-parent',
        message: `Parent ${args.parentEntryId} is not reachable in the published tree.`,
        entryId: String(args.parentEntryId),
      })
    } else if (args.entryId && parent.chain.some((row) => sameId(row.entryId, args.entryId))) {
      issues.push({
        code: 'parent-cycle',
        message: `Moving ${args.entryId} below ${args.parentEntryId} would create a cycle.`,
        entryId: String(args.parentEntryId),
      })
    }
  }

  return issues
}

async function activeRedirectsAtPath(
  ctx: QueryOrMutationCtx,
  args: { collection: string; locale: string; path: string },
): Promise<Doc<'redirects'>[]> {
  return await ctx.db
    .query('redirects')
    .withIndex('by_collection_locale_state_from', (q) =>
      q
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('state', 'active')
        .eq('fromPath', args.path),
    )
    // One existing row is valid, a second proves a collision, and a third
    // keeps candidate validation sound when excluding the row being updated.
    .take(3)
}

function withoutRedirect(
  redirects: Doc<'redirects'>[],
  excludeRedirectId?: Id<'redirects'> | null,
) {
  return excludeRedirectId
    ? redirects.filter((redirect) => !sameId(redirect._id, excludeRedirectId))
    : redirects
}

async function uniqueActiveRedirectAtPath(
  ctx: QueryOrMutationCtx,
  args: { collection: string; locale: string; path: string },
): Promise<Doc<'redirects'> | null> {
  const redirects = await activeRedirectsAtPath(ctx, args)
  if (redirects.length > 1) {
    throw new PublicTreeInvariantError(
      'duplicate-active-redirect',
      `More than one active redirect starts at ${args.collection}/${args.locale}${args.path}.`,
    )
  }
  return redirects[0] ?? null
}

function pathPrefixes(path: string): string[] {
  const segments = normalizePublicPath(path).split('/').filter(Boolean)
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`).reverse()
}

function descendantSuffix(path: string, prefix: string): string {
  if (path === prefix) return ''
  return path.slice(prefix.length)
}

function joinRedirectTarget(targetPath: string, suffix: string): string {
  if (!suffix) return targetPath
  if (targetPath === '/') return normalizePublicPath(suffix)
  return normalizePublicPath(`${targetPath}${suffix}`)
}

export type PublicRedirectInvalidReason =
  | 'target-unreachable'
  | 'target-suffix-missing'
  | 'target-outside-subtree'
  | 'redirect-loop'

export type PublicRedirectLookup =
  | { kind: 'none' }
  | {
      kind: 'invalid'
      redirect: Doc<'redirects'>
      reason: PublicRedirectInvalidReason
    }
  | {
      kind: 'redirect'
      redirect: Doc<'redirects'>
      sourcePath: string
      targetPath: string
      target: PublicTreeResolution
      statusCode: number
    }

async function matchingRedirect(
  ctx: QueryOrMutationCtx,
  args: { collection: string; locale: string; path: string },
): Promise<Doc<'redirects'> | null> {
  const exactSource = await uniqueActiveRedirectAtPath(ctx, args)
  if (exactSource?.kind === 'exact') return exactSource

  for (const prefix of pathPrefixes(args.path)) {
    const candidate =
      prefix === args.path
        ? exactSource
        : await uniqueActiveRedirectAtPath(ctx, {
            ...args,
            path: prefix,
          })
    if (candidate?.kind === 'prefix') return candidate
  }
  return null
}

/**
 * Resolves at most one redirect. Targets are entry IDs, not paths, and the
 * resulting target path is checked directly against the tree without calling
 * redirect resolution again.
 */
export async function resolvePublicRedirect(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    path: string
    options?: PublicTreePathOptions
  },
): Promise<PublicRedirectLookup> {
  const sourcePath = normalizePublicPath(args.path)
  const redirect = await matchingRedirect(ctx, { ...args, path: sourcePath })
  if (!redirect) return { kind: 'none' }

  const targetEntry = await inspectPublicEntryReachability(ctx, {
    collection: args.collection,
    locale: args.locale,
    entryId: redirect.targetEntryId,
    options: args.options,
  })
  if (!targetEntry.reachable) return { kind: 'invalid', redirect, reason: 'target-unreachable' }

  const suffix = redirect.kind === 'prefix' ? descendantSuffix(sourcePath, redirect.fromPath) : ''
  const targetPath = joinRedirectTarget(targetEntry.path, suffix)
  if (targetPath === sourcePath) return { kind: 'invalid', redirect, reason: 'redirect-loop' }

  const target = await resolvePublicTreePath(ctx, {
    collection: args.collection,
    locale: args.locale,
    path: targetPath,
    options: args.options,
  })
  if (!target) return { kind: 'invalid', redirect, reason: 'target-suffix-missing' }

  const targetRootIndex = target.chain.findIndex((row) =>
    sameId(row.entryId, redirect.targetEntryId),
  )
  if (targetRootIndex < 0) {
    return { kind: 'invalid', redirect, reason: 'target-outside-subtree' }
  }

  return {
    kind: 'redirect',
    redirect,
    sourcePath,
    targetPath,
    target,
    statusCode: redirect.statusCode,
  }
}

export type PublicRouteLookup =
  | ({ kind: 'entry' } & PublicTreeResolution)
  | ({ kind: 'redirect' } & Omit<Extract<PublicRedirectLookup, { kind: 'redirect' }>, 'kind'>)
  | ({ kind: 'invalid-redirect' } & Omit<
      Extract<PublicRedirectLookup, { kind: 'invalid' }>,
      'kind'
    >)
  | { kind: 'not-found' }

export async function resolvePublicRoute(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    path: string
    options?: PublicTreePathOptions
  },
): Promise<PublicRouteLookup> {
  const direct = await resolvePublicTreePath(ctx, args)
  if (direct) return { kind: 'entry', ...direct }

  const redirect = await resolvePublicRedirect(ctx, args)
  if (redirect.kind === 'none') return { kind: 'not-found' }
  if (redirect.kind === 'invalid') {
    return {
      kind: 'invalid-redirect',
      redirect: redirect.redirect,
      reason: redirect.reason,
    }
  }
  return redirect
}

export type PublicRedirectValidationIssue =
  | { code: 'unsafe-source'; message: string }
  | { code: 'source-route-collision'; message: string; entryId: string }
  | { code: 'source-redirect-collision'; message: string; redirectId: string }
  | { code: 'source-covered-by-prefix'; message: string; redirectId: string }
  | { code: 'target-unreachable'; message: string; entryId: string }
  | { code: 'self-loop'; message: string }
  | { code: 'prefix-loop'; message: string }
  | { code: 'target-redirect-source'; message: string; redirectId: string }

export type PublicRedirectValidation = {
  ok: boolean
  fromPath: string | null
  targetPath: string | null
  issues: PublicRedirectValidationIssue[]
}

export async function validatePublicRedirectCandidate(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    kind: 'exact' | 'prefix'
    fromPath: string
    targetEntryId: Id<'entries'>
    excludeRedirectId?: Id<'redirects'> | null
    options?: PublicTreePathOptions
  },
): Promise<PublicRedirectValidation> {
  const source = validatePublicPath(args.fromPath)
  if (!source.ok || source.path === '/') {
    return {
      ok: false,
      fromPath: null,
      targetPath: null,
      issues: [
        {
          code: 'unsafe-source',
          message: source.ok ? 'The root path cannot redirect.' : source.reason,
        },
      ],
    }
  }

  const issues: PublicRedirectValidationIssue[] = []
  const fromPath = source.path
  const direct = await resolvePublicTreePath(ctx, {
    collection: args.collection,
    locale: args.locale,
    path: fromPath,
    options: args.options,
  })
  if (direct && !sameId(direct.row.entryId, args.targetEntryId)) {
    issues.push({
      code: 'source-route-collision',
      message: `${fromPath} already resolves to published entry ${direct.row.entryId}.`,
      entryId: String(direct.row.entryId),
    })
  } else if (direct) {
    issues.push({
      code: 'self-loop',
      message: `${fromPath} already resolves directly to the redirect target.`,
    })
  }

  const sameSource = withoutRedirect(
    await activeRedirectsAtPath(ctx, {
      collection: args.collection,
      locale: args.locale,
      path: fromPath,
    }),
    args.excludeRedirectId,
  )
  for (const redirect of sameSource) {
    issues.push({
      code: 'source-redirect-collision',
      message: `${fromPath} is already the source of redirect ${redirect._id}.`,
      redirectId: String(redirect._id),
    })
  }

  for (const prefix of pathPrefixes(fromPath).slice(1)) {
    const covering = withoutRedirect(
      await activeRedirectsAtPath(ctx, {
        collection: args.collection,
        locale: args.locale,
        path: prefix,
      }),
      args.excludeRedirectId,
    ).find((redirect) => redirect.kind === 'prefix')
    if (covering) {
      issues.push({
        code: 'source-covered-by-prefix',
        message: `${fromPath} is already covered by prefix redirect ${covering._id}.`,
        redirectId: String(covering._id),
      })
      break
    }
  }

  const target = await inspectPublicEntryReachability(ctx, {
    collection: args.collection,
    locale: args.locale,
    entryId: args.targetEntryId,
    options: args.options,
  })
  if (!target.reachable) {
    issues.push({
      code: 'target-unreachable',
      message: `Redirect target ${args.targetEntryId} is not reachable in the published tree.`,
      entryId: String(args.targetEntryId),
    })
    return { ok: false, fromPath, targetPath: null, issues }
  }

  if (target.path === fromPath) {
    issues.push({ code: 'self-loop', message: 'Redirect source and target paths are identical.' })
  }
  if (args.kind === 'prefix' && target.path.startsWith(`${fromPath}/`)) {
    issues.push({
      code: 'prefix-loop',
      message: `Prefix redirect target ${target.path} is inside its own source prefix ${fromPath}.`,
    })
  }

  for (const prefix of pathPrefixes(target.path)) {
    const targetSource = withoutRedirect(
      await activeRedirectsAtPath(ctx, {
        collection: args.collection,
        locale: args.locale,
        path: prefix,
      }),
      args.excludeRedirectId,
    ).find((redirect) => (redirect.kind === 'exact' ? prefix === target.path : true))
    if (targetSource) {
      issues.push({
        code: 'target-redirect-source',
        message: `Target path ${target.path} is covered by active redirect ${targetSource._id}.`,
        redirectId: String(targetSource._id),
      })
      break
    }
  }

  return { ok: issues.length === 0, fromPath, targetPath: target.path, issues }
}
