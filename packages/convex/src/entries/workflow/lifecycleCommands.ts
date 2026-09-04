/** Canonical unpublish, archive, and editorial restore commands. */

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import { getCollectionOrThrow } from '../../lib/collections.js'
import { assertCmsContractWritable } from '../../lib/installedContract.js'
import type { MutationCtx } from '../../lib/types.js'
import { deleteAssetRefsForSource } from './assetRefs.js'
import { buildDraftSnapshots, replaceRevisionAssetRefs } from './draftCommands.js'
import { refreshDraftSearchEntriesForEntry } from './draftSearch.js'
import {
  deleteAllPublicProjections,
  deletePublicProjection,
  readPublicRevisionIdsByLocale,
} from './projection.js'
import {
  assertExpectedPublicRevisionIds,
  enqueueWorkflowRevalidation,
  publicTreeOptions,
  readActiveSnapshots,
  workflowOperationId,
} from './publicationCommands.js'
import { publicPathForEntry } from './publicTree.js'
import { appendRevision } from './revisions.js'

export async function unpublishCurrentPublic(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    locales: string[]
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
  },
): Promise<{
  revisionId: Id<'entryRevisions'>
  affectedLocales: string[]
  remainingLocales: string[]
}> {
  const installed = await assertCmsContractWritable(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  const locales = [...new Set(args.locales)].sort()
  if (!locales.length) throwCmsError('ENTRY_LOCALES_REQUIRED', 'Select at least one locale.')
  const current = await readPublicRevisionIdsByLocale(ctx, entry._id)
  assertExpectedPublicRevisionIds(current, args.expectedPublicRevisionIds, locales)
  const snapshots = await readActiveSnapshots(ctx, entry, locales)
  const oldRows = (
    await Promise.all(
      locales.map((locale) =>
        ctx.db
          .query('publicEntries')
          .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', locale))
          .unique(),
      ),
    )
  ).filter((row): row is Doc<'publicEntries'> => row !== null)
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const paths = (
    await Promise.all(
      oldRows.map((row) => publicPathForEntry(ctx, row, publicTreeOptions(collection, row.locale))),
    )
  ).filter((path): path is string => path !== null)
  const tags = oldRows.flatMap((row) => row.cacheTags)
  const now = Date.now()
  const operationId = workflowOperationId('unpublish', entry._id, now)
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'unpublish',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId,
    message: null,
    appIdentity: args.appIdentity,
    now,
  })
  for (const locale of locales) {
    await deletePublicProjection(ctx, { entryId: entry._id, locale })
    await deleteAssetRefsForSource(
      ctx,
      {
        sourceKind: 'public',
        sourceId: `${String(entry._id)}:${locale}`,
      },
      'canonical',
    )
  }
  const remaining = entry.activePublications.filter((row) => !locales.includes(row.locale))
  await ctx.db.patch(entry._id, {
    activePublications: remaining,
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots })
  await logActivity(ctx, {
    kind: 'entry.unpublished',
    summary: 'Unpublished entry locales',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { locales, revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind: 'unpublish',
    entry,
    revisionId: revision.revisionId,
    tags,
    paths,
    appIdentity: args.appIdentity,
    now,
  })
  return {
    revisionId: revision.revisionId,
    affectedLocales: locales,
    remainingLocales: remaining.map((row) => row.locale).sort(),
  }
}

export async function archiveCurrentEntry(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
  },
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const installed = await assertCmsContractWritable(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  const current = await readPublicRevisionIdsByLocale(ctx, entry._id)
  const locales = Object.keys(current).sort()
  if (Object.keys(args.expectedPublicRevisionIds).length !== locales.length) {
    throwCmsError('PUBLIC_STATE_STALE', 'Public locales changed after preview.')
  }
  assertExpectedPublicRevisionIds(current, args.expectedPublicRevisionIds, locales)
  const snapshots = await readActiveSnapshots(ctx, entry, locales)
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const oldRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
    .collect()
  const paths = (
    await Promise.all(
      oldRows.map((row) => publicPathForEntry(ctx, row, publicTreeOptions(collection, row.locale))),
    )
  ).filter((path): path is string => path !== null)
  const tags = oldRows.flatMap((row) => row.cacheTags)
  const now = Date.now()
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'archive',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: workflowOperationId('archive', entry._id, now),
    message: null,
    appIdentity: args.appIdentity,
    now,
  })
  await deleteAllPublicProjections(ctx, entry._id)
  for (const locale of locales) {
    await deleteAssetRefsForSource(
      ctx,
      {
        sourceKind: 'public',
        sourceId: `${String(entry._id)}:${locale}`,
      },
      'canonical',
    )
  }
  await ctx.db.patch(entry._id, {
    lifecycle: 'archived',
    activePublications: [],
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots })
  await logActivity(ctx, {
    kind: 'entry.archived',
    summary: 'Archived entry',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { locales, revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind: 'archive',
    entry,
    revisionId: revision.revisionId,
    tags,
    paths,
    appIdentity: args.appIdentity,
    now,
  })
  return { revisionId: revision.revisionId, affectedLocales: locales }
}

export async function restoreArchivedEntry(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    expectedDraftVersion: number
    appIdentity: string
  },
): Promise<{ revisionId: Id<'entryRevisions'> }> {
  const installed = await assertCmsContractWritable(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  if (entry.lifecycle !== 'archived') {
    throwCmsError('ENTRY_RESTORE_NOT_ARCHIVED', 'Only archived entries can be restored.', {
      entryId: String(entry._id),
      status: entry.lifecycle,
    })
  }
  if (entry.draftVersion !== args.expectedDraftVersion) {
    throwCmsError('ENTRY_DRAFT_STALE', 'The draft changed before restore.')
  }

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
    kind: 'restore',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: workflowOperationId('restore', entry._id, now),
    message: 'Restored archived editorial record',
    appIdentity: args.appIdentity,
    now,
  })
  await ctx.db.patch(entry._id, {
    lifecycle: 'active',
    latestEditorialRevisionId: revision.revisionId,
    updatedAt: now,
    updatedBy: args.appIdentity,
    draftVersion: entry.draftVersion + 1,
  })
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots })
  await logActivity(ctx, {
    kind: 'entry.restored',
    summary: 'Restored entry',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  return { revisionId: revision.revisionId }
}
