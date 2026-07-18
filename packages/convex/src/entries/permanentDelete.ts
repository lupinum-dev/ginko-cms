import { permanentlyDeleteEntry as permanentlyDeleteEntryArgs } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  contentTags,
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { canDeleteEntries } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import { logActivity } from '../lib/activity.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { assertCmsContractWritable } from '../lib/installedContract.js'
import { enqueueRevalidationEvent } from '../lib/revalidationOutbox.js'
import type { MutationCtx } from '../lib/types.js'
import {
  buildPreview,
  defineCmsOperation,
  definePreview,
  operationEffect,
  operationIssue,
  previewResultValidator,
} from '../operationHelpers.js'
import { scheduleRevalidationOutboxDelivery } from '../revalidation.js'
import { invalidateAssetReferenceProof } from './assetReferenceProof.js'
import { inspectInboundEntryRelations } from './inboundRelations.js'
import { stableHash } from './workflow/hashing.js'

const OPERATION_ID = 'ginko-cms.permanently-delete-entry'
const EXECUTE_PATH = 'entries/permanentDelete:permanentlyDeleteEntryOperationExecute'
const DELETION_ACTIVITY_KIND = 'entry.deleted'

// A permanent delete is one atomic Convex transaction. These limits keep the
// read/write set inside the certified transaction envelope; oversized entries
// fail closed in preview instead of starting a partial purge.
const DELETE_LIMITS = {
  children: 1_500,
  publicRows: 10,
  assets: 500,
  recoveryArtifacts: 500,
  redirects: 500,
  reviews: 500,
  createReceipts: 100,
  transitionItems: 100,
  portableItems: 100,
  localeDrafts: 10,
  draftSearchRows: 10,
  revisions: 40,
  assetRefs: 2_000,
  activityRows: 500,
} as const

type DeleteInventoryName = keyof typeof DELETE_LIMITS

function boundedInventory<T>(name: DeleteInventoryName, rows: T[]) {
  const limit = DELETE_LIMITS[name]
  return {
    rows: rows.slice(0, limit),
    overflow: rows.length > limit ? { name, limit } : null,
  }
}

const deleteResultValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  stableId: v.string(),
  deleted: v.boolean(),
  alreadyDeleted: v.boolean(),
  activityRecordsRetainedAtDeletion: v.number(),
  standardActivityRecordsRetainedAtDeletion: v.number(),
  legalActivityRecordsRetained: v.number(),
})

type DeletedReceipt = {
  entryId: string
  collection: string
  stableId: string
  activityRecordsRetainedAtDeletion: number
  standardActivityRecordsRetainedAtDeletion: number
  legalActivityRecordsRetained: number
}

function confirmationPhrase(stableId: string) {
  return `DELETE ${stableId}`
}

function readDeletedReceipt(row: Doc<'activity'>): DeletedReceipt {
  const detail = row.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return throwCmsError(
      'ENTRY_DELETION_RECEIPT_INVALID',
      'The retained deletion receipt is incomplete.',
      { activityId: String(row._id) },
    )
  }
  const entryId = detail.entryId
  const collection = detail.collection
  const stableId = detail.stableId
  const activityRecordsRetainedAtDeletion = detail.activityRecordsRetainedAtDeletion
  const standardActivityRecordsRetainedAtDeletion = detail.standardActivityRecordsRetainedAtDeletion
  const legalActivityRecordsRetained = detail.legalActivityRecordsRetained
  if (
    typeof entryId !== 'string' ||
    typeof collection !== 'string' ||
    typeof stableId !== 'string' ||
    typeof activityRecordsRetainedAtDeletion !== 'number' ||
    typeof standardActivityRecordsRetainedAtDeletion !== 'number' ||
    typeof legalActivityRecordsRetained !== 'number'
  ) {
    return throwCmsError(
      'ENTRY_DELETION_RECEIPT_INVALID',
      'The retained deletion receipt is incomplete.',
      { activityId: String(row._id) },
    )
  }
  return {
    entryId,
    collection,
    stableId,
    activityRecordsRetainedAtDeletion,
    standardActivityRecordsRetainedAtDeletion,
    legalActivityRecordsRetained,
  }
}

