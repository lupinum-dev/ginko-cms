import {
  getDraftVsPublishedDiff as getDraftVsPublishedDiffArgs,
  getEntry as getEntryArgs,
  getEntryActivity as getEntryActivityArgs,
  getStudioOverview as getStudioOverviewArgs,
  getVersionDiff as getVersionDiffArgs,
  getVersionSnapshot as getVersionSnapshotArgs,
  listActivity as listActivityArgs,
  listEntries as listEntriesArgs,
  listEntriesForStudio as listEntriesForStudioArgs,
  listEntrySummaries as listEntrySummariesArgs,
  listVersions as listVersionsArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  activityListResultValidator,
  draftVsPublishedDiffValidator,
  entryActivityItemValidator,
  entryListItemValidator,
  entrySummaryValidator,
  studioEntryListResultValidator,
  studioEntryValidator,
  studioOverviewValidator,
  versionDiffValidator,
  versionListItemValidator,
  versionSnapshotPreviewValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import { canRead } from '../auth/checks.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { throwCmsError } from '../errors.js'
import { callerQuery } from '../functions.js'
import { getCollectionOrThrow, isRouteBackedCollection } from '../lib/collections.js'
import { isEqualJsonValue } from '../lib/data.js'
import { toOptionalStringId, toStringId } from '../lib/ids.js'
import { getLocaleChain } from '../lib/locale.js'
import { compareOrderRank } from '../lib/ordering.js'
import { buildSearchText } from '../lib/search.js'
import { orderTreeRows } from '../lib/treeOrder.js'
import type { ActivityDoc, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc, EntryRevisionDoc } from './context.js'
import {
  buildStudioEntry,
  getCollectionForEntry,
  getEntryOrThrow,
  readStudioDraftView,
} from './context.js'
import { createSnapshotFromState, flattenRevisionSnapshot, flattenSnapshot } from './versioning.js'
import { readDraftRows, type EntryDraftDoc } from './workflow/drafts.js'
import { entrySnapshotPath, publicPathForLocaleSnapshot } from './workflow/path.js'

/** Default page size for the studio entry list. */
const STUDIO_LIST_DEFAULT_LIMIT = 50
/** Maximum page size for the studio entry list. */
const STUDIO_LIST_MAX_LIMIT = 100
/** Bounded scan cap for filtered Studio entry lists. */
const STUDIO_LIST_SCAN_MAX = 500
/** Multiplier for finding a full page through local text filters. */
const STUDIO_LIST_SCAN_MULTIPLIER = 6
/** Maximum number of rows loaded to derive a complete Studio tree. */
const STUDIO_TREE_LIST_MAX = 1000
/** Default page size for the activity list. */
const ACTIVITY_DEFAULT_LIMIT = 20
/** Maximum page size for the activity list. */
const ACTIVITY_MAX_LIMIT = 50
const STUDIO_OVERVIEW_LIMIT = 8
const ORDER_KEY_TIME_PAD = 16
const ORDER_KEY_TIME_MAX = 9_999_999_999_999

function activityAppIdentityId(row: ActivityDoc): string {
  return row.appIdentityId ?? row.actorId ?? 'unknown'
}

function displayActivitySummary(row: Pick<ActivityDoc, 'kind' | 'summary'>): string {
  if (row.kind.startsWith('member.')) {
    return row.summary.replace(/"[^"]+"/g, '"user or connection"')
  }
  if (row.kind.startsWith('mcpCredentialSettings.')) {
    return row.summary
      .replace(/MCP credential settings/g, 'AI agent connection')
      .replace(/"[^"]+"/g, '"user or connection"')
  }
  return row.summary
}

export async function previewDestructiveEntryOperation(ctx: HandlerQueryCtx, entryId: string) {
  const entry = await getEntryOrThrow(ctx, entryId)
  const collection = await getCollectionForEntry(ctx, entry)
  const draftView = await readStudioDraftView(ctx, entry, collection)
  const primaryLocale = draftView.locales[0]
  const primaryTitle =
    primaryLocale?.data && typeof primaryLocale.data.title === 'string'
      ? primaryLocale.data.title
      : null
  const publicRoutes = await ctx.db
    .query('publicRoutes')
    .filter((q) => q.eq(q.field('entryId'), entry._id))
    .collect()

  return {
    entryId: toStringId(entry._id),
    baseSlug: entry.baseSlug,
    displayLabel: primaryTitle ?? primaryLocale?.draftSlug ?? draftView.baseSlug ?? entry.baseSlug,
    status: entry.status,
    draftVersion: entry.draftVersion,
    dirtyLocales: entry.dirtyLocales,
    publishedLocales: publicRoutes.map((route) => route.locale).sort(),
    publicRoutes: publicRoutes
      .map((route) => ({
        locale: route.locale,
        path: route.path,
        href: route.href,
      }))
      .sort((left, right) =>
        `${left.locale}:${left.path}`.localeCompare(`${right.locale}:${right.path}`),
      ),
  }
}

type StudioEntryRowDoc = {
  entryId: Id<'entries'>
  collectionId: Id<'collections'>
  locale: string
  baseSlug: string
  stableId: string | null
  status: 'draft' | 'published' | 'archived'
  dirtyLocales: string[]
  createdAt: number
  updatedAt: number
  publishedAt: number | null
  parentEntryId?: Id<'entries'> | null
  orderRank: string
  orderKey: string
  nodeKind: 'page' | 'folder' | 'group' | 'section'
  path: string
  data: Record<string, unknown>
  localeSummaries: Array<{
    locale: string
    draftPath: string
    publishedPath: string | null
    published: boolean
    updatedAt: number
  }>
  queryText: string
}

function buildStudioOrderKey(entry: Pick<EntryDoc, '_id' | 'orderRank' | 'updatedAt'>) {
  const orderRank = entry.orderRank ?? ''
  const reverseUpdatedAt = String(ORDER_KEY_TIME_MAX - entry.updatedAt).padStart(
    ORDER_KEY_TIME_PAD,
    '0',
  )
  return `${orderRank}\u0000${reverseUpdatedAt}\u0000${String(entry._id)}`
}

function selectStudioLocaleCode(locales: string[], fallbackChain: string[]) {
  for (const localeCode of fallbackChain) {
    if (locales.includes(localeCode)) return localeCode
  }
  return [...locales].sort()[0] ?? null
}

function overviewDraftSlug(args: {
  entry: EntryDoc
  sharedRow: EntryDraftDoc | null
  localeRow: EntryDraftDoc | null
}) {
  return args.localeRow?.localeSlug ?? args.sharedRow?.slug ?? args.entry.baseSlug
}

async function resolveOverviewAncestorSlugs(
  ctx: HandlerQueryCtx,
  args: { entry: EntryDoc; locale: string },
) {
  const slugs: string[] = []
  let parentEntryId = args.entry.parentEntryId ?? null
  while (parentEntryId) {
    const parent = await ctx.db.get(parentEntryId)
    if (!parent) break
    const parentDraftRows = await readDraftRows(ctx, parent._id)
    const parentLocaleRow = parentDraftRows.byLocale[args.locale] ?? null
    slugs.unshift(
      overviewDraftSlug({
        entry: parent,
        sharedRow: parentDraftRows.shared,
        localeRow: parentLocaleRow,
      }),
    )
    parentEntryId = parent.parentEntryId ?? null
  }
  return slugs
}

async function computeOverviewDraftPath(
  ctx: HandlerQueryCtx,
  args: {
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    entry: EntryDoc
    slug: string
    locale: string
  },
) {
  const ancestorSlugs = await resolveOverviewAncestorSlugs(ctx, {
    entry: args.entry,
    locale: args.locale,
  })
  const localePath = entrySnapshotPath(args.collection, {
    slug: args.slug,
    stableId: args.entry.stableId ?? null,
    ancestorSlugs,
  })
  return publicPathForLocaleSnapshot(args.collection, localePath, args.locale)
}

async function buildSourceStudioRow(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  entry: EntryDoc,
  requestedLocale: string,
): Promise<StudioEntryRowDoc | null> {
  const [draftRows, publicRoutes] = await Promise.all([
    readDraftRows(ctx, entry._id),
    ctx.db
      .query('publicRoutes')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
      .collect(),
  ])
  const routeByLocale = new Map(publicRoutes.map((route) => [route.locale, route]))
  const locales = Array.from(
    new Set([...collection.locales, ...Object.keys(draftRows.byLocale), ...routeByLocale.keys()]),
  )
  const { chain } = await getLocaleChain(ctx, requestedLocale)
  const preferredLocale = selectStudioLocaleCode(locales, chain)
  if (!preferredLocale) return null
  const shared = (draftRows.shared?.shared ?? {}) as JsonMap
  const preferredLocaleRow = draftRows.byLocale[preferredLocale] ?? null
  const preferredValues = (preferredLocaleRow?.values ?? {}) as JsonMap
  const preferredData = materializeFieldData(collection.fields, shared, preferredValues)
  const preferredSlug = overviewDraftSlug({
    entry,
    sharedRow: draftRows.shared,
    localeRow: preferredLocaleRow,
  })
  const preferredPath = await computeOverviewDraftPath(ctx, {
    collection,
    entry,
    slug: preferredSlug,
    locale: preferredLocale,
  })
  const localeSummaries = await Promise.all(
    locales.map(async (locale) => {
      const localeRow = draftRows.byLocale[locale] ?? null
      const slug = overviewDraftSlug({
        entry,
        sharedRow: draftRows.shared,
        localeRow,
      })
      const publicRoute = routeByLocale.get(locale) ?? null
      return {
        locale,
        draftPath: await computeOverviewDraftPath(ctx, {
          collection,
          entry,
          slug,
          locale,
        }),
        publishedPath: publicRoute?.path ?? null,
        published: !!publicRoute,
        updatedAt: localeRow?.updatedAt ?? entry.updatedAt,
      }
    }),
  )
  return {
    entryId: entry._id,
    collectionId: collection._id,
    locale: preferredLocale,
    baseSlug: preferredSlug,
    stableId: entry.stableId ?? null,
    status: entry.status,
    dirtyLocales: entry.dirtyLocales ?? [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    publishedAt: entry.publishedAt ?? null,
    parentEntryId: draftRows.shared?.parentEntryId ?? entry.parentEntryId ?? null,
    orderRank: draftRows.shared?.orderRank ?? entry.orderRank ?? '',
    orderKey: buildStudioOrderKey(entry),
    nodeKind: entry.nodeKind ?? 'page',
    path: preferredPath,
    data: preferredData,
    localeSummaries: localeSummaries.sort((left, right) => left.locale.localeCompare(right.locale)),
    queryText: buildSearchText({ values: preferredData, fields: collection.fields }) ?? '',
  }
}

async function listSourceStudioRows(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  requestedLocale: string,
) {
  const entries = (
    await Promise.all(
      (['draft', 'published', 'archived'] as const).map((status) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_status', (q) =>
            q.eq('collectionId', collection._id).eq('status', status),
          )
          .collect(),
      ),
    )
  ).flat()
  const rows = await Promise.all(
    entries.map((entry) => buildSourceStudioRow(ctx, collection, entry, requestedLocale)),
  )
  return rows
    .filter((row): row is StudioEntryRowDoc => row !== null)
    .sort((left, right) => right.orderKey.localeCompare(left.orderKey))
}

function studioListStatuses(status?: EntryDoc['status']) {
  return status ? [status] : (['draft', 'published'] as const)
}

async function queryStudioEntryCandidates(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  status: EntryDoc['status'] | undefined,
  scanLimit: number,
) {
  const entries = (
    await Promise.all(
      studioListStatuses(status).map((entryStatus) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_status', (q) =>
            q.eq('collectionId', collection._id).eq('status', entryStatus),
          )
          .order('desc')
          .take(scanLimit),
      ),
    )
  ).flat()

  return entries.sort((left, right) =>
    buildStudioOrderKey(right).localeCompare(buildStudioOrderKey(left)),
  )
}

