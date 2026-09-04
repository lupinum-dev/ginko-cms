import { v } from 'convex/values'

import {
  activityOutcomeValidator,
  collectionTypeValidator,
  entryStatusValidator,
  jsonObjectValidator,
  jsonValueValidator,
  localeTextValidator,
  nodeKindValidator,
} from './foundation.js'
import { collectionRoutingValidator, fieldValidator } from './model.js'
import {
  entryListWorkStateValidator,
  readinessActionValidator,
  readinessStateValidator,
} from './readiness.js'

const localeStateValidator = v.object({
  values: v.record(v.string(), jsonValueValidator),
  bodyMdc: v.optional(v.union(v.string(), v.null())),
})

const completionStateValidator = v.object({
  filledRequired: v.number(),
  totalRequired: v.number(),
  complete: v.boolean(),
  errors: v.array(v.object({ field: v.string(), message: v.string() })),
})

const localizedEntryValidator = v.object({
  locale: v.string(),
  draftExists: v.boolean(),
  entryId: v.string(),
  draftSlug: v.union(v.string(), v.null()),
  draftPath: v.string(),
  publishedSlug: v.union(v.string(), v.null()),
  publishedPath: v.union(v.string(), v.null()),
  draft: localeStateValidator,
  published: v.union(localeStateValidator, v.null()),
  updatedBy: v.string(),
  updatedAt: v.number(),
  completion: completionStateValidator,
  data: v.record(v.string(), jsonValueValidator),
  publishedData: v.record(v.string(), jsonValueValidator),
})

const localeVariantValidator = v.object({
  locale: v.string(),
  draftExists: v.boolean(),
  entryId: v.string(),
  label: v.string(),
  isCurrent: v.boolean(),
  filledRequired: v.number(),
  totalRequired: v.number(),
  complete: v.boolean(),
  draftPath: v.string(),
  publishedPath: v.union(v.string(), v.null()),
  updatedAt: v.number(),
})

const schemaInfoValidator = v.object({
  slug: v.string(),
  type: collectionTypeValidator,
  routing: collectionRoutingValidator,
  locales: v.array(v.string()),
  fields: v.array(fieldValidator),
  settings: jsonValueValidator,
})

const localeDataValidator = v.object({
  draftSlug: v.union(v.string(), v.null()),
  draftPath: v.string(),
  publishedSlug: v.union(v.string(), v.null()),
  publishedPath: v.union(v.string(), v.null()),
  draft: localeStateValidator,
  published: v.union(localeStateValidator, v.null()),
})

export const studioEntryValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  baseSlug: v.string(),
  stableId: v.union(v.string(), v.null()),
  status: entryStatusValidator,
  dirtyLocales: v.array(v.string()),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  draft: jsonValueValidator,
  published: v.union(jsonValueValidator, v.null()),
  draftVersion: v.number(),
  createdBy: v.string(),
  updatedBy: v.string(),
  publishedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  locale: v.string(),
  slug: v.string(),
  path: v.union(v.string(), v.null()),
  data: jsonValueValidator,
  publishedData: v.union(jsonValueValidator, v.null()),
  localeData: v.union(localeDataValidator, v.null()),
  locales: v.array(localizedEntryValidator),
  localeVariants: v.array(localeVariantValidator),
  schema: schemaInfoValidator,
  _can: v.optional(v.record(v.string(), v.boolean())),
})

const localeSummaryValidator = v.object({
  locale: v.string(),
  draftExists: v.boolean(),
  draftPath: v.string(),
  publishedPath: v.union(v.string(), v.null()),
  published: v.boolean(),
  updatedAt: v.number(),
})

export const studioEntryListItemValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  locale: v.string(),
  baseSlug: v.string(),
  stableId: v.union(v.string(), v.null()),
  title: v.string(),
  status: entryStatusValidator,
  dirtyLocales: v.array(v.string()),
  draftVersion: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  path: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  localeSummaries: v.array(localeSummaryValidator),
  _can: v.optional(v.record(v.string(), v.boolean())),
})

