import {
  archiveEntry as archiveEntryArgs,
  createCheckpoint as createCheckpointArgs,
  publishEntry as publishEntryArgs,
  rollbackVersion as rollbackVersionArgs,
  unarchiveEntry as unarchiveEntryArgs,
  unpublishEntry as unpublishEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  publishResultValidator,
  rollbackResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import {
  defineOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
  previewOf,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import { canArchiveEntries, canEditEntries, canPublishEntries } from '../auth/checks.js'
import { previewPublishImpactForEntry } from '../diagnostics.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { logActivity } from '../lib/activity.js'
import { asEntryId } from '../lib/ids.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { getCollectionForEntry, loadEntryMutationContext } from './context.js'
import { previewDestructiveEntryOperation } from './read.js'
import {
  archiveCurrentEntry,
  computePublishDraftHash,
  createDraftCheckpoint,
  publishCurrentDraft,
  restoreRevisionSnapshotToDraft,
  unpublishCurrentPublic,
} from './workflow/commands.js'
import { readPublicRevisionIdsByLocale } from './workflow/projection.js'

function formatAffectedRoutes(
  routes: Array<{ locale: string; href: string; path?: string | null }>,
): string {
  return routes.map((route) => `${route.locale}: ${route.href}`).join(', ')
}

async function loadRevisionForRollback(
  ctx: QueryOrMutationCtx,
  args: { entryId: string; versionId: string },
) {
  const entry = await ctx.db.get(asEntryId(args.entryId))
  if (!entry) {
    throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', {
      entryId: args.entryId,
    })
  }
  const revision = await ctx.db.get(args.versionId as Id<'entryRevisions'>)
  if (!revision || revision.entryId !== entry._id) {
    throwCmsError('ENTRY_VERSION_NOT_FOUND', 'Version not found', {
      entryId: args.entryId,
      versionId: args.versionId,
    })
  }
  return {
    entry,
    revision,
    revisionNumber: revision.revisionNumber ?? 0,
  }
}

async function runCanonicalRollbackVersion(
  ctx: Parameters<typeof restoreRevisionSnapshotToDraft>[0],
  args: {
    entry: Awaited<ReturnType<typeof loadRevisionForRollback>>['entry']
    revision: Awaited<ReturnType<typeof loadRevisionForRollback>>['revision']
    revisionNumber: number
    appIdentityId: string
    publish: boolean
  },
) {
  const now = Date.now()
  const restoredDraft = await restoreRevisionSnapshotToDraft(ctx, {
    entry: args.entry,
    sourceRevision: args.revision,
    appIdentity: args.appIdentityId,
    now,
    expectedDraftVersion: args.entry.draftVersion,
  })

  if (!args.publish) {
    return { versionId: String(args.revision._id) }
  }

  const locales = Object.entries(args.revision.snapshot.locales)
    .filter(([, snapshot]) => snapshot !== null)
    .map(([locale]) => locale)
    .sort()
  const expectedDraftHash = await computePublishDraftHash(ctx, {
    entryId: args.entry._id,
    locales,
  })
  const result = await publishCurrentDraft(ctx, {
    entryId: args.entry._id,
    locales,
    expectedDraftVersion: restoredDraft.draftVersion,
    expectedDraftHash,
    appIdentity: args.appIdentityId,
    kind: 'rollback',
    message: `Restored and published version ${args.revisionNumber}`,
  })

  return { versionId: String(result.revisionId) }
}

