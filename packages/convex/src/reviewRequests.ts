import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { getOwnActiveAgentRunOrThrow, recordOwnedAgentRunWrite } from './agentRuns.js'
import { canEditEntries, canPublishEntries } from './auth/checks.js'
import { computePublishDraftHash, publishCurrentDraft } from './entries/workflow/commands.js'
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
  agentRunId: v.string(),
  operationId: v.literal('ginko-cms.publish-entry'),
  entryId: v.string(),
  locales: v.array(v.string()),
  expectedVersion: v.number(),
  message: v.union(v.string(), v.null()),
  title: v.string(),
  summary: v.string(),
  status: reviewRequestStatusValidator,
  preview: jsonObjectValidator,
  requestedBy: v.string(),
  reviewedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
  versionHash: v.union(v.string(), v.null()),
  isStale: v.boolean(),
  staleReason: v.union(v.string(), v.null()),
})

type ReviewRequestDoc = Doc<'reviewRequests'>
const MAX_REVIEW_REQUESTS = 100

function serializeReviewRequest(
  request: ReviewRequestDoc,
  stale: { isStale: boolean; staleReason: string | null } = {
    isStale: false,
    staleReason: null,
  },
) {
  return {
    _id: String(request._id),
    agentRunId: String(request.agentRunId),
    operationId: 'ginko-cms.publish-entry',
    entryId: request.entryId,
    locales: request.locales,
    expectedVersion: request.expectedVersion,
    message: request.message ?? null,
    title: request.title,
    summary: request.summary,
    status: request.status,
    preview: request.preview,
    requestedBy: request.requestedBy,
    reviewedBy: request.reviewedBy ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    reviewedAt: request.reviewedAt ?? null,
    versionHash: request.versionHash ?? null,
    isStale: stale.isStale,
    staleReason: stale.staleReason,
  }
}

async function reviewStaleState(
  ctx: { db: { get: (id: Id<'entries'>) => Promise<Doc<'entries'> | null> } },
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
      staleReason: `Draft version changed from ${request.expectedVersion} to ${entry.draftVersion}.`,
    }
  }
  return { isStale: false, staleReason: null }
}

async function serializeReviewRequestWithStaleState(
  ctx: Parameters<typeof reviewStaleState>[0],
  request: ReviewRequestDoc,
) {
  return serializeReviewRequest(request, await reviewStaleState(ctx, request))
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

export const requestPublishReview = callerMutation.protected({
  id: 'reviewRequests:requestPublishReview',
  args: {
    agentRunId: v.string(),
    entryId: v.string(),
    locales: v.array(v.string()),
    expectedVersion: v.number(),
    message: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    summary: v.string(),
    preview: jsonObjectValidator,
    versionHash: v.optional(v.union(v.string(), v.null())),
  },
  guard: canEditEntries,
  returns: reviewRequestValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    await getOwnActiveAgentRunOrThrow(ctx, args.agentRunId, appIdentity, now)
    if (args.locales.length === 0) {
      throwCmsError(
        'REVIEW_REQUEST_LOCALES_REQUIRED',
        'Publish review requires at least one locale.',
      )
    }
    await recordOwnedAgentRunWrite(ctx, args.agentRunId, 'ginko-cms.request-publish-review')

    const id = await ctx.db.insert('reviewRequests', {
      agentRunId: args.agentRunId as Id<'agentRuns'>,
      entryId: args.entryId,
      locales: Array.from(new Set(args.locales)),
      expectedVersion: args.expectedVersion,
      message: args.message ?? null,
      title: args.title,
      summary: args.summary,
      status: 'pending',
      preview: args.preview,
      requestedBy: appIdentity.userId,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      versionHash: args.versionHash ?? null,
    })
    const request = await ctx.db.get(id)
    if (!request) throw new Error('Review request disappeared after create.')

    await logActivity(ctx, {
      kind: 'reviewRequest.created',
      summary: `Created review request "${args.title}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        reviewRequestId: String(id),
        agentRunId: args.agentRunId,
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
    if (
      args.expectedVersionHash !== undefined &&
      args.expectedVersionHash !== null &&
      request.versionHash !== args.expectedVersionHash
    ) {
      throwCmsError('REVIEW_REQUEST_STALE', 'Review request is stale.', {
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
        result: {
          versionId: String(publishResult.revisionId),
          affectedLocales: publishResult.affectedLocales,
        },
      },
    })

    return await serializeReviewRequestWithStaleState(ctx, updated)
  },
})

export const rejectReview = callerMutation.protected({
  id: 'reviewRequests:rejectReview',
  args: {
    reviewRequestId: v.string(),
  },
  guard: canPublishEntries,
  returns: reviewRequestValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const request = await getPendingReviewOrThrow(ctx, args.reviewRequestId)
    await ctx.db.patch(request._id, {
      status: 'rejected',
      reviewedBy: appIdentity.userId,
      reviewedAt: now,
      updatedAt: now,
    })
    const updated = await ctx.db.get(request._id)
    if (!updated) throw new Error('Review request disappeared after rejection.')

    await logActivity(ctx, {
      kind: 'reviewRequest.rejected',
      summary: `Rejected review request "${request.title}"`,
      appIdentityId: appIdentity.userId,
      detail: { reviewRequestId: args.reviewRequestId },
    })

    return await serializeReviewRequestWithStaleState(ctx, updated)
  },
})
