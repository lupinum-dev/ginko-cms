import {
  createReadinessAction,
  createReadinessIssue,
  type AffectedPublicUrl,
  type EntryReadinessDetail,
  type EntryReadinessLocale,
  type ReadinessAction,
  type ReadinessActionKind,
  type ReadinessIssue,
  type ReadinessIssueCode,
  type ReadinessState,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'

import type { Doc } from '../_generated/dataModel.js'
import { can, canArchiveEntries, canEditEntries, canPublishEntries } from '../auth/checks.js'
import { previewPublishImpactForEntry } from '../diagnostics.js'
import { getCollectionMode, isRouteBackedCollection } from '../lib/collections.js'
import { isEqualJsonValue } from '../lib/data.js'
import { toStringId } from '../lib/ids.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import { getCmsSettings } from '../lib/locale.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import { collectPublishRequiredFieldIssues } from '../lib/validation.js'
import { exactReviewStaleState } from '../reviewRequests.js'
import { getCollectionForEntry, getEntryOrThrow, readStudioDraftView } from './context.js'
import { readDraftRows } from './workflow/drafts.js'
import { buildPublicProjectionFromRevisionSnapshot } from './workflow/projectionBuild.js'
import { publicPathForEntry } from './workflow/publicTree.js'

function configuredReadinessLocales(args: {
  collection: CmsCollection
  settings: Awaited<ReturnType<typeof getCmsSettings>>
}) {
  const settingsLocales = args.settings?.locales ?? []
  const configured = settingsLocales
    .map((locale) => locale.code)
    .filter((locale) => args.collection.locales.includes(locale))
  for (const locale of args.collection.locales) {
    if (!configured.includes(locale)) configured.push(locale)
  }
  if (configured.length > 0) return configured
  return args.collection.locales.length ? args.collection.locales : ['en']
}

function primaryReadinessLocale(args: {
  locales: string[]
  settings: Awaited<ReturnType<typeof getCmsSettings>>
}) {
  const defaultLocale = args.settings?.locales?.find((locale) => locale.isDefault)?.code
  if (defaultLocale && args.locales.includes(defaultLocale)) return defaultLocale
  return args.locales[0] ?? 'en'
}

function isMeaningfulDraftData(args: {
  draftValues: Record<string, unknown>
  shared: Record<string, unknown>
  bodyMdc: string | null | undefined
}) {
  return (
    Object.keys(args.draftValues).length > 0 ||
    Object.keys(args.shared).length > 0 ||
    !!args.bodyMdc?.trim()
  )
}

function readinessIssue(args: {
  code: ReadinessIssueCode
  severity: 'blocker' | 'warning' | 'info'
  locale: string | null
  fieldPath?: string | null
  params?: Record<string, unknown>
}) {
  return createReadinessIssue({
    code: args.code,
    severity: args.severity,
    locale: args.locale,
    fieldPath: args.fieldPath ?? null,
    messageParams: args.params,
    diagnosticId: null,
  })
}

function dedupeIssues(issues: ReadinessIssue[]) {
  const seen = new Set<string>()
  const result: ReadinessIssue[] = []
  for (const issue of issues) {
    const key = `${issue.code}:${issue.severity}:${issue.locale ?? ''}:${issue.fieldPath ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result
}

function requiredFieldIssues(args: {
  collection: CmsCollection
  locale: string
  shared: Record<string, unknown>
  values: Record<string, unknown>
  data: Record<string, unknown>
}) {
  const dataOnly = getCollectionMode(args.collection) === 'none'
  return collectPublishRequiredFieldIssues({
    collection: args.collection,
    localizedValues: args.values,
    sharedValues: args.shared,
    data: args.data,
  }).map((error) =>
    readinessIssue({
      code: dataOnly
        ? 'data_only_required_field_missing'
        : error.scope === 'localized'
          ? 'required_localized_field_missing'
          : 'required_shared_field_missing',
      severity: 'blocker',
      locale: dataOnly || error.scope === 'localized' ? args.locale : null,
      fieldPath: error.field,
    }),
  )
}

function visibilityDiagnosticIssueCode(code: string): ReadinessIssueCode {
  switch (code) {
    case 'missing_locale_route':
      return 'locale_missing'
    case 'missing_parent_route':
      return 'route_parent_not_public'
    case 'missing_required_localized_field':
      return 'required_localized_field_missing'
    case 'route_collision':
      return 'route_collision'
    case 'broken_relation':
      return 'relation_target_missing'
    default:
      return 'projection_rebuild_failed'
  }
}

function issueFromVisibilityDiagnostic(args: {
  diagnostic: {
    code: string
    severity: string
    locale?: string | null
    details?: { fields?: string[]; relationField?: string | null } | null
  }
  fallbackLocale: string
}) {
  const fieldPath =
    args.diagnostic.details?.fields?.[0] ?? args.diagnostic.details?.relationField ?? null
  return readinessIssue({
    code: visibilityDiagnosticIssueCode(args.diagnostic.code),
    severity: args.diagnostic.severity === 'error' ? 'blocker' : 'warning',
    locale: args.diagnostic.locale ?? args.fallbackLocale,
    fieldPath,
  })
}

function affectedCurrentEntryUrl(args: {
  entryId: string
  locale: string
  currentPath: string | null
  nextPath: string | null
  currentHref: string | null
  nextHref: string | null
}): AffectedPublicUrl | null {
  if (!args.currentHref && !args.nextHref && !args.currentPath && !args.nextPath) return null
  return {
    entryId: args.entryId,
    locale: args.locale,
    kind: 'current_entry',
    beforePath: args.currentPath,
    afterPath: args.nextPath,
    beforeHref: args.currentHref,
    afterHref: args.nextHref,
    reason:
      args.currentHref && args.nextHref && args.currentHref !== args.nextHref
        ? 'route_changed'
        : 'publish',
  }
}

function readinessAction(args: {
  kind: ReadinessActionKind
  locale: string | null
  target: ReadinessAction['target']
  params?: Record<string, unknown>
}) {
  return createReadinessAction({
    kind: args.kind,
    locale: args.locale,
    target: args.target,
    params: args.params,
  })
}

async function detectAssetMetadataStale(
  ctx: HandlerQueryCtx,
  args: {
    collection: CmsCollection
    entry: Awaited<ReturnType<typeof getEntryOrThrow>>
    locale: string
    publicRow: Doc<'publicEntries'>
  },
) {
  const revision = await ctx.db.get(args.publicRow.revisionId)
  const localeSnapshot = revision?.snapshots[args.locale] ?? null
  if (!revision || !localeSnapshot) return false
  const publicPath = await publicPathForEntry(ctx, args.publicRow, {
    pathPrefix: pathPrefixForLocale(args.collection, args.locale),
    rootSlug: rootSlugForLocale(args.collection, args.locale),
  })
  if (!publicPath) return false
  const rebuilt = await buildPublicProjectionFromRevisionSnapshot(ctx, {
    entry: args.entry,
    collection: args.collection,
    revisionId: revision._id,
    locale: args.locale,
    localeSnapshot,
    publicPath,
    now: args.publicRow.lastPublishedAt,
  })
  return !isEqualJsonValue(rebuilt.input.data, args.publicRow.data)
}

function chooseNextReadinessAction(args: {
  locale: string
  state: ReadinessState
  blockers: ReadinessIssue[]
  canPublish: boolean
  canRequestReview: boolean
}) {
  const firstBlocker = args.blockers[0]
  if (firstBlocker) {
    if (firstBlocker.code === 'required_localized_field_missing') {
      return readinessAction({
        kind: 'fill_required_localized_field',
        locale: args.locale,
        target: 'field',
        params: firstBlocker.fieldPath ? { fieldPath: firstBlocker.fieldPath } : {},
      })
    }
    if (firstBlocker.code === 'required_shared_field_missing') {
      return readinessAction({
        kind: 'fill_required_shared_field',
        locale: null,
        target: 'field',
        params: firstBlocker.fieldPath ? { fieldPath: firstBlocker.fieldPath } : {},
      })
    }
    if (firstBlocker.code === 'data_only_required_field_missing') {
      return readinessAction({
        kind: 'fill_required_field',
        locale: args.locale,
        target: 'field',
        params: firstBlocker.fieldPath ? { fieldPath: firstBlocker.fieldPath } : {},
      })
    }
    if (firstBlocker.code === 'route_collision') {
      return readinessAction({
        kind: 'resolve_route_collision',
        locale: args.locale,
        target: 'route',
      })
    }
    return readinessAction({ kind: 'continue_editing', locale: args.locale, target: 'editor' })
  }

  if (args.state === 'missing') {
    return readinessAction({ kind: 'add_locale', locale: args.locale, target: 'locale' })
  }
  if (args.state === 'in_review') {
    return readinessAction({ kind: 'open_review', locale: args.locale, target: 'review' })
  }
  if (args.state === 'live') {
    return readinessAction({ kind: 'view_public_page', locale: args.locale, target: 'publish' })
  }
  if (args.canPublish) {
    return readinessAction({ kind: 'publish_locale', locale: args.locale, target: 'publish' })
  }
  if (args.canRequestReview) {
    return readinessAction({ kind: 'request_review', locale: args.locale, target: 'review' })
  }
  return readinessAction({ kind: 'continue_editing', locale: args.locale, target: 'editor' })
}

async function readActiveReviewRequests(ctx: HandlerQueryCtx, entryId: string) {
  return await ctx.db
    .query('reviewRequests')
    .withIndex('by_entry', (q) => q.eq('entryId', entryId))
    .filter((q) => q.eq(q.field('status'), 'pending'))
    .collect()
}

async function computeEntryReadiness(
  ctx: HandlerQueryCtx,
  args: { entryId: string; exact: boolean },
): Promise<EntryReadinessDetail> {
  const appIdentity = await ctx.appIdentity()
  const entry = await getEntryOrThrow(ctx, args.entryId)
  const collection = await getCollectionForEntry(ctx, entry)
  const [settings, draftRows, draftView, publicRows, reviewRequests] = await Promise.all([
    getCmsSettings(ctx),
    readDraftRows(ctx, entry._id),
    readStudioDraftView(ctx, entry, collection),
    ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
      .collect(),
    readActiveReviewRequests(ctx, args.entryId),
  ])
  const publicByLocale = new Map(publicRows.map((row) => [row.locale, row]))
  const configuredLocales = configuredReadinessLocales({ collection, settings })
  const primaryLocale = primaryReadinessLocale({ locales: configuredLocales, settings })
  const canPublishEntriesNow = can(appIdentity, canPublishEntries)
  const canEditEntriesNow = can(appIdentity, canEditEntries)
  const canArchiveEntriesNow = can(appIdentity, canArchiveEntries)
  const routeBacked = isRouteBackedCollection(collection)
  const publishImpact =
    routeBacked && args.exact
      ? await previewPublishImpactForEntry(ctx, {
          collection: collection.slug,
          entryId: args.entryId,
          locales: configuredLocales,
        })
      : null
  const impactByLocale = new Map((publishImpact?.locales ?? []).map((item) => [item.locale, item]))

  const locales: EntryReadinessLocale[] = []
  for (const locale of configuredLocales) {
    const localeDraftRow = draftRows.byLocale[locale] ?? null
    const draftLocale = draftView.locales.find((item) => item.locale === locale) ?? null
    const publicRow = publicByLocale.get(locale) ?? null
    const published = !!publicRow
    const draftExists = !!localeDraftRow
    const blockers: ReadinessIssue[] = []
    const warnings: ReadinessIssue[] = []
    const infos: ReadinessIssue[] = []
    let draftUrl: string | null = routeBacked && draftLocale ? draftLocale.draftPath : null
    let publicUrl: string | null = publicRow
      ? await publicPathForEntry(ctx, publicRow, {
          pathPrefix: pathPrefixForLocale(collection, locale),
          rootSlug: rootSlugForLocale(collection, locale),
        })
      : null
    const affectedPublicUrls: AffectedPublicUrl[] = []
    let impactStatus: string | null = null
    let assetMetadataStale = false

    if (entry.lifecycle === 'archived') {
      blockers.push(
        readinessIssue({
          code: 'entry_archived',
          severity: 'blocker',
          locale,
        }),
      )
    }

    if (draftExists && draftLocale) {
      blockers.push(
        ...requiredFieldIssues({
          collection,
          locale,
          shared: draftView.shared,
          values: draftLocale.draft.values,
          data: draftLocale.data,
        }),
      )
    }

    if (routeBacked && (draftExists || published)) {
      const localeImpact = impactByLocale.get(locale) ?? null
      if (localeImpact) {
        impactStatus = localeImpact.status
        draftUrl = localeImpact.nextHref ?? draftUrl
        publicUrl = localeImpact.currentHref ?? publicUrl
        blockers.push(
          ...localeImpact.blockingDiagnostics.map((diagnostic) =>
            issueFromVisibilityDiagnostic({ diagnostic, fallbackLocale: locale }),
          ),
        )
        warnings.push(
          ...localeImpact.warnings.map((diagnostic) =>
            issueFromVisibilityDiagnostic({ diagnostic, fallbackLocale: locale }),
          ),
        )
        const affected = affectedCurrentEntryUrl({
          entryId: args.entryId,
          locale,
          currentPath: localeImpact.currentPath,
          nextPath: localeImpact.nextPath,
          currentHref: localeImpact.currentHref,
          nextHref: localeImpact.nextHref,
        })
        if (affected && localeImpact.status !== 'no_changes') affectedPublicUrls.push(affected)
      }
    }

    if (args.exact && published && publicRow) {
      assetMetadataStale = await detectAssetMetadataStale(ctx, {
        collection,
        entry,
        locale,
        publicRow,
      })
      if (assetMetadataStale) {
        warnings.push(
          readinessIssue({
            code: 'asset_metadata_stale',
            severity: 'warning',
            locale,
            params: { model: 'publish_time_snapshot' },
          }),
        )
      }
    }

    const cleanBlockers = dedupeIssues(blockers)
    const matchingReviewCandidate =
      reviewRequests.find(
        (request) =>
          request.locales.includes(locale) &&
          request.expectedVersion === entry.draftVersion &&
          request.status === 'pending',
      ) ?? null
    const activePublication = entry.activePublications.find(
      (publication) => publication.locale === locale,
    )
    const hasUnpublishedChanges =
      draftExists &&
      (!published ||
        !activePublication ||
        activePublication.sharedVersion !== entry.sharedVersion ||
        activePublication.localeVersion !== localeDraftRow?.version ||
        (!!draftLocale && !isEqualJsonValue(draftLocale.data, draftLocale.publishedData)) ||
        assetMetadataStale)
    const meaningfulDraft = draftLocale
      ? isMeaningfulDraftData({
          draftValues: draftLocale.draft.values,
          shared: draftView.shared,
          bodyMdc: draftLocale.draft.bodyMdc,
        })
      : false
    const publishable =
      draftExists &&
      cleanBlockers.length === 0 &&
      (routeBacked && args.exact
        ? impactStatus === 'ready' || impactStatus === 'no_changes'
        : meaningfulDraft)
    let matchingReview = matchingReviewCandidate
    if (args.exact && matchingReviewCandidate && publishable) {
      const stale = await exactReviewStaleState(ctx, matchingReviewCandidate)
      if (stale.isStale) {
        warnings.push(
          readinessIssue({
            code: 'review_preview_stale',
            severity: 'warning',
            locale,
            params: stale.staleReason ? { reason: stale.staleReason } : {},
          }),
        )
        matchingReview = null
      }
    }
    const cleanWarnings = dedupeIssues(warnings)

    let state: ReadinessState
    if (!draftExists && !published) {
      state = 'missing'
    } else if (cleanBlockers.length > 0) {
      state = 'needs_work'
    } else if (matchingReview && publishable && hasUnpublishedChanges) {
      state = 'in_review'
    } else if (published && !hasUnpublishedChanges) {
      state = 'live'
    } else if (published && hasUnpublishedChanges && publishable) {
      state = 'live_with_changes'
    } else if (!published && publishable) {
      state = 'ready'
    } else {
      state = 'draft'
    }

    const canPreview = draftExists && state !== 'missing'
    const canRequestReview =
      canEditEntriesNow && draftExists && cleanBlockers.length === 0 && state !== 'in_review'
    const canPublish =
      canPublishEntriesNow &&
      cleanBlockers.length === 0 &&
      (state === 'ready' || state === 'live_with_changes')
    const canArchive = canArchiveEntriesNow && entry.lifecycle !== 'archived'
    const nextAction = chooseNextReadinessAction({
      locale,
      state,
      blockers: cleanBlockers,
      canPublish,
      canRequestReview,
    })

    locales.push({
      locale,
      state,
      blockers: cleanBlockers,
      warnings: cleanWarnings,
      infos,
      nextAction,
      draftExists,
      published,
      hasUnpublishedChanges,
      canPreview,
      canRequestReview,
      canPublish,
      canArchive,
      publicUrl,
      draftUrl: routeBacked ? draftUrl : null,
      affectedPublicUrls,
      reviewRequestId: matchingReview ? toStringId(matchingReview._id) : null,
      currentDraftVersion: draftExists ? entry.draftVersion : null,
      currentPublishedRevisionId: publicRow?.revisionId ? toStringId(publicRow.revisionId) : null,
    })
  }

  return {
    entryId: args.entryId,
    collection: collection.slug,
    primaryLocale,
    locales,
    updatedAt: Date.now(),
  }
}

export async function computeEntryReadinessSummary(
  ctx: HandlerQueryCtx,
  args: { entryId: string },
): Promise<EntryReadinessDetail> {
  return await computeEntryReadiness(ctx, { entryId: args.entryId, exact: false })
}

export async function computeEntryReadinessDetail(
  ctx: HandlerQueryCtx,
  args: { entryId: string },
): Promise<EntryReadinessDetail> {
  return await computeEntryReadiness(ctx, { entryId: args.entryId, exact: true })
}
