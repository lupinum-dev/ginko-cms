import {
  publishReviewPreviewValidator,
  reviewSummaryValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import type {
  PublishReviewPreview,
  PublishReviewPreviewAffectedUrl,
  ReviewSummary,
} from '@lupinum/ginko-cms-contract/shared/readiness.js'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import {
  getOwnActiveAgentRunOrThrow,
  getOwnAgentRunOrThrow,
  recordOwnedAgentRunWrite,
} from './agentRuns.js'
import { canEditEntries, canPublishEntries, canRead } from './auth/checks.js'
import { previewPublishImpactForEntry } from './diagnostics.js'
import { getCollectionForEntry } from './entries/context.js'
import { computePublishDraftHash, publishCurrentDraft } from './entries/workflow/commands.js'
import { stableHash } from './entries/workflow/hashing.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { asEntryId } from './lib/ids.js'

const reviewRequestStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
)

const reviewRequestValidator = v.object({
  _id: v.string(),
  agentRunId: v.union(v.string(), v.null()),
  requestSource: v.union(v.literal('human'), v.literal('agent')),
  operationId: v.literal('ginko-cms.publish-entry'),
  entryId: v.string(),
  locales: v.array(v.string()),
  expectedVersion: v.number(),
  message: v.union(v.string(), v.null()),
  title: v.string(),
  summary: v.string(),
  status: reviewRequestStatusValidator,
  preview: publishReviewPreviewValidator,
  requestedBy: v.string(),
  reviewedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
  reviewFeedback: v.union(v.string(), v.null()),
  versionHash: v.union(v.string(), v.null()),
  isStale: v.boolean(),
  staleReason: v.union(v.string(), v.null()),
  reviewSummary: reviewSummaryValidator,
})

// Slim outcome shape for closed (non-pending) review requests. Rejections
// carry the reviewer feedback so the editor sees it where work resumes
// (PUB-06); the heavy publish preview stays out of this payload.
const reviewOutcomeValidator = v.object({
  _id: v.string(),
  entryId: v.string(),
  status: v.union(v.literal('approved'), v.literal('rejected')),
  title: v.string(),
  locales: v.array(v.string()),
  expectedVersion: v.number(),
  createdAt: v.number(),
  reviewedBy: v.union(v.string(), v.null()),
  reviewedByLabel: v.union(v.string(), v.null()),
  reviewedAt: v.union(v.number(), v.null()),
  reviewFeedback: v.union(v.string(), v.null()),
})

type ReviewRequestDoc = Doc<'reviewRequests'>
type ReviewOutcomeDoc = ReviewRequestDoc & { status: 'approved' | 'rejected' }

function isReviewOutcome(request: ReviewRequestDoc): request is ReviewOutcomeDoc {
  return request.status !== 'pending'
}

const MAX_REVIEW_REQUESTS = 100
const MAX_REVIEW_OUTCOMES = 20
const REVIEW_READY_STATUSES = new Set(['ready', 'no_changes'])
const OUTDATED_REVIEW_PREVIEW_REASON =
  'Review request must be recreated because its publish preview is outdated.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPublishReviewPreview(value: unknown): value is PublishReviewPreview {
  if (!isRecord(value)) return false
  return (
    value.kind === 'publish-review-preview' &&
    typeof value.status === 'string' &&
    typeof value.collection === 'string' &&
    typeof value.entryId === 'string' &&
    Array.isArray(value.locales) &&
    Array.isArray(value.affectedPublicUrls) &&
    Array.isArray(value.changes) &&
    Array.isArray(value.blockingIssueCodes) &&
    Array.isArray(value.warningIssueCodes) &&
    typeof value.computedAt === 'number'
  )
}

function staleReviewPreview(request: ReviewRequestDoc): PublishReviewPreview {
  return {
    kind: 'publish-review-preview',
    status: 'blocked',
    collection: '',
    entryId: request.entryId,
    locales: request.locales.map((locale) => ({
      locale,
      status: 'blocked',
      currentHref: null,
      nextHref: null,
      blockingIssueCodes: ['outdated_review_preview'],
      warningIssueCodes: [],
      changeKinds: [],
    })),
    affectedPublicUrls: [],
    changes: [],
    blockingIssueCodes: ['outdated_review_preview'],
    warningIssueCodes: [],
    computedAt: request.updatedAt ?? request.createdAt,
  }
}

