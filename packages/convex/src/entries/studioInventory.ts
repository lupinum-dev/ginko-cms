import {
  listEntriesForStudio as listEntriesForStudioArgs,
  listEntrySummaries as listEntrySummariesArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  entrySummaryListResultValidator,
  studioEntryListResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'

import type { Doc } from '../_generated/dataModel.js'
import { canRead } from '../auth/checks.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { throwCmsError } from '../errors.js'
import { callerQuery } from '../functions.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import { readDraftSearchCandidatePage, readStudioTreeCandidatePage } from './studioKeyset.js'
import {
  buildStudioRowsForEntries,
  mapStudioSourceRow,
  type StudioEntryStatus,
} from './studioRows.js'
import {
  attachSummaryAccess,
  buildIndexedEntrySummary,
  summaryMatchesWorkState,
} from './studioSummary.js'
import { draftSearchPublicationHash } from './workflow/draftSearch.js'

const STUDIO_LIST_DEFAULT_LIMIT = 50
// A row can hydrate three locale drafts at the 64 KiB body ceiling. Keeping
// pages to 25 leaves deterministic headroom below Convex's 16 MiB read limit.
const STUDIO_LIST_MAX_LIMIT = 25
const STUDIO_FILTER_SCAN_LIMIT = 1_500

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

async function canonicalEntriesForSearchRows(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  rows: Doc<'draftSearchEntries'>[],
) {
  const loaded = await Promise.all(
    rows.map(async (row) => {
      const [entry, draft] = await Promise.all([
        ctx.db.get(row.entryId),
        ctx.db
          .query('entryLocaleDrafts')
          .withIndex('by_entry_locale', (query) =>
            query.eq('entryId', row.entryId).eq('locale', row.locale),
          )
          .unique(),
      ])
      if (
        !entry ||
        entry.collection !== collection.slug ||
        entry.draftVersion !== row.sourceDraftVersion ||
        entry.sharedVersion !== row.sourceSharedVersion ||
        entry.updatedAt !== row.updatedAt ||
        (draft?.version ?? 0) !== row.sourceLocaleVersion ||
        draftSearchPublicationHash(entry) !== row.sourcePublicationHash
      ) {
        return null
      }
      return { entry, row }
    }),
  )
  return loaded.filter(
    (item): item is { entry: EntryDoc; row: Doc<'draftSearchEntries'> } => item !== null,
  )
}

async function cheaplyMatchesWorkState(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  candidate: { entry: EntryDoc; row: Doc<'draftSearchEntries'> },
  workState: 'all' | 'changed' | 'needs_attention' | 'missing_translation' | undefined,
) {
  if (!workState || workState === 'all' || workState === 'needs_attention') return true
  const rows =
    collection.locales.length === 1
      ? [candidate.row]
      : await ctx.db
          .query('draftSearchEntries')
          .withIndex('by_entry_locale', (query) => query.eq('entryId', candidate.entry._id))
          .collect()
  if (workState === 'missing_translation') {
    return rows.some(
      (row) =>
        collection.locales.includes(row.locale) &&
        row.sourceLocaleVersion === 0 &&
        !candidate.entry.activePublications.some(
          (publication) => publication.locale === row.locale,
        ),
    )
  }
  return rows.some((row) => {
    if (!collection.locales.includes(row.locale) || row.sourceLocaleVersion === 0) return false
    const publication = candidate.entry.activePublications.find(
      (active) => active.locale === row.locale,
    )
    return (
      !publication ||
      publication.sharedVersion !== candidate.entry.sharedVersion ||
      publication.localeVersion !== row.sourceLocaleVersion
    )
  })
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
  let cursor = args.cursor ?? null
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
    continueCursor: isDone ? null : cursor,
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

export const listEntrySummaries = callerQuery.protected({
  id: 'editor:listEntrySummaries',
  args: listEntrySummariesArgs.args,
  guard: canRead,
  returns: entrySummaryListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const collection = await getCollectionOrThrow(ctx, args.collection)
    const limit = Math.max(
      1,
      Math.min(args.paginationOpts.numItems ?? STUDIO_LIST_DEFAULT_LIMIT, STUDIO_LIST_MAX_LIMIT),
    )
    const summaries: Awaited<ReturnType<typeof buildIndexedEntrySummary>>[] = []
    let cursor = args.paginationOpts.cursor
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
          buildIndexedEntrySummary(ctx, entry, row, collection),
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
      continueCursor: isDone ? null : cursor,
    }
  },
})
