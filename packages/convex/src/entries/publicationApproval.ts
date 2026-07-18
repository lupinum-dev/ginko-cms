import type { publishEntry as publishEntryArgs } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'

import { can } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import {
  buildPreview,
  type CmsOperationDefinition,
  executeDestructiveOperation,
  operationApplied,
  writeAppliedOperationReceipt,
} from '../operationHelpers.js'
import { computePublishDraftHash } from './workflow/commands.js'

export type PublishOperationArgs = {
  entryId: string
  locales: string[]
  message?: string
  expectedVersion: number
}

export type PublishAuthorization =
  | { kind: 'confirmation'; token?: string }
  | {
      kind: 'review'
      reviewRequestId: string
      versionHash: string
      previewHash: string
    }

type PublishOperation<TLoaded, TResult> = CmsOperationDefinition<
  typeof publishEntryArgs.args,
  TLoaded,
  TResult
> & {
  kind: 'destructive'
  load: NonNullable<CmsOperationDefinition<typeof publishEntryArgs.args, TLoaded, TResult>['load']>
  preview: NonNullable<
    CmsOperationDefinition<typeof publishEntryArgs.args, TLoaded, TResult>['preview']
  >
}

type PublishOperationCtx = Parameters<PublishOperation<unknown, unknown>['handler']>[0]

export function canonicalPublishLocales(locales: string[]) {
  return [...new Set(locales)].sort()
}

function sameLocales(left: string[], right: string[]) {
  const canonicalLeft = canonicalPublishLocales(left)
  const canonicalRight = canonicalPublishLocales(right)
  return (
    canonicalLeft.length === canonicalRight.length &&
    canonicalLeft.every((locale, index) => locale === canonicalRight[index])
  )
}

async function assertReviewPublishAuthorization(
  ctx: PublishOperationCtx,
  args: PublishOperationArgs,
  authorization: Extract<PublishAuthorization, { kind: 'review' }>,
) {
  const reviewRequestId = ctx.db.normalizeId('reviewRequests', authorization.reviewRequestId)
  const request = reviewRequestId ? await ctx.db.get(reviewRequestId) : null
  if (
    !request ||
    request.status !== 'pending' ||
    request.entryId !== args.entryId ||
    request.expectedVersion !== args.expectedVersion ||
    !sameLocales(request.locales, args.locales) ||
    (request.message ?? null) !== (args.message ?? null) ||
    request.versionHash !== authorization.versionHash ||
    request.previewHash !== authorization.previewHash
  ) {
    throwCmsError('REVIEW_REQUEST_STALE', 'Review authorization no longer matches the publish.', {
      reviewRequestId: authorization.reviewRequestId,
    })
  }

  const entryId = ctx.db.normalizeId('entries', args.entryId)
  if (!entryId) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: args.entryId })
  const currentVersionHash = await computePublishDraftHash(ctx, {
    entryId,
    locales: canonicalPublishLocales(args.locales),
  })
  if (currentVersionHash !== request.versionHash) {
    throwCmsError('REVIEW_REQUEST_STALE', 'Review authorization no longer matches the draft.', {
      reviewRequestId: authorization.reviewRequestId,
    })
  }
}

/** Studio confirmations and pinned reviews share one operation executor. */
export async function executeCanonicalPublish<TLoaded, TResult>(
  ctx: PublishOperationCtx,
  operation: PublishOperation<TLoaded, TResult>,
  input: PublishOperationArgs,
  authorization: PublishAuthorization,
) {
  if (authorization.kind === 'confirmation') {
    return await executeDestructiveOperation(ctx, operation, input, authorization.token)
  }

  const args = { ...input, locales: canonicalPublishLocales(input.locales) }
  const identity = await ctx.appIdentity()
  if (!identity || (operation.guard && !can(identity, operation.guard))) {
    throwCmsError('REVIEW_REQUEST_FORBIDDEN', 'Publish permission is required to approve review.', {
      reviewRequestId: authorization.reviewRequestId,
    })
  }
  await assertReviewPublishAuthorization(ctx, args, authorization)
  const loaded = await operation.load(ctx, args)
  const preview = buildPreview(await operation.preview(ctx, args, loaded))
  if (!preview.allowed) {
    throwCmsError('REVIEW_PUBLISH_BLOCKED', 'Review request is no longer publishable.', {
      reviewRequestId: authorization.reviewRequestId,
      blockerCount: preview.blockers.length,
    })
  }

  // Any unexpected failure rolls back publication, projections, activity,
  // outbox, the applied receipt, and the enclosing review approval together.
  const value = await operation.handler(ctx, args, loaded)
  await writeAppliedOperationReceipt(ctx, {
    operation,
    authorizationId: `review:${authorization.reviewRequestId}`,
    args,
    preview,
  })
  return operationApplied(await value)
}