function previewForReviewRequest(request: ReviewRequestDoc): PublishReviewPreview {
  return isPublishReviewPreview(request.preview) ? request.preview : staleReviewPreview(request)
}

function affectedPublicUrlsFromImpact(
  impact: Awaited<ReturnType<typeof previewPublishImpactForEntry>>,
): PublishReviewPreviewAffectedUrl[] {
  return impact.changes
    .filter((change) => change.kind === 'route')
    .map((change): PublishReviewPreviewAffectedUrl => {
      const scope: PublishReviewPreviewAffectedUrl['scope'] =
        change.scope === 'descendant' ? 'descendant' : 'current_entry'
      return {
        locale: change.locale,
        entryId: change.entryId ?? impact.entryId,
        scope,
        label: change.label,
        beforeHref: typeof change.before === 'string' ? change.before : null,
        afterHref: typeof change.after === 'string' ? change.after : null,
      }
    })
    .filter((url) => url.beforeHref || url.afterHref)
}

function reviewPreviewHash(preview: PublishReviewPreview) {
  const { computedAt: _computedAt, ...stablePreview } = preview
  return `preview:${stableHash(stablePreview)}`
}

function reviewSummaryFromPreview(preview: PublishReviewPreview): ReviewSummary {
  return {
    status: preview.status,
    localeStatuses: preview.locales.map((item) => ({
      locale: item.locale,
      status: item.status,
      currentHref: item.currentHref,
      nextHref: item.nextHref,
    })),
    affectedPublicUrls: preview.affectedPublicUrls,
    changeCount: preview.changes.length,
    blockerCount: preview.blockingIssueCodes.length,
    warningCount: preview.warningIssueCodes.length,
    blockingIssueCodes: preview.blockingIssueCodes,
    warningIssueCodes: preview.warningIssueCodes,
  }
}

function serializeReviewRequest(
  request: ReviewRequestDoc,
  stale: { isStale: boolean; staleReason: string | null } = {
    isStale: false,
    staleReason: null,
  },
) {
  const preview = previewForReviewRequest(request)
  const agentRunId = request.agentRunId ? String(request.agentRunId) : null
  return {
    _id: String(request._id),
    agentRunId,
    requestSource: agentRunId ? 'agent' : 'human',
    operationId: 'ginko-cms.publish-entry',
    entryId: request.entryId,
    locales: request.locales,
    expectedVersion: request.expectedVersion,
    message: request.message ?? null,
    title: request.title,
    summary: request.summary,
    status: request.status,
    preview,
    requestedBy: request.requestedBy,
    reviewedBy: request.reviewedBy ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    reviewedAt: request.reviewedAt ?? null,
    reviewFeedback: request.reviewFeedback ?? null,
    versionHash: request.versionHash ?? null,
    isStale: stale.isStale,
    staleReason: stale.staleReason,
    reviewSummary: reviewSummaryFromPreview(preview),
  }
}

async function cheapReviewStaleState(
  ctx: Parameters<typeof computeReviewPreview>[0],
  request: ReviewRequestDoc,
) {
  if (request.status !== 'pending') return { isStale: false, staleReason: null }
  const entry = await ctx.db.get(asEntryId(request.entryId))
  if (!entry) {
    return { isStale: true, staleReason: 'Entry no longer exists.' }
  }
  if (entry.draftVersion !== request.expectedVersion) {
    return {
      isStale: true,
      staleReason: 'This review is out of date. Ask for a new review.',
    }
  }
  if (!isPublishReviewPreview(request.preview) || !request.previewHash) {
    return {
      isStale: true,
      staleReason: OUTDATED_REVIEW_PREVIEW_REASON,
    }
  }
  return { isStale: false, staleReason: null }
}

