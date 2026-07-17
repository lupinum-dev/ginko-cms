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
  entryReadinessDetailValidator,
  entrySummaryValidator,
  studioEntryListResultValidator,
  studioEntryValidator,
  studioOverviewValidator,
  versionDiffValidator,
  versionListItemValidator,
  versionSnapshotPreviewValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import {
  createReadinessAction,
  type EntryReadinessDetail,
  type EntryListWorkState,
  type ReadinessAction,
  type ReadinessState,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'
import { renderGinkoHref } from '@lupinum/ginko-cms-contract/shared/routeDiagnostics.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel.js'
import { canRead } from '../auth/checks.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { throwCmsError } from '../errors.js'
import { callerQuery } from '../functions.js'
import {
  getCollectionDefaultLocale,
  getCollectionOrThrow,
  isRouteBackedCollection,
  listInstalledCollections,
} from '../lib/collections.js'
import { isEqualJsonValue } from '../lib/data.js'
import { toOptionalStringId, toStringId } from '../lib/ids.js'
import { getLocaleChain, getRoutingLocales } from '../lib/locale.js'
import { compareOrderRank } from '../lib/ordering.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import { buildSearchText } from '../lib/search.js'
import { orderTreeRows } from '../lib/treeOrder.js'
import type { ActivityDoc, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc, EntryRevisionDoc } from './context.js'
import {
  buildStudioEntry,
  deriveDirtyLocales,
  getCollectionForEntry,
  getEntryOrThrow,
  readStudioDraftView,
} from './context.js'
import { computeEntryReadinessDetail, computeEntryReadinessSummary } from './readiness.js'
import { createSnapshotFromState, flattenRevisionSnapshot, flattenSnapshot } from './versioning.js'
import {
  computeDraftPath,
  effectiveDraftParent,
  effectiveDraftSlug,
} from './workflow/draftPlacement.js'
import { readDraftRows } from './workflow/drafts.js'
import { publicPathForEntry } from './workflow/publicTree.js'

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

type ActivityCursor = {
  v: 1
  kind: 'activity'
  createdAt: number
  creationTime: number
}

function parseActivityCursor(value: string | null): ActivityCursor | null {
  if (!value) return null
  let cursor: unknown
  try {
    cursor = JSON.parse(value)
  } catch {
    throwCmsError('INVALID_CURSOR', 'Activity cursor is invalid.')
  }
  const parsed = cursor as Partial<ActivityCursor>
  if (
    !cursor ||
    typeof cursor !== 'object' ||
    parsed.v !== 1 ||
    parsed.kind !== 'activity' ||
    typeof parsed.createdAt !== 'number' ||
    !Number.isFinite(parsed.createdAt) ||
    typeof parsed.creationTime !== 'number' ||
    !Number.isFinite(parsed.creationTime)
  ) {
    throwCmsError('INVALID_CURSOR', 'Activity cursor is invalid.')
  }
  return parsed as ActivityCursor
}

function encodeActivityCursor(row: ActivityDoc) {
  return JSON.stringify({
    v: 1,
    kind: 'activity',
    createdAt: row.createdAt,
    creationTime: row._creationTime,
  } satisfies ActivityCursor)
}

type PublicRoutePreview = {
  entryId: string
  locale: string
  path: string
  href: string
}

type StudioEntryStatus = 'draft' | 'published' | 'archived'

function studioEntryStatus(entry: EntryDoc): StudioEntryStatus {
  if (entry.lifecycle === 'archived') return 'archived'
  return entry.activePublications.length > 0 ? 'published' : 'draft'
}

async function publicRoutePreview(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  row: Doc<'publicEntries'>,
  routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>,
): Promise<PublicRoutePreview | null> {
  const path = await publicPathForEntry(ctx, row, {
    pathPrefix: pathPrefixForLocale(collection, row.locale),
    rootSlug: rootSlugForLocale(collection, row.locale),
  })
  if (!path) return null
  return {
    entryId: toStringId(row.entryId),
    locale: row.locale,
    path,
    href: renderGinkoHref({ locale: row.locale, path }, routingLocales),
  }
}

function activityAppIdentityId(row: ActivityDoc): string {
  return row.appIdentityId ?? row.actorId ?? 'unknown'
}

// Editor-safe display names for an activity page (design review S3): the
// Studio never prints raw document/user ids, so resolve collection labels,
// entry slugs, and member display names in one batched pass per page.
async function resolveActivityDisplayFields(
  ctx: HandlerQueryCtx,
  page: ActivityDoc[],
): Promise<{
  collections: Map<string, { slug: string; label: string | null }>
  entries: Map<string, string>
  actors: Map<string, string | null>
}> {
  const collectionSlugs = new Set<string>()
  const entryIds = new Set<string>()
  const actorIds = new Set<string>()
  for (const row of page) {
    if (row.collection) collectionSlugs.add(row.collection)
    if (row.entryId) entryIds.add(String(row.entryId))
    // Rows written since the actorLabel column exists carry the name from
    // write time (even when it resolved to null) — only legacy rows need the
    // read-time member lookup.
    if (row.actorLabel === undefined) actorIds.add(activityAppIdentityId(row))
  }

  const collections = new Map<string, { slug: string; label: string | null }>()
  const entries = new Map<string, string>()
  const actors = new Map<string, string | null>()

  const installedCollections = await listInstalledCollections(ctx)
  for (const collection of installedCollections) {
    if (!collectionSlugs.has(collection.slug)) continue
    const label =
      typeof collection.label === 'string'
        ? collection.label
        : (Object.values(collection.label).find(Boolean) ?? null)
    collections.set(collection.slug, { slug: collection.slug, label })
  }

  await Promise.all([
    ...Array.from(entryIds, async (id) => {
      const entryId = ctx.db.normalizeId('entries', id)
      if (!entryId) return
      const doc = await ctx.db.get(entryId)
      if (doc) entries.set(id, doc.slug)
    }),
    ...Array.from(actorIds, async (id) => {
      const member = await ctx.db
        .query('members')
        .withIndex('by_userId', (query) => query.eq('userId', id))
        .first()
      actors.set(id, member?.displayName ?? member?.email ?? null)
    }),
  ])

  return { collections, entries, actors }
}

function activityOperationId(row: Pick<ActivityDoc, 'detail'>): string | null {
  const detail = row.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  const operationId = detail.operationId
  return typeof operationId === 'string' ? operationId : null
}

// Redacts the quoted identifier (email / connection name — PII) from a
// summary instead of substituting a placeholder, so the display copy stays
// grammatical: 'Revoked AI agent connection for "x"' → 'Revoked AI agent
// connection'.
function redactQuotedIdentifier(summary: string): string {
  return summary
    .replace(/\s+for\s+"[^"]+"/g, '')
    .replace(/\s*"[^"]+"/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function displayActivitySummary(row: Pick<ActivityDoc, 'kind' | 'summary' | 'detail'>): string {
  if (row.kind.startsWith('member.')) {
    return redactQuotedIdentifier(row.summary)
  }
  if (row.kind.startsWith('mcpCredentialSettings.')) {
    return redactQuotedIdentifier(
      row.summary.replace(/MCP credential settings/g, 'AI agent connection'),
    )
  }
  if (row.kind === 'entry.checkpointed') {
    return row.summary.replace(/checkpoint/gi, 'version')
  }
  if (row.kind === 'agentRun.write') {
    const operationId = activityOperationId(row)
    if (operationId === 'ginko-cms.create-entry') return 'AI created content'
    if (operationId === 'ginko-cms.save-entry-draft') return 'AI updated content'
    if (operationId === 'ginko-cms.request-publish-review') return 'AI requested review'
    if (operationId === 'ginko-cms.publish-entry') return 'AI published content'
    if (operationId === 'ginko-cms.archive-entry') return 'AI archived content'
    if (operationId === 'ginko-cms.restore-entry') return 'AI restored content'
    if (operationId === 'ginko-cms.move-asset') return 'AI organized assets'
    if (operationId === 'ginko-cms.export-backup') return 'AI exported backup'
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
  const publicRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
    .collect()
  const routingLocales = await getRoutingLocales(
    ctx,
    collection.locales,
    getCollectionDefaultLocale(collection),
  )
  const publicRoutes = (
    await Promise.all(
      publicRows.map((row) => publicRoutePreview(ctx, collection, row, routingLocales)),
    )
  ).filter((route): route is PublicRoutePreview => route !== null)
  const publicDescendantRoutes = await readPublicDescendantRoutes(ctx, {
    collection,
    rootEntryId: entry._id,
    routingLocales,
  })
  const publicRevisionIdsByLocale = Object.fromEntries(
    publicRows
      .map((row): [string, Id<'entryRevisions'>] => [row.locale, row.revisionId])
      .sort(([left], [right]) => left.localeCompare(right)),
  )

  return {
    entryId: toStringId(entry._id),
    baseSlug: entry.slug,
    displayLabel: primaryTitle ?? primaryLocale?.draftSlug ?? draftView.baseSlug ?? entry.slug,
    status: studioEntryStatus(entry),
    draftVersion: entry.draftVersion,
    dirtyLocales: deriveDirtyLocales(
      entry,
      new Map(draftView.locales.map((locale) => [locale.locale, locale.draftVersion])),
    ),
    publicRevisionIdsByLocale,
    publishedLocales: publicRoutes.map((route) => route.locale).sort(),
    publicRoutes: publicRoutes.sort((left, right) =>
      `${left.locale}:${left.path}`.localeCompare(`${right.locale}:${right.path}`),
    ),
    publicDescendantRoutes,
  }
}

async function readPublicDescendantRoutes(
  ctx: HandlerQueryCtx,
  args: {
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    rootEntryId: Id<'entries'>
    routingLocales: Awaited<ReturnType<typeof getRoutingLocales>>
  },
): Promise<PublicRoutePreview[]> {
  const descendants: PublicRoutePreview[] = []
  const queue = args.collection.locales.map((locale) => ({
    locale,
    parentEntryId: args.rootEntryId,
  }))
  const seen = new Set<string>()

  while (queue.length > 0) {
    const next = queue.shift()!
    const rows = await ctx.db
      .query('publicEntries')
      .withIndex('by_collection_locale_parent_orderKey', (q) =>
        q
          .eq('collection', args.collection.slug)
          .eq('locale', next.locale)
          .eq('parentEntryId', next.parentEntryId),
      )
      .collect()
    for (const row of rows as Doc<'publicEntries'>[]) {
      const key = `${row.locale}:${toStringId(row.entryId)}`
      if (seen.has(key)) continue
      seen.add(key)
      const route = await publicRoutePreview(ctx, args.collection, row, args.routingLocales)
      if (route) descendants.push(route)
      queue.push({ locale: row.locale, parentEntryId: row.entryId })
    }
  }

  return descendants.sort((left, right) =>
    `${left.locale}:${left.path}:${left.entryId}`.localeCompare(
      `${right.locale}:${right.path}:${right.entryId}`,
    ),
  )
}

type StudioEntryRowDoc = {
  entryId: Id<'entries'>
  collection: string
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
    draftExists: boolean
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

async function buildSourceStudioRow(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  entry: EntryDoc,
  requestedLocale: string,
): Promise<StudioEntryRowDoc | null> {
  const [draftRows, publicRows] = await Promise.all([
    readDraftRows(ctx, entry._id),
    ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
      .collect(),
  ])
  const publicByLocale = new Map(publicRows.map((row) => [row.locale, row]))
  const locales = Array.from(
    new Set([...collection.locales, ...Object.keys(draftRows.byLocale), ...publicByLocale.keys()]),
  )
  const { chain } = await getLocaleChain(ctx, requestedLocale)
  const preferredLocale = selectStudioLocaleCode(locales, chain)
  if (!preferredLocale) return null
  const shared = (draftRows.shared?.shared ?? {}) as JsonMap
  const preferredLocaleRow = draftRows.byLocale[preferredLocale] ?? null
  const preferredValues = (preferredLocaleRow?.values ?? {}) as JsonMap
  const preferredData = materializeFieldData(collection.fields, shared, preferredValues)
  const preferredSlug = effectiveDraftSlug(entry, draftRows.shared, preferredLocaleRow)
  const draftParentEntryId = effectiveDraftParent(entry, draftRows.shared)
  const preferredPath = await computeDraftPath(ctx, {
    collection,
    entry,
    parentEntryId: draftParentEntryId,
    slug: preferredSlug,
    locale: preferredLocale,
  })
  const localeSummaries = await Promise.all(
    locales.map(async (locale) => {
      const localeRow = draftRows.byLocale[locale] ?? null
      const slug = effectiveDraftSlug(entry, draftRows.shared, localeRow)
      const publicRow = publicByLocale.get(locale) ?? null
      return {
        locale,
        draftPath: await computeDraftPath(ctx, {
          collection,
          entry,
          parentEntryId: draftParentEntryId,
          slug,
          locale,
        }),
        draftExists: !!localeRow,
        publishedPath: publicRow
          ? await publicPathForEntry(ctx, publicRow, {
              pathPrefix: pathPrefixForLocale(collection, locale),
              rootSlug: rootSlugForLocale(collection, locale),
            })
          : null,
        published: !!publicRow,
        updatedAt: localeRow?.updatedAt ?? entry.updatedAt,
      }
    }),
  )
  const localeVersions = new Map(
    Object.values(draftRows.byLocale).map((localeRow) => [localeRow.locale, localeRow.version]),
  )
  return {
    entryId: entry._id,
    collection: collection.slug,
    locale: preferredLocale,
    baseSlug: preferredSlug,
    stableId: entry.stableId ?? null,
    status: studioEntryStatus(entry),
    dirtyLocales: deriveDirtyLocales(entry, localeVersions),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    publishedAt: publicRows.length
      ? Math.max(...publicRows.map((row) => row.lastPublishedAt))
      : null,
    parentEntryId: draftParentEntryId,
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
      (['active', 'archived'] as const).map((lifecycle) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_lifecycle', (q) =>
            q.eq('collection', collection.slug).eq('lifecycle', lifecycle),
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

function studioListLifecycles(status?: StudioEntryStatus) {
  return status === 'archived' ? (['archived'] as const) : (['active'] as const)
}

async function queryStudioEntryCandidates(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  status: StudioEntryStatus | undefined,
  scanLimit: number,
) {
  const entries = (
    await Promise.all(
      studioListLifecycles(status).map((lifecycle) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_lifecycle', (q) =>
            q.eq('collection', collection.slug).eq('lifecycle', lifecycle),
          )
          .order('desc')
          .take(scanLimit),
      ),
    )
  )
    .flat()
    .filter((entry) => !status || studioEntryStatus(entry) === status)

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
    localeSummaries: row.localeSummaries.map((locale) => ({
      locale: locale.locale,
      draftExists: locale.draftExists,
      draftPath: locale.draftPath,
      publishedPath: locale.publishedPath,
      published: locale.published,
      updatedAt: locale.updatedAt,
    })),
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

function workStateFromWorkflowSummary(args: {
  row: StudioEntryRowDoc
  routeBacked: boolean
  workflowSummary: ReturnType<typeof computeEntryWorkflowSummary>
}) {
  const locales = localeReadiness(args.row)
  const missingTranslationLocales = args.workflowSummary.missingLocales
  const draftChangedSincePublish =
    args.row.status !== 'published' ||
    Object.values(args.workflowSummary.workStatesByLocale).some(
      (state) => state === 'draft' || state === 'changed',
    )
  const blockingIssueCount = args.workflowSummary.issueCounts.blocker
  // A live entry stays 'public' even with newer draft work; the combination of
  // publicState + draftChangedSincePublish is the canonical "live with
  // unpublished changes". 'draft_only' is reserved for entries with no public
  // output at all.
  const publicState = !args.routeBacked
    ? ('data_only' as const)
    : blockingIssueCount > 0
      ? ('needs_attention' as const)
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

function summaryAction(args: {
  kind: ReadinessAction['kind']
  locale: string | null
  target: ReadinessAction['target']
}) {
  return createReadinessAction({
    kind: args.kind,
    locale: args.locale,
    target: args.target,
    params: {},
  })
}

function cheapReadinessStateForListLocale(args: {
  row: StudioEntryRowDoc
  locale: StudioEntryRowDoc['localeSummaries'][number] | undefined
  routeBacked: boolean
}): ReadinessState {
  const locale = args.locale
  if (!locale || (!locale.draftExists && !locale.published)) return 'missing'
  if (args.routeBacked && !locale.draftPath) return 'needs_work'
  if (locale.published && !args.row.dirtyLocales.includes(locale.locale)) return 'live'
  if (locale.published && args.row.dirtyLocales.includes(locale.locale)) {
    return 'live_with_changes'
  }
  return locale.draftExists ? 'ready' : 'draft'
}

function listWorkStateFromReadinessState(state: ReadinessState): EntryListWorkState {
  if (state === 'missing') return 'missing_translation'
  if (state === 'needs_work') return 'blocked'
  if (state === 'live') return 'public'
  if (state === 'live_with_changes') return 'changed'
  return 'draft'
}

function computeEntryWorkflowSummary(args: {
  row: StudioEntryRowDoc
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
  routeBacked: boolean
}) {
  const workStatesByLocale: Record<string, EntryListWorkState> = {}
  const readinessStatesByLocale: Record<string, ReadinessState> = {}
  const issueCounts = { blocker: 0, warning: 0, info: 0 }
  const publishedLocales: string[] = []
  const localeRows = new Map(args.row.localeSummaries.map((locale) => [locale.locale, locale]))
  const primaryLocale = args.collection.locales[0] ?? args.row.locale

  for (const locale of args.collection.locales) {
    const row = localeRows.get(locale)
    if (row?.published) publishedLocales.push(locale)
    const readinessState = cheapReadinessStateForListLocale({
      row: args.row,
      locale: row,
      routeBacked: args.routeBacked,
    })
    readinessStatesByLocale[locale] = readinessState
    workStatesByLocale[locale] = listWorkStateFromReadinessState(readinessState)
    if (readinessState === 'needs_work') {
      issueCounts.blocker += 1
    }
  }

  const missingLocales = args.collection.locales.filter(
    (locale) => workStatesByLocale[locale] === 'missing_translation',
  )
  const changedLocale = args.row.dirtyLocales.find((locale) => workStatesByLocale[locale])
  const firstMissingLocale = missingLocales[0] ?? null
  const nextAction =
    issueCounts.blocker > 0
      ? summaryAction({ kind: 'open_diagnostics', locale: null, target: 'diagnostics' })
      : firstMissingLocale
        ? summaryAction({ kind: 'add_locale', locale: firstMissingLocale, target: 'locale' })
        : changedLocale
          ? summaryAction({ kind: 'preview_publish', locale: changedLocale, target: 'publish' })
          : publishedLocales[0]
            ? summaryAction({
                kind: 'view_public_page',
                locale: publishedLocales[0] ?? null,
                target: 'publish',
              })
            : summaryAction({ kind: 'continue_editing', locale: primaryLocale, target: 'editor' })

  return {
    entryId: toStringId(args.row.entryId),
    collection: args.collection.slug,
    primaryLocale,
    workStatesByLocale,
    readinessStatesByLocale,
    issueCounts,
    missingLocales,
    publishedLocales,
    nextAction,
  }
}

function mapEntrySummary(args: {
  row: StudioEntryRowDoc
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
}) {
  const routeBacked = isRouteBackedCollection(args.collection)
  const workflowSummary = computeEntryWorkflowSummary({
    row: args.row,
    collection: args.collection,
    routeBacked,
  })
  const workState = workStateFromWorkflowSummary({
    row: args.row,
    routeBacked,
    workflowSummary,
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
    workflowSummary,
    nextAction: workState.nextAction,
  }
}

function newestRows<T extends { updatedAt: number }>(rows: T[], limit = STUDIO_OVERVIEW_LIMIT) {
  return [...rows].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, limit)
}

// Archived entries are intentionally out of normal work: they never count as
// actionable in work queues, even when their locales would otherwise read as
// draft, changed, blocked, or missing.
function hasWorkflowChangedDraft(entry: ReturnType<typeof mapEntrySummary>) {
  return (
    entry.status !== 'archived' &&
    Object.values(entry.workflowSummary.workStatesByLocale).some(
      (state) => state === 'draft' || state === 'changed',
    )
  )
}

function hasWorkflowBlocker(entry: ReturnType<typeof mapEntrySummary>) {
  return entry.status !== 'archived' && entry.workflowSummary.issueCounts.blocker > 0
}

function hasWorkflowMissingLocale(entry: ReturnType<typeof mapEntrySummary>) {
  return entry.status !== 'archived' && entry.workflowSummary.missingLocales.length > 0
}

function isReadyToPreviewCandidate(entry: ReturnType<typeof mapEntrySummary>) {
  return (
    entry.status !== 'archived' &&
    hasWorkflowChangedDraft(entry) &&
    !hasWorkflowBlocker(entry) &&
    !hasWorkflowMissingLocale(entry)
  )
}

function localeHasStaleReview(locale: EntryReadinessDetail['locales'][number]) {
  return locale.warnings.some((issue) => issue.code === 'review_preview_stale')
}

function readinessDetailAllowsPreview(detail: EntryReadinessDetail) {
  if (
    detail.locales.some(
      (locale) =>
        locale.state === 'missing' || locale.blockers.length > 0 || localeHasStaleReview(locale),
    )
  ) {
    return false
  }

  return detail.locales.some(
    (locale) =>
      locale.hasUnpublishedChanges &&
      locale.canPreview &&
      !localeHasStaleReview(locale) &&
      (locale.state === 'ready' ||
        locale.state === 'live_with_changes' ||
        locale.canRequestReview ||
        locale.canPublish),
  )
}

async function canonicalReadyToPreviewEntries(
  ctx: HandlerQueryCtx,
  entries: Array<ReturnType<typeof mapEntrySummary>>,
) {
  const readyEntries: Array<ReturnType<typeof mapEntrySummary>> = []
  for (const entry of entries) {
    const readiness = await computeEntryReadinessDetail(ctx, { entryId: entry.entryId })
    if (readinessDetailAllowsPreview(readiness)) readyEntries.push(entry)
  }
  return readyEntries
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

async function queryStudioTreeEntryCandidates(
  ctx: HandlerQueryCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  status: StudioEntryStatus | undefined,
) {
  const entries = (
    await Promise.all(
      studioListLifecycles(status).map((lifecycle) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_lifecycle', (q) =>
            q.eq('collection', collection.slug).eq('lifecycle', lifecycle),
          )
          .take(STUDIO_TREE_LIST_MAX + 1),
      ),
    )
  )
    .flat()
    .filter((entry) => !status || studioEntryStatus(entry) === status)

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
  args: { locale: string; status?: StudioEntryStatus; cursor?: string | null; limit: number },
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
    case 'route_rebuild':
      return 'routeUpdated' as const
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
    const collections = await listInstalledCollections(ctx)
    const summaries = []
    const allEntrySummaries = []
    const publishedRows = []

    for (const collection of collections) {
      const rows = await listSourceStudioRows(ctx, collection, args.locale)
      const routeBacked = isRouteBackedCollection(collection)
      const mapped = rows.map((row) => mapEntrySummary({ row, collection }))
      allEntrySummaries.push(...mapped)
      const publicRows = await ctx.db
        .query('publicEntries')
        .withIndex('by_collection_locale_orderKey', (q) =>
          q.eq('collection', collection.slug).eq('locale', args.locale),
        )
        .collect()
      const publicRowsWithPaths = (
        await Promise.all(
          publicRows.map(async (row) => {
            const path = await publicPathForEntry(ctx, row, {
              pathPrefix: pathPrefixForLocale(collection, row.locale),
              rootSlug: rootSlugForLocale(collection, row.locale),
            })
            return path ? { row, path } : null
          }),
        )
      ).filter((item): item is { row: Doc<'publicEntries'>; path: string } => item !== null)
      publishedRows.push(
        ...publicRowsWithPaths.map(({ row, path }) => ({
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
        })),
      )
      summaries.push({
        slug: collection.slug,
        label: collection.label,
        routeMode: routeBacked ? 'route' : 'none',
        type: collection.type,
        locales: collection.locales,
        entryCount: rows.length,
        changedDrafts: mapped.filter(hasWorkflowChangedDraft).length,
        blocked: mapped.filter(hasWorkflowBlocker).length,
        missingTranslations: mapped.filter(hasWorkflowMissingLocale).length,
      })
    }

    const revalidationJobs = await ctx.db.query('outboxEvents').take(50)
    const activity = await ctx.db.query('activity').withIndex('by_time').order('desc').take(12)
    const recentPublished = publishedRows
      .sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0))
      .slice(0, STUDIO_OVERVIEW_LIMIT)
    const changedDrafts = newestRows(allEntrySummaries.filter(hasWorkflowChangedDraft))
    const readyToPreviewEntries = await canonicalReadyToPreviewEntries(
      ctx,
      allEntrySummaries.filter(isReadyToPreviewCandidate),
    )
    const readyToPreview = newestRows(readyToPreviewEntries)
    const blockedEntries = allEntrySummaries.filter(hasWorkflowBlocker)
    const blocked = newestRows(blockedEntries)
    const missingTranslationEntries = allEntrySummaries.filter(hasWorkflowMissingLocale)
    const missingTranslations = newestRows(missingTranslationEntries)
    const failedRevalidation = revalidationJobs.filter((job) => job.status === 'dead')
    const pendingRevalidation = revalidationJobs.filter(
      (job) => job.status === 'pending' || job.status === 'delivering',
    )
    const needsAttentionEntryIds = new Set([
      ...blockedEntries.map((entry) => entry.entryId),
      ...missingTranslationEntries.map((entry) => entry.entryId),
    ])

    return {
      counts: {
        needsAttention: needsAttentionEntryIds.size + failedRevalidation.length,
        changedDrafts: allEntrySummaries.filter(hasWorkflowChangedDraft).length,
        readyToPreview: readyToPreviewEntries.length,
        missingTranslations: missingTranslationEntries.length,
        failedRevalidation: failedRevalidation.length,
        pendingRevalidation: pendingRevalidation.length,
      },
      collections: summaries,
      changedDrafts: attachEntryRecordAccess(appIdentity, changedDrafts),
      readyToPreview: attachEntryRecordAccess(appIdentity, readyToPreview),
      blocked: attachEntryRecordAccess(appIdentity, blocked),
      missingTranslations: attachEntryRecordAccess(appIdentity, missingTranslations),
      recentPublished: attachEntryRecordAccess(appIdentity, recentPublished),
      revalidationJobs: revalidationJobs
        .filter((job) => job.status !== 'delivered')
        .slice(0, STUDIO_OVERVIEW_LIMIT)
        .map((job) => ({
          id: toStringId(job._id),
          status: job.status === 'dead' ? ('failed' as const) : job.status,
          paths: job.paths,
          attempts: job.attempts,
          lastError: job.lastError,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
      activity: activity.map((row) => ({
        _id: toStringId(row._id),
        kind: row.kind,
        summary: row.summary,
        displaySummary: displayActivitySummary(row),
        entryId: toOptionalStringId(row.entryId),
        collectionId: row.collection ?? null,
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

export const getEntryReadinessDetail = callerQuery.protected({
  id: 'editor:getEntryReadinessDetail',
  args: {
    entryId: v.string(),
  },
  guard: canRead,
  returns: entryReadinessDetailValidator,
  handler: async (ctx: HandlerQueryCtx, args) => computeEntryReadinessDetail(ctx, args),
})

export const getEntryReadinessSummary = callerQuery.protected({
  id: 'editor:getEntryReadinessSummary',
  args: {
    entryId: v.string(),
  },
  guard: canRead,
  returns: entryReadinessDetailValidator,
  handler: async (ctx: HandlerQueryCtx, args) => computeEntryReadinessSummary(ctx, args),
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
    const cursor = parseActivityCursor(args.paginationOpts.cursor)
    const sameTimestampRows = cursor
      ? await ctx.db
          .query('activity')
          .withIndex('by_time', (query) =>
            query.eq('createdAt', cursor.createdAt).lt('_creationTime', cursor.creationTime),
          )
          .order('desc')
          .take(limit + 1)
      : []
    const remaining = limit + 1 - sameTimestampRows.length
    const olderRows =
      remaining > 0
        ? await ctx.db
            .query('activity')
            .withIndex('by_time', (query) =>
              cursor ? query.lt('createdAt', cursor.createdAt) : query,
            )
            .order('desc')
            .take(remaining)
        : []
    const rows = [...sameTimestampRows, ...olderRows]
    const isDone = rows.length <= limit
    const page = isDone ? rows : rows.slice(0, limit)
    const display = await resolveActivityDisplayFields(ctx, page)

    return {
      page: page.map((row) => ({
        _id: toStringId(row._id),
        kind: row.kind,
        summary: row.summary,
        displaySummary: displayActivitySummary(row),
        entryId: toOptionalStringId(row.entryId),
        collectionId: row.collection ?? null,
        locale: row.locale ?? null,
        detail: row.detail ?? null,
        appIdentityId: activityAppIdentityId(row),
        createdAt: row.createdAt,
        collectionSlug: row.collection
          ? (display.collections.get(row.collection)?.slug ?? row.collection)
          : null,
        collectionLabel: row.collection
          ? (display.collections.get(row.collection)?.label ?? null)
          : null,
        entrySlug: row.entryId ? (display.entries.get(String(row.entryId)) ?? null) : null,
        actorLabel:
          row.actorLabel !== undefined
            ? row.actorLabel
            : (display.actors.get(activityAppIdentityId(row)) ?? null),
      })),
      isDone,
      continueCursor: isDone || page.length === 0 ? null : encodeActivityCursor(page.at(-1)!),
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
          .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
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

    const leftFlat = flattenRevisionSnapshot(left.snapshots)
    const rightFlat = flattenRevisionSnapshot(right.snapshots)
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

async function extractLocaleFromRevision(
  ctx: HandlerQueryCtx,
  revision: EntryRevisionDoc,
  locale?: string,
) {
  const localeKey = locale ?? Object.keys(revision.snapshots).sort()[0]
  if (!localeKey) return null
  const localeData = revision.snapshots[localeKey]
  if (!localeData) return null
  const entry = await getEntryOrThrow(ctx, toStringId(revision.entryId))
  const collection = await getCollectionForEntry(ctx, entry)
  const path = await computeDraftPath(ctx, {
    collection,
    entry,
    parentEntryId: localeData.parentEntryId,
    slug: localeData.slug,
    locale: localeKey,
  })
  return {
    slug: localeData.slug,
    path,
    values: localeData.values as Record<string, unknown>,
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
    const locale = await extractLocaleFromRevision(ctx, revision, args.locale)
    const selectedSnapshot =
      (args.locale ? revision.snapshots[args.locale] : undefined) ??
      revision.snapshots[Object.keys(revision.snapshots).sort()[0] ?? ''] ??
      null

    return {
      _id: toStringId(revision._id),
      version: revisionDisplayNumber(revisions, revision._id),
      action: revision.kind,
      message: revision.message ?? null,
      createdAt: revision.createdAt,
      snapshot: {
        baseSlug: selectedSnapshot?.slug ?? '',
        shared: (selectedSnapshot?.shared as Record<string, unknown>) ?? {},
        locale,
      },
    }
  },
})

export async function getDraftVsPublishedDiffPreview(
  ctx: HandlerQueryCtx,
  args: { entryId: string },
) {
  const entry = await getEntryOrThrow(ctx, args.entryId)
  const collection = await getCollectionForEntry(ctx, entry)

  const draftSnapshot = await createSnapshotFromState(ctx, entry, collection, 'draft')
  const publishedSnapshot = await createSnapshotFromState(ctx, entry, collection, 'published')

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