async function readDeletionActivity(ctx: MutationCtx, entryId: string) {
  return await ctx.db
    .query('activity')
    .withIndex('by_kind_subject', (query) =>
      query.eq('kind', DELETION_ACTIVITY_KIND).eq('subjectKey', entryId),
    )
    .first()
}

async function loadExistingEntryState(ctx: MutationCtx, entry: Doc<'entries'>) {
  const now = Date.now()
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const [
    children,
    inboundRelations,
    publicRows,
    publicSearchRows,
    assets,
    recoveryArtifacts,
    redirects,
    reviews,
    createReceipts,
    transitionItems,
    portableItems,
    localeDrafts,
    draftSearchRows,
    revisions,
    assetRefs,
    activityRows,
  ] = await Promise.all([
    ctx.db
      .query('entries')
      .withIndex('by_parent', (query) =>
        query.eq('collection', entry.collection).eq('parentEntryId', entry._id),
      )
      .take(DELETE_LIMITS.children + 1),
    inspectInboundEntryRelations(ctx, entry),
    ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.publicRows + 1),
    ctx.db
      .query('publicSearchEntries')
      .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.publicRows + 1),
    ctx.db
      .query('assets')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.assets + 1),
    ctx.db
      .query('assetRecoveryArtifacts')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.recoveryArtifacts + 1),
    ctx.db
      .query('redirects')
      .withIndex('by_target', (query) => query.eq('targetEntryId', entry._id))
      .take(DELETE_LIMITS.redirects + 1),
    ctx.db
      .query('reviewRequests')
      .withIndex('by_entry', (query) => query.eq('entryId', String(entry._id)))
      .take(DELETE_LIMITS.reviews + 1),
    ctx.db
      .query('mcpCreateEntryReceipts')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.createReceipts + 1),
    ctx.db
      .query('contractTransitionItems')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.transitionItems + 1),
    ctx.db
      .query('portableItems')
      .withIndex('by_collection_canonical', (query) =>
        query.eq('collection', entry.collection).eq('canonicalKey', entry.stableId),
      )
      .take(DELETE_LIMITS.portableItems + 1),
    ctx.db
      .query('entryLocaleDrafts')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.localeDrafts + 1),
    ctx.db
      .query('draftSearchEntries')
      .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.draftSearchRows + 1),
    ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_createdAt', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.revisions + 1),
    ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.assetRefs + 1),
    ctx.db
      .query('activity')
      .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
      .take(DELETE_LIMITS.activityRows + 1),
  ])

  const inventories = {
    children: boundedInventory('children', children),
    publicRows: boundedInventory('publicRows', [...publicRows, ...publicSearchRows]),
    assets: boundedInventory('assets', assets),
    recoveryArtifacts: boundedInventory('recoveryArtifacts', recoveryArtifacts),
    redirects: boundedInventory('redirects', redirects),
    reviews: boundedInventory('reviews', reviews),
    createReceipts: boundedInventory('createReceipts', createReceipts),
    transitionItems: boundedInventory('transitionItems', transitionItems),
    portableItems: boundedInventory('portableItems', portableItems),
    localeDrafts: boundedInventory('localeDrafts', localeDrafts),
    draftSearchRows: boundedInventory('draftSearchRows', draftSearchRows),
    revisions: boundedInventory('revisions', revisions),
    assetRefs: boundedInventory('assetRefs', assetRefs),
    activityRows: boundedInventory('activityRows', activityRows),
  }
  const inventoryOverflows = Object.values(inventories)
    .map((inventory) => inventory.overflow)
    .filter((overflow): overflow is NonNullable<typeof overflow> => overflow !== null)

  // Public projection families share one supported cap. Slice them
  // individually only after detecting total drift.
  const boundedPublicRows = publicRows.slice(0, DELETE_LIMITS.publicRows)
  const boundedPublicSearchRows = publicSearchRows.slice(0, DELETE_LIMITS.publicRows)

  const transitionRuns = await Promise.all(
    inventories.transitionItems.rows.map(async (item) => ({
      item,
      run: await ctx.db.get(item.runId),
    })),
  )
  const portableRunIds = [...new Set(inventories.portableItems.rows.map((item) => item.runId))]
  const portableRuns = new Map(
    await Promise.all(
      portableRunIds.map(
        async (runId) =>
          [
            runId,
            await ctx.db
              .query('portableRuns')
              .withIndex('by_run_id', (query) => query.eq('runId', runId))
              .unique(),
          ] as const,
      ),
    ),
  )
  const retainedPortableItems = inventories.portableItems.rows.filter((item) => {
    const run = portableRuns.get(item.runId)
    return !run || run.expiresAt > now
  })
  const expiredPortableItems = inventories.portableItems.rows.filter(
    (item) => !retainedPortableItems.includes(item),
  )
  const activeTransitionItems = transitionRuns.filter(
    ({ run }) => !run || (run.state !== 'complete' && run.state !== 'cancelled'),
  )
  const terminalTransitionItems = transitionRuns
    .filter(({ item }) => !activeTransitionItems.some((active) => active.item._id === item._id))
    .map(({ item }) => item)

  return {
    kind: 'existing' as const,
    now,
    entry,
    collection,
    inventoryOverflows,
    children: inventories.children.rows,
    inboundRelations,
    publicRows: boundedPublicRows,
    publicSearchRows: boundedPublicSearchRows,
    assets: inventories.assets.rows,
    recoveryArtifacts: inventories.recoveryArtifacts.rows,
    redirects: inventories.redirects.rows,
    reviews: inventories.reviews.rows,
    createReceipts: inventories.createReceipts.rows,
    activeTransitionItems,
    terminalTransitionItems,
    retainedPortableItems,
    expiredPortableItems,
    localeDrafts: inventories.localeDrafts.rows,
    draftSearchRows: inventories.draftSearchRows.rows,
    revisions: inventories.revisions.rows,
    assetRefs: inventories.assetRefs.rows,
    activityRows: inventories.activityRows.rows,
  }
}

