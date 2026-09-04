import {
  renderGinkoHref,
  type GinkoRoutingLocale,
} from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../../lib/paths.js'
import type { CmsCollection, QueryOrMutationCtx } from '../../lib/types.js'
import {
  entrySnapshotPath,
  localeSnapshotPathFromPublicPath,
  pathSegments,
  publicPathForLocaleSnapshot,
} from './path.js'
import { MAX_PUBLIC_TREE_DEPTH, publicPathForEntry } from './publicTree.js'

const PUBLISH_IMPACT_PAGE_MAX = 100

export type PublishedDescendantRouteChange = {
  entryId: string
  title: string
  currentPath: string | null
  nextPath: string
  currentHref: string | null
  nextHref: string
}

type PublishImpactFrame = {
  parentEntryId: string
  nextParentPath: string
  orderKey: string | null
  entryId: string | null
}

type PublishImpactCursor = {
  v: 1
  kind: 'publishRouteImpact'
  collection: string
  entryId: string
  locale: string
  draftVersion: number
  routeGeneration: number
  nextRootPath: string
  frames: PublishImpactFrame[]
}

function appendPathSegment(parentPath: string, slug: string) {
  return parentPath === '/' ? `/${slug}` : `${parentPath}/${slug}`
}

function cursorEntryId(ctx: QueryOrMutationCtx, value: string): Id<'entries'> {
  const entryId = ctx.db.normalizeId('entries', value)
  if (!entryId)
    throwCmsError('INVALID_CURSOR', 'Publish impact cursor contains an invalid entry id.')
  return entryId
}

async function nextPublicChild(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    locale: string
    parentEntryId: string
    orderKey: string | null
    entryId: string | null
  },
) {
  const parentEntryId = cursorEntryId(ctx, args.parentEntryId)
  if (args.orderKey === null) {
    return await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
        query
          .eq('collection', args.collection)
          .eq('locale', args.locale)
          .eq('parentEntryId', parentEntryId),
      )
      .order('asc')
      .first()
  }

  if (args.entryId === null) {
    throwCmsError('INVALID_CURSOR', 'Publish impact cursor has an incomplete sibling position.')
  }
  const entryId = cursorEntryId(ctx, args.entryId)
  const sameRank = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
      query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('parentEntryId', parentEntryId)
        .eq('orderKey', args.orderKey!)
        .gt('entryId', entryId),
    )
    .order('asc')
    .first()
  if (sameRank) return sameRank

  return await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey_entry', (query) =>
      query
        .eq('collection', args.collection)
        .eq('locale', args.locale)
        .eq('parentEntryId', parentEntryId)
        .gt('orderKey', args.orderKey!),
    )
    .order('asc')
    .first()
}

function cloneFrames(frames: PublishImpactFrame[]): PublishImpactFrame[] {
  return frames.map((frame) => ({ ...frame }))
}

function encodeCursor(args: Omit<PublishImpactCursor, 'v' | 'kind'>): string {
  return JSON.stringify({ v: 1, kind: 'publishRouteImpact', ...args } satisfies PublishImpactCursor)
}

function parseCursor(
  value: string | null | undefined,
  expected: Omit<PublishImpactCursor, 'v' | 'kind' | 'frames'>,
): PublishImpactCursor | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throwCmsError('INVALID_CURSOR', 'Publish impact cursor is invalid.')
  }
  const cursor = parsed as Partial<PublishImpactCursor>
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    cursor.v !== 1 ||
    cursor.kind !== 'publishRouteImpact' ||
    cursor.collection !== expected.collection ||
    cursor.entryId !== expected.entryId ||
    cursor.locale !== expected.locale ||
    cursor.draftVersion !== expected.draftVersion ||
    cursor.routeGeneration !== expected.routeGeneration ||
    cursor.nextRootPath !== expected.nextRootPath ||
    !Array.isArray(cursor.frames) ||
    cursor.frames.length === 0 ||
    cursor.frames.length > MAX_PUBLIC_TREE_DEPTH + 1 ||
    cursor.frames.some(
      (frame) =>
        !frame ||
        typeof frame !== 'object' ||
        typeof frame.parentEntryId !== 'string' ||
        typeof frame.nextParentPath !== 'string' ||
        (frame.orderKey !== null && typeof frame.orderKey !== 'string') ||
        (frame.entryId !== null && typeof frame.entryId !== 'string'),
    )
  ) {
    throwCmsError('INVALID_CURSOR', 'Publish impact cursor is invalid or stale.')
  }
  return cursor as PublishImpactCursor
}

async function assertCursorFrames(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    entryId: string
    locale: string
    nextRootPath: string
    frames: PublishImpactFrame[]
  },
) {
  let expectedParentEntryId = args.entryId
  let expectedNextParentPath = args.nextRootPath
  for (const [index, frame] of args.frames.entries()) {
    if (
      frame.parentEntryId !== expectedParentEntryId ||
      frame.nextParentPath !== expectedNextParentPath ||
      (frame.orderKey === null) !== (frame.entryId === null)
    ) {
      throwCmsError('INVALID_CURSOR', 'Publish impact cursor does not describe one tree branch.')
    }
    if (frame.entryId === null) {
      if (index !== args.frames.length - 1) {
        throwCmsError('INVALID_CURSOR', 'Publish impact cursor has an incomplete branch position.')
      }
      continue
    }
    const row = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) =>
        query.eq('entryId', cursorEntryId(ctx, frame.entryId!)).eq('locale', args.locale),
      )
      .unique()
    if (
      !row ||
      row.collection !== args.collection ||
      String(row.parentEntryId) !== frame.parentEntryId ||
      row.orderKey !== frame.orderKey
    ) {
      throwCmsError('INVALID_CURSOR', 'Publish impact cursor no longer matches the public tree.')
    }
    expectedParentEntryId = String(row.entryId)
    expectedNextParentPath = appendPathSegment(frame.nextParentPath, row.slug)
  }
}

