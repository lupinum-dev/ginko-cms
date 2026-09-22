import {
  acknowledgeTranslationReview as acknowledgeArgs,
  getTranslationReview as getReviewArgs,
  setTranslationSource as setSourceArgs,
  translationReviewValidator,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { can, canEditEntries, canRead } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation, callerQuery } from '../functions.js'
import { assertCollectionSupportsLocale } from '../lib/collections.js'
import { assertConvexDocumentWithinLimit, MAX_CONVEX_DOCUMENT_BYTES } from '../lib/contentLimits.js'
import { isEqualJsonValue } from '../lib/data.js'
import { assertCmsContractWritable } from '../lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { getCollectionForEntry, getEntryOrThrow, loadEntryMutationContext } from './context.js'

function snapshot(entry: Doc<'entries'>, row: Doc<'entryLocaleDrafts'>) {
  return { values: row.values, shared: entry.shared, bodyMdc: row.bodyMdc, slug: row.slug }
}

async function insertReview(
  ctx: MutationCtx,
  review: Omit<Doc<'entryTranslationReviews'>, '_id' | '_creationTime'>,
) {
  // Each locale fits separately; their combined immutable review may not.
  // Reserve space for Convex's system fields before attempting the write.
  assertConvexDocumentWithinLimit(review, {
    code: 'TRANSLATION_REVIEW_TOO_LARGE',
    label: 'The combined source and translation review',
    recovery:
      'Shorten large fields or split this entry into smaller entries before reviewing again.',
    entryId: String(review.entryId),
    locale: review.targetLocale,
    maxBytes: MAX_CONVEX_DOCUMENT_BYTES - 1_024,
  })
  return String(await ctx.db.insert('entryTranslationReviews', review))
}

/** Record an explicit source choice without treating copied text as reviewed. */
export async function recordUnreviewedTranslationSource(
  ctx: MutationCtx,
  input: {
    entry: Doc<'entries'>
    target: Pick<Doc<'entryLocaleDrafts'>, '_id' | 'locale' | 'version'>
    sourceLocale: string | null
    appIdentityId: string
    now: number
  },
) {
  return await insertReview(ctx, {
    entryId: input.entry._id,
    targetLocale: input.target.locale,
    sourceLocale: input.sourceLocale,
    sourceDraftId: null,
    targetDraftId: input.target._id,
    sourceVersion: null,
    targetVersion: input.target.version,
    sharedVersion: input.entry.sharedVersion,
    sourceSnapshot: null,
    targetSnapshot: null,
    reviewed: false,
    recordedAt: input.now,
    recordedBy: input.appIdentityId,
  })
}

async function loadReview(ctx: QueryOrMutationCtx, entryId: string, targetLocale: string) {
  const entry = await getEntryOrThrow(ctx, entryId)
  const collection = await getCollectionForEntry(ctx, entry)
  assertCollectionSupportsLocale(collection, targetLocale)
  const target = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', targetLocale))
    .unique()
  if (!target)
    throwCmsError(
      'TRANSLATION_TARGET_MISSING',
      'Create this language before reviewing its translation.',
    )
  const latestReview = await ctx.db
    .query('entryTranslationReviews')
    .withIndex('by_entry_target', (q) =>
      q.eq('entryId', entry._id).eq('targetLocale', targetLocale),
    )
    .order('desc')
    .first()
  // Recreating a missing locale starts a new working identity, not an old review.
  const review = latestReview?.targetDraftId === target._id ? latestReview : null
  const sourceLocale = review?.sourceLocale
  const source = sourceLocale
    ? await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', sourceLocale))
        .unique()
    : null
  return { entry, collection, target, review, source }
}

function changedFields(
  before: ReturnType<typeof snapshot> | null,
  after: ReturnType<typeof snapshot>,
) {
  const paths: string[] = []
  function compareValues(prefix: string, old: JsonMap, current: JsonMap) {
    for (const key of new Set([...Object.keys(old), ...Object.keys(current)])) {
      if (
        Object.hasOwn(old, key) !== Object.hasOwn(current, key) ||
        !isEqualJsonValue(old[key], current[key])
      )
        paths.push(`${prefix}${key}`)
    }
  }
  compareValues('values.', before?.values ?? {}, after.values)
  compareValues('shared.', before?.shared ?? {}, after.shared)
  if ((before?.bodyMdc ?? '') !== after.bodyMdc) paths.push('bodyMdc')
  if ((before?.slug ?? null) !== after.slug) paths.push('slug')
  return paths
}

function assertFence(
  state: Awaited<ReturnType<typeof loadReview>>,
  args: {
    expectedTargetVersion: number
    expectedTargetDraftId: string
    expectedSharedVersion: number
    expectedReviewId: string | null
  },
) {
  if (
    String(state.target._id) !== args.expectedTargetDraftId ||
    state.target.version !== args.expectedTargetVersion ||
    state.entry.sharedVersion !== args.expectedSharedVersion ||
    (state.review ? String(state.review._id) : null) !== args.expectedReviewId
  ) {
    throwCmsError(
      'TRANSLATION_REVIEW_STALE',
      'The translation or its review changed. Review the latest text before confirming.',
    )
  }
}