async function buildStudioRowsForEntries(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  entries: EntryDoc[],
  requestedLocale: string,
) {
  const rows = await Promise.all(
    entries.map((entry) => buildSourceStudioRow(ctx, collection, entry, requestedLocale)),
  )
  return rows.filter((row): row is StudioEntryRowDoc => row !== null)
}

function mapStudioSourceRow(
  row: StudioEntryRowDoc,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
) {
  return {
    _id: toStringId(row.entryId),
    collection: collection.slug,
    locale: row.locale,
    title: entryTitle(row),
    baseSlug: row.baseSlug,
    stableId: row.stableId,
    status: row.status,
    dirtyLocales: row.dirtyLocales,
    path: row.path,
    data: row.data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    parentEntryId: toOptionalStringId(row.parentEntryId),
    orderRank: row.orderRank,
    nodeKind: row.nodeKind,
    localeSummaries: row.localeSummaries,
  }
}

function mapEntryListSourceRow(
  row: StudioEntryRowDoc,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
) {
  return {
    _id: toStringId(row.entryId),
    collection: collection.slug,
    slug: row.baseSlug,
    stableId: row.stableId,
    path: row.path,
    title: entryTitle(row),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    parentEntryId: toOptionalStringId(row.parentEntryId),
    order: row.orderRank,
    orderRank: row.orderRank,
    nodeKind: row.nodeKind,
    data: row.data,
  }
}