export const publishEntryOperation = defineOperation({
  id: 'ginko-cms.publish-entry',
  name: 'publish-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:publishEntryOperationExecute',
  args: publishEntryArgs.args,
  guard: canPublishEntries,
  returns: publishResultValidator,
  previewReturns: operationPreviewValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', {
        entryId: args.entryId,
      })
    }
    if (entry.draftVersion !== args.expectedVersion) {
      throwCmsError(
        'ENTRY_CONCURRENT_EDIT',
        'This entry changed in another session. Reload and try again.',
        {
          entryId: args.entryId,
          expectedVersion: args.expectedVersion,
          actualVersion: entry.draftVersion,
          currentVersion: entry.draftVersion,
          retryable: true,
        },
      )
    }
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
    }
  },
  preview: async (ctx, args, { entry, collection }) => {
    const result = await previewPublishImpactForEntry(ctx, {
      collection: collection.slug,
      entryId: args.entryId,
      locales: args.locales,
    })
    const localeStatuses = result.locales.map((item) => `${item.locale}: ${item.status}`)
    const blocked = result.status === 'not_publishable' || result.status === 'blocked'
    const blockingMessages = result.blockingDiagnostics.map((item) => item.message).filter(Boolean)
    const warnings = result.warnings.map((item) => item.message).filter(Boolean)
    const affectedRoutes = result.changes.filter((change) => change.kind === 'route').length
    const dirtyLocaleCount = (entry.dirtyLocales as string[]).filter((locale) =>
      args.locales.includes(locale),
    ).length
    return operationPreview({
      summary: `Publish impact for entry ${args.entryId} (${args.locales.join(', ') || 'all requested locales'}): ${result.status}${localeStatuses.length ? ` - ${localeStatuses.join(', ')}` : ''}.`,
      allowed: !blocked,
      blockers: blockingMessages.map((message) =>
        operationIssue({ code: 'publish-blocker', message }),
      ),
      warnings: warnings.map((message) => operationIssue({ code: 'publish-warning', message })),
      effects: [
        operationEffect({
          kind: 'locales',
          summary: 'Locales evaluated',
          count: result.locales.length,
        }),
        operationEffect({
          kind: 'dirty-locales',
          summary: 'Dirty locales to publish',
          count: dirtyLocaleCount,
        }),
        operationEffect({
          kind: 'routes',
          summary: 'Public routes affected',
          count: affectedRoutes,
        }),
        operationEffect({
          kind: 'changes',
          summary: 'Public output changes',
          count: result.changes.length,
        }),
        operationEffect({
          kind: 'events',
          summary: 'Revalidation events',
          count: result.events.length,
        }),
      ],
      details: {
        locales: result.locales,
        changes: result.changes,
        events: result.events,
      },
      confirm: {
        operationId: 'ginko-cms.publish-entry',
        args,
        status: result.status,
        changes: result.changes,
        events: result.events,
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestRevisionId ? String(entry.latestRevisionId) : null,
      },
    })
  },
  handler: async (ctx, args, { entry }) => {
    const appIdentity = await ctx.appIdentity()
    const expectedDraftHash = await computePublishDraftHash(ctx, {
      entryId: entry._id,
      locales: args.locales,
    })
    const result = await publishCurrentDraft(ctx, {
      entryId: entry._id,
      locales: args.locales,
      expectedDraftVersion: args.expectedVersion,
      expectedDraftHash,
      appIdentity: appIdentity.userId,
      message: args.message ?? null,
    })
    const refreshed = await ctx.db.get(entry._id)
    return {
      versionId: String(result.revisionId),
      dirtyLocales: refreshed?.dirtyLocales ?? [],
      draftVersion: refreshed?.draftVersion ?? args.expectedVersion,
    }
  },
})

export const publishEntryOperationExecute = callerMutation.protected({
  ...publishEntryOperation,
})
export const previewPublishEntryOperation = callerMutation.protected(
  Object.assign(previewOf(publishEntryOperation), {
    id: 'editor:previewPublishEntryOperation',
  }),
)

