import type { Doc, Id } from '../../../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../../../lib/types.js'
import type { PublicPlacementIssue, PublicTreePathOptions } from './model.js'
import {
  currentPublicPathForEntry,
  normalizePublicPath,
  publicSiblingForSlug,
  validatePublicPath,
} from './pathResolution.js'
import {
  findActiveRedirectPlacementCollisions,
  type ActiveRedirectPlacementCollision,
} from './redirects.js'

export type ActiveRedirectTreePlacementCollision = ActiveRedirectPlacementCollision & {
  path: string
  entryId: string
}

function descendantSourceRange(path: string) {
  const root = normalizePublicPath(path)
  return root === '/'
    ? { lower: '/', upper: '0', suffixOffset: 0 }
    : { lower: `${root}/`, upper: `${root}0`, suffixOffset: root.length }
}

async function findActiveRedirectSubtreePlacementCollision(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId: Id<'entries'>
    nextRootPath: string
  },
): Promise<ActiveRedirectTreePlacementCollision | null> {
  const range = descendantSourceRange(args.nextRootPath)
  const redirects = await ctx.db
    .query('redirects')
    .withIndex('by_collection_locale_state_from', (query) =>
      query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('state', 'active')
        .gte('fromPath', range.lower)
        .lt('fromPath', range.upper),
    )
    .collect()

  for (const redirect of redirects) {
    const suffix = validatePublicPath(redirect.fromPath.slice(range.suffixOffset))
    if (!suffix.ok || suffix.segments.length === 0) continue

    let parentEntryId = args.entryId
    let descendant: Doc<'publicEntries'> | null = null
    for (const slug of suffix.segments) {
      descendant = await publicSiblingForSlug(ctx, {
        collection: args.collection,
        locale: args.locale,
        parentEntryId,
        slug,
      })
      if (!descendant) break
      parentEntryId = descendant.entryId
    }
    if (descendant) {
      return {
        kind: 'source',
        redirect,
        path: redirect.fromPath,
        entryId: String(descendant.entryId),
      }
    }
  }
  return null
}

/**
 * Checks the prospective root and every published descendant without walking
 * the subtree. Descendant candidates come from the active redirect-source
 * index, then use one indexed parent/slug lookup per route segment.
 */
export async function findActiveRedirectTreePlacementCollisions(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId?: Id<'entries'> | null
    currentRootPath?: string | null
    nextRootPath: string
    options?: PublicTreePathOptions
  },
): Promise<ActiveRedirectTreePlacementCollision[]> {
  const nextRootPath = normalizePublicPath(args.nextRootPath)
  const rootCollisions = await findActiveRedirectPlacementCollisions(ctx, {
    collection: args.collection,
    locale: args.locale,
    path: nextRootPath,
  })
  const collisions = rootCollisions.map((collision) => ({
    ...collision,
    path: nextRootPath,
    entryId: String(args.entryId ?? ''),
  }))
  if (!args.entryId) return collisions

  const currentRootPath =
    args.currentRootPath === undefined
      ? await currentPublicPathForEntry(ctx, {
          collection: args.collection,
          locale: args.locale,
          entryId: args.entryId,
          options: args.options,
        })
      : args.currentRootPath
  if (!currentRootPath || normalizePublicPath(currentRootPath) === nextRootPath) return collisions

  const descendant = await findActiveRedirectSubtreePlacementCollision(ctx, {
    collection: args.collection,
    locale: args.locale,
    entryId: args.entryId,
    nextRootPath,
  })
  return descendant ? [...collisions, descendant] : collisions
}

export async function activeRedirectPlacementIssues(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    entryId?: Id<'entries'> | null
    nextRootPath: string
    options?: PublicTreePathOptions
  },
): Promise<PublicPlacementIssue[]> {
  const collisions = await findActiveRedirectTreePlacementCollisions(ctx, args)
  return collisions.map((collision) => {
    const redirectId = collision.redirect.redirectId
    const fromPath = collision.redirect.fromPath
    return collision.kind === 'source'
      ? {
          code: 'redirect-source-collision' as const,
          message: `${collision.path} is reserved by active ${collision.redirect.kind} redirect ${redirectId}. Retire the redirect before reusing this path.`,
          redirectId,
          fromPath,
        }
      : {
          code: 'redirect-prefix-collision' as const,
          message: `${collision.path} is covered by active prefix redirect ${redirectId} at ${fromPath}. Retire the redirect before reusing this path.`,
          redirectId,
          fromPath,
        }
  })
}