function entryTitle(row: Pick<StudioEntryRowDoc, 'baseSlug' | 'data'>): string {
  const candidates = [row.data.title, row.data.name, row.data.label, row.data.heading]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return row.baseSlug
}

function localeReadiness(row: Pick<StudioEntryRowDoc, 'dirtyLocales' | 'localeSummaries'>) {
  const summaries = row.localeSummaries.map((locale) => ({
    locale: locale.locale,
    draftPath: locale.draftPath,
    publishedPath: locale.publishedPath,
    published: locale.published,
    changed: row.dirtyLocales.includes(locale.locale),
    state: locale.published
      ? row.dirtyLocales.includes(locale.locale)
        ? ('changed' as const)
        : ('public' as const)
      : ('draft_only' as const),
  }))
  return summaries
}

function entryWorkState(args: {
  row: StudioEntryRowDoc
  routeBacked: boolean
  expectedLocales: string[]
}) {
  if (args.row.status === 'archived') {
    return {
      publicState: 'data_only' as const,
      draftChangedSincePublish: false,
      blockingIssueCount: 0,
      missingTranslationLocales: [],
      locales: localeReadiness(args.row),
      nextAction: 'Archived',
    }
  }
  const locales = localeReadiness(args.row)
  const existingLocales = new Set(locales.map((l) => l.locale))
  const missingTranslationLocales = args.expectedLocales.filter(
    (locale) => !existingLocales.has(locale),
  )
  const draftChangedSincePublish =
    args.row.status !== 'published' || args.row.dirtyLocales.length > 0
  // Full publish blockers belong to the diagnostics/publish-preview path.
  // This overview only reports cheap, conservative readiness gaps that the
  // Studio list read model can prove without running the full validator.
  const blockingIssueCount = args.routeBacked
    ? locales.filter((locale) => locale.state === 'draft_only' && !locale.draftPath).length
    : 0
  const publicState = !args.routeBacked
    ? ('data_only' as const)
    : blockingIssueCount > 0
      ? ('needs_attention' as const)
      : draftChangedSincePublish
        ? ('draft_only' as const)
        : args.row.status === 'published'
          ? ('public' as const)
          : ('draft_only' as const)

  return {
    publicState,
    draftChangedSincePublish,
    blockingIssueCount,
    missingTranslationLocales,
    locales,
    nextAction:
      blockingIssueCount > 0
        ? 'Resolve readiness issues'
        : missingTranslationLocales.length > 0
          ? 'Complete translations'
          : draftChangedSincePublish
            ? 'Preview website changes'
            : 'Verify public output',
  }
}

