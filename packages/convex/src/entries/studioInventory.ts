import {
  listEntriesForStudio as listEntriesForStudioArgs,
  listEntrySummaries as listEntrySummariesArgs,
  resolveRelationEntries as resolveRelationEntriesArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  entrySummaryListResultValidator,
  studioEntryListResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { canRead } from '../auth/checks.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { throwCmsError } from '../errors.js'
import { callerQuery } from '../functions.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { getCmsSettings } from '../lib/locale.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import {
  canonicalEntriesForSearchRows,
  cheaplyMatchesWorkState,
} from './studioInventoryCandidates.js'
import { readDraftSearchCandidatePage, readStudioTreeCandidatePage } from './studioKeyset.js'
import {
  buildStudioRowsForEntries,
  entryTitle,
  mapStudioSourceRow,
  type StudioEntryStatus,
} from './studioRows.js'
import {
  attachSummaryAccess,
  buildIndexedEntrySummary,
  summaryMatchesWorkState,
} from './studioSummary.js'

const STUDIO_LIST_DEFAULT_LIMIT = 50
// A row can hydrate three locale drafts at the 64 KiB body ceiling. Keeping
// pages to 25 leaves deterministic headroom below Convex's 16 MiB read limit.
const STUDIO_LIST_MAX_LIMIT = 25
const STUDIO_FILTER_SCAN_LIMIT = 1_500
const RELATION_RESOLUTION_LIMIT = 50

const relationEntryValidator = v.object({
  _id: v.string(),
  stableId: v.string(),
  title: v.string(),
  slug: v.string(),
})

async function listStudioTreeRows(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  args: {
    locale: string
    parentEntryId: string | null
    cursor?: string | null
    limit: number
  },
) {
  const parentEntryId = args.parentEntryId
    ? ctx.db.normalizeId('entries', args.parentEntryId)
    : null
  if (args.parentEntryId && !parentEntryId) {
    throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found.', {
      parentEntryId: args.parentEntryId,
    })
  }
  if (parentEntryId) {
    const parent = await ctx.db.get(parentEntryId)
    if (!parent || parent.collection !== collection.slug) {
      throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found.', {
        parentEntryId: args.parentEntryId,
      })
    }
  }

  const result = await readStudioTreeCandidatePage(ctx, {
    collection: collection.slug,
    locale: args.locale,
    parentEntryId,
    cursor: args.cursor,
    limit: args.limit,
  })
  return {
    pageRows: await buildStudioRowsForEntries(ctx, collection, result.page, args.locale),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  }
}

async function listIndexedStudioRows(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  args: {
    locale: string
    status?: StudioEntryStatus
    query?: string
    cursor?: string | null
    limit: number
  },
) {
  const pageRows: Awaited<ReturnType<typeof buildStudioRowsForEntries>> = []
  let cursor = args.cursor ?? ''
  let isDone = false
  let scanned = 0

  while (!isDone && pageRows.length < args.limit) {
    const result = await readDraftSearchCandidatePage(ctx, {
      ...args,
      collection: collection.slug,
      cursor,
      limit: args.limit - pageRows.length,
    })
    scanned += result.scannedCount
    if (
      scanned > STUDIO_FILTER_SCAN_LIMIT ||
      (scanned === STUDIO_FILTER_SCAN_LIMIT && !result.isDone)
    ) {
      throwCmsError(
        'SUPPORTED_SCALE_EXCEEDED',
        'Studio filtering exceeds the supported 1,500 entries for one collection and locale.',
        { collection: collection.slug, locale: args.locale, limit: STUDIO_FILTER_SCAN_LIMIT },
      )
    }
    const entries = await canonicalEntriesForSearchRows(ctx, collection, result.page)
    pageRows.push(
      ...(await buildStudioRowsForEntries(
        ctx,
        collection,
        entries.map((item) => item.entry),
        args.locale,
      )),
    )
    cursor = result.continueCursor
    isDone = result.isDone
  }

  return {
    pageRows,
    isDone,
    continueCursor: isDone ? '' : cursor,
  }
}

