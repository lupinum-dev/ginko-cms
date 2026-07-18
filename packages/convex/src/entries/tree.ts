import {
  createEntry as createEntryArgs,
  duplicateEntry as duplicateEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { duplicateEntryResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import { getOwnActiveAgentRunOrThrow } from '../agentRuns.js'
import { canCreateEntries, canEditEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { asEntryId } from '../lib/ids.js'
import { assertCmsContractWritable } from '../lib/installedContract.js'
import {
  buildPreview,
  defineCmsOperation,
  definePreview,
  hashValue,
  operationEffect,
  previewResultValidator,
} from '../operationHelpers.js'
import { loadEntryMutationContext } from './context.js'
import { assertNoDraftSiblingPathConflict } from './draftPathConflicts.js'
import { moveEntryInTree, resolveEntryPlacement } from './placement.js'
import { createCanonicalEntry, duplicateCanonicalEntry } from './workflow/commands.js'
import { assertValidDraftParentChain } from './workflow/draftPlacement.js'

const createEntryDefinition = defineCmsOperation({
  id: 'ginko-cms.create-entry',
  args: createEntryArgs.args,
  guard: canCreateEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    return String(
      await createCanonicalEntry(ctx, {
        collection: args.collection,
        appIdentity: appIdentity.userId,
        locale: args.locale,
        slug: args.slug,
        shared: (args.shared as JsonMap | undefined) ?? {},
        localized: (args.localized as JsonMap | undefined) ?? {},
        bodyMdc: args.bodyMdc,
        parentEntryId: args.parentEntryId,
        orderRank: args.orderRank,
        nodeKind: args.nodeKind ?? null,
      }),
    )
  },
})

export const createEntry = callerMutation.protected(createEntryDefinition)

const duplicateEntryDefinition = defineCmsOperation({
  id: 'ginko-cms.duplicate-entry',
  args: duplicateEntryArgs.args,
  guard: canCreateEntries,
  returns: duplicateEntryResultValidator,
  load: async (ctx, args) =>
    await loadEntryMutationContext(ctx, args.sourceEntryId, {
      expectedVersion: args.expectedSourceDraftVersion,
    }),
  handler: async (_ctx, args, loaded) =>
    await duplicateCanonicalEntry(_ctx, {
      source: loaded.entry,
      collection: loaded.collection,
      appIdentityId: loaded.appIdentityId,
      now: loaded.now,
      variants: args.variants,
    }),
})

export const duplicateEntry = callerMutation.protected(duplicateEntryDefinition)

export const mcpCreateEntry = callerMutation.protected({
  acceptsTrustedCaller: true,
  id: 'editor:mcpCreateEntry',
  args: {
    agentRunId: v.string(),
    requestId: v.string(),
    ...createEntryArgs.args,
  },
  guard: canCreateEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    const { agentRunId, requestId, ...input } = args
    if (!/^[\w.:-]{1,128}$/.test(requestId)) {
      throwCmsError(
        'MCP_REQUEST_ID_INVALID',
        'requestId must be 1-128 letters, numbers, dots, underscores, colons, or hyphens.',
      )
    }

    const appIdentity = await ctx.appIdentity()
    if (appIdentity.audit.origin !== 'mcp') {
      throwCmsError('MCP_CREDENTIAL_REQUIRED', 'MCP create requires an API-key credential.')
    }
    const now = Date.now()
    const agentRun = await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, now)
    const callerKey = `${appIdentity.audit.apiKeyId}:${appIdentity.userId}`
    const argsHash = await hashValue(input)
    const receipt = await ctx.db
      .query('mcpCreateEntryReceipts')
      .withIndex('by_caller_request', (q) =>
        q.eq('callerKey', callerKey).eq('requestId', requestId),
      )
      .first()
    if (receipt && receipt.expiresAt > now) {
      if (receipt.argsHash !== argsHash) {
        throwCmsError(
          'MCP_REQUEST_ID_CONFLICT',
          'requestId was already used with different create arguments.',
          { requestId },
        )
      }
      return String(receipt.entryId)
    }
    if (receipt) await ctx.db.delete(receipt._id)

    const expiredReceipts = await ctx.db
      .query('mcpCreateEntryReceipts')
      .withIndex('by_expires_at', (q) => q.lte('expiresAt', now))
      .take(25)
    await Promise.all(expiredReceipts.map((expired) => ctx.db.delete(expired._id)))

    const entryId = await createEntryDefinition.handler(ctx, input)
    await ctx.db.insert('mcpCreateEntryReceipts', {
      callerKey,
      apiKeyId: appIdentity.audit.apiKeyId,
      requestId,
      argsHash,
      entryId: asEntryId(ctx, entryId),
      createdAt: now,
      expiresAt: now + 24 * 60 * 60_000,
    })
    await ctx.db.patch(agentRun._id, {
      updatedAt: now,
      lastWriteAt: now,
    })
    return entryId
  },
})

const treeMoveResultValidator = v.object({
  draftVersion: v.number(),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
})