export const studioEntryListResultValidator = v.object({
  page: v.array(studioEntryListItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

const studioPublicStateValidator = v.union(
  v.literal('public'),
  v.literal('draft_only'),
  v.literal('needs_attention'),
  v.literal('data_only'),
)

const studioRouteModeValidator = v.union(v.literal('route'), v.literal('none'))

const studioLocaleReadinessValidator = v.object({
  locale: v.string(),
  draftPath: v.string(),
  publishedPath: v.union(v.string(), v.null()),
  published: v.boolean(),
  changed: v.boolean(),
  state: v.union(v.literal('public'), v.literal('draft_only'), v.literal('changed')),
})

const entryWorkflowSummaryValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  primaryLocale: v.string(),
  workStatesByLocale: v.record(v.string(), entryListWorkStateValidator),
  readinessStatesByLocale: v.record(v.string(), readinessStateValidator),
  issueCounts: v.object({
    blocker: v.number(),
    warning: v.number(),
    info: v.number(),
  }),
  missingLocales: v.array(v.string()),
  publishedLocales: v.array(v.string()),
  nextAction: readinessActionValidator,
})

export const entrySummaryValidator = v.object({
  _id: v.string(),
  entryId: v.string(),
  collection: v.string(),
  collectionLabel: localeTextValidator,
  title: v.string(),
  slug: v.string(),
  path: v.string(),
  status: entryStatusValidator,
  routeMode: studioRouteModeValidator,
  nodeKind: nodeKindValidator,
  parentEntryId: v.union(v.string(), v.null()),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  publicState: studioPublicStateValidator,
  draftChangedSincePublish: v.boolean(),
  blockingIssueCount: v.number(),
  missingTranslationLocales: v.array(v.string()),
  localeReadiness: v.array(studioLocaleReadinessValidator),
  workflowSummary: entryWorkflowSummaryValidator,
  nextAction: v.string(),
  _can: v.optional(v.record(v.string(), v.boolean())),
})

export const entrySummaryListResultValidator = v.object({
  page: v.array(entrySummaryValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const studioWorkQueueItemValidator = v.object({
  entry: entrySummaryValidator,
  queueKinds: v.array(
    v.union(v.literal('changed'), v.literal('needs_attention'), v.literal('missing_translation')),
  ),
})

export const studioWorkQueueResultValidator = v.object({
  page: v.array(studioWorkQueueItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

const overviewEntryValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  collectionLabel: localeTextValidator,
  title: v.string(),
  path: v.string(),
  status: entryStatusValidator,
  publicState: studioPublicStateValidator,
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  blockingIssueCount: v.number(),
  missingTranslationLocales: v.array(v.string()),
  nextAction: v.string(),
  _can: v.optional(v.record(v.string(), v.boolean())),
})

export const studioOverviewValidator = v.object({
  recentPublished: v.array(overviewEntryValidator),
  revalidationJobs: v.array(
    v.object({
      id: v.string(),
      status: v.union(
        v.literal('pending'),
        v.literal('delivering'),
        v.literal('delivered'),
        v.literal('failed'),
      ),
      paths: v.array(v.string()),
      attempts: v.number(),
      lastError: v.union(v.string(), v.null()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
})

export const publishResultValidator = v.object({
  versionId: v.string(),
  dirtyLocales: v.array(v.string()),
  draftVersion: v.number(),
})

export const draftSaveResultValidator = v.object({
  draftVersion: v.number(),
  dirtyLocales: v.array(v.string()),
})

export const duplicateEntryResultValidator = v.object({
  entryId: v.string(),
  stableId: v.string(),
  slug: v.string(),
  locales: v.array(v.string()),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  draftVersion: v.number(),
})

export const rollbackResultValidator = v.object({ versionId: v.string() })

export const versionDiffValidator = v.object({
  leftVersionId: v.string(),
  rightVersionId: v.string(),
  changes: v.array(
    v.object({
      field: v.string(),
      left: v.union(jsonValueValidator, v.null()),
      right: v.union(jsonValueValidator, v.null()),
    }),
  ),
})

export const activityItemValidator = v.object({
  _id: v.string(),
  kind: v.string(),
  outcome: activityOutcomeValidator,
  displaySummary: v.string(),
  entryId: v.union(v.string(), v.null()),
  collection: v.union(v.string(), v.null()),
  locale: v.union(v.string(), v.null()),
  appIdentityId: v.string(),
  createdAt: v.number(),
  collectionLabel: v.optional(v.union(v.string(), v.null())),
  entrySlug: v.optional(v.union(v.string(), v.null())),
  actorLabel: v.union(v.string(), v.null()),
})

export const activityListResultValidator = v.object({
  page: v.array(activityItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const entryActivityItemValidator = v.object({
  _id: v.string(),
  kind: v.string(),
  outcome: activityOutcomeValidator,
  summary: v.string(),
  displaySummary: v.string(),
  locale: v.union(v.string(), v.null()),
  detail: v.union(jsonValueValidator, v.null()),
  appIdentityId: v.string(),
  createdAt: v.number(),
})

export const entryActivityListResultValidator = v.object({
  page: v.array(entryActivityItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const versionListItemValidator = v.object({
  _id: v.string(),
  version: v.number(),
  action: v.string(),
  displayAction: v.union(
    v.literal('published'),
    v.literal('restoredPublished'),
    v.literal('restoredDraft'),
    v.literal('unpublished'),
    v.literal('archived'),
    v.literal('checkpoint'),
    v.literal('routeUpdated'),
  ),
  publishedLocales: v.array(v.string()),
  message: v.union(v.string(), v.null()),
  createdBy: v.string(),
  createdAt: v.number(),
  isCurrentPublished: v.boolean(),
})

export const versionListResultValidator = v.object({
  page: v.array(versionListItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

const snapshotLocalePreviewValidator = v.object({
  slug: v.union(v.string(), v.null()),
  path: v.string(),
  values: v.union(jsonObjectValidator, v.null()),
})

const snapshotPreviewBaseValidator = v.object({
  baseSlug: v.string(),
  shared: jsonObjectValidator,
  locale: v.union(snapshotLocalePreviewValidator, v.null()),
})

export const versionSnapshotPreviewValidator = v.object({
  _id: v.string(),
  version: v.number(),
  action: v.string(),
  message: v.union(v.string(), v.null()),
  createdAt: v.number(),
  snapshot: snapshotPreviewBaseValidator,
})

export const draftVsPublishedDiffValidator = v.object({
  changes: v.array(
    v.object({
      field: v.string(),
      left: v.union(jsonValueValidator, v.null()),
      right: v.union(jsonValueValidator, v.null()),
    }),
  ),
})

export const searchResultItemValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  slug: v.string(),
  path: v.string(),
  title: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  snippet: v.union(v.string(), v.null()),
  highlights: v.array(v.object({ start: v.number(), end: v.number() })),
})
