import {
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import {
  renderGinkoHref,
  type GinkoRoutingLocale,
} from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { toStringId } from '../../lib/ids.js'
import { compareOrderRank } from '../../lib/ordering.js'
import type { MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'
import { localeSnapshotPathFromPublicPath, publicPathForLocaleSnapshot } from './path.js'
import {
  appendRevisionAndPatchEntry,
  type RevisionLocaleSnapshot,
  type RevisionSnapshot,
} from './revisions.js'

export type PublishedDescendantRouteChange = {
  entry: Doc<'entries'>
  entryId: string
  locale: string
  publicRow: Doc<'publicEntries'>
  revision: Doc<'entryRevisions'>
  localeSnapshot: RevisionLocaleSnapshot
  currentPath: string
  nextPath: string
  currentHref: string | null
  nextHref: string | null
  title: string
}

export type DescendantProjectionRebuild = {
  entry: Doc<'entries'>
  publicRow: Doc<'publicEntries'>
  revision: Doc<'entryRevisions'>
  locale: string
  snapshot: {
    parentEntryId?: Id<'entries'> | null
    orderRank?: string | null
  }
  localeSnapshot: RevisionLocaleSnapshot
  oldPath: string
  newPath: string
  cacheTags: string[]
}

function sortPublicRows(left: Doc<'publicEntries'>, right: Doc<'publicEntries'>) {
  const rank = compareOrderRank(left.orderKey, right.orderKey)
  if (rank !== 0) return rank
  return toStringId(left.entryId).localeCompare(toStringId(right.entryId))
}

function descendantSuffix(args: { ancestorPath: string; descendantPath: string }) {
  if (args.ancestorPath === '/') return args.descendantPath
  const prefix = `${args.ancestorPath}/`
  return args.descendantPath.startsWith(prefix)
    ? args.descendantPath.slice(args.ancestorPath.length)
    : null
}

function joinDescendantPath(args: { ancestorPath: string; suffix: string }) {
  if (args.ancestorPath === '/')
    return args.suffix.startsWith('/') ? args.suffix : `/${args.suffix}`
  return `${args.ancestorPath}${args.suffix.startsWith('/') ? args.suffix : `/${args.suffix}`}`
}

async function publicChildrenForParent(
  ctx: QueryOrMutationCtx,
  args: {
    collectionId: Id<'collections'>
    locale: string
    parentEntryId: Id<'entries'>
  },
) {
  return (
    await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey', (q) =>
        q
          .eq('collectionId', args.collectionId)
          .eq('locale', args.locale)
          .eq('parentEntryId', args.parentEntryId),
      )
      .collect()
  ).sort(sortPublicRows)
}

function requirePublicDescendantEntry(args: {
  publicRow: Doc<'publicEntries'>
  entry: Doc<'entries'> | null
}) {
  if (!args.entry) {
    throw new Error(
      `Public descendant route rebuild rejected: entry ${args.publicRow.entryId} is missing`,
    )
  }
  return args.entry
}

function requirePublicDescendantRevision(args: {
  publicRow: Doc<'publicEntries'>
  revision: Doc<'entryRevisions'> | null
}) {
  if (!args.revision) {
    throw new Error(
      `Public descendant route rebuild rejected: revision ${args.publicRow.revisionId} is missing`,
    )
  }
  return args.revision
}

function requirePublicDescendantLocaleSnapshot(args: {
  publicRow: Doc<'publicEntries'>
  revision: Doc<'entryRevisions'>
  locale: string
}) {
  const snapshot = args.revision.snapshot.locales[args.locale] ?? null
  if (!snapshot) {
    throw new Error(
      `Public descendant route rebuild rejected: revision ${args.revision._id} has no ${args.locale} snapshot for public row ${args.publicRow._id}`,
    )
  }
  return snapshot
}

function requireDescendantSuffix(args: {
  ancestorPath: string
  descendantPath: string
  entryId: string
}) {
  const suffix = descendantSuffix(args)
  if (suffix === null) {
    throw new Error(
      `Public descendant route rebuild rejected: public path ${args.descendantPath} for entry ${args.entryId} is not below ${args.ancestorPath}`,
    )
  }
  return suffix
}

export async function collectPublishedDescendantRouteChanges(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Doc<'collections'>
    rootEntry: Doc<'entries'>
    locale: string
    currentPath: string | null
    nextPath: string | null
    activeRoutingLocales?: GinkoRoutingLocale[]
  },
): Promise<PublishedDescendantRouteChange[]> {
  if (!args.currentPath || !args.nextPath || args.currentPath === args.nextPath) return []

  const changes: PublishedDescendantRouteChange[] = []
  const queue = await publicChildrenForParent(ctx, {
    collectionId: args.collection._id,
    locale: args.locale,
    parentEntryId: args.rootEntry._id,
  })
  const seen = new Set<string>([toStringId(args.rootEntry._id)])

  while (queue.length > 0) {
    const publicRow = queue.shift()!
    const entryId = toStringId(publicRow.entryId)
    if (seen.has(entryId)) continue
    seen.add(entryId)

    const entry = requirePublicDescendantEntry({
      publicRow,
      entry: await ctx.db.get(publicRow.entryId),
    })
    const revision = requirePublicDescendantRevision({
      publicRow,
      revision: await ctx.db.get(publicRow.revisionId),
    })
    const publicLocaleSnapshot = requirePublicDescendantLocaleSnapshot({
      publicRow,
      revision,
      locale: args.locale,
    })
    const suffix = requireDescendantSuffix({
      ancestorPath: args.currentPath,
      descendantPath: publicRow.path,
      entryId,
    })
    const nextPath = joinDescendantPath({
      ancestorPath: args.nextPath,
      suffix,
    })
    if (nextPath !== publicRow.path) {
      changes.push({
        entry,
        entryId,
        locale: args.locale,
        publicRow,
        revision,
        localeSnapshot: {
          ...publicLocaleSnapshot,
          path: localeSnapshotPathFromPublicPath(args.collection, nextPath, args.locale),
        },
        currentPath: publicRow.path,
        nextPath,
        currentHref: args.activeRoutingLocales
          ? renderGinkoHref(
              { locale: args.locale, path: publicRow.path },
              args.activeRoutingLocales,
            )
          : null,
        nextHref: args.activeRoutingLocales
          ? renderGinkoHref({ locale: args.locale, path: nextPath }, args.activeRoutingLocales)
          : null,
        title: publicRow.title || entry.baseSlug || entryId,
      })
    }

    const children = await publicChildrenForParent(ctx, {
      collectionId: args.collection._id,
      locale: args.locale,
      parentEntryId: publicRow.entryId,
    })
    queue.push(...children)
  }

  return changes
}

