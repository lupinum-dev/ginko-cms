import {
  createEntry as createEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import { getOwnActiveAgentRunOrThrow, recordOwnedAgentRunWrite } from '../agentRuns.js'
import { canCreateEntries, canEditEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { asEntryId } from '../lib/ids.js'
import { defineCmsOperation, hashValue } from '../operationHelpers.js'
import { getCollectionForEntry, getEntryOrThrow } from './context.js'
import { assertNoDraftSiblingPathConflict } from './draftPathConflicts.js'
import { moveEntryInTree } from './placement.js'
import { createCanonicalEntry } from './workflow/commands.js'
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

export const mcpCreateEntry = callerMutation.protected({
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
    await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, now)
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
      entryId: asEntryId(entryId),
      createdAt: now,
      expiresAt: now + 24 * 60 * 60_000,
    })
    await recordOwnedAgentRunWrite(ctx, agentRunId, 'ginko-cms.create-entry')
    return entryId
  },
})

export const reorderEntry = callerMutation.protected({
  id: 'editor:reorderEntry',
  args: reorderEntryArgs.args,
  guard: canEditEntries,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const collection = await getCollectionForEntry(ctx, entry)
    await moveEntryInTree(ctx, {
      entry,
      collection,
      appIdentityId: appIdentity.userId,
      now: Date.now(),
      parentEntryId: args.parentEntryId,
      beforeEntryId: args.beforeEntryId,
      afterEntryId: args.afterEntryId,
      activityKind: 'entry.reordered',
      activitySummary: 'Reordered entry',
      detail: ({ orderRank }) => ({ toRank: orderRank }),
    })
    return null
  },
})

export const reparentEntry = callerMutation.protected({
  id: 'editor:reparentEntry',
  args: reparentEntryArgs.args,
  guard: canEditEntries,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const collection = await getCollectionForEntry(ctx, entry)
    const fromParent = entry.parentEntryId ? String(entry.parentEntryId) : null
    const parentEntryId = args.parentEntryId ? asEntryId(args.parentEntryId) : null
    await assertValidDraftParentChain(ctx, {
      entry,
      collection,
      parentEntryId,
    })
    await assertNoDraftSiblingPathConflict(ctx, {
      entry,
      collection,
      locales: collection.locales,
      parentEntryId,
    })
    await moveEntryInTree(ctx, {
      entry,
      collection,
      appIdentityId: appIdentity.userId,
      now: Date.now(),
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
    return null
  },
})
