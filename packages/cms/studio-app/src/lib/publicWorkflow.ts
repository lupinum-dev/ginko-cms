import type {
  EntryReadinessDetail,
  EntryReadinessLocale,
  ReadinessActionKind,
  ReadinessAction,
  ReadinessIssue,
  ReadinessIssueCode,
  ReadinessState,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'

export type CollectionCapabilityMode = 'route' | 'none'
export type StudioPublicState = 'public' | 'draft_only' | 'needs_attention' | 'data_only'
export type StudioWorkflowTranslator = (
  key: string,
  params?: Record<string, unknown>,
  defaultValue?: string,
) => string

export type StudioWorkQueueCounts = {
  needsAttention?: number | null
  changedDrafts?: number | null
  missingTranslations?: number | null
  failedRevalidation?: number | null
  pendingRevalidation?: number | null
}

export type WebsiteRefreshStatus = 'pending' | 'delivering' | 'delivered' | 'failed'

export type WebsiteRefreshSummaryInput = {
  status: WebsiteRefreshStatus | string
  paths?: string[] | null
  lastError?: string | null
}

export type DashboardCollectionSummaryInput = {
  mode?: CollectionCapabilityMode | null
  entryCount?: number | null
  locales?: string[] | null
}

export function deriveDashboardCollectionSummary(collections: DashboardCollectionSummaryInput[]) {
  return collections.reduce(
    (summary, collection) => {
      const entryCount =
        typeof collection.entryCount === 'number' && Number.isFinite(collection.entryCount)
          ? collection.entryCount
          : 0
      summary.totalCollections += 1
      summary.totalEntries += entryCount
      if (collection.mode === 'none') {
        summary.dataOnlyCollections += 1
      } else {
        summary.routeBackedCollections += 1
      }
      if (collection.locales?.length) {
        summary.localizedCollections += 1
      }
      return summary
    },
    {
      totalCollections: 0,
      routeBackedCollections: 0,
      dataOnlyCollections: 0,
      localizedCollections: 0,
      totalEntries: 0,
    },
  )
}

function countValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function deriveStudioWorkQueueSummary(counts: StudioWorkQueueCounts) {
  const changedDrafts = countValue(counts.changedDrafts)
  const missingTranslations = countValue(counts.missingTranslations)
  const failedRevalidation = countValue(counts.failedRevalidation)
  const pendingRevalidation = countValue(counts.pendingRevalidation)
  const needsAttention =
    countValue(counts.needsAttention) || missingTranslations + failedRevalidation

  return {
    needsAttention,
    changedDrafts,
    missingTranslations,
    failedRevalidation,
    pendingRevalidation,
    healthy: needsAttention === 0 && failedRevalidation === 0,
  }
}

function translate(
  t: StudioWorkflowTranslator,
  key: string,
  params?: Record<string, unknown>,
  fallback = 'Unavailable',
): string {
  const value = t(key, params, fallback)
  return value === key ? fallback : value
}

export function publicStateLabel(t: StudioWorkflowTranslator, state: StudioPublicState): string {
  return translate(t, `ginkoCms.studio.workflow.publicState.${state}`, undefined, 'Status unknown')
}

export function publicStateTone(
  state: StudioPublicState,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (state === 'public') return 'success'
  if (state === 'needs_attention') return 'danger'
  if (state === 'draft_only') return 'warning'
  return 'neutral'
}

export function websiteRefreshStatusLabel(
  t: StudioWorkflowTranslator,
  status: WebsiteRefreshStatus | string,
): string {
  const normalized: WebsiteRefreshStatus =
    status === 'delivering' || status === 'delivered' || status === 'failed' ? status : 'pending'
  return translate(
    t,
    `ginkoCms.studio.workflow.websiteRefresh.${normalized}`,
    undefined,
    'Website refresh pending',
  )
}

export function websiteRefreshStatusMessage(
  t: StudioWorkflowTranslator,
  job: WebsiteRefreshSummaryInput,
): string {
  if (job.status === 'failed' && job.lastError) return job.lastError
  const paths = Array.isArray(job.paths) ? job.paths.filter(Boolean) : []
  return paths.length
    ? paths.join(', ')
    : translate(
        t,
        'ginkoCms.studio.workflow.websiteRefresh.noAffectedPages',
        undefined,
        'No affected pages recorded',
      )
}

export type PreviewResultStatus = 'ready' | 'blocked' | 'no_changes' | 'not_publishable'
export type PublishPreviewPanelState =
  | 'idle'
  | 'pending'
  | 'ready'
  | 'blocked'
  | 'no_changes'
  | 'not_publishable'
  | 'stale'
  | 'error'
  | 'missing'
  | 'failed'

export type PublishPreviewState =
  | 'not_previewed'
  | 'pending'
  | 'ready'
  | 'blocked'
  | 'failed'
  | 'stale'
  | 'expired'

export interface PublishConfirmationState {
  canConfirm: boolean
  disabledReason: string | null
  token: string | null
  expiresAt: number | null
}

export function readinessStateLabel(
  t: StudioWorkflowTranslator,
  state: ReadinessState | string | null | undefined,
): string {
  if (!state) return translate(t, 'ginkoCms.studio.workflow.states.unknown', undefined, 'Unknown')
  return translate(
    t,
    `ginkoCms.studio.workflow.states.${state}`,
    undefined,
    translate(t, 'ginkoCms.studio.workflow.states.unknown', undefined, 'Unknown'),
  )
}

// Tone comes from the STATE CODE, never from the localized label — label
// comparisons broke in any non-English Studio. Blockers override everything;
// plain drafts are a normal state, not a problem, so they render neutral.
export function readinessStateTone(
  state: ReadinessState | string | null | undefined,
  options?: { blocked?: boolean },
): 'success' | 'warning' | 'info' | 'neutral' {
  if (options?.blocked) return 'warning'
  switch (state) {
    case 'live':
    case 'live_with_changes':
    case 'ready':
      return 'success'
    case 'needs_work':
    case 'missing':
      return 'warning'
    case 'in_review':
      return 'info'
    default:
      return 'neutral'
  }
}

export function readinessActionLabel(
  t: StudioWorkflowTranslator,
  kind: ReadinessActionKind | string | null | undefined,
): string {
  if (!kind) {
    return translate(
      t,
      'ginkoCms.studio.workflow.actions.continue_editing',
      undefined,
      'Continue writing',
    )
  }
  return translate(
    t,
    `ginkoCms.studio.workflow.actions.${kind}`,
    undefined,
    translate(
      t,
      'ginkoCms.studio.workflow.actions.continue_editing',
      undefined,
      'Continue writing',
    ),
  )
}

export function readinessIssueLabel(
  t: StudioWorkflowTranslator,
  code: ReadinessIssueCode | string | null | undefined,
): string {
  if (!code) {
    return translate(
      t,
      'ginkoCms.studio.workflow.issues.unknown',
      undefined,
      'Publish status issue',
    )
  }
  return translate(
    t,
    `ginkoCms.studio.workflow.issues.${code}`,
    undefined,
    translate(t, 'ginkoCms.studio.workflow.issues.unknown', undefined, 'Publish status issue'),
  )
}

export function readinessIssueMessage(
  t: StudioWorkflowTranslator,
  issue: {
    code: string
    fieldPath?: string | null
    messageParams?: Record<string, unknown> | null
  },
): string {
  const label = readinessIssueLabel(t, issue.code)
  const fieldPath =
    issue.fieldPath ??
    (typeof issue.messageParams?.fieldPath === 'string' ? issue.messageParams.fieldPath : null)
  return fieldPath ? `${label}: ${fieldPath}` : label
}

export interface StudioReadinessLanguageRow {
  locale: string
  label: string
  state: string
  status: string
  blocked: boolean
  draftExists: boolean
  published: boolean
  hasUnpublishedChanges: boolean
  publicUrl: string | null
  draftUrl: string | null
  canPreview: boolean
  canRequestReview: boolean
  canPublish: boolean
  nextAction: ReadinessAction
}

export interface StudioEntryReadinessView {
  currentLocale: EntryReadinessLocale | null
  languageRows: StudioReadinessLanguageRow[]
  publicUrl: string | null
  draftUrl: string | null
  blockers: ReadinessIssue[]
  warnings: ReadinessIssue[]
  nextAction: ReadinessAction | null
  canPreview: boolean
  canRequestReview: boolean
  canPublish: boolean
  publishLocales: string[]
  missing: boolean
}

export function mapEntryReadinessDetail(input: {
  readinessDetail: EntryReadinessDetail | null | undefined
  currentLocale: string
  t: StudioWorkflowTranslator
  publishMode?: 'single' | 'all'
}): StudioEntryReadinessView {
  const detail = input.readinessDetail ?? null
  if (!detail) {
    return {
      currentLocale: null,
      languageRows: [],
      publicUrl: null,
      draftUrl: null,
      blockers: [],
      warnings: [],
      nextAction: null,
      canPreview: false,
      canRequestReview: false,
      canPublish: false,
      publishLocales: [],
      missing: true,
    }
  }

  const currentLocale =
    detail.locales.find((row) => row.locale === input.currentLocale) ?? detail.locales[0] ?? null
  const selectedRows =
    input.publishMode === 'all' ? detail.locales : currentLocale ? [currentLocale] : []
  const actionableRows = selectedRows.filter(
    (row) => row.canPreview || row.canRequestReview || row.canPublish,
  )

  return {
    currentLocale,
    languageRows: detail.locales.map((row) => ({
      locale: row.locale,
      label: row.locale.toUpperCase(),
      state: row.state,
      status: readinessStateLabel(input.t, row.state),
      blocked: row.blockers.length > 0,
      draftExists: row.draftExists,
      published: row.published,
      hasUnpublishedChanges: row.hasUnpublishedChanges,
      publicUrl: row.publicUrl,
      draftUrl: row.draftUrl,
      canPreview: row.canPreview,
      canRequestReview: row.canRequestReview,
      canPublish: row.canPublish,
      nextAction: row.nextAction,
    })),
    publicUrl: currentLocale?.publicUrl ?? null,
    draftUrl: currentLocale?.draftUrl ?? null,
    blockers: selectedRows.flatMap((row) => row.blockers),
    warnings: selectedRows.flatMap((row) => row.warnings),
    nextAction: currentLocale?.nextAction ?? null,
    canPreview:
      input.publishMode === 'all'
        ? actionableRows.some((row) => row.canPreview)
        : Boolean(currentLocale?.canPreview),
    canRequestReview:
      input.publishMode === 'all'
        ? actionableRows.some((row) => row.canRequestReview)
        : Boolean(currentLocale?.canRequestReview),
    canPublish:
      input.publishMode === 'all'
        ? actionableRows.some((row) => row.canPublish)
        : Boolean(currentLocale?.canPublish),
    publishLocales:
      input.publishMode === 'all'
        ? detail.locales.filter((row) => row.canPublish).map((row) => row.locale)
        : currentLocale?.canPublish
          ? [currentLocale.locale]
          : [],
    missing: false,
  }
}

export interface PublishOperationPreviewInput {
  allowed: boolean
  summary?: string | null
  blockers?: Array<{ message: string }>
  warnings?: Array<{ message: string }>
  confirmation?: { token?: string | null; expiresAt?: number | null } | null
  details?: unknown
}

export function deriveCapabilityWarnings(input: {
  mode: CollectionCapabilityMode
  pathPrefix: string
  locales: string[]
  t: StudioWorkflowTranslator
}) {
  const warnings: string[] = []
  const pathPrefix = input.pathPrefix.trim()
  if (input.mode === 'route') {
    if (!pathPrefix) {
      warnings.push(
        translate(
          input.t,
          'ginkoCms.studio.workflow.capabilityWarnings.routePrefixMissing',
          undefined,
          'Website page collections should define a URL prefix before publishing pages.',
        ),
      )
    }
    if (input.locales.length === 0) {
      warnings.push(
        translate(
          input.t,
          'ginkoCms.studio.workflow.capabilityWarnings.routeLocalesMissing',
          undefined,
          'Website page collections need at least one language for URL checks.',
        ),
      )
    }
  }
  if (input.mode === 'none' && pathPrefix && pathPrefix !== '/') {
    warnings.push(
      translate(
        input.t,
        'ginkoCms.studio.workflow.capabilityWarnings.dataOnlyRoutePrefix',
        undefined,
        'Shared data collections ignore URL checks; clear the page-looking prefix.',
      ),
    )
  }
  return warnings
}

export function mapPreviewPanelState(status: PreviewResultStatus): PublishPreviewPanelState {
  if (status === 'ready') return 'ready'
  if (status === 'blocked') return 'blocked'
  if (status === 'no_changes') return 'no_changes'
  return 'not_publishable'
}

export function derivePublishOperationPreviewState(input: {
  preview: PublishOperationPreviewInput | null
  locales: string[]
  t: StudioWorkflowTranslator
  now?: number
  staleReason?: string | null
}): {
  state: PublishPreviewState
  message: string
  confirmationToken: string | null
  confirmationExpiresAt: number | null
  locales: string[]
  renderablePreviewDetails: unknown
} {
  if (input.staleReason) {
    return {
      state: 'stale',
      message: input.staleReason,
      confirmationToken: null,
      confirmationExpiresAt: null,
      locales: [],
      renderablePreviewDetails: input.preview?.details ?? null,
    }
  }
  const preview = input.preview
  if (!preview) {
    return {
      state: 'failed',
      message: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.prepareFailed',
        undefined,
        'We could not prepare the website preview. Try again.',
      ),
      confirmationToken: null,
      confirmationExpiresAt: null,
      locales: [],
      renderablePreviewDetails: null,
    }
  }
  const blocked = preview.allowed === false || Boolean(preview.blockers?.length)
  const message =
    preview.blockers?.[0]?.message ??
    preview.warnings?.[0]?.message ??
    preview.summary ??
    translate(
      input.t,
      'ginkoCms.studio.workflow.preview.ready',
      undefined,
      'Publish preview is ready.',
    )
  if (blocked) {
    return {
      state: 'blocked',
      message,
      confirmationToken: null,
      confirmationExpiresAt: null,
      locales: [],
      renderablePreviewDetails: preview.details ?? null,
    }
  }
  const token = preview.confirmation?.token ?? null
  const expiresAt = preview.confirmation?.expiresAt ?? null
  if (!token) {
    return {
      state: 'failed',
      message: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.refreshBeforePublishing',
        undefined,
        'Preview website changes again before publishing.',
      ),
      confirmationToken: null,
      confirmationExpiresAt: null,
      locales: [],
      renderablePreviewDetails: preview.details ?? null,
    }
  }
  if (expiresAt && expiresAt <= (input.now ?? Date.now())) {
    return {
      state: 'expired',
      message: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.expired',
        undefined,
        'The preview expired. Preview website changes again before publishing.',
      ),
      confirmationToken: null,
      confirmationExpiresAt: expiresAt,
      locales: [],
      renderablePreviewDetails: preview.details ?? null,
    }
  }
  return {
    state: 'ready',
    message,
    confirmationToken: token,
    confirmationExpiresAt: expiresAt,
    locales: input.locales,
    renderablePreviewDetails: preview.details ?? null,
  }
}

