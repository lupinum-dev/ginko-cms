export const readinessStates = [
  'draft',
  'needs_work',
  'ready',
  'in_review',
  'live',
  'live_with_changes',
  'missing',
] as const

export type ReadinessState = (typeof readinessStates)[number]

export const entryListWorkStates = [
  'missing_translation',
  'blocked',
  'public',
  'changed',
  'draft',
] as const

export type EntryListWorkState = (typeof entryListWorkStates)[number]

export const readinessSeverities = ['blocker', 'warning', 'info'] as const

export type ReadinessSeverity = (typeof readinessSeverities)[number]

export const readinessIssueCodes = [
  'required_field_missing',
  'required_localized_field_missing',
  'required_shared_field_missing',
  'body_required',
  'seo_title_required',
  'seo_description_required',
  'asset_alt_required',
  'asset_caption_required',
  'collection_schema_invalid',
  'data_only_required_field_missing',
  'locale_missing',
  'locale_not_configured',
  'primary_locale_missing',
  'default_locale_unknown',
  'fallback_not_configured',
  'locale_parent_missing',
  'locale_public_projection_missing',
  'locale_public_route_missing',
  'locale_slug_missing',
  'locale_switch_target_missing',
  'route_missing',
  'route_collision',
  'route_reserved',
  'route_invalid',
  'route_parent_not_public',
  'route_descendant_collision',
  'route_descendant_rebuild_failed',
  'route_cycle_detected',
  'route_depth_exceeded',
  'route_slug_unchanged_noop',
  'review_request_stale',
  'review_preview_stale',
  'review_preview_missing',
  'review_not_authorized',
  'review_already_closed',
  'review_publish_blocked',
  'review_locale_mismatch',
  'review_version_hash_mismatch',
  'permission_publish_missing',
  'permission_review_missing',
  'permission_archive_missing',
  'permission_restore_missing',
  'permission_agent_scope_missing',
  'permission_member_inactive',
  'permission_api_key_revoked',
  'permission_role_not_allowed',
  'agent_run_missing',
  'agent_run_not_owned',
  'agent_run_closed',
  'agent_publish_requires_permission',
  'agent_archive_requires_permission',
  'agent_restore_requires_permission',
  'agent_review_required',
  'agent_operation_not_supported',
  'asset_missing',
  'asset_not_public',
  'asset_policy_blocked',
  'asset_metadata_stale',
  'asset_alt_missing',
  'asset_caption_missing',
  'asset_ref_rebuild_failed',
  'asset_upload_pending',
  'relation_target_missing',
  'relation_target_not_public',
  'relation_locale_missing',
  'relation_collection_invalid',
  'relation_cycle_detected',
  'relation_validation_failed',
  'projection_public_entry_missing',
  'projection_public_route_missing',
  'projection_revision_missing',
  'projection_revision_locale_missing',
  'projection_rebuild_failed',
  'projection_route_mismatch',
  'projection_asset_ref_mismatch',
  'projection_cache_tags_missing',
  'revalidation_pending',
  'revalidation_failed',
  'revalidation_delivery_missing',
  'revalidation_adapter_unconfigured',
  'revalidation_cache_tag_missing',
  'revalidation_event_stale',
  'settings_missing',
  'collection_missing',
  'entry_missing',
  'entry_archived',
  'entry_collection_mismatch',
  'draft_version_conflict',
  'draft_hash_mismatch',
  'confirmation_missing',
  'confirmation_expired',
  'confirmation_mismatch',
] as const

export type ReadinessIssueCode = (typeof readinessIssueCodes)[number]

export const readinessActionTargets = [
  'editor',
  'field',
  'locale',
  'route',
  'review',
  'publish',
] as const

export type ReadinessActionTarget = (typeof readinessActionTargets)[number]

export const readinessActionKinds = [
  'continue_editing',
  'fill_required_field',
  'fill_required_localized_field',
  'fill_required_shared_field',
  'add_locale',
  'publish_locale',
  'resolve_route_collision',
  'request_review',
  'open_review',
  'view_public_page',
] as const

