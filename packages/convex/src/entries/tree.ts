import {
  createEntry as createEntryArgs,
  deleteEntry as deleteEntryArgs,
  reorderEntry as reorderEntryArgs,
  reparentEntry as reparentEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  defineOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
  previewOf,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { canCreateEntries, canDeleteEntries, canEditEntries } from '../auth/checks.js'
import { assertBackupArtifactCoversPurge } from '../backup.js'
import { throwCmsError } from '../errors.js'
import { callerMutation, callerTransportMutation } from '../functions.js'
import { logActivity } from '../lib/activity.js'
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
  if (result.publicRoutes.length === 0) return
  throwCmsError(
    'ENTRY_HAS_PUBLIC_ROUTES',
    'Permanent deletion is blocked while the entry has public routes. Unpublish or archive every published locale first.',
    {
      entryId,
      suggestedAction: 'unpublish-or-archive',
      publicRoutes: result.publicRoutes,
    },
  )
}

export const createEntry = callerMutation.protected({
  identityForwardingFunctionRef: 'editor:createEntry',
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
        parentEntryId: args.parentEntryId,
        orderRank: args.orderRank,
        nodeKind: args.nodeKind ?? null,
      }),
    )
  },
})

export const reorderEntry = callerMutation.protected({
  identityForwardingFunctionRef: 'editor:reorderEntry',
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
  identityForwardingFunctionRef: 'editor:reparentEntry',
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

  const entries = await ctx.db
    .query('entries')
    .filter((q) => q.eq(q.field('collectionId'), args.entry.collectionId))
    .collect()

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

export const deleteEntryOperation = defineOperation({
  id: 'ginko-cms.delete-entry',
  name: 'delete-entry',
  kind: 'destructive',
  identityForwardingFunctionRef: 'entries/tree:deleteEntryOperationExecute',
  args: deleteEntryArgs.args,
  guard: canDeleteEntries,
  returns: v.null(),
  previewReturns: operationPreviewValidator(),
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
    return operationPreview({
      summary: `Will permanently delete "${result.displayLabel ?? result.baseSlug}" and ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: result.publicRoutes.length === 0,
      blockers: result.publicRoutes.length
        ? [
            operationIssue({
              code: 'public-routes-present',
              message:
                'Permanent deletion is blocked while the entry has public routes. Unpublish or archive every published locale first.',
              details: { publicRoutes: result.publicRoutes },
            }),
          ]
        : [],
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
      ],
      details: {
        publicRoutes: result.publicRoutes,
        draftVersion: entry.draftVersion,
      },
      confirm: {
        operationId: 'ginko-cms.delete-entry',
        args,
        effect: {
          publicRoutes: result.publicRoutes,
          draftVersion: entry.draftVersion,
        },
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestRevisionId ? String(entry.latestRevisionId) : null,
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

export const deleteEntryOperationExecute = callerMutation.protected({
  ...deleteEntryOperation,
})
export const deleteEntryTransportExecute = callerTransportMutation({
  ...deleteEntryOperation,
  identityForwardingFunctionRef: 'entries/tree:deleteEntryTransportExecute',
})
export const previewDeleteEntryOperation = callerMutation.protected(
  Object.assign(previewOf(deleteEntryOperation), {
    identityForwardingFunctionRef: 'editor:previewDeleteEntryOperation',
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
