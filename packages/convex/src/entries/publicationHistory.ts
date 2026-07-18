import { rollbackVersion as rollbackVersionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { rollbackResultValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'

import { can, canEditEntries, canPublishEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { asEntryId } from '../lib/ids.js'
import { assertCmsContractWritable } from '../lib/installedContract.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import {
  buildPreview,
  defineCmsOperation,
  definePreview,
  operationEffect,
  operationIssue,
  previewResultValidator,
} from '../operationHelpers.js'
import { getCollectionForEntry } from './context.js'
import {
  restoreRevisionSnapshotToDraft,
  rollbackPublicToRevision,
  validateRevisionPlacementForDraftRestore,
} from './workflow/commands.js'
import { readPublicRevisionIdsByLocale } from './workflow/projection.js'
import { validateRevisionSnapshotsForActivation } from './workflow/publicationCommands.js'
import { readRouteGeneration } from './workflow/routeGeneration.js'

async function loadRevisionForRollback(
  ctx: QueryOrMutationCtx,
  args: { entryId: string; versionId: string },
) {
  const entry = await ctx.db.get(asEntryId(ctx, args.entryId))
  if (!entry) {
    throwCmsError('ENTRY_NOT_FOUND', 'Entry not found', { entryId: args.entryId })
  }
  const revisionId = ctx.db.normalizeId('entryRevisions', args.versionId)
  const revision = revisionId ? await ctx.db.get(revisionId) : null
  if (!revision || revision.entryId !== entry._id) {
    throwCmsError('ENTRY_VERSION_NOT_FOUND', 'Version not found', {
      entryId: args.entryId,
      versionId: args.versionId,
    })
  }
  return { entry, revision, revisionNumber: revision.revisionNumber ?? 0 }
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
    expectedPublicRevisionIds: Awaited<ReturnType<typeof readPublicRevisionIdsByLocale>>
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
    expectedPublicRevisionIds: args.expectedPublicRevisionIds,
    appIdentity: args.appIdentityId,
    message: `Rolled back public output to version ${args.revisionNumber}`,
  })
  return { versionId: String(result.revisionId) }
}

export const rollbackVersionOperation = defineCmsOperation({
  id: 'ginko-cms.rollback-version',
  kind: 'destructive',
  executeFunctionRef: 'entries/publicationHistory:rollbackVersionOperationExecute',
  args: rollbackVersionArgs.args,
  guard: canEditEntries,
  load: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (args.publish === true && !can(appIdentity, canPublishEntries)) {
      throwCmsError(
        'ROLLBACK_PUBLISH_FORBIDDEN',
        'Publishing a restored version requires publish permission.',
        { entryId: args.entryId, versionId: args.versionId },
      )
    }
    const { entry, revision, revisionNumber } = await loadRevisionForRollback(ctx, args)
    const collection = await getCollectionForEntry(ctx, entry)
    const installed = await assertCmsContractWritable(ctx)
    const locales = Object.keys(revision.snapshots).sort()
    const expectedPublicRevisionIds = await readPublicRevisionIdsByLocale(ctx, entry._id)
    const routeGenerations = Object.fromEntries(
      await Promise.all(
        locales.map(async (locale) => [
          locale,
          await readRouteGeneration(ctx, collection.slug, locale),
        ]),
      ),
    )
    return {
      entry,
      collection,
      revision,
      revisionNumber,
      installedContentHash: installed.record.contentHash,
      expectedPublicRevisionIds,
      routeGenerations,
    }
  },
  returns: rollbackResultValidator,
  previewReturns: previewResultValidator(),
  preview: async (
    ctx,
    args,
    {
      entry,
      collection,
      revision,
      revisionNumber,
      installedContentHash,
      expectedPublicRevisionIds,
      routeGenerations,
    },
  ) => {
    const firstLocale = Object.keys(revision.snapshots)[0]
    const firstSnapshot = firstLocale ? revision.snapshots[firstLocale] : null
    const blockers = []
    if (entry.lifecycle !== 'active') {
      blockers.push(
        operationIssue({
          code: 'entry-archived',
          message: 'Restore the archived entry before restoring a historical version.',
        }),
      )
    }
    if (revision.contentHash !== installedContentHash) {
      blockers.push(
        operationIssue({
          code: 'revision-contract-mismatch',
          message: 'This historical version is incompatible with the installed contract.',
        }),
      )
    }
    if (!firstSnapshot) {
      blockers.push(
        operationIssue({
          code: 'revision-snapshot-empty',
          message: 'This historical version contains no restorable locale snapshot.',
        }),
      )
    }

    let activationProjectionHash: string | null = null
    if (blockers.length === 0) {
      if (args.publish) {
        const activation = await validateRevisionSnapshotsForActivation(ctx, {
          entry,
          collection,
          revisionId: revision._id,
          snapshots: revision.snapshots,
          stableNow: revision.createdAt,
        })
        activationProjectionHash = activation.projectionHash
      } else {
        await validateRevisionPlacementForDraftRestore(ctx, {
          entry,
          collection,
          sourceRevision: revision,
        })
      }
    }
    return buildPreview({
      summary: `Will ${args.publish ? 'roll back public output' : 'restore the draft'} for "${firstSnapshot?.slug ?? entry.slug}" to version ${revisionNumber}.`,
      allowed: blockers.length === 0,
      blockers,
      warnings: [
        operationIssue({
          code: 'replace-current-state',
          message: `${args.publish ? 'Current public output' : 'Current draft'} will be replaced by ${humanVersionLabel(revision, revisionNumber)}.`,
        }),
      ],
      effects: [operationEffect({ kind: 'versions', summary: 'Version restored', count: 1 })],
      details: { version: revisionNumber, publish: args.publish === true },
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
        lifecycle: entry.lifecycle,
        sourceContentHash: revision.contentHash,
        installedContentHash,
        versionId: String(revision._id),
        latestRevisionId: entry.latestEditorialRevisionId
          ? String(entry.latestEditorialRevisionId)
          : null,
        expectedPublicRevisionIds: Object.fromEntries(
          Object.entries(expectedPublicRevisionIds).map(([locale, revisionId]) => [
            locale,
            String(revisionId),
          ]),
        ),
        routeGenerations,
        activationProjectionHash,
      },
    })
  },
  handler: async (
    ctx,
    args,
    { entry, collection, revision, revisionNumber, expectedPublicRevisionIds },
  ) => {
    const appIdentity = await ctx.appIdentity()
    void collection
    return await runCanonicalRollbackVersion(ctx, {
      entry,
      revision,
      revisionNumber,
      appIdentityId: appIdentity.userId,
      publish: args.publish === true,
      expectedPublicRevisionIds,
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
    id: 'entries/publicationHistory:previewRollbackVersionOperation',
  }),
)
