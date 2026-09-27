import {
  openSharedBody as openArgs,
  getSharedBodyHead as headArgs,
  pullSharedBody as pullArgs,
  pushSharedBody as pushArgs,
  editorCollaborationHeadValidator,
  editorCollaborationSnapshotValidator,
  editorCollaborationReplyValidator,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import { sha256Hex } from '@lupinum/ginko-content/cms-contract'
import {
  applyCollaborationSteps,
  createCollaborationSnapshot,
  collaborationLimits,
  CollaborationError,
  editorSchemaRevision,
  fenceMismatch,
  type CollaborationHead,
  type CollaborationReply,
} from '@lupinum/ginko-editor/runtime'
import { v } from 'convex/values'

import { internal } from '../_generated/api.js'
import type { Doc } from '../_generated/dataModel.js'
import { canEditEntries, canRead } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { callerMutation, callerQuery } from '../functions.js'
import { assertCollectionSupportsLocale } from '../lib/collections.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import { assertCmsContractWritable, readInstalledCmsContract } from '../lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { getEntryOrThrow } from './context.js'
import { refreshDraftAssetRefsForSave } from './workflow/commands.js'
import { applyDraftPatch } from './workflow/drafts.js'

const encoder = new TextEncoder()
const sourceHash = (source: string) => sha256Hex(encoder.encode(source))
const head = (room: Doc<'editorBodyRooms'>): CollaborationHead => ({
  protocolVersion: room.protocolVersion ?? 1,
  epoch: room.epoch,
  schemaRevision: room.schemaRevision,
  policyRevision: room.policyRevision,
  version: room.version,
})
const snapshot = (room: Doc<'editorBodyRooms'>) => ({ ...head(room), document: room.document })

async function bodyContext(ctx: QueryOrMutationCtx, args: { entryId: string; locale: string }) {
  const entry = await getEntryOrThrow(ctx, args.entryId)
  const installed = await readInstalledCmsContract(ctx)
  const collection = installed?.content.collections[entry.collection]
  if (!installed || !collection)
    throwCmsError(
      'COLLECTION_NOT_FOUND',
      'The content contract no longer contains this collection.',
    )
  assertCollectionSupportsLocale(
    { slug: entry.collection, locales: collection.locales },
    args.locale,
  )
  if (entry.lifecycle === 'archived')
    throwCmsError('ENTRY_ARCHIVED', 'Restore this entry before sharing its body.')
  const draft = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', args.locale))
    .unique()
  if (!draft)
    throwCmsError('ENTRY_LOCALE_MISSING', 'Create this translation before sharing its body.')
  const room = await ctx.db
    .query('editorBodyRooms')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', args.locale))
    .unique()
  return { entry, collection, draft, room, policyRevision: installed.record.contentHash }
}

async function checked<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CollaborationError)
      throwCmsError('EDITOR_COLLABORATION_REJECTED', error.message, { reason: error.code })
    throw error
  }
}

async function currentHead(context: Awaited<ReturnType<typeof bodyContext>>) {
  const { room, draft, policyRevision } = context
  if (!room)
    throwCmsError('EDITOR_ROOM_MISSING', 'Open this shared body before reading its operations.')
  const current = head(room)
  if (room.sourceDraftId !== draft._id || room.sourceHash !== (await sourceHash(draft.bodyMdc))) {
    return { ...current, epoch: `replaced:${room._id}:${room.generation}:${draft.version}` }
  }
  return { ...current, policyRevision, schemaRevision: editorSchemaRevision }
}

