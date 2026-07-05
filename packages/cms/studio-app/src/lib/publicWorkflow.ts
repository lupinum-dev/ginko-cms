export type CollectionCapabilityMode = 'route' | 'none'
export type StudioPublicState = 'public' | 'draft_only' | 'needs_attention' | 'data_only'

export type StudioWorkQueueCounts = {
  needsAttention?: number | null
  changedDrafts?: number | null
  missingTranslations?: number | null
  failedRevalidation?: number | null
  importBlockers?: number | null
  pendingRevalidation?: number | null
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
  const importBlockers = countValue(counts.importBlockers)
  const pendingRevalidation = countValue(counts.pendingRevalidation)
  const needsAttention =
    countValue(counts.needsAttention) || missingTranslations + failedRevalidation + importBlockers

  return {
    needsAttention,
    changedDrafts,
    missingTranslations,
    failedRevalidation,
    importBlockers,
    pendingRevalidation,
    healthy: needsAttention === 0 && failedRevalidation === 0 && importBlockers === 0,
  }
}

export function publicStateLabel(state: StudioPublicState): string {
  if (state === 'public') return 'Public'
  if (state === 'data_only') return 'Data-only'
  if (state === 'needs_attention') return 'Needs attention'
  return 'Draft only'
}

export function publicStateTone(
  state: StudioPublicState,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (state === 'public') return 'success'
  if (state === 'needs_attention') return 'danger'
  if (state === 'draft_only') return 'warning'
  return 'neutral'
}

export function deriveEntryNextAction(input: {
  publicState: StudioPublicState
  draftChangedSincePublish: boolean
  blockingIssueCount: number
  missingTranslationLocales: string[]
}): string {
  if (input.blockingIssueCount > 0 || input.publicState === 'needs_attention') {
    return 'Resolve readiness issues'
  }
  if (input.missingTranslationLocales.length > 0) return 'Complete translations'
  if (input.draftChangedSincePublish) return 'Preview website changes'
  if (input.publicState === 'public') return 'Verify published website content'
  return 'Continue editing'
}

export type PreviewResultStatus = 'ready' | 'blocked' | 'no_changes' | 'not_publishable'
export type PreviewPanelState =
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

export type PublishReadinessState =
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
}) {
  const warnings: string[] = []
  const pathPrefix = input.pathPrefix.trim()
  if (input.mode === 'route') {
    if (!pathPrefix) {
      warnings.push('Route-backed collections should define a path prefix before publishing pages.')
    }
    if (input.locales.length === 0) {
      warnings.push('Route-backed collections need at least one locale for public route checks.')
    }
  }
  if (input.mode === 'none' && pathPrefix && pathPrefix !== '/') {
    warnings.push('Data-only collections ignore route diagnostics; clear the route-looking prefix.')
  }
  return warnings
}

export function mapPreviewPanelState(status: PreviewResultStatus): PreviewPanelState {
  if (status === 'ready') return 'ready'
  if (status === 'blocked') return 'blocked'
  if (status === 'no_changes') return 'no_changes'
  return 'not_publishable'
}

export function publishReadinessFromImpact(input: {
  status: PreviewResultStatus
  mode: CollectionCapabilityMode
}): {
  state: PublishReadinessState
  message: string
  confirmable: boolean
} {
  if (input.status === 'ready') {
    return { state: 'ready', message: 'Ready to publish', confirmable: true }
  }
  if (input.status === 'blocked') {
    return { state: 'blocked', message: 'Blocked', confirmable: false }
  }
  if (input.status === 'no_changes') {
    return { state: 'ready', message: 'No public changes', confirmable: true }
  }
  if (input.mode === 'none') {
    return {
      state: 'ready',
      message: 'Ready to publish data. No route-backed output will be created.',
      confirmable: true,
    }
  }
  return { state: 'blocked', message: 'Not publishable', confirmable: false }
}