const reorderEntryOperation = defineCmsOperation({
  id: 'ginko-cms.reorder-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/tree:reorderEntryOperationExecute',
  args: reorderEntryArgs.args,
  guard: canEditEntries,
  returns: treeMoveResultValidator,
  previewReturns: previewResultValidator(),
  load: async (ctx, args) =>
    await loadEntryMutationContext(ctx, args.entryId, {
      expectedVersion: args.expectedDraftVersion,
    }),
  preview: async (ctx, args, { entry, collection }) => {
    const placement = await resolveEntryPlacement(ctx, {
      collection,
      collectionSlug: entry.collection,
      parentEntryId: args.parentEntryId,
      beforeEntryId: args.beforeEntryId,
      afterEntryId: args.afterEntryId,
      currentOrder: entry.orderRank,
      excludeEntryId: entry._id,
    })
    await assertValidDraftParentChain(ctx, {
      entry,
      collection,
      parentEntryId: placement.parentEntryId,
    })
    await assertNoDraftSiblingPathConflict(ctx, {
      entry,
      collection,
      locales: collection.locales,
      parentEntryId: placement.parentEntryId,
    })
    const effect = {
      parentEntryId: placement.parentEntryId ? String(placement.parentEntryId) : null,
      orderRank: placement.orderRank,
    }
    return buildPreview({
      summary: `Reorder entry ${args.entryId}.`,
      effects: [
        operationEffect({
          kind: 'entry-placement',
          summary: 'Editorial tree placement updated',
          count: 1,
        }),
      ],
      details: effect,
      confirm: { operationId: 'ginko-cms.reorder-entry', args, effect },
      version: { draftVersion: entry.draftVersion },
    })
  },
  handler: async (ctx, args, { appIdentityId, entry, collection, now }) => {
    await assertCmsContractWritable(ctx)
    const resolved = await moveEntryInTree(ctx, {
      entry,
      collection,
      appIdentityId,
      now,
      parentEntryId: args.parentEntryId,
      beforeEntryId: args.beforeEntryId,
      afterEntryId: args.afterEntryId,
      activityKind: 'entry.reordered',
      activitySummary: 'Reordered entry',
      detail: ({ orderRank }) => ({ toRank: orderRank }),
    })
    return {
      draftVersion: resolved.draftVersion,
      parentEntryId: resolved.parentEntryId ? String(resolved.parentEntryId) : null,
      orderRank: resolved.orderRank,
    }
  },
})

export const reorderEntryOperationExecute = callerMutation.protected(reorderEntryOperation)
export const previewReorderEntryOperation = callerMutation.protected(
  Object.assign(definePreview(reorderEntryOperation), {
    id: 'entries/tree:previewReorderEntryOperation',
  }),
)

const reparentEntryOperation = defineCmsOperation({
  id: 'ginko-cms.reparent-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/tree:reparentEntryOperationExecute',
  args: reparentEntryArgs.args,
  guard: canEditEntries,
  returns: treeMoveResultValidator,
  previewReturns: previewResultValidator(),
  load: async (ctx, args) =>
    await loadEntryMutationContext(ctx, args.entryId, {
      expectedVersion: args.expectedDraftVersion,
    }),
  preview: async (ctx, args, { entry, collection }) => {
    const fromParent = entry.parentEntryId ? String(entry.parentEntryId) : null
    const placement = await resolveEntryPlacement(ctx, {
      collection,
      collectionSlug: entry.collection,
      parentEntryId: args.parentEntryId,
      beforeEntryId: args.beforeEntryId,
      afterEntryId: args.afterEntryId,
      currentOrder: entry.orderRank,
      excludeEntryId: entry._id,
    })
    await assertValidDraftParentChain(ctx, {
      entry,
      collection,
      parentEntryId: placement.parentEntryId,
    })
    await assertNoDraftSiblingPathConflict(ctx, {
      entry,
      collection,
      locales: collection.locales,
      parentEntryId: placement.parentEntryId,
    })
    const effect = {
      fromParentEntryId: fromParent,
      parentEntryId: placement.parentEntryId ? String(placement.parentEntryId) : null,
      orderRank: placement.orderRank,
    }
    return buildPreview({
      summary: `Move entry ${args.entryId} to a different parent.`,
      effects: [
        operationEffect({
          kind: 'entry-placement',
          summary: 'Editorial parent and order updated',
          count: 1,
        }),
      ],
      details: effect,
      confirm: { operationId: 'ginko-cms.reparent-entry', args, effect },
      version: { draftVersion: entry.draftVersion },
    })
  },
  handler: async (ctx, args, { appIdentityId, entry, collection, now }) => {
    await assertCmsContractWritable(ctx)
    const fromParent = entry.parentEntryId ? String(entry.parentEntryId) : null
    const resolved = await moveEntryInTree(ctx, {
      entry,
      collection,
      appIdentityId,
      now,
      parentEntryId: args.parentEntryId,
      beforeEntryId: args.beforeEntryId,
      afterEntryId: args.afterEntryId,
      activityKind: 'entry.reparented',
      activitySummary: 'Reparented entry',
      detail: ({ parentEntryId }) => ({
        fromParent,
        toParent: parentEntryId ? String(parentEntryId) : null,
      }),
    })
    return {
      draftVersion: resolved.draftVersion,
      parentEntryId: resolved.parentEntryId ? String(resolved.parentEntryId) : null,
      orderRank: resolved.orderRank,
    }
  },
})

export const reparentEntryOperationExecute = callerMutation.protected(reparentEntryOperation)
export const previewReparentEntryOperation = callerMutation.protected(
  Object.assign(definePreview(reparentEntryOperation), {
    id: 'entries/tree:previewReparentEntryOperation',
  }),
)