export async function collectDescendantProjectionRebuilds(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Doc<'collections'>
    rootEntry: Doc<'entries'>
    localeSnapshots: Record<string, RevisionLocaleSnapshot | null>
    locales: string[]
  },
): Promise<DescendantProjectionRebuild[]> {
  const rebuilds: DescendantProjectionRebuild[] = []

  for (const locale of args.locales) {
    const parentLocaleSnapshot = args.localeSnapshots[locale]
    if (!parentLocaleSnapshot) continue
    const parentPublic = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', args.rootEntry._id).eq('locale', locale))
      .first()
    if (!parentPublic) continue

    const nextParentPath = publicPathForLocaleSnapshot(
      args.collection,
      parentLocaleSnapshot.path,
      locale,
    )
    if (parentPublic.path === nextParentPath) continue

    const routeChanges = await collectPublishedDescendantRouteChanges(ctx, {
      collection: args.collection,
      rootEntry: args.rootEntry,
      locale,
      currentPath: parentPublic.path,
      nextPath: nextParentPath,
    })
    for (const change of routeChanges) {
      rebuilds.push({
        entry: change.entry,
        publicRow: change.publicRow,
        revision: change.revision,
        locale,
        snapshot: {
          parentEntryId: change.publicRow.parentEntryId ?? null,
          orderRank: change.publicRow.orderKey ?? null,
        },
        localeSnapshot: change.localeSnapshot,
        oldPath: change.currentPath,
        newPath: change.nextPath,
        cacheTags: change.publicRow.cacheTags,
      })
    }
  }

  return rebuilds
}

function cloneRevisionSnapshot(snapshot: RevisionSnapshot): RevisionSnapshot {
  return {
    parentEntryId: snapshot.parentEntryId ?? null,
    orderRank: snapshot.orderRank ?? null,
    slug: snapshot.slug ?? null,
    shared: { ...(snapshot.shared ?? {}) },
    locales: { ...(snapshot.locales ?? {}) },
  }
}