function mapEntrySummary(args: {
  row: StudioEntryRowDoc
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
}) {
  const routeBacked = isRouteBackedCollection(args.collection)
  const workState = entryWorkState({
    row: args.row,
    routeBacked,
    expectedLocales: args.collection.locales,
  })

  return {
    _id: toStringId(args.row.entryId),
    entryId: toStringId(args.row.entryId),
    collection: args.collection.slug,
    collectionLabel: args.collection.label,
    title: entryTitle(args.row),
    slug: args.row.baseSlug,
    path: args.row.path,
    status: args.row.status,
    routeMode: routeBacked ? 'route' : 'none',
    nodeKind: args.row.nodeKind,
    parentEntryId: toOptionalStringId(args.row.parentEntryId),
    updatedAt: args.row.updatedAt,
    publishedAt: args.row.publishedAt,
    publicState: workState.publicState,
    draftChangedSincePublish: workState.draftChangedSincePublish,
    blockingIssueCount: workState.blockingIssueCount,
    missingTranslationLocales: workState.missingTranslationLocales,
    localeReadiness: workState.locales,
    nextAction: workState.nextAction,
  }
}

function newestRows<T extends { updatedAt: number }>(rows: T[], limit = STUDIO_OVERVIEW_LIMIT) {
  return [...rows].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, limit)
}

function isStudioListCursor(cursor: string): boolean {
  const parts = cursor.split('\0')
  return parts.length === 3 && /^\d{16}$/.test(parts[1] ?? '') && Boolean(parts[2])
}

function treeCursorOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0
  const match = /^tree:(\d+)$/.exec(cursor)
  if (!match) {
    throwCmsError('INVALID_CURSOR', 'Invalid tree pagination cursor.', { cursor })
  }
  return Number(match[1])
}

function treeListStatuses(status?: EntryDoc['status']) {
  return status ? [status] : (['draft', 'published'] as const)
}

async function queryStudioTreeEntryCandidates(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  status: EntryDoc['status'] | undefined,
) {
  const entries = (
    await Promise.all(
      treeListStatuses(status).map((entryStatus) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_status', (q) =>
            q.eq('collectionId', collection._id).eq('status', entryStatus),
          )
          .take(STUDIO_TREE_LIST_MAX + 1),
      ),
    )
  ).flat()

  if (entries.length > STUDIO_TREE_LIST_MAX) {
    throwCmsError(
      'STUDIO_TREE_TOO_LARGE',
      `Studio tree for "${collection.slug}" exceeds ${STUDIO_TREE_LIST_MAX} entries. Filter the collection or split the tree before browsing hierarchy.`,
      { collection: collection.slug, maxRows: STUDIO_TREE_LIST_MAX },
    )
  }

  return entries
}