async function history(
  ctx: QueryOrMutationCtx,
  context: Awaited<ReturnType<typeof bodyContext>>,
  requested: CollaborationHead,
): Promise<CollaborationReply> {
  const room = context.room!
  const current = await currentHead(context)
  if (!Number.isSafeInteger(requested.version) || requested.version < 0)
    throwCmsError('EDITOR_VERSION_INVALID', 'Invalid editor version.')
  const mismatch = fenceMismatch(current, requested)
  if (mismatch) return { status: 'stale', head: current, reason: mismatch }
  if (requested.version > room.version)
    throwCmsError('EDITOR_VERSION_INVALID', 'The requested version is ahead of this body.')
  if (requested.version < room.minimumVersion)
    return { status: 'stale', head: current, reason: 'history' }
  const rows = await ctx.db
    .query('editorBodySteps')
    .withIndex('by_room_epoch_version', (q) =>
      q.eq('roomId', room._id).eq('epoch', room.epoch).gt('version', requested.version),
    )
    .take(8)
  const steps: string[] = [],
    clientIds: string[] = []
  let version = requested.version,
    bytes = 0
  for (const row of rows) {
    const start = row.version - row.steps.length
    if (start > version)
      throwCmsError('EDITOR_HISTORY_GAP', 'This body needs a fresh editing session.')
    const tail = row.steps.slice(version - start)
    const size = tail.reduce((sum, step) => sum + encoder.encode(step).byteLength, 0)
    // Keep an accepted transaction together, so recovery bases are complete
    // server checkpoints even when a page reaches its byte/operation limit.
    if (
      steps.length + tail.length > collaborationLimits.stepsPerBatch ||
      bytes + size > collaborationLimits.batchBytes
    )
      break
    steps.push(...tail)
    clientIds.push(...tail.map(() => row.clientId))
    bytes += size
    version = row.version
  }
  return {
    status: 'ok',
    update: { ...current, fromVersion: requested.version, version, steps, clientIds },
  }
}