export async function exactReviewStaleState(
  ctx: Parameters<typeof computeReviewPreview>[0],
  request: ReviewRequestDoc,
) {
  const cheap = await cheapReviewStaleState(ctx, request)
  if (cheap.isStale) return cheap
  const currentPreview = await computeReviewPreview(ctx, {
    entryId: request.entryId,
    locales: request.locales,
    now: Date.now(),
  })
  if (!REVIEW_READY_STATUSES.has(currentPreview.status)) {
    return {
      isStale: true,
      staleReason: 'This review is out of date. Ask for a new review.',
    }
  }
  if (reviewPreviewHash(currentPreview) !== request.previewHash) {
    return {
      isStale: true,
      staleReason: 'This review is out of date. Ask for a new review.',
    }
  }
  return { isStale: false, staleReason: null }
}

async function serializeReviewRequestWithStaleState(
  ctx: Parameters<typeof cheapReviewStaleState>[0],
  request: ReviewRequestDoc,
  options: { exact?: boolean } = {},
) {
  const stale = options.exact
    ? await exactReviewStaleState(ctx, request)
    : await cheapReviewStaleState(ctx, request)
  return serializeReviewRequest(request, stale)
}

async function getPendingReviewOrThrow(
  ctx: { db: { get: (id: Id<'reviewRequests'>) => Promise<ReviewRequestDoc | null> } },
  id: string,
) {
  const request = await ctx.db.get(id as Id<'reviewRequests'>)
  if (!request) {
    throwCmsError('REVIEW_REQUEST_NOT_FOUND', 'Review request not found.', { reviewRequestId: id })
  }
  if (request.status !== 'pending') {
    throwCmsError('REVIEW_REQUEST_CLOSED', 'Review request is already closed.', {
      reviewRequestId: id,
      status: request.status,
    })
  }
  return request
}

async function executeApprovedPublishReview(
  ctx: Parameters<typeof publishCurrentDraft>[0],
  request: ReviewRequestDoc,
  appIdentityId: string,
) {
  const entryId = asEntryId(request.entryId)
  const entry = await ctx.db.get(entryId)
  if (!entry) {
    throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', {
      reviewRequestId: String(request._id),
      entryId: request.entryId,
    })
  }
  if (entry.draftVersion !== request.expectedVersion) {
    throwCmsError('REVIEW_REQUEST_STALE', 'Review request is stale.', {
      reviewRequestId: String(request._id),
      expectedVersion: request.expectedVersion,
      actualVersion: entry.draftVersion,
    })
  }

  const currentPreview = await computeReviewPreview(ctx, {
    entryId: request.entryId,
    locales: request.locales,
    now: Date.now(),
  })
  if (!REVIEW_READY_STATUSES.has(currentPreview.status)) {
    throwCmsError('REVIEW_PUBLISH_BLOCKED', 'Review request is no longer publishable.', {
      reviewRequestId: String(request._id),
      status: currentPreview.status,
      blockingIssueCodes: currentPreview.blockingIssueCodes,
    })
  }

  const expectedDraftHash = await computePublishDraftHash(ctx, {
    entryId,
    locales: request.locales,
  })
  return await publishCurrentDraft(ctx, {
    entryId,
    locales: request.locales,
    expectedDraftVersion: request.expectedVersion,
    expectedDraftHash,
    appIdentity: appIdentityId,
    message: request.message ?? null,
  })
}

