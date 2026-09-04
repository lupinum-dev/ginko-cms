import type {
  EntryListWorkState,
  EntryReadinessDetail,
  ReadinessState,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { isRouteBackedCollection } from '../lib/collections.js'
import { toOptionalStringId, toStringId } from '../lib/ids.js'
import type { getCmsSettings } from '../lib/locale.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import { computeEntryReadinessSummary } from './readiness.js'
import {
  entryTitle,
  studioEntryStatus,
  type StudioEntryRowDoc,
  type StudioEntryStatus,
} from './studioRows.js'

function workStateFromReadinessState(state: ReadinessState): EntryListWorkState {
  if (state === 'missing') return 'missing_translation'
  if (state === 'needs_work') return 'blocked'
  if (state === 'live') return 'public'
  if (state === 'live_with_changes') return 'changed'
  return 'draft'
}

function chooseSummaryAction(readiness: EntryReadinessDetail) {
  const prioritized =
    readiness.locales.find((locale) => locale.blockers.length > 0) ??
    readiness.locales.find((locale) => locale.state === 'missing') ??
    readiness.locales.find((locale) => locale.hasUnpublishedChanges) ??
    readiness.locales.find((locale) => locale.locale === readiness.primaryLocale) ??
    readiness.locales[0]
  return (
    prioritized?.nextAction ?? {
      kind: 'continue_editing' as const,
      locale: readiness.primaryLocale,
      target: 'editor' as const,
      params: {},
    }
  )
}

type EntrySummarySource = {
  entryId: Id<'entries'>
  title: string
  slug: string
  path: string
  status: StudioEntryStatus
  nodeKind: StudioEntryRowDoc['nodeKind']
  parentEntryId: Id<'entries'> | null | undefined
  updatedAt: number
  publishedAt: number | null
}

function entrySummaryFromReadiness(
  source: EntrySummarySource,
  collection: CmsCollection,
  readiness: EntryReadinessDetail,
) {
  const routeBacked = isRouteBackedCollection(collection)
  const workStatesByLocale: Record<string, EntryListWorkState> = {}
  const readinessStatesByLocale: Record<string, ReadinessState> = {}
  const issueCounts = { blocker: 0, warning: 0, info: 0 }
  for (const locale of readiness.locales) {
    workStatesByLocale[locale.locale] = workStateFromReadinessState(locale.state)
    readinessStatesByLocale[locale.locale] = locale.state
    issueCounts.blocker += locale.blockers.length
    issueCounts.warning += locale.warnings.length
    issueCounts.info += locale.infos.length
  }
  const missingLocales = readiness.locales
    .filter((locale) => locale.state === 'missing')
    .map((locale) => locale.locale)
  const publishedLocales = readiness.locales
    .filter((locale) => locale.published)
    .map((locale) => locale.locale)
  const draftChangedSincePublish = readiness.locales.some((locale) => locale.hasUnpublishedChanges)
  const blockingIssueCount = issueCounts.blocker
  const nextAction = chooseSummaryAction(readiness)
  const publicState = !routeBacked
    ? ('data_only' as const)
    : blockingIssueCount > 0
      ? ('needs_attention' as const)
      : source.status === 'published'
        ? ('public' as const)
        : ('draft_only' as const)

  return {
    _id: toStringId(source.entryId),
    entryId: toStringId(source.entryId),
    collection: collection.slug,
    collectionLabel: collection.label,
    title: source.title,
    slug: source.slug,
    path: source.path,
    status: source.status,
    routeMode: routeBacked ? ('route' as const) : ('none' as const),
    nodeKind: source.nodeKind,
    parentEntryId: toOptionalStringId(source.parentEntryId),
    updatedAt: source.updatedAt,
    publishedAt: source.publishedAt,
    publicState,
    draftChangedSincePublish,
    blockingIssueCount,
    missingTranslationLocales: missingLocales,
    localeReadiness: readiness.locales.map((locale) => ({
      locale: locale.locale,
      draftPath: locale.draftUrl ?? '',
      publishedPath: locale.publicUrl,
      published: locale.published,
      changed: locale.hasUnpublishedChanges,
      state: locale.published
        ? locale.hasUnpublishedChanges
          ? ('changed' as const)
          : ('public' as const)
        : ('draft_only' as const),
    })),
    workflowSummary: {
      entryId: toStringId(source.entryId),
      collection: collection.slug,
      primaryLocale: readiness.primaryLocale,
      workStatesByLocale,
      readinessStatesByLocale,
      issueCounts,
      missingLocales,
      publishedLocales,
      nextAction,
    },
    nextAction:
      blockingIssueCount > 0
        ? 'Resolve readiness issues'
        : missingLocales.length > 0
          ? 'Complete translations'
          : draftChangedSincePublish
            ? 'Preview website changes'
            : 'Verify public output',
  }
}

export async function buildEntrySummary(
  ctx: HandlerQueryCtx,
  row: StudioEntryRowDoc,
  collection: CmsCollection,
) {
  const readiness = await computeEntryReadinessSummary(ctx, { entryId: toStringId(row.entryId) })
  return entrySummaryFromReadiness(
    {
      entryId: row.entryId,
      title: entryTitle(row),
      slug: row.baseSlug,
      path: row.path,
      status: row.status,
      nodeKind: row.nodeKind,
      parentEntryId: row.parentEntryId,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
    },
    collection,
    readiness,
  )
}

export async function buildIndexedEntrySummary(
  ctx: HandlerQueryCtx,
  entry: EntryDoc,
  searchRow: Doc<'draftSearchEntries'>,
  collection: CmsCollection,
  source?: {
    appIdentity?: Awaited<ReturnType<HandlerQueryCtx['appIdentity']>>
    settings?: Awaited<ReturnType<typeof getCmsSettings>>
  },
) {
  const readiness = await computeEntryReadinessSummary(ctx, {
    entryId: toStringId(entry._id),
    source: { ...source, entry, collection },
  })
  const preferredLocale =
    readiness.locales.find((locale) => locale.locale === readiness.primaryLocale) ??
    readiness.locales[0]
  return entrySummaryFromReadiness(
    {
      entryId: entry._id,
      title: searchRow.title,
      slug: searchRow.slug,
      path: preferredLocale?.draftUrl ?? searchRow.slug,
      status: studioEntryStatus(entry),
      nodeKind: entry.nodeKind ?? 'page',
      parentEntryId: entry.parentEntryId,
      updatedAt: entry.updatedAt,
      publishedAt: entry.activePublications.length
        ? Math.max(...entry.activePublications.map((publication) => publication.activatedAt))
        : null,
    },
    collection,
    readiness,
  )
}

export type EntrySummary = Awaited<ReturnType<typeof buildEntrySummary>>

export function summaryQueueKinds(entry: EntrySummary) {
  const kinds: Array<'changed' | 'needs_attention' | 'missing_translation'> = []
  if (entry.status !== 'archived' && entry.draftChangedSincePublish) {
    kinds.push('changed')
  }
  if (entry.status !== 'archived' && entry.workflowSummary.issueCounts.blocker > 0) {
    kinds.push('needs_attention')
  }
  if (entry.status !== 'archived' && entry.workflowSummary.missingLocales.length > 0) {
    kinds.push('missing_translation')
  }
  return kinds
}

export function summaryMatchesWorkState(
  entry: EntrySummary,
  workState: 'all' | 'changed' | 'needs_attention' | 'missing_translation' | undefined,
) {
  if (!workState || workState === 'all') return true
  return summaryQueueKinds(entry).includes(workState)
}

export function attachSummaryAccess(
  appIdentity: Parameters<typeof attachEntryRecordAccess>[0],
  summaries: EntrySummary[],
) {
  return attachEntryRecordAccess(appIdentity, summaries)
}
