/** Canonical editorial history, draft restore, and public rollback commands. */

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import { getCollectionOrThrow } from '../../lib/collections.js'
import { assertCmsContractWritable } from '../../lib/installedContract.js'
import type { MutationCtx } from '../../lib/types.js'
import { assertNoDraftSiblingPathConflict } from '../draftPathConflicts.js'
import {
  buildDraftSnapshots,
  refreshDraftAssetRefsForSave,
  replaceRevisionAssetRefs,
} from './draftCommands.js'
import { assertValidDraftParentChain } from './draftPlacement.js'
import { applyDraftPatch, type SaveDraftPatch } from './drafts.js'
import { refreshDraftSearchEntriesForEntry } from './draftSearch.js'
import { validateRevisionPlacementForDraftRestore } from './historyPlacement.js'
import { readPublicRevisionIdsByLocale } from './projection.js'
import {
  activateSnapshots,
  assertExpectedPublicRevisionIds,
  enqueueWorkflowRevalidation,
  workflowOperationId,
} from './publicationCommands.js'
import { appendRevision } from './revisions.js'

export { validateRevisionPlacementForDraftRestore } from './historyPlacement.js'

export async function createDraftCheckpoint(
  ctx: MutationCtx,
  args: { entryId: Id<'entries'>; appIdentity: string; message?: string | null },
): Promise<Id<'entryRevisions'>> {
  const installed = await assertCmsContractWritable(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const rows = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
    .collect()
  const locales = rows.map((row) => row.locale).sort()
  const snapshots = await buildDraftSnapshots(ctx, entry, collection, locales, false)
  const now = Date.now()
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'checkpoint',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: workflowOperationId('checkpoint', entry._id, now),
    message: args.message ?? null,
    appIdentity: args.appIdentity,
    now,
  })
  await ctx.db.patch(entry._id, { latestEditorialRevisionId: revision.revisionId })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots })
  await logActivity(ctx, {
    kind: 'entry.checkpointed',
    summary: 'Created draft checkpoint',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  return revision.revisionId
}

export async function restoreRevisionSnapshotToDraft(
  ctx: MutationCtx,
  args: {
    entry: Doc<'entries'>
    sourceRevision: Doc<'entryRevisions'>
    appIdentity: string
    now: number
    expectedDraftVersion: number
  },
) {
  if (args.entry.lifecycle !== 'active') {
    throwCmsError('ENTRY_ARCHIVED', 'Archived entries cannot restore a draft version.')
  }
  if (args.entry.draftVersion !== args.expectedDraftVersion) {
    throwCmsError('ENTRY_DRAFT_STALE', 'The draft changed before restore.')
  }
  const installed = await assertCmsContractWritable(ctx)
  if (args.sourceRevision.contentHash !== installed.record.contentHash) {
    throwCmsError(
      'REVISION_CONTRACT_MISMATCH',
      'Historical draft is incompatible with this contract.',
    )
  }
  const collection = await getCollectionOrThrow(ctx, args.entry.collection)
  const placement = await validateRevisionPlacementForDraftRestore(ctx, {
    entry: args.entry,
    collection,
    sourceRevision: args.sourceRevision,
  })
  await createDraftCheckpoint(ctx, {
    entryId: args.entry._id,
    appIdentity: args.appIdentity,
    message: `Before restore of revision ${args.sourceRevision.revisionNumber}`,
  })
  const { locales, first } = placement
  const patch: SaveDraftPatch = {
    shared: {
      shared: first.shared,
      slug: first.slug,
      parentEntryId: first.parentEntryId,
      orderRank: first.orderRank,
    },
    locales: Object.fromEntries(
      locales.map((locale) => {
        const snapshot = args.sourceRevision.snapshots[locale]!
        return [locale, { slug: snapshot.slug, values: snapshot.values, bodyMdc: snapshot.bodyMdc }]
      }),
    ),
  }
  const result = await applyDraftPatch(ctx, {
    entryId: args.entry._id,
    expectedDraftVersion: args.expectedDraftVersion,
    patch,
    appIdentity: args.appIdentity,
    now: args.now,
  })
  await assertValidDraftParentChain(ctx, {
    entry: result.entry,
    collection,
  })
  await assertNoDraftSiblingPathConflict(ctx, {
    entry: result.entry,
    collection,
    locales,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entry._id,
    collection: args.entry.collection,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
  })
  const refreshed = await ctx.db.get(args.entry._id)
  if (!refreshed) throwCmsError('ENTRY_NOT_FOUND', 'Entry disappeared during restore.')
  const snapshots = await buildDraftSnapshots(ctx, refreshed, collection, locales, false)
  const revision = await appendRevision(ctx, {
    entryId: refreshed._id,
    collection: refreshed.collection,
    parentRevisionId: refreshed.latestEditorialRevisionId,
    kind: 'restore',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: workflowOperationId('restore', refreshed._id, args.now),
    message: `Restored revision ${args.sourceRevision.revisionNumber} to draft`,
    appIdentity: args.appIdentity,
    now: args.now,
  })
  await ctx.db.patch(refreshed._id, { latestEditorialRevisionId: revision.revisionId })
  await replaceRevisionAssetRefs(ctx, {
    revisionId: revision.revisionId,
    entry: refreshed,
    snapshots,
  })
  await logActivity(ctx, {
    kind: 'entry.draft-restored',
    summary: 'Restored historical version to draft',
    appIdentityId: args.appIdentity,
    entryId: refreshed._id,
    collection: refreshed.collection,
    detail: {
      sourceRevisionId: String(args.sourceRevision._id),
      restoreRevisionId: String(revision.revisionId),
    },
    createdAt: args.now,
  })
  return result
}

/** Activate compatible historical output without modifying the current draft. */
export async function rollbackPublicToRevision(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    sourceRevisionId: Id<'entryRevisions'>
    locales?: string[]
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
    message?: string | null
  },
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const installed = await assertCmsContractWritable(ctx)
  const [entry, source] = await Promise.all([
    ctx.db.get(args.entryId),
    ctx.db.get(args.sourceRevisionId),
  ])
  if (!entry || !source || source.entryId !== args.entryId) {
    throwCmsError('REVISION_NOT_FOUND', 'Historical publication not found.')
  }
  if (entry.lifecycle !== 'active') {
    throwCmsError('ENTRY_ARCHIVED', 'Archived entries cannot restore public output.')
  }
  if (source.contentHash !== installed.record.contentHash) {
    throwCmsError(
      'REVISION_CONTRACT_MISMATCH',
      'Historical output is incompatible with this contract.',
    )
  }
  const locales = [...new Set(args.locales ?? Object.keys(source.snapshots))].sort()
  const current = await readPublicRevisionIdsByLocale(ctx, entry._id)
  assertExpectedPublicRevisionIds(current, args.expectedPublicRevisionIds, locales)
  const snapshots = Object.fromEntries(
    locales.map((locale) => {
      const snapshot = source.snapshots[locale]
      if (!snapshot) throwCmsError('REVISION_LOCALE_MISSING', `Revision has no ${locale} snapshot.`)
      return [locale, snapshot]
    }),
  )
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const now = Date.now()
  const operationId = workflowOperationId('rollback', entry._id, now)
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'rollback',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId,
    message: args.message ?? `Rolled back to revision ${source.revisionNumber}`,
    appIdentity: args.appIdentity,
    now,
  })
  const publicationByLocale = new Map(entry.activePublications.map((row) => [row.locale, row]))
  for (const locale of locales) {
    const snapshot = snapshots[locale]!
    const currentPublication = publicationByLocale.get(locale)
    publicationByLocale.set(locale, {
      locale,
      revisionId: revision.revisionId,
      sharedVersion: snapshot.sharedVersion,
      localeVersion: snapshot.localeVersion,
      firstPublishedAt: currentPublication?.firstPublishedAt ?? now,
      activatedAt: now,
      activatedBy: args.appIdentity,
    })
  }
  await ctx.db.patch(entry._id, {
    activePublications: [...publicationByLocale.values()].sort((a, b) =>
      a.locale.localeCompare(b.locale),
    ),
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
  const effect = await activateSnapshots(ctx, {
    entry,
    collection,
    snapshots,
    revisionId: revision.revisionId,
    appIdentity: args.appIdentity,
    now,
    kind: 'rollback',
    operationId,
  })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots })
  await logActivity(ctx, {
    kind: 'entry.public-rolled-back',
    summary: 'Rolled back public output',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { sourceRevisionId: String(source._id), locales },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind: 'rollback',
    entry,
    revisionId: revision.revisionId,
    tags: effect.tags,
    paths: effect.paths,
    appIdentity: args.appIdentity,
    now,
  })
  return { revisionId: revision.revisionId, affectedLocales: locales }
}