export const openSharedBody = callerMutation.protected({
  id: 'editor:openSharedBody',
  args: openArgs.args,
  guard: canEditEntries,
  returns: v.union(
    v.object({
      available: v.literal(false),
      reason: v.union(v.literal('policy'), v.literal('source')),
    }),
    v.object({
      available: v.literal(true),
      snapshot: editorCollaborationSnapshotValidator,
      clientPrefix: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
    const context = await bodyContext(ctx, args)
    const identity = await ctx.appIdentity()
    const policy = context.collection.componentPolicy
    if (context.collection.portable.bodyField === null)
      return { available: false as const, reason: 'source' as const }
    if (!('version' in policy) || policy.version !== 2)
      return { available: false as const, reason: 'policy' as const }
    const hash = await sourceHash(context.draft.bodyMdc)
    const policyRevision = context.policyRevision
    const existing = context.room
    if (
      existing &&
      existing.sourceDraftId === context.draft._id &&
      existing.sourceHash === hash &&
      existing.policyRevision === policyRevision &&
      existing.schemaRevision === editorSchemaRevision
    ) {
      return {
        available: true as const,
        snapshot: snapshot(existing),
        clientPrefix: `${identity.userId}/`,
      }
    }
    const generation = (existing?.generation ?? 0) + 1
    let checkpoint
    try {
      checkpoint = await createCollaborationSnapshot(context.draft.bodyMdc, {
        policy,
        epoch: existing ? `${existing._id}:${generation}` : 'new',
        policyRevision,
      })
    } catch (error) {
      if (error instanceof CollaborationError && error.code === 'content')
        return { available: false as const, reason: 'source' as const }
      throw error
    }
    const row = {
      ...checkpoint.snapshot,
      protocolVersion: 1 as const,
      sourceDraftId: context.draft._id,
      entryId: context.entry._id,
      locale: args.locale,
      generation,
      minimumVersion: 0,
      historyBytes: 0,
      sourceHash: hash,
      updatedAt: Date.now(),
    }
    if (existing) {
      await ctx.db.replace(existing._id, row)
      await ctx.scheduler.runAfter(0, internal.entries.collaborationCleanup.pruneOldEpoch, {
        roomId: existing._id,
        epoch: existing.epoch,
      })
    } else {
      const roomId = await ctx.db.insert('editorBodyRooms', row)
      checkpoint.snapshot.epoch = `${roomId}:${generation}`
      await ctx.db.patch(roomId, { epoch: checkpoint.snapshot.epoch })
    }
    return {
      available: true as const,
      snapshot: { ...checkpoint.snapshot, protocolVersion: 1 as const },
      clientPrefix: `${identity.userId}/`,
    }
  },
})

export const getSharedBodyHead = callerQuery.protected({
  id: 'editor:getSharedBodyHead',
  args: headArgs.args,
  guard: canRead,
  returns: editorCollaborationHeadValidator,
  handler: async (ctx, args) => currentHead(await bodyContext(ctx, args)),
})
export const pullSharedBody = callerQuery.protected({
  id: 'editor:pullSharedBody',
  args: pullArgs.args,
  guard: canRead,
  returns: editorCollaborationReplyValidator,
  handler: async (ctx, args) => history(ctx, await bodyContext(ctx, args), args),
})
export const pushSharedBody = callerMutation.protected({
  id: 'editor:pushSharedBody',
  args: pushArgs.args,
  guard: canEditEntries,
  returns: editorCollaborationReplyValidator,
  handler: async (ctx, args) => {
    await assertCmsContractWritable(ctx)
    const context = await bodyContext(ctx, args)
    const current = await currentHead(context)
    const identity = await ctx.appIdentity()
    const prefix = `${identity.userId}/`
    if (
      !args.clientId.startsWith(prefix) ||
      !/^[\w-]{8,80}$/.test(args.clientId.slice(prefix.length))
    ) {
      throwCmsError('EDITOR_CLIENT_INVALID', 'This client ID belongs to another editing session.')
    }
    const room = context.room!
    if (fenceMismatch(current, args) || args.version !== room.version)
      return history(ctx, context, args)
    const policy = context.collection.componentPolicy
    if (!('version' in policy) || policy.version !== 2)
      throwCmsError('EDITOR_POLICY_CHANGED', 'Reopen this body with the current component policy.')
    const checkpoint = await checked(() =>
      applyCollaborationSteps(snapshot(room), args, { policy }),
    )
    assertMdcBodyWithinLimit(checkpoint.markdown, { locale: args.locale, field: 'bodyMdc' })
    const now = Date.now()
    const result = await applyDraftPatch(ctx, {
      entryId: context.entry._id,
      expectedDraftVersion: context.entry.draftVersion,
      patch: { locales: { [args.locale]: { bodyMdc: checkpoint.markdown } } },
      appIdentity: identity.userId,
      now,
    })
    await refreshDraftAssetRefsForSave(ctx, {
      entryId: context.entry._id,
      collection: context.entry.collection,
      sharedUpdated: false,
      affectedLocales: result.affectedLocales,
    })
    const bytes = encoder.encode(
      JSON.stringify({ steps: args.steps, clientId: args.clientId }),
    ).byteLength
    await ctx.db.patch(room._id, {
      document: checkpoint.snapshot.document,
      version: checkpoint.snapshot.version,
      sourceHash: await sourceHash(checkpoint.markdown),
      historyBytes: room.historyBytes + bytes,
      updatedAt: now,
    })
    await ctx.db.insert('editorBodySteps', {
      roomId: room._id,
      epoch: room.epoch,
      version: checkpoint.snapshot.version,
      clientId: args.clientId,
      steps: args.steps,
      bytes,
      createdAt: now,
    })
    await boundHistory(ctx, room, checkpoint.snapshot.version, room.historyBytes + bytes)
    return {
      status: 'ok' as const,
      update: {
        ...current,
        fromVersion: room.version,
        version: checkpoint.snapshot.version,
        steps: args.steps,
        clientIds: args.steps.map(() => args.clientId),
      },
    }
  },
})

// Recovery can reopen from the latest snapshot after this bounded operation
// window expires. Keep whole accepted batches and never prune the latest batch.
async function boundHistory(
  ctx: MutationCtx,
  room: Doc<'editorBodyRooms'>,
  version: number,
  initialBytes: number,
) {
  let minimumVersion = room.minimumVersion,
    bytes = initialBytes
  const overBudget = () => version - minimumVersion > 1024 || bytes > 2 * 1024 * 1024
  while (overBudget()) {
    const rows = await ctx.db
      .query('editorBodySteps')
      .withIndex('by_room_epoch_version', (q) =>
        q.eq('roomId', room._id).eq('epoch', room.epoch).lt('version', version),
      )
      .take(128)
    if (!rows.length) break
    for (const row of rows) {
      if (!overBudget()) break
      await ctx.db.delete(row._id)
      minimumVersion = row.version
      bytes -= row.bytes
    }
  }
  if (minimumVersion !== room.minimumVersion)
    await ctx.db.patch(room._id, { minimumVersion, historyBytes: bytes })
}