async function activePublicRevisionSnapshotForEntry(
  ctx: MutationCtx,
  args: {
    entry: Doc<'entries'>
    fallbackPublicRow: Doc<'publicEntries'>
    fallbackRevision: Doc<'entryRevisions'>
  },
): Promise<{ parentRevisionId: Id<'entryRevisions'>; snapshot: RevisionSnapshot }> {
  const publicRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id))
    .collect()
  const activeRows = publicRows.length > 0 ? publicRows : [args.fallbackPublicRow]
  const baseRow =
    activeRows.find((row) => String(row._id) === String(args.fallbackPublicRow._id)) ??
    activeRows[0] ??
    args.fallbackPublicRow
  const baseRevision =
    String(baseRow.revisionId) === String(args.fallbackRevision._id)
      ? args.fallbackRevision
      : await ctx.db.get(baseRow.revisionId)
  if (!baseRevision) {
    throw new Error(
      `Descendant route rebuild rejected: active public revision ${baseRow.revisionId} is missing`,
    )
  }

  const snapshot = cloneRevisionSnapshot(baseRevision.snapshot)
  snapshot.parentEntryId = baseRow.parentEntryId ?? null
  snapshot.orderRank = baseRow.orderKey ?? null
  snapshot.locales = {}

  for (const row of activeRows) {
    const revision =
      String(row.revisionId) === String(args.fallbackRevision._id)
        ? args.fallbackRevision
        : await ctx.db.get(row.revisionId)
    if (!revision) {
      throw new Error(
        `Descendant route rebuild rejected: active public revision ${row.revisionId} is missing`,
      )
    }
    const localeSnapshot = revision.snapshot.locales[row.locale] ?? null
    if (!localeSnapshot) {
      throw new Error(
        `Descendant route rebuild rejected: active public revision ${revision._id} has no ${row.locale} snapshot`,
      )
    }
    snapshot.locales[row.locale] = localeSnapshot
  }

  return { parentRevisionId: baseRow.revisionId, snapshot }
}

export async function appendDescendantRouteRebuildRevisions(
  ctx: MutationCtx,
  args: {
    rebuilds: DescendantProjectionRebuild[]
    appIdentity: string
    now: number
  },
): Promise<Map<string, Id<'entryRevisions'>>> {
  const byEntry = new Map<string, DescendantProjectionRebuild[]>()
  for (const rebuild of args.rebuilds) {
    const key = String(rebuild.entry._id)
    const group = byEntry.get(key) ?? []
    group.push(rebuild)
    byEntry.set(key, group)
  }
  const revisionIdsByEntry = new Map<string, Id<'entryRevisions'>>()

  for (const group of byEntry.values()) {
    const first = group[0]
    const entry = first?.entry
    if (!first || !entry) continue
    const activePublic = await activePublicRevisionSnapshotForEntry(ctx, {
      entry,
      fallbackPublicRow: first.publicRow,
      fallbackRevision: first.revision,
    })
    const baseSnapshot = activePublic.snapshot
    for (const rebuild of group) {
      baseSnapshot.locales[rebuild.locale] = rebuild.localeSnapshot
    }
    const revisionResult = await appendRevisionAndPatchEntry(
      ctx,
      {
        entryId: entry._id,
        collectionId: entry.collectionId,
        parentRevisionId: entry.latestRevisionId ?? activePublic.parentRevisionId,
        kind: 'route_rebuild',
        snapshot: baseSnapshot,
        affectedLocales: [...new Set(group.map((rebuild) => rebuild.locale))].sort(),
        message: 'Updated public route after parent publish',
        appIdentity: args.appIdentity,
        now: args.now,
      },
      {
        status: 'published',
      },
    )
    revisionIdsByEntry.set(String(entry._id), revisionResult.revisionId)
  }
  return revisionIdsByEntry
}

export function descendantRevalidationState(rebuilds: DescendantProjectionRebuild[]) {
  return {
    tags: uniqueContentTags(rebuilds.flatMap((rebuild) => rebuild.cacheTags)),
    paths: uniqueContentTags(
      rebuilds
        .flatMap((rebuild) => [rebuild.oldPath, rebuild.newPath])
        .map((path) => normalizeContentPath(path)),
    ),
  }
}