async function loadPermanentDeleteState(
  ctx: MutationCtx,
  args: { entryId: string; confirmationPhrase: string },
) {
  await assertCmsContractWritable(ctx)
  const normalizedId = ctx.db.normalizeId('entries', args.entryId)
  const entry = normalizedId ? await ctx.db.get(normalizedId) : null
  if (entry) return await loadExistingEntryState(ctx, entry)

  const deletionActivity = await readDeletionActivity(ctx, args.entryId)
  if (!deletionActivity) {
    throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: args.entryId })
  }
  return {
    kind: 'deleted' as const,
    receipt: readDeletedReceipt(deletionActivity),
    activityId: deletionActivity._id,
  }
}

function listedIds(rows: Array<{ _id: unknown }>, limit = 25) {
  return rows.slice(0, limit).map((row) => String(row._id))
}

function inventoryFence(rows: Array<{ _id: unknown }>) {
  const ids = rows.map((row) => String(row._id)).sort()
  return { count: ids.length, hash: stableHash(ids) }
}

function existingEntryBlockers(state: Awaited<ReturnType<typeof loadExistingEntryState>>) {
  const blockers = []
  for (const overflow of state.inventoryOverflows) {
    blockers.push(
      operationIssue({
        code: 'entry-delete-inventory-limit-exceeded',
        message: `Permanent-delete inventory "${overflow.name}" exceeds the atomic limit of ${overflow.limit} records. Reduce retained history or dependencies before retrying.`,
        inventory: overflow.name,
        limit: overflow.limit,
      }),
    )
  }
  if (state.entry.lifecycle !== 'archived') {
    blockers.push(
      operationIssue({
        code: 'entry-not-archived',
        message: 'Archive the entry before permanently deleting it.',
      }),
    )
  }
  const publicRemnantCount =
    state.entry.activePublications.length + state.publicRows.length + state.publicSearchRows.length
  if (publicRemnantCount > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-public-remnants',
        message: `${publicRemnantCount} active publication or public projection record${publicRemnantCount === 1 ? '' : 's'} must be removed or repaired first.`,
        count: publicRemnantCount,
      }),
    )
  }
  if (state.children.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-children',
        message: `${state.children.length} editorial child entr${state.children.length === 1 ? 'y' : 'ies'} must be moved or deleted first.`,
        count: state.children.length,
        entryIds: listedIds(state.children),
      }),
    )
  }
  if (state.inboundRelations.total > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-inbound-relations',
        message: `${state.inboundRelations.total} current inbound relation${state.inboundRelations.total === 1 ? '' : 's'} must be resolved first.`,
        details: state.inboundRelations,
      }),
    )
  }
  if (state.assets.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-scoped-assets',
        message: `${state.assets.length} entry-scoped asset${state.assets.length === 1 ? '' : 's'} must be moved or purged first.`,
        count: state.assets.length,
        assetIds: listedIds(state.assets),
      }),
    )
  }
  if (state.recoveryArtifacts.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-recovery-artifacts',
        message: `${state.recoveryArtifacts.length} retained asset recovery artifact${state.recoveryArtifacts.length === 1 ? '' : 's'} must be resolved first.`,
        count: state.recoveryArtifacts.length,
        artifactIds: state.recoveryArtifacts.slice(0, 25).map((row) => row.artifactId),
      }),
    )
  }
  const activeRedirects = state.redirects.filter((redirect) => redirect.state === 'active')
  if (activeRedirects.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-active-redirects',
        message: `${activeRedirects.length} active redirect${activeRedirects.length === 1 ? '' : 's'} must be retired first.`,
        count: activeRedirects.length,
        redirectIds: activeRedirects.slice(0, 25).map((row) => row.redirectId),
      }),
    )
  }
  const pendingReviews = state.reviews.filter((review) => review.status === 'pending')
  if (pendingReviews.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-has-pending-reviews',
        message: `${pendingReviews.length} pending review request${pendingReviews.length === 1 ? '' : 's'} must be resolved first.`,
        count: pendingReviews.length,
        reviewIds: listedIds(pendingReviews),
      }),
    )
  }
  if (state.retainedPortableItems.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-retained-by-portability',
        message: `${state.retainedPortableItems.length} current portability artifact${state.retainedPortableItems.length === 1 ? '' : 's'} retain this entry. Wait for expiry or clean up the run first.`,
        count: state.retainedPortableItems.length,
        runIds: [...new Set(state.retainedPortableItems.map((item) => item.runId))].slice(0, 25),
      }),
    )
  }
  if (state.activeTransitionItems.length > 0) {
    blockers.push(
      operationIssue({
        code: 'entry-retained-by-contract-transition',
        message: `${state.activeTransitionItems.length} active contract transition item${state.activeTransitionItems.length === 1 ? '' : 's'} retain this entry. Complete or cancel the transition first.`,
        count: state.activeTransitionItems.length,
        runIds: state.activeTransitionItems.slice(0, 25).map(({ item }) => String(item.runId)),
      }),
    )
  }
  return blockers
}