export type ReadinessActionKind = (typeof readinessActionKinds)[number]

export type ReadinessParamValue = string | number | boolean | null

export type ReadinessParams = Record<string, ReadinessParamValue>

export type ReadinessIssue = {
  code: ReadinessIssueCode
  severity: ReadinessSeverity
  locale: string | null
  fieldPath: string | null
  messageParams: ReadinessParams
  diagnosticId: string | null
}

export type ReadinessAction = {
  kind: ReadinessActionKind
  locale: string | null
  target: ReadinessActionTarget
  params: ReadinessParams
}

export type AffectedPublicUrl = {
  entryId: string
  locale: string
  kind: 'current_entry' | 'descendant'
  beforePath: string | null
  afterPath: string | null
  beforeHref: string | null
  afterHref: string | null
  reason: 'publish' | 'route_changed' | 'parent_route_changed' | 'unpublish' | 'archive'
}

export type EntryReadinessLocale = {
  locale: string
  state: ReadinessState
  blockers: ReadinessIssue[]
  warnings: ReadinessIssue[]
  infos: ReadinessIssue[]
  nextAction: ReadinessAction
  draftExists: boolean
  published: boolean
  hasUnpublishedChanges: boolean
  canPreview: boolean
  canRequestReview: boolean
  canPublish: boolean
  canArchive: boolean
  publicUrl: string | null
  draftUrl: string | null
  affectedPublicUrls: AffectedPublicUrl[]
  reviewRequestId: string | null
  currentDraftVersion: number | null
  currentPublishedRevisionId: string | null
}

export type EntryReadinessDetail = {
  entryId: string
  collection: string
  primaryLocale: string
  locales: EntryReadinessLocale[]
  updatedAt: number
}

export type PublishImpactStatus = 'ready' | 'blocked' | 'no_changes' | 'not_publishable'
export type PublishImpactChangeKind = 'route' | 'redirect' | 'sitemap' | 'search' | 'nav' | 'seo'

export type PublishReviewPreviewLocale = {
  locale: string
  status: PublishImpactStatus
  currentHref: string | null
  nextHref: string | null
  routeImpact: PublishRouteImpactPage
  blockingIssueCodes: string[]
  warningIssueCodes: string[]
  changeKinds: PublishImpactChangeKind[]
}

export type PublishRouteImpactPage = {
  /** Exact once `hasMore` is false; otherwise the traversal is still paged. */
  total: number | null
  listed: number
  hasMore: boolean
  continueCursor: string | null
  routeGeneration: number
  impactHash: string
}

export type PublishRouteImpactPageResult = {
  collection: string
  entryId: string
  locale: string
  draftVersion: number
  routeGeneration: number
  changes: PublishReviewPreviewChange[]
  isDone: boolean
  continueCursor: string | null
}

export type PublishReviewPreviewAffectedUrl = {
  locale: string
  entryId: string
  scope: 'current_entry' | 'descendant'
  label: string
  beforeHref: string | null
  afterHref: string | null
}

export type PublishReviewPreviewChange = {
  locale: string
  entryId?: string
  scope?: 'current_entry' | 'descendant'
  kind: PublishImpactChangeKind
  label: string
  before: string | boolean | null
  after: string | boolean | null
}

export type PublishReviewPreview = {
  kind: 'publish-review-preview'
  status: PublishImpactStatus
  collection: string
  entryId: string
  locales: PublishReviewPreviewLocale[]
  affectedPublicUrls: PublishReviewPreviewAffectedUrl[]
  changes: PublishReviewPreviewChange[]
  blockingIssueCodes: string[]
  warningIssueCodes: string[]
  computedAt: number
}

