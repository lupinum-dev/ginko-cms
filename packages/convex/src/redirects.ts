import {
  listRedirects as listRedirectsArgs,
  redirectInventoryPageValidator,
  retireRedirect as retireRedirectArgs,
  retireRedirectResultValidator,
} from '@lupinum/ginko-cms-contract/convex/schemas/redirects.js'
import {
  contentTags,
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'

import type { Doc } from './_generated/dataModel.js'
import { canPublishEntries, canRead } from './auth/checks.js'
import { bumpRouteGeneration, readRouteGeneration } from './entries/workflow/routeGeneration.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { toStringId } from './lib/ids.js'
import { assertCmsContractWritable } from './lib/installedContract.js'
import { enqueueRevalidationEvent } from './lib/revalidationOutbox.js'
import type { MutationCtx } from './lib/types.js'
import {
  blockedPreview,
  buildPreview,
  defineCmsOperation,
  definePreview,
  operationEffect,
  operationIssue,
  previewResultValidator,
} from './operationHelpers.js'
import {
  listRedirectInventory,
  mapRedirectInventoryItem,
  readRedirectTargetPath,
} from './redirects/inventory.js'
import { scheduleRevalidationOutboxDelivery } from './revalidation.js'

export const listRedirects = callerQuery.protected({
  id: 'redirects:listRedirects',
  args: listRedirectsArgs.args,
  guard: canRead,
  returns: redirectInventoryPageValidator,
  handler: listRedirectInventory,
})

async function enqueueRedirectRetirementRevalidation(
  ctx: MutationCtx,
  args: {
    redirect: Doc<'redirects'>
    targetPath: string | null
    appIdentityId: string
    now: number
  },
) {
  const paths = [...new Set([args.redirect.fromPath, args.targetPath].filter(Boolean))].map(
    (path) => normalizeContentPath(path),
  )
  const event = await enqueueRevalidationEvent(ctx, {
    idempotencyKey: `redirect.retire:${args.redirect.redirectId}:${args.now}`,
    versionId: `redirect:${args.redirect.redirectId}:${args.now}`,
    tags: uniqueContentTags([
      contentTags.collection(args.redirect.collection),
      ...paths.map((path) => contentTags.route(path)),
      contentTags.nav(args.redirect.collection, args.redirect.locale),
      contentTags.search(args.redirect.locale),
      contentTags.sitemap(),
    ]),
    paths,
    payload: {
      reason: 'redirect-retired',
      redirectId: args.redirect.redirectId,
      collection: args.redirect.collection,
      locale: args.redirect.locale,
      targetEntryId: toStringId(args.redirect.targetEntryId),
      sourcePath: args.redirect.fromPath,
      targetPath: args.targetPath,
      appIdentityId: args.appIdentityId,
    },
    now: args.now,
  })
  if (event.inserted) await scheduleRevalidationOutboxDelivery(ctx)
}

export const retireRedirectOperation = defineCmsOperation({
  id: 'ginko-cms.retire-redirect',
  kind: 'destructive',
  executeFunctionRef: 'editor:retireRedirectOperationExecute',
  args: retireRedirectArgs.args,
  guard: canPublishEntries,
  returns: retireRedirectResultValidator,
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
    const redirect = await ctx.db
      .query('redirects')
      .withIndex('by_redirect_id', (query) => query.eq('redirectId', args.redirectId))
      .unique()
    if (!redirect) return { redirect: null, targetPath: null, routeGeneration: null }
    return {
      redirect,
      targetPath: await readRedirectTargetPath(ctx, redirect),
      routeGeneration: await readRouteGeneration(ctx, redirect.collection, redirect.locale),
    }
  },
  preview: async (_ctx, args, { redirect, targetPath, routeGeneration }) => {
    if (!redirect) {
      return blockedPreview({
        summary: 'Redirect not found.',
        blocker: operationIssue({
          code: 'redirect-not-found',
          message: 'Redirect not found.',
        }),
        confirm: { operationId: 'ginko-cms.retire-redirect', args },
        version: null,
      })
    }
    if (redirect.state !== 'active') {
      return blockedPreview({
        summary: `Redirect ${args.redirectId} is already retired.`,
        blocker: operationIssue({
          code: 'redirect-already-retired',
          message: 'Only an active redirect can be retired.',
        }),
        details: mapRedirectInventoryItem(redirect, targetPath),
        confirm: { operationId: 'ginko-cms.retire-redirect', args },
        version: {
          redirectId: args.redirectId,
          state: redirect.state,
          updatedAt: redirect.updatedAt,
          routeGeneration,
        },
      })
    }

    return buildPreview({
      summary: `Will retire redirect ${redirect.fromPath}.`,
      warnings: [
        operationIssue({
          code: 'redirect-source-will-stop-resolving',
          message: `${redirect.fromPath} will stop redirecting after this operation.`,
        }),
      ],
      effects: [
        operationEffect({ kind: 'redirects', summary: 'Active redirects retired', count: 1 }),
        operationEffect({
          kind: 'routes',
          summary: 'Route paths revalidated',
          count: targetPath === null ? 1 : 2,
        }),
      ],
      details: mapRedirectInventoryItem(redirect, targetPath),
      confirm: {
        operationId: 'ginko-cms.retire-redirect',
        args,
        effect: {
          redirectId: args.redirectId,
          fromPath: redirect.fromPath,
          targetPath,
        },
      },
      version: {
        redirectId: args.redirectId,
        state: redirect.state,
        updatedAt: redirect.updatedAt,
        routeGeneration,
      },
    })
  },
  handler: async (ctx, _args, { redirect, targetPath }) => {
    if (!redirect || redirect.state !== 'active') {
      throwCmsError('REDIRECT_NOT_ACTIVE', 'Only an active redirect can be retired.')
    }
    const appIdentity = await ctx.appIdentity()
    const retiredAt = Math.max(Date.now(), redirect.updatedAt + 1)
    await ctx.db.patch(redirect._id, {
      state: 'retired',
      retiredBy: appIdentity.userId,
      retiredAt,
      updatedAt: retiredAt,
    })
    await bumpRouteGeneration(ctx, redirect.collection, redirect.locale, retiredAt)
    await enqueueRedirectRetirementRevalidation(ctx, {
      redirect,
      targetPath,
      appIdentityId: appIdentity.userId,
      now: retiredAt,
    })
    await logActivity(ctx, {
      kind: 'redirect.retired',
      summary: `Retired redirect ${redirect.fromPath}`,
      appIdentityId: appIdentity.userId,
      collection: redirect.collection,
      locale: redirect.locale,
      detail: {
        redirectId: redirect.redirectId,
        fromPath: redirect.fromPath,
        targetEntryId: toStringId(redirect.targetEntryId),
        targetPath,
        kind: redirect.kind,
        source: redirect.source,
        statusCode: redirect.statusCode,
      },
      createdAt: retiredAt,
    })
    return {
      redirectId: redirect.redirectId,
      fromPath: redirect.fromPath,
      targetPath,
      retiredAt,
    }
  },
})

export const retireRedirectOperationExecute = callerMutation.protected(retireRedirectOperation)
export const previewRetireRedirectOperation = callerMutation.protected(
  Object.assign(definePreview(retireRedirectOperation), {
    id: 'editor:previewRetireRedirectOperation',
  }),
)