export const unpublishEntryOperation = defineOperation({
  id: 'ginko-cms.unpublish-entry',
  name: 'unpublish-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:unpublishEntryOperationExecute',
  args: unpublishEntryArgs.args,
  guard: canPublishEntries,
  returns: v.null(),
  previewReturns: operationPreviewValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
    }
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
    }
  },
  preview: async (ctx, args, { entry }) => {
    const result = await previewDestructiveEntryOperation(ctx, args.entryId)
    return operationPreview({
      summary: `Will unpublish "${result.displayLabel ?? result.baseSlug}" and remove ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: result.publicRoutes.length > 0,
      blockers:
        result.publicRoutes.length === 0
          ? [operationIssue({ code: 'not-public', message: 'Entry is not currently public.' })]
          : [],
      warnings: result.publicRoutes.length
        ? [
            operationIssue({
              code: 'affected-routes',
              message: `Affected routes: ${formatAffectedRoutes(result.publicRoutes)}`,
            }),
          ]
        : [],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes removed',
          count: result.publicRoutes.length,
        }),
      ],
      details: { publicRoutes: result.publicRoutes },
      confirm: {
        operationId: 'ginko-cms.unpublish-entry',
        args,
        effect: result.publicRoutes,
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestRevisionId ? String(entry.latestRevisionId) : null,
      },
    })
  },
  handler: async (ctx, args, { entry, collection }) => {
    const appIdentity = await ctx.appIdentity()
    const expectedPublicRevisionIds = await readPublicRevisionIdsByLocale(ctx, entry._id)
    await unpublishCurrentPublic(ctx, {
      entryId: entry._id,
      locales: Object.keys(expectedPublicRevisionIds),
      expectedPublicRevisionIds,
      appIdentity: appIdentity.userId,
    })
    void collection
    return null
  },
})

export const unpublishEntryOperationExecute = callerMutation.protected({
  ...unpublishEntryOperation,
})
export const previewUnpublishEntryOperation = callerMutation.protected(
  Object.assign(previewOf(unpublishEntryOperation), {
    id: 'editor:previewUnpublishEntryOperation',
  }),
)

export const archiveEntryOperation = defineOperation({
  id: 'ginko-cms.archive-entry',
  name: 'archive-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:archiveEntryOperationExecute',
  args: archiveEntryArgs.args,
  guard: canArchiveEntries,
  returns: v.null(),
  previewReturns: operationPreviewValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
    }
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
    }
  },
  preview: async (ctx, args, { entry }) => {
    const result = await previewDestructiveEntryOperation(ctx, args.entryId)
    return operationPreview({
      summary: `Will archive "${result.displayLabel ?? result.baseSlug}" and remove ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: result.status !== 'archived',
      blockers:
        result.status === 'archived'
          ? [operationIssue({ code: 'already-archived', message: 'Entry is already archived.' })]
          : [],
      warnings: result.publicRoutes.length
        ? [
            operationIssue({
              code: 'affected-routes',
              message: `Affected routes: ${formatAffectedRoutes(result.publicRoutes)}`,
            }),
          ]
        : [],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes removed',
          count: result.publicRoutes.length,
        }),
      ],
      details: { publicRoutes: result.publicRoutes },
      confirm: {
        operationId: 'ginko-cms.archive-entry',
        args,
        effect: result.publicRoutes,
      },
      version: {
        draftVersion: entry.draftVersion,
        status: entry.status,
      },
    })
  },
  handler: async (ctx, args, { entry, collection }) => {
    const appIdentity = await ctx.appIdentity()
    await archiveCurrentEntry(ctx, {
      entryId: entry._id,
      expectedPublicRevisionIds: await readPublicRevisionIdsByLocale(ctx, entry._id),
      appIdentity: appIdentity.userId,
    })
    void collection
    return null
  },
})

export const archiveEntryOperationExecute = callerMutation.protected({
  ...archiveEntryOperation,
})
export const previewArchiveEntryOperation = callerMutation.protected(
  Object.assign(previewOf(archiveEntryOperation), {
    id: 'editor:previewArchiveEntryOperation',
  }),
)