async function listStudioTreeRows(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  args: { locale: string; status?: EntryDoc['status']; cursor?: string | null; limit: number },
) {
  const offset = treeCursorOffset(args.cursor)
  const candidates = await queryStudioTreeEntryCandidates(ctx, collection, args.status)
  const rows = await buildStudioRowsForEntries(ctx, collection, candidates, args.locale)
  const ordered = orderTreeRows(rows, {
    getId: (row) => String(row.entryId),
    getParentId: (row) => (row.parentEntryId ? String(row.parentEntryId) : null),
    compareSiblings: (left, right) => {
      const rank = compareOrderRank(left.orderRank ?? null, right.orderRank ?? null)
      if (rank !== 0) return rank
      return left.path.localeCompare(right.path)
    },
  }).map(({ row }) => row)
  const pageRows = ordered.slice(offset, offset + args.limit)
  const nextOffset = offset + pageRows.length

  return {
    pageRows,
    hasNextPage: nextOffset < ordered.length,
    continueCursor: nextOffset < ordered.length ? `tree:${nextOffset}` : null,
  }
}

function mapVersionDisplayAction(action: string) {
  switch (action) {
    case 'archive':
      return 'archived' as const
    case 'checkpoint':
      return 'checkpoint' as const
    case 'rollback':
      return 'restoredPublished' as const
    case 'unpublish':
      return 'unpublished' as const
    case 'publish':
    default:
      return 'published' as const
  }
}

function revisionDisplayNumber(revisions: EntryRevisionDoc[], revisionId: Id<'entryRevisions'>) {
  const ascending = [...revisions].sort((left, right) => left.createdAt - right.createdAt)
  const index = ascending.findIndex((revision) => revision._id === revisionId)
  return index === -1 ? ascending.length : index + 1
}

export const listEntries = callerQuery.protected({
  id: 'editor:listEntries',
  args: listEntriesArgs.args,
  guard: canRead,
  returns: v.array(entryListItemValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const collection = await getCollectionOrThrow(ctx, args.collection)
    const rows = await listSourceStudioRows(ctx, collection, args.locale)

    return rows.map((row) => mapEntryListSourceRow(row, collection))
  },
})

export const listEntriesForStudio = callerQuery.protected({
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
    const q = args.query?.trim().toLowerCase() ?? ''
    const cursor = args.paginationOpts.cursor

    if (collection.type === 'tree' && !q) {
      const result = await listStudioTreeRows(ctx, collection, {
        locale: args.locale,
        status: args.status,
        cursor,
        limit,
      })
      return {
        page: attachEntryRecordAccess(
          appIdentity,
          result.pageRows.map((row) => mapStudioSourceRow(row, collection)),
        ),
        isDone: !result.hasNextPage,
        continueCursor: result.continueCursor,
      }
    }

    if (cursor && !isStudioListCursor(cursor)) {
      throwCmsError('INVALID_CURSOR', 'Invalid pagination cursor.')
    }

    const scanLimit = Math.min(
      STUDIO_LIST_SCAN_MAX,
      Math.max(limit + 1, limit * STUDIO_LIST_SCAN_MULTIPLIER),
    )
    const candidates = (
      await queryStudioEntryCandidates(ctx, collection, args.status, scanLimit)
    ).filter((entry) => !cursor || buildStudioOrderKey(entry) < cursor)

    let pageRows: StudioEntryRowDoc[]
    let hasNextPage: boolean
    if (!q) {
      const pageEntries = candidates.slice(0, limit + 1)
      const rows = await buildStudioRowsForEntries(ctx, collection, pageEntries, args.locale)
      pageRows = rows.slice(0, limit)
      hasNextPage = candidates.length > limit
    } else {
      const rows = (
        await buildStudioRowsForEntries(ctx, collection, candidates, args.locale)
      ).filter((row) =>
        [entryTitle(row), row.baseSlug, row.path, row.queryText].some((value) =>
          value.toLowerCase().includes(q),
        ),
      )
      pageRows = rows.slice(0, limit)
      hasNextPage = rows.length > limit
    }

    return {
      page: attachEntryRecordAccess(
        appIdentity,
        pageRows.map((row) => mapStudioSourceRow(row, collection)),
      ),
      isDone: !hasNextPage,
      continueCursor: hasNextPage ? (pageRows.at(-1)?.orderKey ?? null) : null,
    }
  },
})