async function deleteExistingEntry(
  ctx: MutationCtx,
  state: Awaited<ReturnType<typeof loadExistingEntryState>>,
  appIdentityId: string,
) {
  const { entry } = state

  for (const row of state.expiredPortableItems) await ctx.db.delete(row._id)
  for (const row of state.terminalTransitionItems) await ctx.db.delete(row._id)
  for (const row of state.reviews) await ctx.db.delete(row._id)
  for (const row of state.createReceipts) await ctx.db.delete(row._id)
  for (const row of state.redirects) await ctx.db.delete(row._id)
  for (const row of state.draftSearchRows) await ctx.db.delete(row._id)
  for (const row of state.localeDrafts) await ctx.db.delete(row._id)
  for (const row of state.publicRows) await ctx.db.delete(row._id)
  for (const row of state.publicSearchRows) await ctx.db.delete(row._id)
  for (const row of state.assetRefs) await ctx.db.delete(row._id)
  if (state.assetRefs.length > 0) await invalidateAssetReferenceProof(ctx)
  for (const row of state.revisions) await ctx.db.delete(row._id)

  for (const row of state.activityRows) {
    await ctx.db.patch(row._id, { entryId: null, subjectKey: String(entry._id) })
  }
  const standardActivityRecordsRetainedAtDeletion = state.activityRows.length
  const legalActivityRecordsRetained = 1
  const activityRecordsRetainedAtDeletion =
    standardActivityRecordsRetainedAtDeletion + legalActivityRecordsRetained
  await logActivity(ctx, {
    kind: DELETION_ACTIVITY_KIND,
    summary: 'Permanently deleted archived entry',
    retention: 'legal',
    appIdentityId,
    entryId: null,
    subjectKey: String(entry._id),
    collection: entry.collection,
    detail: {
      entryId: String(entry._id),
      collection: entry.collection,
      stableId: entry.stableId,
      activityRecordsRetainedAtDeletion,
      standardActivityRecordsRetainedAtDeletion,
      legalActivityRecordsRetained,
      retainedOperationReceipt: true,
      deletedLocaleDrafts: state.localeDrafts.length,
      deletedRevisions: state.revisions.length,
      deletedReviewRecords: state.reviews.length,
    },
    createdAt: state.now,
  })

  const redirectPaths = state.redirects.map((redirect) => normalizeContentPath(redirect.fromPath))
  const tags = uniqueContentTags([
    contentTags.collection(entry.collection),
    contentTags.entry(entry.collection, entry.stableId),
    ...state.collection.locales.flatMap((locale) => [
      contentTags.entry(entry.collection, entry.stableId, locale),
      contentTags.nav(entry.collection, locale),
      contentTags.search(locale),
    ]),
    ...redirectPaths.map((path) => contentTags.route(path)),
    contentTags.sitemap(),
  ])
  await enqueueRevalidationEvent(ctx, {
    idempotencyKey: `content.revalidate:delete:${String(entry._id)}`,
    versionId: null,
    tags,
    paths: redirectPaths,
    payload: {
      reason: 'delete',
      collection: entry.collection,
      entryId: String(entry._id),
      stableId: entry.stableId,
      appIdentityId,
    },
    now: state.now,
  })
  await scheduleRevalidationOutboxDelivery(ctx)
  await ctx.db.delete(entry._id)

  return {
    entryId: String(entry._id),
    collection: entry.collection,
    stableId: entry.stableId,
    deleted: true,
    alreadyDeleted: false,
    activityRecordsRetainedAtDeletion,
    standardActivityRecordsRetainedAtDeletion,
    legalActivityRecordsRetained,
  }
}

