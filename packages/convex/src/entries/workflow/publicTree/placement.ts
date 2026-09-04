import type { Doc, Id } from '../../../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../../../lib/types.js'
import type { PublicPlacementIssue, PublicTreePathOptions } from './model.js'
import {
  inspectPublicEntryReachability,
  publicPathFromTreeSegments,
  publicSiblingForSlug,
  sameId,
  validatePublicPath,
} from './pathResolution.js'
import { activeRedirectPlacementIssues } from './redirectPlacement.js'

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

export type { PublicPlacementIssue } from './model.js'

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

  let prospectivePath: string | null = null
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
    } else {
      prospectivePath = publicPathFromTreeSegments(
        [...parent.chain.map((row) => row.slug), args.slug],
        args.options,
      )
    }
  } else {
    prospectivePath = publicPathFromTreeSegments([args.slug], args.options)
  }

  if (prospectivePath) {
    issues.push(
      ...(await activeRedirectPlacementIssues(ctx, {
        collection: args.collection,
        locale: args.locale,
        entryId: args.entryId,
        nextRootPath: prospectivePath,
        options: args.options,
      })),
    )
  }

  return issues
}
