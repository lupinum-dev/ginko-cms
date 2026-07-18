import type { Doc, Id } from '../../../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../../../lib/types.js'
import { PublicTreeInvariantError, type PublicTreePathOptions } from './model.js'
import {
  inspectPublicEntryReachability,
  normalizePublicPath,
  resolvePublicTreePath,
  sameId,
  type PublicTreeResolution,
  validatePublicPath,
} from './pathResolution.js'

async function activeRedirectsAtPath(
  ctx: QueryOrMutationCtx,
  args: { collection: string; locale: string; path: string },
): Promise<Doc<'redirects'>[]> {
  return await ctx.db
    .query('redirects')
    .withIndex('by_collection_locale_state_from', (query) =>
      query
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

export type ActiveRedirectPlacementCollision =
  | { kind: 'source'; redirect: Doc<'redirects'> }
  | { kind: 'covered-by-prefix'; redirect: Doc<'redirects'> }

function pathPrefixes(path: string): string[] {
  const segments = normalizePublicPath(path).split('/').filter(Boolean)
  return segments.map((_, index) => `/${segments.slice(0, index + 1).join('/')}`).reverse()
}

/**
 * Finds active redirects that reserve a prospective public path. Exact source
 * ownership and ancestor prefix coverage are distinct so previews can explain
 * the precise blocker without scanning the redirect table.
 */
export async function findActiveRedirectPlacementCollisions(
  ctx: QueryOrMutationCtx,
  args: { collection: string; locale: string; path: string },
): Promise<ActiveRedirectPlacementCollision[]> {
  const path = normalizePublicPath(args.path)
  const collisions: ActiveRedirectPlacementCollision[] = []
  const source = await uniqueActiveRedirectAtPath(ctx, { ...args, path })
  if (source) collisions.push({ kind: 'source', redirect: source })

  for (const prefix of pathPrefixes(path).slice(1)) {
    const redirect = await uniqueActiveRedirectAtPath(ctx, { ...args, path: prefix })
    if (redirect?.kind === 'prefix') {
      collisions.push({ kind: 'covered-by-prefix', redirect })
      break
    }
  }
  return collisions
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
      message: `${fromPath} is already the source of redirect ${redirect.redirectId}.`,
      redirectId: redirect.redirectId,
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
        message: `${fromPath} is already covered by prefix redirect ${covering.redirectId}.`,
        redirectId: covering.redirectId,
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
        message: `Target path ${target.path} is covered by active redirect ${targetSource.redirectId}.`,
        redirectId: targetSource.redirectId,
      })
      break
    }
  }

  return { ok: issues.length === 0, fromPath, targetPath: target.path, issues }
}