export async function computePublishedAncestorSlugsForPreview(
  ctx: QueryOrMutationCtx,
  args: {
    collection: CmsCollection
    parentEntryId: Id<'entries'> | null
    locale: string
  },
): Promise<string[]> {
  if (!args.parentEntryId) return []

  const parentPublic = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (query) =>
      query.eq('entryId', args.parentEntryId!).eq('locale', args.locale),
    )
    .unique()
  if (!parentPublic) {
    const parent = await ctx.db.get(args.parentEntryId)
    return parent ? [parent.slug] : []
  }

  const parentPath = await publicPathForEntry(ctx, parentPublic, {
    pathPrefix: pathPrefixForLocale(args.collection, args.locale),
    rootSlug: rootSlugForLocale(args.collection, args.locale),
  })
  if (!parentPath) return []
  return pathSegments(localeSnapshotPathFromPublicPath(args.collection, parentPath, args.locale))
}

export async function computeDraftPublicPathForLocale(
  ctx: QueryOrMutationCtx,
  args: {
    collection: CmsCollection
    entry: Doc<'entries'>
    locale: string
    parentEntryId: Id<'entries'> | null
    slug: string
  },
) {
  const ancestorSlugs = await computePublishedAncestorSlugsForPreview(ctx, {
    collection: args.collection,
    parentEntryId: args.parentEntryId,
    locale: args.locale,
  })
  return publicPathForLocaleSnapshot(
    args.collection,
    entrySnapshotPath(args.collection, {
      slug: args.slug,
      stableId: args.entry.stableId ?? null,
      ancestorSlugs,
    }),
    args.locale,
  )
}

/**
 * Pages only published descendants of the entry being moved or renamed. The
 * cursor is fenced by both canonical draft version and public route
 * generation. It contains only the bounded depth-first traversal stack; no
 * descendant impact rows become a second source of truth.
 */
export async function paginatePublishedDescendantRouteChanges(
  ctx: QueryOrMutationCtx,
  args: {
    collection: CmsCollection
    entryId: Id<'entries'>
    locale: string
    nextRootPath: string
    activeRoutingLocales: GinkoRoutingLocale[]
    draftVersion: number
    routeGeneration: number
    cursor?: string | null
    limit?: number
  },
) {
  const limit = Math.min(Math.max(Math.floor(args.limit ?? 25), 1), PUBLISH_IMPACT_PAGE_MAX)
  const expected = {
    collection: args.collection.slug,
    entryId: String(args.entryId),
    locale: args.locale,
    draftVersion: args.draftVersion,
    routeGeneration: args.routeGeneration,
    nextRootPath: args.nextRootPath,
  }
  const cursor = parseCursor(args.cursor, expected)
  const frames = cursor
    ? cloneFrames(cursor.frames)
    : [
        {
          parentEntryId: String(args.entryId),
          nextParentPath: args.nextRootPath,
          orderKey: null,
          entryId: null,
        },
      ]
  await assertCursorFrames(ctx, { ...expected, frames })

  const candidates: Array<{
    change: PublishedDescendantRouteChange
    frames: PublishImpactFrame[]
  }> = []

  while (frames.length > 0 && candidates.length <= limit) {
    const frame = frames[frames.length - 1]!
    const child = await nextPublicChild(ctx, {
      collection: args.collection.slug,
      locale: args.locale,
      parentEntryId: frame.parentEntryId,
      orderKey: frame.orderKey,
      entryId: frame.entryId,
    })
    if (!child) {
      frames.pop()
      continue
    }

    frame.orderKey = child.orderKey
    frame.entryId = String(child.entryId)
    const nextPath = appendPathSegment(frame.nextParentPath, child.slug)
    frames.push({
      parentEntryId: String(child.entryId),
      nextParentPath: nextPath,
      orderKey: null,
      entryId: null,
    })

    const currentPath = await publicPathForEntry(ctx, child, {
      pathPrefix: pathPrefixForLocale(args.collection, args.locale),
      rootSlug: rootSlugForLocale(args.collection, args.locale),
    })
    const currentHref = currentPath
      ? renderGinkoHref({ locale: args.locale, path: currentPath }, args.activeRoutingLocales)
      : null
    const nextHref = renderGinkoHref(
      { locale: args.locale, path: nextPath },
      args.activeRoutingLocales,
    )
    if (currentHref === nextHref) continue

    candidates.push({
      change: {
        entryId: String(child.entryId),
        title: child.title,
        currentPath,
        nextPath,
        currentHref,
        nextHref,
      },
      frames: cloneFrames(frames),
    })
  }

  const hasMore = candidates.length > limit
  const selected = hasMore ? candidates.slice(0, limit) : candidates
  return {
    page: selected.map((candidate) => candidate.change),
    isDone: !hasMore,
    continueCursor:
      hasMore && selected.length
        ? encodeCursor({
            ...expected,
            frames: selected[selected.length - 1]!.frames,
          })
        : null,
  }
}
