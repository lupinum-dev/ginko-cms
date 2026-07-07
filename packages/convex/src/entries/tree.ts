import {
  createEntry as createEntryArgs,
  deleteEntry as deleteEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { recordOwnedAgentRunWrite } from '../agentRuns.js'
import { canCreateEntries, canDeleteEntries, canEditEntries } from '../auth/checks.js'
import { assertBackupArtifactCoversPurge } from '../backup.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { logActivity } from '../lib/activity.js'
import {
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from '../operationHelpers.js'
import {
  deleteEntryRecords,
  getCollectionForEntry,
  getEntryOrThrow,
  readStudioDraftView,
} from './context.js'
import { moveEntryInTree, reparentChildEntries } from './placement.js'
import { previewDestructiveEntryOperation } from './read.js'
import { createCanonicalEntry } from './workflow/commands.js'
import { publicPathForLocaleSnapshot } from './workflow/path.js'

async function assertNoPublicRoutesForDelete(
  ctx: Parameters<typeof previewDestructiveEntryOperation>[0],
  entryId: string,
): Promise<void> {
  const result = await previewDestructiveEntryOperation(ctx, entryId)
  if (result.publicRoutes.length === 0 && result.publicDescendantRoutes.length === 0) return
  throwCmsError(
    'ENTRY_HAS_PUBLIC_ROUTES',
    'Permanent deletion is blocked while the entry or its descendants have public routes. Unpublish or archive every published locale first.',
    {
      entryId,
      suggestedAction: 'unpublish-or-archive',
      publicRoutes: result.publicRoutes,
      publicDescendantRoutes: result.publicDescendantRoutes,
    },
  )
}

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

export const deleteEntryOperation = defineCmsOperation({
  id: 'ginko-cms.delete-entry',
  name: 'delete-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/tree:deleteEntryOperationExecute',
  args: deleteEntryArgs.args,
  guard: canDeleteEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const entry = await getEntryOrThrow(ctx, args.entryId)
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
    }
  },
  preview: async (ctx, args, { entry }) => {
    if (!args.exportArtifactId) {
      throwCmsError(
        'BACKUP_REQUIRED',
        'Permanent entry deletion requires a matching backup export.',
        {
          entryId: args.entryId,
          suggestedAction: 'export-backup',
          nextAction: {
            tool: 'export-backup',
            args: {
              scope: 'entry',
              entryId: args.entryId,
            },
          },
        },
      )
    }
    const result = await previewDestructiveEntryOperation(ctx, args.entryId)
    const publicRouteBlockers = []
    if (result.publicRoutes.length > 0) {
      publicRouteBlockers.push(
        operationIssue({
          code: 'public-routes-present',
          message:
            'Permanent deletion is blocked while the entry has public routes. Unpublish or archive every published locale first.',
          details: { publicRoutes: result.publicRoutes },
        }),
      )
    }
    if (result.publicDescendantRoutes.length > 0) {
      publicRouteBlockers.push(
        operationIssue({
          code: 'published-descendants',
          message:
            'Permanent deletion is blocked while published descendant routes would remain live under this entry.',
          details: { publicDescendantRoutes: result.publicDescendantRoutes },
        }),
      )
    }
    return buildPreview({
      summary: `Will permanently delete "${result.displayLabel ?? result.baseSlug}" and ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: publicRouteBlockers.length === 0,
      blockers: publicRouteBlockers,
      warnings: [
        operationIssue({
          code: 'permanent-delete',
          message: `This cannot be undone. Asset handling: ${args.assetMode ?? 'delete'}.`,
        }),
      ],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes affected',
          count: result.publicRoutes.length,
        }),
        operationEffect({
          kind: 'descendant-routes',
          summary: 'Published descendant routes checked',
          count: result.publicDescendantRoutes.length,
        }),
      ],
      details: {
        publicRoutes: result.publicRoutes,
        publicDescendantRoutes: result.publicDescendantRoutes,
        draftVersion: entry.draftVersion,
      },
      confirm: {
        operationId: 'ginko-cms.delete-entry',
        args,
        effect: {
          publicRoutes: result.publicRoutes,
          publicDescendantRoutes: result.publicDescendantRoutes,
          draftVersion: entry.draftVersion,
        },
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestRevisionId ? String(entry.latestRevisionId) : null,
        publicDescendantRouteCount: result.publicDescendantRoutes.length,
      },
    })
  },
  handler: async (ctx, args, { entry, collection }) => {
    const appIdentity = await ctx.appIdentity()
    if (!args.exportArtifactId) {
      throwCmsError(
        'BACKUP_REQUIRED',
        'Permanent entry deletion requires a matching backup export.',
        {
          entryId: args.entryId,
          suggestedAction: 'export-backup',
          nextAction: {
            tool: 'export-backup',
            args: {
              scope: 'entry',
              entryId: args.entryId,
            },
          },
        },
      )
    }
    await assertNoPublicRoutesForDelete(ctx, args.entryId)
    await assertBackupArtifactCoversPurge(ctx, args.exportArtifactId, {
      scope: 'entry',
      entryId: args.entryId,
    })
    await deleteEntryRecordsDirectly(ctx, {
      entry,
      collection,
      appIdentityId: appIdentity.userId,
      now: Date.now(),
      assetMode: args.assetMode,
    })
    return null
  },
})

export const deleteEntryOperationExecute = callerMutation.protected(deleteEntryOperation)
export const previewDeleteEntryOperation = callerMutation.protected(
  Object.assign(definePreview(deleteEntryOperation), {
    id: 'entries/tree:previewDeleteEntryOperation',
  }),
)

async function deleteEntryRecordsDirectly(
  ctx: Parameters<typeof deleteEntryRecords>[0],
  args: {
    entry: Awaited<ReturnType<typeof getEntryOrThrow>>
    collection: Awaited<ReturnType<typeof getCollectionForEntry>>
    appIdentityId: string
    now: number
    assetMode?: 'delete' | 'moveToCollection'
  },
) {
  const assets = await ctx.db
    .query('assets')
    .withIndex('by_entry', (q) => q.eq('entryId', args.entry._id))
    .collect()
  for (const asset of assets) {
    if (args.assetMode === 'moveToCollection') {
      await ctx.db.patch(asset._id, {
        scope: 'collection',
        entryId: null,
        collectionId: args.entry.collectionId,
        updatedBy: args.appIdentityId,
        updatedAt: args.now,
      })
    } else {
      await ctx.storage.delete(asset.storageId)
      await ctx.db.delete(asset._id)
    }
  }

  const children = await reparentChildEntries(ctx, {
    entry: args.entry,
    collection: args.collection,
    appIdentityId: args.appIdentityId,
    now: args.now,
  })

  await deleteEntryRecords(ctx, args.entry._id)
  await ctx.db.delete(args.entry._id)

  await logActivity(ctx, {
    kind: 'entry.deleted',
    summary: 'Deleted entry',
    appIdentityId: args.appIdentityId,
    collectionId: args.entry.collectionId,
    detail: {
      assetMode: args.assetMode ?? 'delete',
      childrenReparented: children.length,
    },
  })
}
