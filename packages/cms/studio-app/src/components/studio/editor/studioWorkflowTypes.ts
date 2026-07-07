import type {
  AffectedPublicUrl,
  EntryReadinessDetail,
  EntryReadinessLocale,
  ReadinessAction,
  ReadinessIssue,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'

export interface StudioWorkflowDiagnostic {
  code: string
  href?: string | null
  locale?: string | null
  message: string
  path?: string | null
  severity?: string
}

export interface StudioLocaleVisibilityRow {
  current: boolean
  diagnostics: StudioWorkflowDiagnostic[]
  draftPath: string | null
  draftState: string
  hiddenDiagnosticCount: number
  href: string | null
  label: string
  locale: string
  missingRequiredFields: string[]
  nav: string
  path: string | null
  publishedPath: string | null
  publishedState: string
  reasons: string[]
  search: string
  secondaryLabels: string[]
  sitemap: string
  visibleDiagnostics: StudioWorkflowDiagnostic[]
}

export interface StudioPublicVisibilityState {
  error: Error | null | undefined
  errorMessage: string
  globalDiagnostics: StudioWorkflowDiagnostic[]
  hiddenGlobalDiagnosticCount: number
  isRouteBacked: boolean
  localeRows: StudioLocaleVisibilityRow[]
  pending: boolean
  publishedLocales: string[]
  status: string
}

export interface StudioRouteValidationState {
  diagnostics: StudioWorkflowDiagnostic[]
  hiddenDiagnosticCount: number
  message: string
  state: string
}

export interface StudioPublishImpactLocale {
  blockingDiagnostics: StudioWorkflowDiagnostic[]
  changes: Array<{
    kind: string
    label: string
    before: string | boolean | null
    after: string | boolean | null
  }>
  currentHref: string | null
  currentPath: string | null
  hiddenBlockerCount: number
  label: string
  locale: string
  nav: { before: boolean; after: boolean }
  nextHref: string | null
  nextPath: string | null
  search: { before: boolean; after: boolean }
  sitemap: { before: boolean; after: boolean }
  status: string
  visibleBlockers: StudioWorkflowDiagnostic[]
  visibleWarnings: StudioWorkflowDiagnostic[]
  warnings: StudioWorkflowDiagnostic[]
}

export interface StudioPublishImpactState {
  cacheTags: string[]
  error: Error | null
  events: string[]
  locales: StudioPublishImpactLocale[]
  message: string
  pending: boolean
  state: string
  status: string | null
}

export interface StudioPublishReviewState {
  blocked: boolean
  failed: boolean
  label: string
  locales: string[]
  message: string
  previewHash: string | null
  stale: boolean
  state: string
}

export type StudioReadinessIssue = ReadinessIssue
export type StudioReadinessAction = ReadinessAction
export type StudioAffectedPublicUrl = AffectedPublicUrl
export type StudioReadinessLocale = EntryReadinessLocale
export type StudioEntryReadinessDetail = EntryReadinessDetail

export interface StudioTranslationReadinessRow {
  draftPath: string | null
  exists: boolean
  impactLabel: string
  label: string
  locale: string
  missingFields: string[]
  missingRoute: boolean
  parentBlocked: boolean
  published: boolean
  status: string
  suggestedAction: string
}

const DIAGNOSTIC_LABELS: Record<string, string> = {
  invalid_entry_id: 'Invalid entry',
  data_only_collection: 'Shared data collection',
  entry_collection_mismatch: 'Entry collection mismatch',
  unpublished_entry: 'Unpublished language',
  missing_locale_route: 'Missing language URL',
  missing_required_localized_field: 'Missing required field',
  missing_parent_route: 'Parent not public',
  route_collision: 'URL conflict',
  route_redirect_collision: 'URL/redirect conflict',
  redirect_collision: 'Redirect collision',
  redirect_target_missing: 'Redirect target missing',
  excluded_from_sitemap: 'Excluded from sitemap',
  excluded_from_search: 'Excluded from search',
  excluded_from_nav: 'Excluded from nav',
}

export function diagnosticLabel(code: string) {
  return DIAGNOSTIC_LABELS[code] ?? 'Website issue'
}

export function statusToneClass(status: string | null | undefined) {
  if (!status) return ''
  if (['blocked', 'collision', 'error', 'failed', 'missing', 'not_publishable'].includes(status)) {
    return 'ginko:border-destructive/40 ginko:text-destructive-fg'
  }
  if (['stale', 'pending', 'draft_only', 'excluded'].includes(status)) {
    return 'ginko:border-warning/40 ginko:text-warning-fg'
  }
  if (['ready', 'public', 'no_changes'].includes(status))
    return 'ginko:border-success/40 ginko:text-success-fg'
  return ''
}