export type ReviewSummary = {
  status: PublishImpactStatus
  localeStatuses: Array<{
    locale: string
    status: PublishImpactStatus
    currentHref: string | null
    nextHref: string | null
  }>
  affectedPublicUrls: PublishReviewPreviewAffectedUrl[]
  affectedPublicUrlCount: number
  affectedPublicUrlsHasMore: boolean
  changeCount: number
  blockerCount: number
  warningCount: number
  blockingIssueCodes: string[]
  warningIssueCodes: string[]
}

export type ReadinessIssueInput = Omit<ReadinessIssue, 'code' | 'severity' | 'messageParams'> & {
  code: string
  severity: string
  messageParams?: Record<string, unknown>
}

export type ReadinessActionInput = Omit<ReadinessAction, 'kind' | 'target' | 'params'> & {
  kind: string
  target: string
  params?: Record<string, unknown>
}

function createMembership<T extends readonly string[]>(values: T) {
  return new Set<string>(values)
}

const readinessStateSet = createMembership(readinessStates)
const readinessSeveritySet = createMembership(readinessSeverities)
const readinessIssueCodeSet = createMembership(readinessIssueCodes)
const readinessActionKindSet = createMembership(readinessActionKinds)
const readinessActionTargetSet = createMembership(readinessActionTargets)

export function isReadinessState(value: unknown): value is ReadinessState {
  return typeof value === 'string' && readinessStateSet.has(value)
}

export function isReadinessSeverity(value: unknown): value is ReadinessSeverity {
  return typeof value === 'string' && readinessSeveritySet.has(value)
}

export function isReadinessIssueCode(value: unknown): value is ReadinessIssueCode {
  return typeof value === 'string' && readinessIssueCodeSet.has(value)
}

export function isReadinessActionKind(value: unknown): value is ReadinessActionKind {
  return typeof value === 'string' && readinessActionKindSet.has(value)
}

export function isReadinessActionTarget(value: unknown): value is ReadinessActionTarget {
  return typeof value === 'string' && readinessActionTargetSet.has(value)
}

export function assertReadinessState(value: unknown): ReadinessState {
  if (isReadinessState(value)) return value
  throw new Error(`Unknown readiness state: ${String(value)}`)
}

export function assertReadinessSeverity(value: unknown): ReadinessSeverity {
  if (isReadinessSeverity(value)) return value
  throw new Error(`Unknown readiness severity: ${String(value)}`)
}

export function assertReadinessIssueCode(value: unknown): ReadinessIssueCode {
  if (isReadinessIssueCode(value)) return value
  throw new Error(`Unknown readiness issue code: ${String(value)}`)
}

export function assertReadinessActionKind(value: unknown): ReadinessActionKind {
  if (isReadinessActionKind(value)) return value
  throw new Error(`Unknown readiness action kind: ${String(value)}`)
}

export function assertReadinessActionTarget(value: unknown): ReadinessActionTarget {
  if (isReadinessActionTarget(value)) return value
  throw new Error(`Unknown readiness action target: ${String(value)}`)
}

function assertReadinessParams(value: unknown): ReadinessParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Readiness params must be a flat JSON-safe record.')
  }

  const result: ReadinessParams = {}
  for (const [key, item] of Object.entries(value)) {
    const valid =
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    if (!valid) throw new Error('Readiness params must be a flat JSON-safe record.')
    result[key] = item
  }
  return result
}

export function createReadinessIssue(input: ReadinessIssueInput): ReadinessIssue {
  return {
    code: assertReadinessIssueCode(input.code),
    severity: assertReadinessSeverity(input.severity),
    locale: input.locale,
    fieldPath: input.fieldPath,
    messageParams: assertReadinessParams(input.messageParams ?? {}),
    diagnosticId: input.diagnosticId,
  }
}

export function createReadinessAction(input: ReadinessActionInput): ReadinessAction {
  return {
    kind: assertReadinessActionKind(input.kind),
    locale: input.locale,
    target: assertReadinessActionTarget(input.target),
    params: assertReadinessParams(input.params ?? {}),
  }
}