export const listEntriesForStudio = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'editor:listEntriesForStudio',
  args: listEntriesForStudioArgs.args,
  guard: canRead,
  returns: studioEntryListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const collection = await getCollectionOrThrow(ctx, args.collection)
    const limit = Math.max(
      1,
      Math.min(args.paginationOpts.numItems ?? STUDIO_LIST_DEFAULT_LIMIT, STUDIO_LIST_MAX_LIMIT),
    )
    const cursor = args.paginationOpts.cursor

    if (collection.type !== 'tree' || args.query?.trim() || args.status) {
      const result = await listIndexedStudioRows(ctx, collection, {
        locale: args.locale,
        status: args.status,
        query: args.query,
        cursor,
        limit,
      })
      return {
        page: attachEntryRecordAccess(
          appIdentity,
          result.pageRows.map((row) => mapStudioSourceRow(row, collection)),
        ),
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    }

    if (collection.type === 'tree') {
      const result = await listStudioTreeRows(ctx, collection, {
        locale: args.locale,
        parentEntryId: args.parentEntryId,
        cursor,
        limit,
      })
      return {
        page: attachEntryRecordAccess(
          appIdentity,
          result.pageRows.map((row) => mapStudioSourceRow(row, collection)),
        ),
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    }

    throwCmsError('INVALID_COLLECTION_TYPE', 'Unsupported Studio collection type.')
  },
})

export const resolveRelationEntries = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'editor:resolveRelationEntries',
  args: resolveRelationEntriesArgs.args,
  guard: canRead,
  returns: v.array(relationEntryValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const stableIds = [...new Set(args.stableIds)]
    if (stableIds.length > RELATION_RESOLUTION_LIMIT) {
      throwCmsError(
        'INVALID_RELATION_VALUE',
        `A relation field can resolve at most ${RELATION_RESOLUTION_LIMIT} selected entries.`,
      )
    }

    const collection = await getCollectionOrThrow(ctx, args.collection)
    const entries = (
      await Promise.all(
        stableIds.map((stableId) =>
          ctx.db
            .query('entries')
            .withIndex('by_collection_stableId', (query) =>
              query.eq('collection', collection.slug).eq('stableId', stableId),
            )
            .unique(),
        ),
      )
    ).filter((entry): entry is EntryDoc => entry !== null)
    const rows = await buildStudioRowsForEntries(ctx, collection, entries, args.locale)
    const rowByStableId = new Map(rows.map((row) => [row.stableId, row]))

    return stableIds.flatMap((stableId) => {
      const row = rowByStableId.get(stableId)
      if (!row) return []
      return [
        {
          _id: String(row.entryId),
          stableId,
          title: entryTitle(row),
          slug: row.baseSlug,
        },
      ]
    })
  },
})

export const listEntrySummaries = callerQuery.protected({
  id: 'editor:listEntrySummaries',
  args: listEntrySummariesArgs.args,
  guard: canRead,
  returns: entrySummaryListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const collection = await getCollectionOrThrow(ctx, args.collection)
    const settings = await getCmsSettings(ctx)
    const limit = Math.max(
      1,
      Math.min(args.paginationOpts.numItems ?? STUDIO_LIST_DEFAULT_LIMIT, STUDIO_LIST_MAX_LIMIT),
    )
    const summaries: Awaited<ReturnType<typeof buildIndexedEntrySummary>>[] = []
    let cursor = args.paginationOpts.cursor ?? ''
    let isDone = false
    let scanned = 0
    while (!isDone && summaries.length < limit) {
      const result = await readDraftSearchCandidatePage(ctx, {
        collection: collection.slug,
        locale: args.locale,
        status: args.status,
        workState: args.workState,
        query: args.query,
        cursor,
        limit: limit - summaries.length,
      })
      scanned += result.scannedCount
      if (
        scanned > STUDIO_FILTER_SCAN_LIMIT ||
        (scanned === STUDIO_FILTER_SCAN_LIMIT && !result.isDone)
      ) {
        throwCmsError(
          'SUPPORTED_SCALE_EXCEEDED',
          'Studio filtering exceeds the supported 1,500 entries for one collection and locale.',
          { collection: collection.slug, locale: args.locale, limit: STUDIO_FILTER_SCAN_LIMIT },
        )
      }
      const entries = await canonicalEntriesForSearchRows(ctx, collection, result.page)
      const potentiallyMatching = (
        await Promise.all(
          entries.map(async (candidate) => ({
            candidate,
            matches: await cheaplyMatchesWorkState(ctx, collection, candidate, args.workState),
          })),
        )
      )
        .filter(({ matches }) => matches)
        .map(({ candidate }) => candidate)
      const candidates = await Promise.all(
        potentiallyMatching.map(({ entry, row }) =>
          buildIndexedEntrySummary(ctx, entry, row, collection, { appIdentity, settings }),
        ),
      )
      summaries.push(
        ...candidates.filter((summary) => summaryMatchesWorkState(summary, args.workState)),
      )
      cursor = result.continueCursor
      isDone = result.isDone
    }
    return {
      page: attachSummaryAccess(appIdentity, summaries),
      isDone,
      continueCursor: isDone ? '' : cursor,
    }
  },
})