export const getTranslationReview = callerQuery.protected({
  id: 'editor:getTranslationReview',
  args: getReviewArgs.args,
  guard: canRead,
  returns: translationReviewValidator,
  handler: async (ctx, args) => {
    const { entry, target, review, source } = await loadReview(ctx, args.entryId, args.targetLocale)
    const sourceSnapshot = source ? snapshot(entry, source) : null
    const sourceChanged =
      review?.reviewed &&
      (review.sourceDraftId !== source?._id ||
        review.sourceVersion !== source?.version ||
        review.sharedVersion !== entry.sharedVersion)
    const targetChanged = review?.reviewed && review.targetVersion !== target.version
    const reviewed = review?.reviewed && source && !sourceChanged && !targetChanged
    return {
      _can: { edit: can(await ctx.appIdentity(), canEditEntries) },
      entryId: args.entryId,
      targetLocale: args.targetLocale,
      sourceLocale: review?.sourceLocale ?? null,
      reviewId: review ? String(review._id) : null,
      status: !review
        ? 'unknown'
        : !review.sourceLocale
          ? 'independent'
          : reviewed
            ? 'reviewed'
            : 'needs-review',
      reason:
        !review || !review.sourceLocale || reviewed
          ? null
          : !source
            ? 'source-missing'
            : !review.reviewed
              ? 'unreviewed'
              : sourceChanged
                ? 'source-changed'
                : 'target-changed',
      sourceVersion: source?.version ?? null,
      sourceDraftId: source ? String(source._id) : null,
      targetDraftId: String(target._id),
      targetVersion: target.version,
      sharedVersion: entry.sharedVersion,
      source: sourceSnapshot,
      target: snapshot(entry, target),
      reviewedSource: review?.sourceSnapshot ?? null,
      changedFields: sourceSnapshot
        ? changedFields(review?.sourceSnapshot ?? null, sourceSnapshot)
        : [],
      changedTargetFields: changedFields(review?.targetSnapshot ?? null, snapshot(entry, target)),
      reviewedAt: review?.reviewed ? review.recordedAt : null,
      reviewedBy: review?.reviewed ? review.recordedBy : null,
    }
  },
})

export const setTranslationSource = callerMutation.protected({
  id: 'editor:setTranslationSource',
  args: setSourceArgs.args,
  guard: canEditEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
    const { appIdentityId, now } = await loadEntryMutationContext(ctx, args.entryId)
    const state = await loadReview(ctx, args.entryId, args.targetLocale)
    assertFence(state, args)
    if (args.sourceLocale !== null) {
      assertCollectionSupportsLocale(state.collection, args.sourceLocale)
      if (args.sourceLocale === args.targetLocale)
        throwCmsError('TRANSLATION_SOURCE_INVALID', 'Choose a different source language.')
      const sourceLocale = args.sourceLocale
      const source = await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry_locale', (q) =>
          q.eq('entryId', state.entry._id).eq('locale', sourceLocale),
        )
        .unique()
      if (!source) throwCmsError('TRANSLATION_SOURCE_MISSING', 'Create the source language first.')
    }
    return await recordUnreviewedTranslationSource(ctx, {
      entry: state.entry,
      target: state.target,
      sourceLocale: args.sourceLocale,
      now,
      appIdentityId,
    })
  },
})

export const acknowledgeTranslationReview = callerMutation.protected({
  id: 'editor:acknowledgeTranslationReview',
  args: acknowledgeArgs.args,
  guard: canEditEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
    const { appIdentityId, now } = await loadEntryMutationContext(ctx, args.entryId)
    const state = await loadReview(ctx, args.entryId, args.targetLocale)
    assertFence(state, args)
    if (!state.review?.sourceLocale || !state.source)
      throwCmsError(
        'TRANSLATION_SOURCE_MISSING',
        'Choose an existing source language before reviewing.',
      )
    if (
      String(state.source._id) !== args.expectedSourceDraftId ||
      state.source.version !== args.expectedSourceVersion
    )
      throwCmsError(
        'TRANSLATION_REVIEW_STALE',
        'The source changed. Review the latest source before confirming.',
      )
    return await insertReview(ctx, {
      entryId: state.entry._id,
      targetLocale: args.targetLocale,
      sourceLocale: state.review.sourceLocale,
      sourceDraftId: state.source._id,
      targetDraftId: state.target._id,
      sourceVersion: state.source.version,
      targetVersion: state.target.version,
      sharedVersion: state.entry.sharedVersion,
      sourceSnapshot: snapshot(state.entry, state.source),
      targetSnapshot: snapshot(state.entry, state.target),
      reviewed: true,
      recordedAt: now,
      recordedBy: appIdentityId,
    })
  },
})
