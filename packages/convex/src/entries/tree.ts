import {
  createEntry as createEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { recordOwnedAgentRunWrite } from '../agentRuns.js'
import { canCreateEntries, canEditEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { defineCmsOperation } from '../operationHelpers.js'
import { getCollectionForEntry, getEntryOrThrow, readStudioDraftView } from './context.js'
import { moveEntryInTree } from './placement.js'
import { createCanonicalEntry } from './workflow/commands.js'
import { publicPathForLocaleSnapshot } from './workflow/path.js'

export const createEntryOperation = defineCmsOperation({
  id: 'ginko-cms.create-entry',
  name: 'create-entry',
  kind: 'safe',
  safety: 'bounded-write',
  executeFunctionRef: 'entries/tree:createEntry',
  args: createEntryArgs.args,
  guard: canCreateEntries,
  returns: v.string(),
  load: async () => undefined,
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
        parentEntryId: args.parentEntryId,
        orderRank: args.orderRank,
        nodeKind: args.nodeKind ?? null,
      }),
    )
  },
})

export const createEntry = callerMutation.protected(createEntryOperation)

export const mcpCreateEntry = callerMutation.protected({
  id: 'editor:mcpCreateEntry',
  args: {
    agentRunId: v.string(),
    ...createEntryArgs.args,
  },
  guard: canCreateEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    const { agentRunId, ...input } = args
    await recordOwnedAgentRunWrite(ctx, agentRunId, 'ginko-cms.create-entry')
    return await createEntryOperation.handler(ctx, input)
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
    await assertNoDraftPathConflictForMove(ctx, {
      entry,
      collection,
      parentEntryId: args.parentEntryId,
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

async function assertNoDraftPathConflictForMove(
  ctx: Parameters<typeof readStudioDraftView>[0],
  args: {
    entry: Awaited<ReturnType<typeof getEntryOrThrow>>
    collection: Awaited<ReturnType<typeof getCollectionForEntry>>
    parentEntryId?: string
  },
) {
  const movingView = await readStudioDraftView(ctx, args.entry, args.collection)
  const parent = args.parentEntryId ? await getEntryOrThrow(ctx, args.parentEntryId) : null
  const parentView = parent ? await readStudioDraftView(ctx, parent, args.collection) : null
  const candidatePaths = new Map<string, string>()

  for (const localeView of movingView.locales) {
    const slug = localeView.draftSlug ?? args.entry.baseSlug
    const parentLocale = parentView?.locales.find((item) => item.locale === localeView.locale)
    const parentPath = parentLocale?.draftPath ?? null
    const candidatePath = parentPath
      ? `${parentPath.replace(/\/$/, '')}/${slug}`
      : publicPathForLocaleSnapshot(args.collection, slug, localeView.locale)
    candidatePaths.set(localeView.locale, candidatePath)
  }

  const statuses: Array<Doc<'entries'>['status']> = ['draft', 'published', 'archived']
  const entries = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query('entries')
          .withIndex('by_collection_status', (q) =>
            q.eq('collectionId', args.entry.collectionId).eq('status', status),
          )
          .collect(),
      ),
    )
  ).flat()

  for (const other of entries) {
    if (other._id === args.entry._id) continue
    const otherView = await readStudioDraftView(ctx, other, args.collection)
    for (const localeView of otherView.locales) {
      const candidate = candidatePaths.get(localeView.locale)
      if (!candidate || localeView.draftPath !== candidate) continue
      throwCmsError(
        'ENTRY_PATH_CONFLICT',
        `Path "${candidate}" already exists for locale "${localeView.locale}"`,
        {
          entryId: String(args.entry._id),
          conflictingEntryId: String(other._id),
          locale: localeView.locale,
          path: candidate,
        },
      )
    }
  }
}