export const listEntrySummaries = callerQuery.protected({
  id: 'editor:listEntrySummaries',
  args: listEntrySummariesArgs.args,
  guard: canRead,
  returns: v.array(entrySummaryValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const collection = await getCollectionOrThrow(ctx, args.collection)
    const limit = Math.max(1, Math.min(args.limit ?? STUDIO_LIST_DEFAULT_LIMIT, 150))
    const rows = await listSourceStudioRows(ctx, collection, args.locale)
    const query = args.query?.trim().toLowerCase() ?? ''

    const filtered = rows
      .map((row) => mapEntrySummary({ row, collection }))
      .filter((row) => (args.status ? row.status === args.status : row.status !== 'archived'))
      .filter((row) => {
        if (!query) return true
        return [row.title, row.slug, row.path].some((value) => value.toLowerCase().includes(query))
      })
      .filter((row) => {
        if (!args.workState || args.workState === 'all') return true
        if (args.workState === 'changed') return row.draftChangedSincePublish
        if (args.workState === 'needs_attention') return row.blockingIssueCount > 0
        return row.missingTranslationLocales.length > 0
      })
      .slice(0, limit)

    return attachEntryRecordAccess(appIdentity, filtered)
  },
})

export const getStudioOverview = callerQuery.protected({
  id: 'editor:getStudioOverview',
  args: getStudioOverviewArgs.args,
  guard: canRead,
  returns: studioOverviewValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const appIdentity = await ctx.appIdentity()
    const collections = await ctx.db.query('collections').collect()
    const summaries = []
    const allEntrySummaries = []
    const publishedRows = []

    for (const collectionDoc of collections) {
      const collection = await getCollectionOrThrow(ctx, collectionDoc.slug)
      const rows = await listSourceStudioRows(ctx, collection, args.locale)
      const routeBacked = isRouteBackedCollection(collection)
      const mapped = rows.map((row) => mapEntrySummary({ row, collection }))
      allEntrySummaries.push(...mapped)
      const publicRows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_orderKey', (q) =>
          q.eq('collectionId', collection._id).eq('locale', args.locale),
        )
        .collect()
      publishedRows.push(
        ...publicRows.map((row) => ({
          entryId: toStringId(row.entryId),
          collection: collection.slug,
          collectionLabel: collection.label,
          title: row.title,
          path: row.path,
          status: 'published',
          publicState: 'public',
          updatedAt: row.lastPublishedAt,
          publishedAt: row.lastPublishedAt,
          blockingIssueCount: 0,
          missingTranslationLocales: [],
          nextAction: 'Verify public output',
        })),
      )
      summaries.push({
        slug: collection.slug,
        label: collection.label,
        routeMode: routeBacked ? 'route' : 'none',
        type: collection.type,
        locales: collection.locales,
        entryCount: rows.length,
        changedDrafts: mapped.filter((row) => row.draftChangedSincePublish).length,
        blocked: mapped.filter((row) => row.blockingIssueCount > 0).length,
        missingTranslations: mapped.filter((row) => row.missingTranslationLocales.length > 0)
          .length,
      })
    }

    const imports = await ctx.db
      .query('collectionImportRuns')
      .withIndex('by_created_at')
      .order('desc')
      .take(20)
    const revalidationJobs = await ctx.db.query('outboxEvents').take(50)
    const activity = await ctx.db.query('activity').withIndex('by_time').order('desc').take(12)
    const recentPublished = publishedRows
      .sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0))
      .slice(0, STUDIO_OVERVIEW_LIMIT)
    const changedDrafts = newestRows(
      allEntrySummaries.filter((entry) => entry.draftChangedSincePublish),
    )
    const blockedEntries = allEntrySummaries.filter((entry) => entry.blockingIssueCount > 0)
    const blocked = newestRows(blockedEntries)
    const missingTranslationEntries = allEntrySummaries.filter(
      (entry) => entry.missingTranslationLocales.length > 0,
    )
    const missingTranslations = newestRows(missingTranslationEntries)
    const failedRevalidation = revalidationJobs.filter((job) => job.status === 'failed')
    const pendingRevalidation = revalidationJobs.filter(
      (job) => job.status === 'pending' || job.status === 'delivering',
    )
    const importBlockers = imports.filter(
      (run) => run.status === 'blocked' || run.status === 'failed',
    )
    const needsAttentionEntryIds = new Set([
      ...blockedEntries.map((entry) => entry.entryId),
      ...missingTranslationEntries.map((entry) => entry.entryId),
    ])

    return {
      counts: {
        needsAttention:
          needsAttentionEntryIds.size + failedRevalidation.length + importBlockers.length,
        changedDrafts: allEntrySummaries.filter((entry) => entry.draftChangedSincePublish).length,
        missingTranslations: missingTranslationEntries.length,
        failedRevalidation: failedRevalidation.length,
        importBlockers: importBlockers.length,
        pendingRevalidation: pendingRevalidation.length,
      },
      collections: summaries,
      changedDrafts: attachEntryRecordAccess(appIdentity, changedDrafts),
      blocked: attachEntryRecordAccess(appIdentity, blocked),
      missingTranslations: attachEntryRecordAccess(appIdentity, missingTranslations),
      recentPublished: attachEntryRecordAccess(appIdentity, recentPublished),
      revalidationJobs: revalidationJobs
        .filter((job) => job.status !== 'delivered')
        .slice(0, STUDIO_OVERVIEW_LIMIT)
        .map((job) => ({
          id: toStringId(job._id),
          status: job.status,
          paths: job.paths,
          attempts: job.attempts,
          lastError: job.lastError,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
      importRuns: importBlockers.slice(0, STUDIO_OVERVIEW_LIMIT).map((run) => ({
        id: toStringId(run._id),
        importRunId: run.importRunId,
        kind: run.kind,
        status: run.status ?? (run.kind === 'preview' ? 'previewed' : 'applied'),
        entryCount: run.entryCount,
        assetCount: run.assetCount,
        collectionSlugs: run.collectionSlugs,
        createdAt: run.createdAt,
      })),
      activity: activity.map((row) => ({
        _id: toStringId(row._id),
        kind: row.kind,
        summary: row.summary,
        displaySummary: displayActivitySummary(row),
        entryId: toOptionalStringId(row.entryId),
        collectionId: toOptionalStringId(row.collectionId),
        locale: row.locale ?? null,
        appIdentityId: activityAppIdentityId(row),
        createdAt: row.createdAt,
      })),
    }
  },
})