export const permanentlyDeleteEntryOperation = defineCmsOperation({
  id: OPERATION_ID,
  kind: 'destructive',
  executeFunctionRef: EXECUTE_PATH,
  args: permanentlyDeleteEntryArgs.args,
  guard: canDeleteEntries,
  returns: deleteResultValidator,
  previewReturns: previewResultValidator(),
  load: loadPermanentDeleteState,
  preview: async (_ctx, args, state) => {
    if (state.kind === 'deleted') {
      const expectedPhrase = confirmationPhrase(state.receipt.stableId)
      const phraseMatches = args.confirmationPhrase === expectedPhrase
      return buildPreview({
        summary: `Entry "${state.receipt.stableId}" was already permanently deleted.`,
        allowed: phraseMatches,
        blockers: phraseMatches
          ? []
          : [
              operationIssue({
                code: 'confirmation-phrase-mismatch',
                message: `Enter ${expectedPhrase} exactly to confirm the idempotent deletion receipt.`,
              }),
            ],
        warnings: [
          operationIssue({
            code: 'entry-already-deleted',
            message: 'No content records will be deleted again; retained audit records remain.',
          }),
        ],
        effects: [operationEffect({ kind: 'entries', summary: 'Entries deleted', count: 0 })],
        details: {
          alreadyDeleted: true,
          activityRecordsRetainedAtDeletion: state.receipt.activityRecordsRetainedAtDeletion,
          standardActivityRecordsRetainedAtDeletion:
            state.receipt.standardActivityRecordsRetainedAtDeletion,
          legalActivityRecordsRetained: state.receipt.legalActivityRecordsRetained,
          retainedOperationReceipt: true,
        },
        confirm: phraseMatches
          ? { operationId: OPERATION_ID, args, expectedPhrase, alreadyDeleted: true }
          : null,
        version: { activityId: String(state.activityId), receipt: state.receipt },
      })
    }

    const blockers = existingEntryBlockers(state)
    const expectedPhrase = confirmationPhrase(state.entry.stableId)
    if (args.confirmationPhrase !== expectedPhrase) {
      blockers.push(
        operationIssue({
          code: 'confirmation-phrase-mismatch',
          message: `Enter ${expectedPhrase} exactly to confirm permanent deletion.`,
        }),
      )
    }
    const removableRedirects = state.redirects.filter(
      (redirect: Doc<'redirects'>) => redirect.state === 'retired',
    )
    const removableReviewRecords = state.reviews.filter(
      (review: Doc<'reviewRequests'>) => review.status !== 'pending',
    )
    return buildPreview({
      summary:
        blockers.length === 0
          ? `Will permanently delete archived entry "${state.entry.stableId}".`
          : `Cannot permanently delete entry "${state.entry.stableId}" yet.`,
      allowed: blockers.length === 0,
      blockers,
      warnings: [
        operationIssue({
          code: 'audit-records-retained',
          message: `${state.activityRows.length} existing activity record${state.activityRows.length === 1 ? '' : 's'} will keep normal retention with detached entry links; one minimal legal-hold deletion receipt and the guarded operation receipt will remain.`,
        }),
      ],
      effects: [
        operationEffect({ kind: 'entries', summary: 'Entries deleted', count: 1 }),
        operationEffect({
          kind: 'locale-drafts',
          summary: 'Localized drafts deleted',
          count: state.localeDrafts.length,
        }),
        operationEffect({
          kind: 'revisions',
          summary: 'Immutable entry revisions deleted',
          count: state.revisions.length,
        }),
        operationEffect({
          kind: 'reviews',
          summary: 'Resolved review records deleted',
          count: removableReviewRecords.length,
        }),
        operationEffect({
          kind: 'redirects',
          summary: 'Retired redirects deleted',
          count: removableRedirects.length,
        }),
      ],
      details: {
        expectedPhrase,
        inboundRelations: state.inboundRelations,
        activityRecordsRetainedAtDeletion: state.activityRows.length + 1,
        standardActivityRecordsRetainedAtDeletion: state.activityRows.length,
        legalActivityRecordsRetained: 1,
        retainedOperationReceipt: true,
        deletedRecords: {
          localeDrafts: state.localeDrafts.length,
          revisions: state.revisions.length,
          draftSearchRows: state.draftSearchRows.length,
          contentAssetRefs: state.assetRefs.length,
          reviews: state.reviews.length,
          mcpCreateReceipts: state.createReceipts.length,
          expiredPortableItems: state.expiredPortableItems.length,
          terminalTransitionItems: state.terminalTransitionItems.length,
          retiredRedirects: removableRedirects.length,
        },
      },
      confirm:
        blockers.length === 0
          ? { operationId: OPERATION_ID, args, expectedPhrase, irreversible: true }
          : null,
      version: {
        entry: {
          id: String(state.entry._id),
          lifecycle: state.entry.lifecycle,
          draftVersion: state.entry.draftVersion,
          updatedAt: state.entry.updatedAt,
        },
        inventory: {
          children: inventoryFence(state.children),
          publicRows: inventoryFence(state.publicRows),
          publicSearchRows: inventoryFence(state.publicSearchRows),
          assets: inventoryFence(state.assets),
          recoveryArtifacts: inventoryFence(state.recoveryArtifacts),
          localeDrafts: inventoryFence(state.localeDrafts),
          revisions: inventoryFence(state.revisions),
          draftSearchRows: inventoryFence(state.draftSearchRows),
          contentAssetRefs: inventoryFence(state.assetRefs),
          reviews: inventoryFence(state.reviews),
          redirects: inventoryFence(state.redirects),
          portableItems: inventoryFence(state.expiredPortableItems),
          transitionItems: inventoryFence(state.terminalTransitionItems),
          activity: inventoryFence(state.activityRows),
        },
      },
    })
  },
  handler: async (ctx, _args, state) => {
    if (state.kind === 'deleted') {
      return {
        entryId: state.receipt.entryId,
        collection: state.receipt.collection,
        stableId: state.receipt.stableId,
        deleted: false,
        alreadyDeleted: true,
        activityRecordsRetainedAtDeletion: state.receipt.activityRecordsRetainedAtDeletion,
        standardActivityRecordsRetainedAtDeletion:
          state.receipt.standardActivityRecordsRetainedAtDeletion,
        legalActivityRecordsRetained: state.receipt.legalActivityRecordsRetained,
      }
    }
    const appIdentity = await ctx.appIdentity()
    return await deleteExistingEntry(ctx, state, appIdentity.userId)
  },
})

export const permanentlyDeleteEntryOperationExecute = callerMutation.protected(
  permanentlyDeleteEntryOperation,
)
export const previewPermanentlyDeleteEntryOperation = callerMutation.protected(
  Object.assign(definePreview(permanentlyDeleteEntryOperation), {
    id: 'entries/permanentDelete:previewPermanentlyDeleteEntryOperation',
  }),
)