async function computeReviewPreview(
  ctx: Parameters<typeof previewPublishImpactForEntry>[0],
  args: { entryId: string; locales: string[]; now: number },
): Promise<PublishReviewPreview> {
  const entryId = asEntryId(args.entryId)
  const entry = await ctx.db.get(entryId)
  if (!entry) {
    throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
  }
  const collection = await getCollectionForEntry(ctx, entry)
  const locales = Array.from(new Set(args.locales))
  const impact = await previewPublishImpactForEntry(ctx, {
    collection: collection.slug,
    entryId: args.entryId,
    locales,
  })
  const blockingIssueCodes = Array.from(
    new Set(impact.blockingDiagnostics.map((diagnostic) => diagnostic.code)),
  )
  const warningIssueCodes = Array.from(
    new Set(impact.warnings.map((diagnostic) => diagnostic.code)),
  )
  return {
    kind: 'publish-review-preview',
    status: impact.status,
    collection: collection.slug,
    entryId: args.entryId,
    locales: impact.locales.map((locale) => ({
      locale: locale.locale,
      status: locale.status,
      currentHref: locale.currentHref,
      nextHref: locale.nextHref,
      blockingIssueCodes: Array.from(
        new Set(locale.blockingDiagnostics.map((diagnostic) => diagnostic.code)),
      ),
      warningIssueCodes: Array.from(new Set(locale.warnings.map((diagnostic) => diagnostic.code))),
      changeKinds: Array.from(new Set(locale.changes.map((change) => change.kind))),
    })),
    affectedPublicUrls: affectedPublicUrlsFromImpact(impact),
    changes: impact.changes.map((change) => ({
      locale: change.locale,
      entryId: change.entryId,
      scope: change.scope,
      kind: change.kind,
      label: change.label,
      before: change.before,
      after: change.after,
    })),
    blockingIssueCodes,
    warningIssueCodes,
    computedAt: args.now,
  }
}