export function derivePublishReadinessFromOperationPreview(input: {
  preview: PublishOperationPreviewInput | null
  locales: string[]
  now?: number
  staleReason?: string | null
}): {
  state: PublishReadinessState
  message: string
  previewHash: string | null
  confirmationToken: string | null
  confirmationExpiresAt: number | null
  locales: string[]
  renderablePreviewDetails: unknown
} {
  if (input.staleReason) {
    return {
      state: 'stale',
      message: input.staleReason,
      previewHash: null,
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
      message: 'Publish operation preview returned no usable result.',
      previewHash: null,
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
    'Publish preview is ready.'
  if (blocked) {
    return {
      state: 'blocked',
      message,
      previewHash: null,
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
      message: 'Publish confirmation token is missing. Preview again.',
      previewHash: null,
      confirmationToken: null,
      confirmationExpiresAt: null,
      locales: [],
      renderablePreviewDetails: preview.details ?? null,
    }
  }
  if (expiresAt && expiresAt <= (input.now ?? Date.now())) {
    return {
      state: 'expired',
      message: 'Publish confirmation expired. Preview again before publishing.',
      previewHash: null,
      confirmationToken: null,
      confirmationExpiresAt: expiresAt,
      locales: [],
      renderablePreviewDetails: preview.details ?? null,
    }
  }
  return {
    state: 'ready',
    message,
    previewHash: null,
    confirmationToken: token,
    confirmationExpiresAt: expiresAt,
    locales: input.locales,
    renderablePreviewDetails: preview.details ?? null,
  }
}

export function derivePublishConfirmationState(input: {
  readinessState: PublishReadinessState
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
        disabledReason: 'Publish confirmation token is missing. Preview again.',
        token: null,
        expiresAt,
      }
    }
    if (input.confirmationExpiresAt && input.confirmationExpiresAt <= (input.now ?? Date.now())) {
      return {
        canConfirm: false,
        disabledReason: 'Publish confirmation expired. Preview again before publishing.',
        token: null,
        expiresAt,
      }
    }
    return { canConfirm: true, disabledReason: null, token, expiresAt }
  }
  if (input.readinessState === 'not_previewed') {
    return {
      canConfirm: false,
      disabledReason: 'Preview publish impact before publishing.',
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'pending') {
    return {
      canConfirm: false,
      disabledReason: 'Publish impact preview is still loading.',
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'stale') {
    return {
      canConfirm: false,
      disabledReason: 'Publish impact preview is stale. Preview again before publishing.',
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'failed') {
    return {
      canConfirm: false,
      disabledReason: 'Publish impact preview failed. Fix the error before publishing.',
      token: null,
      expiresAt,
    }
  }
  if (input.readinessState === 'expired') {
    return {
      canConfirm: false,
      disabledReason: 'Publish confirmation expired. Preview again before publishing.',
      token: null,
      expiresAt,
    }
  }
  return {
    canConfirm: false,
    disabledReason: 'Website changes preview is blocked.',
    token: null,
    expiresAt,
  }
}

export function deriveTranslationSuggestedAction(input: {
  visibilityKnown: boolean
  variantExists: boolean
  parentBlocked: boolean
  missingRoute: boolean
  missingFields: string[]
  impactStatus?: PreviewResultStatus | null
  published: boolean
}) {
  if (!input.visibilityKnown) return 'Visibility unknown - refresh diagnostics before translating.'
  if (!input.variantExists) return 'Create this locale variant before translating.'
  if (input.parentBlocked) return 'Fix or publish the parent route in this locale first.'
  if (input.missingRoute) return 'Set a localized slug/path, then review public visibility again.'
  if (input.missingFields.length) {
    return `Fill required localized fields: ${input.missingFields.join(', ')}.`
  }
  if (input.impactStatus === 'blocked') {
    return 'Resolve publish blockers before publishing this translation.'
  }
  if (input.impactStatus === 'ready') {
    return 'Read-only preview is ready; review the website changes before publishing.'
  }
  if (input.published)
    return 'Published. Preview website changes before publishing further draft changes.'
  return 'Draft exists. Review the translation and preview website changes.'
}