export function derivePublishConfirmationState(input: {
  readinessState: PublishPreviewState
  t: StudioWorkflowTranslator
  confirmationToken?: string | null
  confirmationExpiresAt?: number | null
  now?: number
}): PublishConfirmationState {
  const token = input.confirmationToken ?? null
  const expiresAt = input.confirmationExpiresAt ?? null
  if (input.readinessState === 'ready') {
    if (!input.confirmationToken) {
      return {
        canConfirm: false,
        disabledReason: translate(
          input.t,
          'ginkoCms.studio.workflow.preview.refreshBeforePublishing',
          undefined,
          'Preview website changes again before publishing.',
        ),
        token: null,
        expiresAt,
      }
    }
    if (input.confirmationExpiresAt && input.confirmationExpiresAt <= (input.now ?? Date.now())) {
      return {
        canConfirm: false,
        disabledReason: translate(
          input.t,
          'ginkoCms.studio.workflow.preview.expired',
          undefined,
          'The preview expired. Preview website changes again before publishing.',
        ),
        token: null,
        expiresAt,
      }
    }
    return { canConfirm: true, disabledReason: null, token, expiresAt }
  }
  if (input.readinessState === 'not_previewed') {
    return {
      canConfirm: false,
      disabledReason: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.previewFirst',
        undefined,
        'Preview website changes before publishing.',
      ),
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'pending') {
    return {
      canConfirm: false,
      disabledReason: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.loading',
        undefined,
        'Website changes preview is still loading.',
      ),
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'stale') {
    return {
      canConfirm: false,
      disabledReason: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.stale',
        undefined,
        'This draft changed since the preview. Preview website changes again.',
      ),
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'failed') {
    return {
      canConfirm: false,
      disabledReason: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.failed',
        undefined,
        'We could not prepare the website preview. Fix the issue and try again.',
      ),
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'expired') {
    return {
      canConfirm: false,
      disabledReason: translate(
        input.t,
        'ginkoCms.studio.workflow.preview.expired',
        undefined,
        'The preview expired. Preview website changes again before publishing.',
      ),
      token: null,
      expiresAt,
    }
  }
  return {
    canConfirm: false,
    disabledReason: translate(
      input.t,
      'ginkoCms.studio.workflow.preview.blocked',
      undefined,
      'Website changes preview is blocked.',
    ),
    token: null,
    expiresAt,
  }
}
