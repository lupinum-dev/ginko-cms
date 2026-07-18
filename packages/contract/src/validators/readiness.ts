import { v } from 'convex/values'
import type { Validator } from 'convex/values'

import {
  entryListWorkStates,
  readinessActionKinds,
  readinessActionTargets,
  readinessIssueCodes,
  readinessSeverities,
  readinessStates,
  type AffectedPublicUrl,
  type EntryListWorkState,
  type EntryReadinessDetail,
  type EntryReadinessLocale,
  type ReadinessAction,
  type ReadinessActionKind,
  type ReadinessActionTarget,
  type ReadinessIssue,
  type ReadinessIssueCode,
  type ReadinessParams,
  type ReadinessSeverity,
  type ReadinessState,
} from '../readiness.js'
import { literalUnion } from './foundation.js'

export const readinessStateValidator = literalUnion(readinessStates) as Validator<
  ReadinessState,
  'required',
  string
>

export const readinessSeverityValidator = literalUnion(readinessSeverities) as Validator<
  ReadinessSeverity,
  'required',
  string
>

export const readinessIssueCodeValidator = literalUnion(readinessIssueCodes) as Validator<
  ReadinessIssueCode,
  'required',
  string
>

export const readinessActionKindValidator = literalUnion(readinessActionKinds) as Validator<
  ReadinessActionKind,
  'required',
  string
>

export const readinessActionTargetValidator = literalUnion(readinessActionTargets) as Validator<
  ReadinessActionTarget,
  'required',
  string
>

export const readinessParamsValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.null()),
) as Validator<ReadinessParams, 'required', string>

export const readinessIssueValidator = v.object({
  code: readinessIssueCodeValidator,
  severity: readinessSeverityValidator,
  locale: v.union(v.string(), v.null()),
  fieldPath: v.union(v.string(), v.null()),
  messageParams: readinessParamsValidator,
  diagnosticId: v.union(v.string(), v.null()),
}) as Validator<ReadinessIssue, 'required', string>

export const readinessActionValidator = v.object({
  kind: readinessActionKindValidator,
  locale: v.union(v.string(), v.null()),
  target: readinessActionTargetValidator,
  params: readinessParamsValidator,
}) as Validator<ReadinessAction, 'required', string>

export const affectedPublicUrlValidator = v.object({
  entryId: v.string(),
  locale: v.string(),
  kind: v.union(v.literal('current_entry'), v.literal('descendant')),
  beforePath: v.union(v.string(), v.null()),
  afterPath: v.union(v.string(), v.null()),
  beforeHref: v.union(v.string(), v.null()),
  afterHref: v.union(v.string(), v.null()),
  reason: v.union(
    v.literal('publish'),
    v.literal('route_changed'),
    v.literal('parent_route_changed'),
    v.literal('unpublish'),
    v.literal('archive'),
  ),
}) as Validator<AffectedPublicUrl, 'required', string>

export const entryReadinessLocaleValidator = v.object({
  locale: v.string(),
  state: readinessStateValidator,
  blockers: v.array(readinessIssueValidator),
  warnings: v.array(readinessIssueValidator),
  infos: v.array(readinessIssueValidator),
  nextAction: readinessActionValidator,
  draftExists: v.boolean(),
  published: v.boolean(),
  hasUnpublishedChanges: v.boolean(),
  canPreview: v.boolean(),
  canRequestReview: v.boolean(),
  canPublish: v.boolean(),
  canArchive: v.boolean(),
  publicUrl: v.union(v.string(), v.null()),
  draftUrl: v.union(v.string(), v.null()),
  affectedPublicUrls: v.array(affectedPublicUrlValidator),
  reviewRequestId: v.union(v.string(), v.null()),
  currentDraftVersion: v.union(v.number(), v.null()),
  currentPublishedRevisionId: v.union(v.string(), v.null()),
}) as Validator<EntryReadinessLocale, 'required', string>

export const entryReadinessDetailValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  primaryLocale: v.string(),
  locales: v.array(entryReadinessLocaleValidator),
  updatedAt: v.number(),
}) as Validator<EntryReadinessDetail, 'required', string>

export const entryListWorkStateValidator = literalUnion(entryListWorkStates) as Validator<
  EntryListWorkState,
  'required',
  string
>