export const getEntry = callerQuery.protected({
  id: 'editor:getEntry',
  args: getEntryArgs.args,
  guard: canRead,
  returns: v.union(v.null(), studioEntryValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entry = await ctx.db.get(args.id as Id<'entries'>)
    if (!entry) return null
    return attachEntryRecordAccess(
      await ctx.appIdentity(),
      await buildStudioEntry(ctx, entry, args.locale),
    )
  },
})

export const listActivity = callerQuery.protected({
  id: 'editor:listActivity',
  args: listActivityArgs.args,
  guard: canRead,
  returns: activityListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const limit = Math.max(
      1,
      Math.min(args.paginationOpts.numItems ?? ACTIVITY_DEFAULT_LIMIT, ACTIVITY_MAX_LIMIT),
    )
    const rows = await ctx.db
      .query('activity')
      .withIndex('by_time', (q) =>
        args.paginationOpts.cursor ? q.lt('createdAt', Number(args.paginationOpts.cursor)) : q,
      )
      .order('desc')
      .take(limit + 1)
    const pageRows = rows.slice(0, limit)
    const nextRow = rows.at(limit)

    return {
      page: pageRows.map((row) => ({
        _id: toStringId(row._id),
        kind: row.kind,
        summary: row.summary,
        displaySummary: displayActivitySummary(row),
        entryId: toOptionalStringId(row.entryId),
        collectionId: toOptionalStringId(row.collectionId),
        locale: row.locale ?? null,
        detail: row.detail ?? null,
        appIdentityId: activityAppIdentityId(row),
        createdAt: row.createdAt,
      })),
      isDone: !nextRow,
      continueCursor: nextRow ? String(pageRows.at(-1)?.createdAt ?? '') : null,
    }
  },
})

export const listVersions = callerQuery.protected({
  id: 'editor:listVersions',
  args: listVersionsArgs.args,
  guard: canRead,
  returns: v.array(versionListItemValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const revisions = await ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entry._id))
      .collect()
    const publicRevisionIds = new Set(
      (
        await ctx.db
          .query('publicEntries')
          .filter((q) => q.eq(q.field('entryId'), entry._id))
          .collect()
      ).map((row) => String(row.revisionId)),
    )

    return revisions
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 100)
      .map((revision) => ({
        _id: toStringId(revision._id),
        version: revisionDisplayNumber(revisions, revision._id),
        action: revision.kind,
        displayAction: mapVersionDisplayAction(revision.kind),
        publishedLocales: revision.affectedLocales,
        message: revision.message ?? null,
        createdBy: revision.createdBy,
        createdAt: revision.createdAt,
        isCurrentPublished: publicRevisionIds.has(String(revision._id)),
      }))
  },
})