export const requestPublishReview = callerMutation.protected({
  id: 'reviewRequests:requestPublishReview',
  args: {
    agentRunId: v.optional(v.union(v.string(), v.null())),
    entryId: v.string(),
    locales: v.array(v.string()),
    expectedVersion: v.number(),
    message: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    summary: v.string(),
  },
  guard: canEditEntries,
  returns: reviewRequestValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const agentRunId = args.agentRunId ?? null
    if (appIdentity.audit.origin === 'mcp' && !agentRunId) {
      throwCmsError('AGENT_RUN_REQUIRED', 'MCP publish review requires an active agent run.')
    }
    if (agentRunId) {
      await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, now)
    }
    if (args.locales.length === 0) {
      throwCmsError(
        'REVIEW_REQUEST_LOCALES_REQUIRED',
        'Publish review requires at least one locale.',
      )
    }
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
    }
    if (entry.draftVersion !== args.expectedVersion) {
      throwCmsError(
        'ENTRY_CONCURRENT_EDIT',
        'This entry changed in another session. Reload and request review again.',
        {
          entryId: args.entryId,
          expectedVersion: args.expectedVersion,
          actualVersion: entry.draftVersion,
          currentVersion: entry.draftVersion,
          retryable: true,
        },
      )
    }
    const locales = Array.from(new Set(args.locales as string[]))
    const preview = await computeReviewPreview(ctx, {
      entryId: args.entryId,
      locales,
      now,
    })
    if (!REVIEW_READY_STATUSES.has(preview.status)) {
      throwCmsError(
        'REVIEW_PUBLISH_BLOCKED',
        'Publish review was not created because the requested publish is currently blocked.',
        {
          entryId: args.entryId,
          locales,
          status: preview.status,
          blockingIssueCodes: preview.blockingIssueCodes,
        },
      )
    }
    const versionHash = await computePublishDraftHash(ctx, {
      entryId: asEntryId(args.entryId),
      locales,
    })
    const previewHash = reviewPreviewHash(preview)

    const id = await ctx.db.insert('reviewRequests', {
      agentRunId: agentRunId ? (agentRunId as Id<'agentRuns'>) : null,
      entryId: args.entryId,
      locales,
      expectedVersion: args.expectedVersion,
      message: args.message ?? null,
      title: args.title,
      summary: args.summary,
      status: 'pending',
      preview,
      requestedBy: appIdentity.userId,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      versionHash,
      previewHash,
    })
    const request = await ctx.db.get(id)
    if (!request) throw new Error('Review request disappeared after create.')

    if (agentRunId) {
      await recordOwnedAgentRunWrite(ctx, agentRunId, 'ginko-cms.request-publish-review')
    }
    await logActivity(ctx, {
      kind: 'reviewRequest.created',
      summary: `Created review request "${args.title}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        reviewRequestId: String(id),
        agentRunId,
        requestSource: agentRunId ? 'agent' : 'human',
        operationId: 'ginko-cms.publish-entry',
        entryId: args.entryId,
      },
    })

    return await serializeReviewRequestWithStaleState(ctx, request)
  },
})

export const listPendingReviews = callerQuery.protected({
  id: 'reviewRequests:listPendingReviews',
  args: {
    limit: v.optional(v.number()),
  },
  guard: canPublishEntries,
  returns: v.array(reviewRequestValidator),
  handler: async (ctx, args) => {
    const boundedLimit = Math.max(1, Math.min(MAX_REVIEW_REQUESTS, args.limit ?? 50))
    const requests = await ctx.db
      .query('reviewRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .order('desc')
      .take(boundedLimit)

    return await Promise.all(
      requests.map((request) => serializeReviewRequestWithStaleState(ctx, request)),
    )
  },
})

export const getOwnReviewRequest = callerQuery.protected({
  id: 'reviewRequests:getOwnReviewRequest',
  args: { reviewRequestId: v.string() },
  guard: canRead,
  returns: reviewRequestValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const request = await ctx.db.get(args.reviewRequestId as Id<'reviewRequests'>)
    if (!request) {
      throwCmsError('REVIEW_REQUEST_NOT_FOUND', 'Review request not found.', {
        reviewRequestId: args.reviewRequestId,
      })
    }
    if (request.agentRunId) {
      await getOwnAgentRunOrThrow(ctx, String(request.agentRunId), appIdentity)
    } else if (request.requestedBy !== appIdentity.userId || appIdentity.audit.origin === 'mcp') {
      throwCmsError('REVIEW_REQUEST_FORBIDDEN', 'Review request belongs to a different caller.', {
        reviewRequestId: args.reviewRequestId,
      })
    }
    return await serializeReviewRequestWithStaleState(ctx, request)
  },
})

export const approveReview = callerMutation.protected({
  id: 'reviewRequests:approveReview',
  args: {
    reviewRequestId: v.string(),
    expectedVersionHash: v.optional(v.union(v.string(), v.null())),
  },
  guard: canPublishEntries,
  returns: reviewRequestValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const request = await getPendingReviewOrThrow(ctx, args.reviewRequestId)
    const stale = await exactReviewStaleState(ctx, request)
    if (stale.isStale) {
      throwCmsError(
        'REVIEW_REQUEST_STALE',
        stale.staleReason ?? 'This review is out of date. Ask for a new review.',
        {
          reviewRequestId: args.reviewRequestId,
        },
      )
    }
    if (
      args.expectedVersionHash !== undefined &&
      args.expectedVersionHash !== null &&
      request.versionHash !== args.expectedVersionHash
    ) {
      throwCmsError('REVIEW_REQUEST_STALE', 'This review is out of date. Ask for a new review.', {
        reviewRequestId: args.reviewRequestId,
      })
    }

    const publishResult = await executeApprovedPublishReview(ctx, request, appIdentity.userId)

    await ctx.db.patch(request._id, {
      status: 'approved',
      reviewedBy: appIdentity.userId,
      reviewedAt: now,
      updatedAt: now,
    })
    const updated = await ctx.db.get(request._id)
    if (!updated) throw new Error('Review request disappeared after approval.')

    await logActivity(ctx, {
      kind: 'reviewRequest.approved',
      summary: `Approved review request "${request.title}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        reviewRequestId: args.reviewRequestId,
        operationId: 'ginko-cms.publish-entry',
        locales: request.locales,
        versionHash: request.versionHash ?? null,
        previewHash: request.previewHash ?? null,
        result: {
          versionId: String(publishResult.revisionId),
          affectedLocales: publishResult.affectedLocales,
        },
      },
    })

    return await serializeReviewRequestWithStaleState(ctx, updated)
  },
})

