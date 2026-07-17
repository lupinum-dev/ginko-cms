import {
  archiveEntry as archiveEntryArgs,
  createCheckpoint as createCheckpointArgs,
  publishEntry as publishEntryArgs,
  restoreEntry as restoreEntryArgs,
  rollbackVersion as rollbackVersionArgs,
  unpublishEntry as unpublishEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  publishResultValidator,
  rollbackResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import { getOwnActiveAgentRunOrThrow } from '../agentRuns.js'
import { can, canArchiveEntries, canEditEntries, canPublishEntries } from '../auth/checks.js'
import { previewPublishImpactForEntry } from '../diagnostics.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { asEntryId } from '../lib/ids.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import {
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from '../operationHelpers.js'
import { deriveDirtyLocales, getCollectionForEntry, loadEntryMutationContext } from './context.js'
import { previewDestructiveEntryOperation } from './read.js'
import {
  archiveCurrentEntry,
  computePublishDraftHash,
  createDraftCheckpoint,
  publishCurrentDraft,
  restoreArchivedEntry,
  rollbackPublicToRevision,
  restoreRevisionSnapshotToDraft,
  unpublishCurrentPublic,
} from './workflow/commands.js'
import { readDraftRows } from './workflow/drafts.js'
import { readPublicRevisionIdsByLocale } from './workflow/projection.js'
import { readRouteGeneration } from './workflow/routeGeneration.js'

function formatAffectedRoutes(
  routes: Array<{ locale: string; href: string; path?: string | null }>,
): string {
  return routes.map((route) => `${route.locale}: ${route.href}`).join(', ')
}

function archiveBlockers(result: Awaited<ReturnType<typeof previewDestructiveEntryOperation>>) {
  const blockers = []
  if (result.status === 'archived') {
    blockers.push(
      operationIssue({ code: 'already-archived', message: 'Entry is already archived.' }),
    )
  }
  return blockers
}

function descendantReachabilityWarning(
  result: Awaited<ReturnType<typeof previewDestructiveEntryOperation>>,
) {
  return result.publicDescendantRoutes.length
    ? operationIssue({
        code: 'descendant-routes-unreachable',
        message: `${result.publicDescendantRoutes.length} published descendant route${result.publicDescendantRoutes.length === 1 ? '' : 's'} will become unreachable without changing the descendants' editorial records.`,
      })
    : null
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

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Human label for a revision in user-facing copy: version number plus the
 * note (message) the history list already shows, falling back to the date.
 * Never expose the raw Convex revision id to users.
 */
function humanVersionLabel(
  revision: Awaited<ReturnType<typeof loadRevisionForRollback>>['revision'],
  revisionNumber: number,
): string {
  if (revision.message) return `version ${revisionNumber} — ${revision.message}`
  const date = new Date(revision.createdAt)
  return `version ${revisionNumber} from ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
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
  const locales = Object.keys(args.revision.snapshots).sort()

  if (!args.publish) {
    await restoreRevisionSnapshotToDraft(ctx, {
      entry: args.entry,
      sourceRevision: args.revision,
      appIdentity: args.appIdentityId,
      now: Date.now(),
      expectedDraftVersion: args.entry.draftVersion,
    })
    const refreshed = await ctx.db.get(args.entry._id)
    return { versionId: String(refreshed?.latestEditorialRevisionId ?? args.revision._id) }
  }

  const result = await rollbackPublicToRevision(ctx, {
    entryId: args.entry._id,
    sourceRevisionId: args.revision._id,
    locales,
    expectedPublicRevisionIds: await readPublicRevisionIdsByLocale(ctx, args.entry._id),
    appIdentity: args.appIdentityId,
    message: `Rolled back public output to version ${args.revisionNumber}`,
  })

  return { versionId: String(result.revisionId) }
}

export const publishEntryOperation = defineCmsOperation({
  id: 'ginko-cms.publish-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:publishEntryOperationExecute',
  args: publishEntryArgs.args,
  guard: canPublishEntries,
  returns: publishResultValidator,
  previewReturns: previewResultValidator(),
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
    const draftRows = await readDraftRows(ctx, entry._id)
    const dirtyLocaleCount = deriveDirtyLocales(
      entry,
      new Map(Object.values(draftRows.byLocale).map((row) => [row.locale, row.version])),
    ).filter((locale) => args.locales.includes(locale)).length
    const routeGenerations = Object.fromEntries(
      await Promise.all(
        args.locales.map(async (locale: string) => [
          locale,
          await readRouteGeneration(ctx, collection.slug, locale),
        ]),
      ),
    )
    return buildPreview({
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
        publishImpact: result,
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
        latestRevisionId: entry.latestEditorialRevisionId
          ? String(entry.latestEditorialRevisionId)
          : null,
        routeGenerations,
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
    const refreshed = (await ctx.db.get(entry._id)) as typeof entry | null
    const refreshedDraftRows = refreshed ? await readDraftRows(ctx, refreshed._id) : null
    return {
      versionId: String(result.revisionId),
      dirtyLocales:
        refreshed && refreshedDraftRows
          ? deriveDirtyLocales(
              refreshed,
              new Map(
                Object.values(refreshedDraftRows.byLocale).map((row) => [row.locale, row.version]),
              ),
            )
          : [],
      draftVersion: refreshed?.draftVersion ?? args.expectedVersion,
    }
  },
})

export const publishEntryOperationExecute = callerMutation.protected(publishEntryOperation)
export const previewPublishEntryOperation = callerMutation.protected(
  Object.assign(definePreview(publishEntryOperation), {
    id: 'entries/publish:previewPublishEntryOperation',
  }),
)

export const mcpPreviewPublishEntry = callerMutation.protected({
  id: 'entries/publish:mcpPreviewPublishEntry',
  args: {
    agentRunId: v.string(),
    ...publishEntryArgs.args,
  },
  guard: canEditEntries,
  returns: previewResultValidator(),
  handler: async (ctx, args) => {
    const { agentRunId, ...input } = args
    const appIdentity = await ctx.appIdentity()
    await getOwnActiveAgentRunOrThrow(ctx, agentRunId, appIdentity, Date.now())
    const loaded = await publishEntryOperation.load(ctx, input)
    const preview = await publishEntryOperation.preview(ctx, input, loaded)
    return { ...preview, confirm: null, confirmation: null }
  },
})

export const unpublishEntryOperation = defineCmsOperation({
  id: 'ginko-cms.unpublish-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:unpublishEntryOperationExecute',
  args: unpublishEntryArgs.args,
  guard: canPublishEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
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
    const blockers = [
      ...(result.publicRoutes.length === 0
        ? [operationIssue({ code: 'not-public', message: 'Entry is not currently public.' })]
        : []),
    ]
    const descendantWarning = descendantReachabilityWarning(result)
    return buildPreview({
      summary: `Will unpublish "${result.displayLabel ?? result.baseSlug}" and remove ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: blockers.length === 0,
      blockers,
      warnings: [
        ...(result.publicRoutes.length
          ? [
              operationIssue({
                code: 'affected-routes',
                message: `Affected routes: ${formatAffectedRoutes(result.publicRoutes)}`,
              }),
            ]
          : []),
        ...(descendantWarning ? [descendantWarning] : []),
      ],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes removed',
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
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
      },
      confirm: {
        operationId: 'ginko-cms.unpublish-entry',
        args,
        effect: {
          publicRoutes: result.publicRoutes,
          publicDescendantRoutes: result.publicDescendantRoutes,
          publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        },
      },
      version: {
        draftVersion: entry.draftVersion,
        latestRevisionId: entry.latestEditorialRevisionId
          ? String(entry.latestEditorialRevisionId)
          : null,
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        publicDescendantRouteCount: result.publicDescendantRoutes.length,
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

export const unpublishEntryOperationExecute = callerMutation.protected(unpublishEntryOperation)
export const previewUnpublishEntryOperation = callerMutation.protected(
  Object.assign(definePreview(unpublishEntryOperation), {
    id: 'entries/publish:previewUnpublishEntryOperation',
  }),
)

export const archiveEntryOperation = defineCmsOperation({
  id: 'ginko-cms.archive-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:archiveEntryOperationExecute',
  args: archiveEntryArgs.args,
  guard: canArchiveEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
    }
    return {
      entry,
      collection: await getCollectionForEntry(ctx, entry),
      destructivePreview: await previewDestructiveEntryOperation(ctx, args.entryId),
    }
  },
  preview: async (_ctx, args, { entry, destructivePreview: result }) => {
    const blockers = archiveBlockers(result)
    const descendantWarning = descendantReachabilityWarning(result)
    return buildPreview({
      summary: `Will archive "${result.displayLabel ?? result.baseSlug}" and remove ${result.publicRoutes.length} public route${result.publicRoutes.length === 1 ? '' : 's'}.`,
      allowed: blockers.length === 0,
      blockers,
      warnings: [
        ...(result.publicRoutes.length
          ? [
              operationIssue({
                code: 'affected-routes',
                message: `Affected routes: ${formatAffectedRoutes(result.publicRoutes)}`,
              }),
            ]
          : []),
        ...(descendantWarning ? [descendantWarning] : []),
      ],
      effects: [
        operationEffect({
          kind: 'routes',
          summary: 'Public routes removed',
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
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
      },
      confirm: {
        operationId: 'ginko-cms.archive-entry',
        args,
        effect: {
          publicRoutes: result.publicRoutes,
          publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        },
      },
      version: {
        draftVersion: entry.draftVersion,
        status: entry.lifecycle,
        publicRevisionIdsByLocale: result.publicRevisionIdsByLocale,
        publicDescendantRouteCount: result.publicDescendantRoutes.length,
      },
    })
  },
  handler: async (ctx, args, { entry, collection, destructivePreview }) => {
    const appIdentity = await ctx.appIdentity()
    await archiveCurrentEntry(ctx, {
      entryId: entry._id,
      expectedPublicRevisionIds: destructivePreview.publicRevisionIdsByLocale,
      appIdentity: appIdentity.userId,
    })
    void collection
    return null
  },
})

export const archiveEntryOperationExecute = callerMutation.protected(archiveEntryOperation)
export const previewArchiveEntryOperation = callerMutation.protected(
  Object.assign(definePreview(archiveEntryOperation), {
    id: 'entries/publish:previewArchiveEntryOperation',
  }),
)

export const restoreEntryOperation = defineCmsOperation({
  id: 'ginko-cms.restore-entry',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:restoreEntryOperationExecute',
  args: restoreEntryArgs.args,
  guard: canArchiveEntries,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const entry = await ctx.db.get(asEntryId(args.entryId))
    if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: args.entryId })
    return { entry }
  },
  preview: async (_ctx, args, { entry }) => {
    const archived = entry.lifecycle === 'archived'
    return buildPreview({
      summary: archived
        ? `Will restore "${entry.slug}" to the active editorial workspace without publishing it.`
        : `Entry "${entry.slug}" is already active.`,
      allowed: archived,
      blockers: archived
        ? []
        : [
            operationIssue({
              code: 'not-archived',
              message: 'Only archived entries can be restored.',
            }),
          ],
      warnings: archived
        ? [
            operationIssue({
              code: 'remains-unpublished',
              message: 'Restoring the editorial record does not restore public output.',
            }),
          ]
        : [],
      effects: [
        operationEffect({
          kind: 'entries',
          summary: 'Editorial records restored',
          count: archived ? 1 : 0,
        }),
      ],
      confirm: {
        operationId: 'ginko-cms.restore-entry',
        args,
        lifecycle: entry.lifecycle,
      },
      version: {
        draftVersion: entry.draftVersion,
        lifecycle: entry.lifecycle,
      },
    })
  },
  handler: async (ctx, _args, { entry }) => {
    const appIdentity = await ctx.appIdentity()
    await restoreArchivedEntry(ctx, {
      entryId: entry._id,
      expectedDraftVersion: entry.draftVersion,
      appIdentity: appIdentity.userId,
    })
    return null
  },
})

export const restoreEntryOperationExecute = callerMutation.protected(restoreEntryOperation)
export const previewRestoreEntryOperation = callerMutation.protected(
  Object.assign(definePreview(restoreEntryOperation), {
    id: 'entries/publish:previewRestoreEntryOperation',
  }),
)

export const rollbackVersionOperation = defineCmsOperation({
  id: 'ginko-cms.rollback-version',
  kind: 'destructive',
  executeFunctionRef: 'entries/publish:rollbackVersionOperationExecute',
  args: rollbackVersionArgs.args,
  guard: canEditEntries,
  load: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (args.publish === true && !can(appIdentity, canPublishEntries)) {
      throwCmsError(
        'ROLLBACK_PUBLISH_FORBIDDEN',
        'Publishing a restored version requires publish permission.',
        {
          entryId: args.entryId,
          versionId: args.versionId,
        },
      )
    }
    const { entry, revision, revisionNumber } = await loadRevisionForRollback(ctx, args)
    const collection = await getCollectionForEntry(ctx, entry)
    return { entry, collection, revision, revisionNumber }
  },
  returns: rollbackResultValidator,
  previewReturns: previewResultValidator(),
  preview: async (_ctx, args, { entry, revision, revisionNumber }) => {
    const firstLocale = Object.keys(revision.snapshots)[0]
    const firstSnapshot = firstLocale ? revision.snapshots[firstLocale] : null
    return buildPreview({
      summary: `Will ${args.publish ? 'roll back public output' : 'restore the draft'} for "${firstSnapshot?.slug ?? entry.slug}" to version ${revisionNumber}.`,
      warnings: [
        operationIssue({
          code: 'replace-current-state',
          message: `${args.publish ? 'Current public output' : 'Current draft'} will be replaced by ${humanVersionLabel(revision, revisionNumber)}.`,
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
          snapshots: revision.snapshots,
          currentDraftVersion: entry.draftVersion,
        },
      },
      version: {
        entryDraftVersion: entry.draftVersion,
        versionId: String(revision._id),
        latestRevisionId: entry.latestEditorialRevisionId
          ? String(entry.latestEditorialRevisionId)
          : null,
      },
    })
  },
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

export const rollbackVersionOperationExecute = callerMutation.protected(
  Object.assign(rollbackVersionOperation, {
    id: 'ginko-cms.rollback-version',
    guard: canEditEntries,
  }),
)
export const previewRollbackVersionOperation = callerMutation.protected(
  Object.assign(definePreview(rollbackVersionOperation), {
    id: 'entries/publish:previewRollbackVersionOperation',
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
