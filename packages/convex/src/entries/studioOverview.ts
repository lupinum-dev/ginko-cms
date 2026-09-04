import {
  getStudioOverview as getStudioOverviewArgs,
  listStudioWorkQueue as listStudioWorkQueueArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  studioOverviewValidator,
  studioWorkQueueResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'

import { canRead } from '../auth/checks.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { throwCmsError } from '../errors.js'
import { callerQuery } from '../functions.js'
import { isRouteBackedCollection, listInstalledCollections } from '../lib/collections.js'
import { toStringId } from '../lib/ids.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import { buildSourceStudioRow } from './studioRows.js'
import { attachSummaryAccess, buildEntrySummary, summaryQueueKinds } from './studioSummary.js'
import { publicPathForEntry } from './workflow/publicTree.js'

const OVERVIEW_RECENT_LIMIT = 8
const WORK_QUEUE_DEFAULT_LIMIT = 12
const WORK_QUEUE_MAX_LIMIT = 50

type WorkQueueCursor = {
  v: 1
  kind: 'studioWorkQueue'
  locale: string
  updatedAt: number
  creationTime: number
}

function parseWorkQueueCursor(value: string | null | undefined, locale: string) {
  if (!value) return null
  let parsed: Partial<WorkQueueCursor>
  try {
    parsed = JSON.parse(value) as Partial<WorkQueueCursor>
  } catch {
    throwCmsError('INVALID_CURSOR', 'Studio work queue cursor is invalid.', { cursor: value })
  }
  if (
    parsed.v !== 1 ||
    parsed.kind !== 'studioWorkQueue' ||
    parsed.locale !== locale ||
    typeof parsed.updatedAt !== 'number' ||
    !Number.isFinite(parsed.updatedAt) ||
    typeof parsed.creationTime !== 'number' ||
    !Number.isFinite(parsed.creationTime)
  ) {
    throwCmsError('INVALID_CURSOR', 'Studio work queue cursor is invalid.', { cursor: value })
  }
  return parsed as WorkQueueCursor
}

async function readWorkQueuePage(
  ctx: HandlerQueryCtx,
  cursor: WorkQueueCursor | null,
  take: number,
) {
  if (!cursor) {
    return await ctx.db
      .query('entries')
      .withIndex('by_lifecycle_updatedAt', (query) => query.eq('lifecycle', 'active'))
      .order('desc')
      .take(take)
  }
  const sameTimestamp = await ctx.db
    .query('entries')
    .withIndex('by_lifecycle_updatedAt', (query) =>
      query
        .eq('lifecycle', 'active')
        .eq('updatedAt', cursor.updatedAt)
        .lt('_creationTime', cursor.creationTime),
    )
    .order('desc')
    .take(take)
  if (sameTimestamp.length >= take) return sameTimestamp
  const older = await ctx.db
    .query('entries')
    .withIndex('by_lifecycle_updatedAt', (query) =>
      query.eq('lifecycle', 'active').lt('updatedAt', cursor.updatedAt),
    )
    .order('desc')
    .take(take - sameTimestamp.length)
  return [...sameTimestamp, ...older]
}

async function recentPublishedForCollection(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  locale: string,
) {
  if (!isRouteBackedCollection(collection) || !collection.locales.includes(locale)) return []
  const rows = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_lastPublishedAt', (query) =>
      query.eq('collection', collection.slug).eq('locale', locale),
    )
    .order('desc')
    .take(OVERVIEW_RECENT_LIMIT)
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const path = await publicPathForEntry(ctx, row, {
        pathPrefix: pathPrefixForLocale(collection, locale),
        rootSlug: rootSlugForLocale(collection, locale),
      })
      if (!path) return null
      return {
        entryId: toStringId(row.entryId),
        collection: collection.slug,
        collectionLabel: collection.label,
        title: row.title,
        path,
        status: 'published' as const,
        publicState: 'public' as const,
        updatedAt: row.lastPublishedAt,
        publishedAt: row.lastPublishedAt,
        blockingIssueCount: 0,
        missingTranslationLocales: [],
        nextAction: 'Verify public output',
      }
    }),
  )
  return mapped.filter((row): row is NonNullable<typeof row> => row !== null)
}

async function recentRevalidationJobs(ctx: HandlerQueryCtx) {
  const statuses = ['dead', 'pending', 'delivering'] as const
  const rows = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('outboxEvents')
          .withIndex('by_status_updatedAt', (query) => query.eq('status', status))
          .order('desc')
          .take(OVERVIEW_RECENT_LIMIT),
      ),
    )
  )
    .flat()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, OVERVIEW_RECENT_LIMIT)
  return rows.map((job) => ({
    id: toStringId(job._id),
    status: job.status === 'dead' ? ('failed' as const) : job.status,
    paths: job.paths,
    attempts: job.attempts,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }))
}

export const getStudioOverview = callerQuery.protected({
  id: 'editor:getStudioOverview',
  args: getStudioOverviewArgs.args,
  guard: canRead,
  returns: studioOverviewValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const collections = await listInstalledCollections(ctx)
    const recentPublished = (
      await Promise.all(
        collections.map((collection) => recentPublishedForCollection(ctx, collection, args.locale)),
      )
    )
      .flat()
      .sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0))
      .slice(0, OVERVIEW_RECENT_LIMIT)
    return {
      recentPublished: attachEntryRecordAccess(appIdentity, recentPublished),
      revalidationJobs: await recentRevalidationJobs(ctx),
    }
  },
})

export const listStudioWorkQueue = callerQuery.protected({
  id: 'editor:listStudioWorkQueue',
  args: listStudioWorkQueueArgs.args,
  guard: canRead,
  returns: studioWorkQueueResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const limit = Math.max(
      1,
      Math.min(args.paginationOpts.numItems ?? WORK_QUEUE_DEFAULT_LIMIT, WORK_QUEUE_MAX_LIMIT),
    )
    const cursor = parseWorkQueueCursor(args.paginationOpts.cursor, args.locale)
    const rows = await readWorkQueuePage(ctx, cursor, limit + 1)
    const candidates = rows.slice(0, limit)
    const last = candidates.at(-1)
    const isDone = rows.length <= limit
    const collections = new Map(
      (await listInstalledCollections(ctx)).map((collection) => [collection.slug, collection]),
    )
    const items: Array<{
      entry: Awaited<ReturnType<typeof buildEntrySummary>>
      queueKinds: Array<'changed' | 'needs_attention' | 'missing_translation'>
    }> = []
    for (const entry of candidates) {
      const collection = collections.get(entry.collection)
      if (!collection) continue
      const row = await buildSourceStudioRow(ctx, collection, entry, args.locale)
      if (!row) continue
      const summary = await buildEntrySummary(ctx, row, collection)
      const queueKinds = summaryQueueKinds(summary)
      if (queueKinds.length) items.push({ entry: summary, queueKinds })
    }
    const entriesWithAccess = attachSummaryAccess(
      appIdentity,
      items.map((item) => item.entry),
    )
    return {
      page: items.map((item, index) => ({
        entry: entriesWithAccess[index]!,
        queueKinds: item.queueKinds,
      })),
      isDone,
      continueCursor:
        isDone || !last
          ? ''
          : JSON.stringify({
              v: 1,
              kind: 'studioWorkQueue',
              locale: args.locale,
              updatedAt: last.updatedAt,
              creationTime: last._creationTime,
            } satisfies WorkQueueCursor),
    }
  },
})