export const unarchiveEntryOperation = defineOperation({
  id: 'ginko-cms.unarchive-entry',
  name: 'unarchive-entry',
  kind: 'safe',
  safety: 'bounded-write',
  args: unarchiveEntryArgs.args,
  guard: canArchiveEntries,
  returns: v.null(),
  load: async () => undefined,
  handler: async (ctx, args) => {
    const { appIdentityId, entry, now } = await loadEntryMutationContext(ctx, args.entryId)
    await ctx.db.patch(entry._id, {
      status: 'draft',
      updatedAt: now,
      updatedBy: appIdentityId,
      draftVersion: entry.draftVersion + 1,
    })
    await logActivity(ctx, {
      kind: 'entry.unarchived',
      summary: 'Unarchived entry',
      appIdentityId,
      entryId: entry._id,
      collectionId: entry.collectionId,
      detail: {},
    })
    return null
  },
})

export const unarchiveEntry = callerMutation.protected({
  ...unarchiveEntryOperation,
})

export const rollbackVersionOperation = defineOperation({
  id: 'ginko-cms.rollback-version',
  name: 'rollback-version',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:rollbackVersionOperationExecute',
  args: rollbackVersionArgs.args,
  guard: canEditEntries,
  load: async (ctx, args) => {
    const { entry, revision, revisionNumber } = await loadRevisionForRollback(ctx, args)
    const collection = await getCollectionForEntry(ctx, entry)
    return { entry, collection, revision, revisionNumber }
  },
  authorize: {
    check: (_appIdentity, _loaded, args) => (args.publish ? canPublishEntries : canEditEntries),
  },
  returns: rollbackResultValidator,
  previewReturns: operationPreviewValidator(),
  preview: async (_ctx, args, { entry, revision, revisionNumber }) =>
    operationPreview({
      summary: `Will roll back "${revision.snapshot.slug ?? entry.baseSlug}" to version ${revisionNumber}${args.publish ? ' and publish it' : ''}.`,
      warnings: [
        operationIssue({
          code: 'replace-current-state',
          message: `Current draft${args.publish ? ' and published state' : ''} will be replaced by version "${args.versionId}".`,
        }),
      ],
      effects: [operationEffect({ kind: 'versions', summary: 'Version restored', count: 1 })],
      details: {
        version: revisionNumber,
        publish: args.publish === true,
      },
      confirm: {
        operationId: 'ginko-cms.rollback-version',
        args,
        effect: {
          version: revisionNumber,
          snapshot: revision.snapshot,
          currentDraftVersion: entry.draftVersion,
        },
      },
      version: {
        entryDraftVersion: entry.draftVersion,
        versionId: String(revision._id),
        latestRevisionId: entry.latestRevisionId ? String(entry.latestRevisionId) : null,
      },
    }),
  handler: async (ctx, args, { entry, collection, revision, revisionNumber }) => {
    const appIdentity = await ctx.appIdentity()
    void collection
    return await runCanonicalRollbackVersion(ctx, {
      entry,
      revision,
      revisionNumber,
      appIdentityId: appIdentity.userId,
      publish: args.publish === true,
    })
  },
})

export const rollbackVersionOperationExecute = callerMutation.protected({
  ...rollbackVersionOperation,
  id: 'ginko-cms.rollback-version',
  guard: canEditEntries,
})
export const previewRollbackVersionOperation = callerMutation.protected(
  Object.assign(previewOf(rollbackVersionOperation), {
    id: 'editor:previewRollbackVersionOperation',
  }),
)

export const createCheckpoint = callerMutation.protected({
  id: 'editor:createCheckpoint',
  args: createCheckpointArgs.args,
  guard: canEditEntries,
  returns: v.string(),
  handler: async (ctx, args) => {
    const { appIdentityId, entry } = await loadEntryMutationContext(ctx, args.entryId)
    const revisionId = await createDraftCheckpoint(ctx, {
      entryId: entry._id,
      appIdentity: appIdentityId,
      message: args.message ?? null,
    })
    return String(revisionId)
  },
})