async function serializeReviewOutcome(
  ctx: Parameters<typeof cheapReviewStaleState>[0],
  request: ReviewOutcomeDoc,
) {
  const reviewedBy = request.reviewedBy ?? null
  const member = reviewedBy
    ? await ctx.db
        .query('members')
        .withIndex('by_userId', (q) => q.eq('userId', reviewedBy))
        .first()
    : null
  return {
    _id: String(request._id),
    entryId: request.entryId,
    status: request.status,
    title: request.title,
    locales: request.locales,
    expectedVersion: request.expectedVersion,
    createdAt: request.createdAt,
    reviewedBy,
    reviewedByLabel: member?.displayName ?? member?.email ?? null,
    reviewedAt: request.reviewedAt ?? null,
    reviewFeedback: request.reviewFeedback ?? null,
  }
}

function sortNewestOutcomeFirst(left: ReviewOutcomeDoc, right: ReviewOutcomeDoc) {
  return (right.reviewedAt ?? right.updatedAt) - (left.reviewedAt ?? left.updatedAt)
}

export const listRecentReviewOutcomesForEntry = callerQuery.protected({
  id: 'reviewRequests:listRecentReviewOutcomesForEntry',
  args: {
    entryId: v.string(),
    limit: v.optional(v.number()),
  },
  guard: canRead,
  returns: v.array(reviewOutcomeValidator),
  handler: async (ctx, args) => {
    const boundedLimit = Math.max(1, Math.min(MAX_REVIEW_OUTCOMES, args.limit ?? 5))
    const requests = await ctx.db
      .query('reviewRequests')
      .withIndex('by_entry', (q) => q.eq('entryId', args.entryId))
      .order('desc')
      .take(MAX_REVIEW_REQUESTS)
    const outcomes = requests
      .filter(isReviewOutcome)
      .sort(sortNewestOutcomeFirst)
      .slice(0, boundedLimit)
    return await Promise.all(outcomes.map((outcome) => serializeReviewOutcome(ctx, outcome)))
  },
})

export const listRecentReviewOutcomes = callerQuery.protected({
  id: 'reviewRequests:listRecentReviewOutcomes',
  args: {
    limit: v.optional(v.number()),
  },
  guard: canPublishEntries,
  returns: v.array(reviewOutcomeValidator),
  handler: async (ctx, args) => {
    const boundedLimit = Math.max(1, Math.min(MAX_REVIEW_OUTCOMES, args.limit ?? 10))
    const takeByStatus = (status: 'approved' | 'rejected') =>
      ctx.db
        .query('reviewRequests')
        .withIndex('by_status_updated_at', (q) => q.eq('status', status))
        .order('desc')
        .take(boundedLimit)
    const [approved, rejected] = await Promise.all([
      takeByStatus('approved'),
      takeByStatus('rejected'),
    ])
    const outcomes = [...approved, ...rejected]
      .filter(isReviewOutcome)
      .sort(sortNewestOutcomeFirst)
      .slice(0, boundedLimit)
    return await Promise.all(outcomes.map((outcome) => serializeReviewOutcome(ctx, outcome)))
  },
})

const MAX_REVIEW_FEEDBACK_LENGTH = 2000

export const rejectReview = callerMutation.protected({
  id: 'reviewRequests:rejectReview',
  args: {
    reviewRequestId: v.string(),
    feedback: v.optional(v.string()),
  },
  guard: canPublishEntries,
  returns: reviewRequestValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const feedback = args.feedback?.trim().slice(0, MAX_REVIEW_FEEDBACK_LENGTH) || null
    const request = await getPendingReviewOrThrow(ctx, args.reviewRequestId)
    await ctx.db.patch(request._id, {
      status: 'rejected',
      reviewedBy: appIdentity.userId,
      reviewedAt: now,
      updatedAt: now,
      reviewFeedback: feedback,
    })
    const updated = await ctx.db.get(request._id)
    if (!updated) throw new Error('Review request disappeared after rejection.')

    await logActivity(ctx, {
      kind: 'reviewRequest.rejected',
      summary: `Rejected review request "${request.title}"`,
      appIdentityId: appIdentity.userId,
      detail: feedback
        ? { reviewRequestId: args.reviewRequestId, feedback }
        : { reviewRequestId: args.reviewRequestId },
    })

    return await serializeReviewRequestWithStaleState(ctx, updated)
  },
})