export const getVersionDiff = callerQuery.protected({
  id: 'editor:getVersionDiff',
  args: getVersionDiffArgs.args,
  guard: canRead,
  returns: versionDiffValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const left = await ctx.db.get(args.leftVersionId as Id<'entryRevisions'>)
    const right = await ctx.db.get(args.rightVersionId as Id<'entryRevisions'>)
    if (!left || !right) {
      throw new Error('Version not found')
    }
    if (left.entryId !== right.entryId) {
      throwCmsError('ENTRY_VERSION_MISMATCH', 'Versions must belong to the same entry', {
        leftVersionId: args.leftVersionId,
        rightVersionId: args.rightVersionId,
      })
    }

    const leftFlat = flattenRevisionSnapshot(left.snapshot)
    const rightFlat = flattenRevisionSnapshot(right.snapshot)
    const keys = Array.from(new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)])).sort()
    return {
      leftVersionId: toStringId(left._id),
      rightVersionId: toStringId(right._id),
      changes: keys
        .filter((key) => !isEqualJsonValue(leftFlat[key], rightFlat[key]))
        .map((key) => ({
          field: key,
          left: leftFlat[key] ?? null,
          right: rightFlat[key] ?? null,
        })),
    }
  },
})

export const getEntryActivity = callerQuery.protected({
  id: 'editor:getEntryActivity',
  args: getEntryActivityArgs.args,
  guard: canRead,
  returns: v.array(entryActivityItemValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const rows = await ctx.db
      .query('activity')
      .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
      .collect()

    return rows
      .sort((left: ActivityDoc, right: ActivityDoc) => right.createdAt - left.createdAt)
      .map((row) => ({
        _id: toStringId(row._id),
        kind: row.kind,
        summary: row.summary,
        displaySummary: displayActivitySummary(row),
        locale: row.locale ?? null,
        detail: row.detail ?? null,
        appIdentityId: activityAppIdentityId(row),
        createdAt: row.createdAt,
      }))
  },
})

function extractLocaleFromSnapshot(
  snapshot: {
    locales?: Record<
      string,
      {
        slug?: string | null
        path: string
        values?: Record<string, unknown> | null
      } | null
    >
  },
  locale?: string,
) {
  const locales = snapshot.locales ?? {}
  const localeKey = locale ?? Object.keys(locales)[0]
  if (!localeKey) return null
  const localeData = locales[localeKey]
  if (!localeData) return null
  return {
    slug: localeData.slug ?? null,
    path: localeData.path,
    values: (localeData.values as Record<string, unknown> | null) ?? null,
  }
}

export const getVersionSnapshot = callerQuery.protected({
  id: 'editor:getVersionSnapshot',
  args: getVersionSnapshotArgs.args,
  guard: canRead,
  returns: versionSnapshotPreviewValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const revision = await ctx.db.get(args.versionId as Id<'entryRevisions'>)
    if (!revision) throw new Error('Version not found')
    const revisions = await ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_createdAt', (q) => q.eq('entryId', revision.entryId))
      .collect()

    return {
      _id: toStringId(revision._id),
      version: revisionDisplayNumber(revisions, revision._id),
      action: revision.kind,
      message: revision.message ?? null,
      createdAt: revision.createdAt,
      snapshot: {
        baseSlug: revision.snapshot.slug ?? '',
        shared: (revision.snapshot.shared as Record<string, unknown>) ?? {},
        locale: extractLocaleFromSnapshot(revision.snapshot, args.locale),
      },
    }
  },
})

export async function getDraftVsPublishedDiffPreview(
  ctx: HandlerQueryCtx,
  args: { entryId: string },
) {
  const entry = await getEntryOrThrow(ctx, args.entryId)
  const collection = await ctx.db.get(entry.collectionId)
  if (!collection) throw new Error('Collection not found')

  const draftSnapshot = await createSnapshotFromState(ctx, entry, collection as never, 'draft')
  const publishedSnapshot = await createSnapshotFromState(
    ctx,
    entry,
    collection as never,
    'published',
  )

  const draftFlat = flattenSnapshot(draftSnapshot)
  const publishedFlat = flattenSnapshot(publishedSnapshot)
  const keys = Array.from(
    new Set([...Object.keys(draftFlat), ...Object.keys(publishedFlat)]),
  ).sort()

  return {
    changes: keys
      .filter((key) => !isEqualJsonValue(publishedFlat[key], draftFlat[key]))
      .map((key) => ({
        field: key,
        left: publishedFlat[key] ?? null,
        right: draftFlat[key] ?? null,
      })),
  }
}

export const getDraftVsPublishedDiff = callerQuery.protected({
  id: 'editor:getDraftVsPublishedDiff',
  args: getDraftVsPublishedDiffArgs.args,
  guard: canRead,
  returns: draftVsPublishedDiffValidator,
  handler: async (ctx: HandlerQueryCtx, args) => getDraftVsPublishedDiffPreview(ctx, args),
})
