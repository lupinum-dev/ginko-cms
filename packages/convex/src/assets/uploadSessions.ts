import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { verifyPublicImageBytes } from '@lupinum/ginko-content/cms-contract'
import { makeFunctionReference } from 'convex/server'

import type { Doc, Id } from '../_generated/dataModel.js'
import type { ActionCtx } from '../_generated/server.js'
import type { CmsMemberAppIdentity } from '../auth/appIdentity.js'
import { canManageAssets } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { requireCms, requireCmsContractWriteToken, resolveCmsAppIdentity } from '../functions.js'
import { toStringId } from '../lib/ids.js'
import {
  assertCmsContractWriteToken,
  type CmsContractWriteToken,
} from '../lib/installedContract.js'
import { validateAssetUploadPolicy } from '../lib/sanitize.js'
import type { MutationCtx, QueryCtx } from '../lib/types.js'
import { hashValue } from '../operationHelpers.js'
import { insertVerifiedAssetRecord } from './assetRecord.js'
import { isStorageClaimedByAnotherOwner } from './storageOwnership.js'

type AssetScope = 'global' | 'collection' | 'entry'
type LocaleText = string | Record<string, string> | null
type FinalizeClaimedAssetUploadSessionArgs = {
  contractWriteToken: CmsContractWriteToken
  sessionId: string
  ownerId: string
  tokenHash: string
  expectedGeneration: number
  storageId: Id<'_storage'>
  filename: string
  alt?: LocaleText
  caption?: LocaleText
  scope: AssetScope
  entryId?: string
  collection?: string
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
  bytes: number
  sha256: string
  width: number
  height: number
  frames: number
}

export type ReadAssetUploadSessionResult =
  | {
      state: 'uploaded'
      sessionId: string
      storageId: Id<'_storage'>
      generation: number
      expiresAt: number
    }
  | { state: 'finalized'; sessionId: string; assetId: string }

const readAssetUploadSessionRef = makeFunctionReference<
  'query',
  { sessionId: string; ownerId: string; tokenHash: string },
  ReadAssetUploadSessionResult
>('assets:readAssetUploadSession')
const finalizeClaimedAssetUploadSessionRef = makeFunctionReference<
  'mutation',
  FinalizeClaimedAssetUploadSessionArgs,
  string
>('assets:finalizeClaimedAssetUploadSession')
const expireAssetUploadSessionRef = makeFunctionReference<
  'mutation',
  { uploadSessionId: Id<'assetUploadSessions'> },
  null
>('assets:expireAssetUploadSession')
const cleanupAssetStorageRef = makeFunctionReference<
  'action',
  {
    taskId: Id<'assetCleanupTasks'>
    storageId: Id<'_storage'>
    generation: number
    attempt: number
  },
  null
>('assets:cleanupAssetStorage')

const ASSET_UPLOAD_SESSION_TTL_MS = 10 * 60_000
const ASSET_UPLOAD_ABANDONED_GRACE_MS = 5 * 60_000

type ProtectedMutationCtx = MutationCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
}
type ProtectedActionCtx = ActionCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
  cmsContractWriteToken: () => CmsContractWriteToken | null
}
function assertAssetUploadSessionIdentity(
  session: Doc<'assetUploadSessions'> | null,
  input: { sessionId: string; ownerId: string; tokenHash: string },
): asserts session is Doc<'assetUploadSessions'> {
  if (!session) {
    throwCmsError('ASSET_UPLOAD_SESSION_NOT_FOUND', 'Asset upload session was not found.', {
      sessionId: input.sessionId,
    })
  }
  if (session.ownerId !== input.ownerId) {
    throwCmsError('ASSET_UPLOAD_SESSION_OWNER_MISMATCH', 'Asset upload session owner mismatch.')
  }
  if (session.tokenHash !== input.tokenHash) {
    throwCmsError('ASSET_UPLOAD_SESSION_TOKEN_INVALID', 'Asset upload session token is invalid.')
  }
}

export function assertAssetUploadSession(
  session: Doc<'assetUploadSessions'> | null,
  input: {
    sessionId: string
    ownerId: string
    tokenHash: string
    now: number
    state: Doc<'assetUploadSessions'>['state']
  },
): asserts session is Doc<'assetUploadSessions'> {
  assertAssetUploadSessionIdentity(session, input)
  if (session.expiresAt <= input.now) {
    throwCmsError('ASSET_UPLOAD_SESSION_EXPIRED', 'Asset upload session expired.')
  }
  if (session.state !== input.state) {
    throwCmsError('ASSET_UPLOAD_SESSION_REPLAYED', 'Asset upload session was already used.', {
      state: session.state,
    })
  }
}

export async function createAssetUploadSessionHandler(ctx: ProtectedMutationCtx) {
  const appIdentity = await ctx.appIdentity()
  const now = Date.now()
  const expiresAt = now + ASSET_UPLOAD_SESSION_TTL_MS
  const token = `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`
  const sessionId = `asset_upload_${globalThis.crypto.randomUUID()}`
  const uploadUrl = await ctx.storage.generateUploadUrl()
  const id = await ctx.db.insert('assetUploadSessions', {
    sessionId,
    ownerId: appIdentity.userId,
    tokenHash: await hashValue(token),
    state: 'awaiting-upload',
    generation: 1,
    createdAt: now,
    expiresAt,
  })
  await ctx.scheduler.runAt(
    expiresAt + ASSET_UPLOAD_ABANDONED_GRACE_MS,
    expireAssetUploadSessionRef,
    { uploadSessionId: id },
  )
  return { sessionId, uploadUrl, token, expiresAt }
}

export async function claimAssetUploadSessionHandler(
  ctx: ProtectedMutationCtx,
  args: { sessionId: string; token: string; storageId: Id<'_storage'> },
) {
  const appIdentity = await ctx.appIdentity()
  const session = await ctx.db
    .query('assetUploadSessions')
    .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
    .unique()
  assertAssetUploadSession(session, {
    sessionId: args.sessionId,
    ownerId: appIdentity.userId,
    tokenHash: await hashValue(args.token),
    now: Date.now(),
    state: 'awaiting-upload',
  })
  const storageId = args.storageId
  if (await isStorageClaimedByAnotherOwner(ctx, storageId, { uploadSessionId: session._id })) {
    throwCmsError('ASSET_UPLOAD_STORAGE_ALREADY_CLAIMED', 'Uploaded storage is already claimed.')
  }
  const now = Date.now()
  const generation = session.generation + 1
  await ctx.db.patch(session._id, {
    state: 'uploaded',
    generation,
    storageId,
    claimedAt: now,
  })
  return { sessionId: session.sessionId, generation, expiresAt: session.expiresAt }
}

export async function readAssetUploadSessionHandler(
  ctx: QueryCtx,
  args: { sessionId: string; ownerId: string; tokenHash: string },
) {
  const session = await ctx.db
    .query('assetUploadSessions')
    .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
    .unique()
  assertAssetUploadSessionIdentity(session, args)
  if (session.state === 'finalized') {
    const asset = session.assetId ? await ctx.db.get(session.assetId) : null
    if (!asset) {
      throwCmsError(
        'ASSET_UPLOAD_FINALIZED_ASSET_MISSING',
        'Finalized upload session points at a missing asset.',
      )
    }
    return { state: 'finalized' as const, sessionId: session.sessionId, assetId: String(asset._id) }
  }
  assertAssetUploadSession(session, {
    sessionId: args.sessionId,
    ownerId: args.ownerId,
    tokenHash: args.tokenHash,
    now: Date.now(),
    state: 'uploaded',
  })
  if (!session.storageId) {
    throwCmsError('ASSET_UPLOAD_STORAGE_MISSING', 'Asset upload session has no storage claim.')
  }
  return {
    state: 'uploaded' as const,
    sessionId: session.sessionId,
    storageId: session.storageId,
    generation: session.generation,
    expiresAt: session.expiresAt,
  }
}

export async function finalizeAssetUploadSessionHandler(
  ctx: ProtectedActionCtx,
  args: {
    sessionId: string
    token: string
    filename: string
    alt?: LocaleText
    caption?: LocaleText
    scope: AssetScope
    entryId?: string
    collection?: string
  },
) {
  const appIdentity = await ctx.appIdentity()
  const tokenHash = await hashValue(args.token)
  const session = await ctx.runQuery(readAssetUploadSessionRef, {
    sessionId: args.sessionId,
    ownerId: appIdentity.userId,
    tokenHash,
  })
  if (session.state === 'finalized') return session.assetId
  const blob = await ctx.storage.get(session.storageId)
  if (!blob) {
    throwCmsError('ASSET_STORAGE_MISSING', 'Uploaded asset storage object was not found.', {
      sessionId: session.sessionId,
      storageId: toStringId(session.storageId),
    })
  }
  const claimed = validateAssetUploadPolicy({ mimeType: blob.type, size: blob.size })
  const verified = await verifyPublicImageBytes(
    new Uint8Array(await blob.arrayBuffer()),
    claimed.mimeType,
  )
  const { mediaType, ...verifiedFacts } = verified
  return await ctx.runMutation(finalizeClaimedAssetUploadSessionRef, {
    contractWriteToken: requireCmsContractWriteToken(ctx),
    sessionId: args.sessionId,
    ownerId: appIdentity.userId,
    tokenHash,
    expectedGeneration: session.generation,
    storageId: session.storageId,
    filename: args.filename,
    alt: args.alt,
    caption: args.caption,
    scope: args.scope,
    entryId: args.entryId,
    collection: args.collection,
    ...verifiedFacts,
    mimeType: mediaType,
  })
}

export async function finalizeClaimedAssetUploadSessionHandler(
  ctx: MutationCtx,
  args: FinalizeClaimedAssetUploadSessionArgs,
) {
  await assertCmsContractWriteToken(ctx, args.contractWriteToken)
  const caller = cmsUserCaller(args.ownerId)
  const authorized = requireCms(await resolveCmsAppIdentity(ctx, caller), canManageAssets)
  if (authorized.kind !== 'member') throw new Error('Asset upload requires a CMS member.')
  const session = await ctx.db
    .query('assetUploadSessions')
    .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
    .unique()
  assertAssetUploadSessionIdentity(session, args)
  if (session.state === 'finalized') {
    const asset = session.assetId ? await ctx.db.get(session.assetId) : null
    if (!asset) {
      throwCmsError(
        'ASSET_UPLOAD_FINALIZED_ASSET_MISSING',
        'Finalized upload session points at a missing asset.',
      )
    }
    return String(asset._id)
  }
  assertAssetUploadSession(session, {
    sessionId: args.sessionId,
    ownerId: args.ownerId,
    tokenHash: args.tokenHash,
    now: Date.now(),
    state: 'uploaded',
  })
  if (session.generation !== args.expectedGeneration || session.storageId !== args.storageId) {
    throwCmsError('ASSET_UPLOAD_SESSION_STALE', 'Asset upload session changed during validation.')
  }
  if (
    await isStorageClaimedByAnotherOwner(ctx, args.storageId, {
      uploadSessionId: session._id,
    })
  ) {
    throwCmsError('ASSET_UPLOAD_STORAGE_ALREADY_CLAIMED', 'Uploaded storage is already claimed.')
  }
  const assetIdValue = await insertVerifiedAssetRecord(ctx, {
    storageId: args.storageId,
    filename: args.filename,
    mimeType: args.mimeType,
    bytes: args.bytes,
    sha256: args.sha256,
    width: args.width,
    height: args.height,
    frames: args.frames,
    alt: args.alt,
    caption: args.caption,
    scope: args.scope,
    entryId: args.entryId,
    collection: args.collection,
    createdBy: authorized.userId,
    storageOwner: { uploadSessionId: session._id },
  })
  const assetId = ctx.db.normalizeId('assets', assetIdValue)
  if (!assetId) throw new Error('Inserted asset id was invalid.')
  await ctx.db.patch(session._id, {
    state: 'finalized',
    generation: session.generation + 1,
    storageId: undefined,
    assetId,
    finalizedAt: Date.now(),
  })
  return assetIdValue
}

export async function expireAssetUploadSessionHandler(
  ctx: MutationCtx,
  args: { uploadSessionId: Id<'assetUploadSessions'> },
) {
  const session = await ctx.db.get(args.uploadSessionId)
  if (!session) return null
  const now = Date.now()
  const cleanupAt = session.expiresAt + ASSET_UPLOAD_ABANDONED_GRACE_MS
  if (now < cleanupAt) {
    await ctx.scheduler.runAt(cleanupAt, expireAssetUploadSessionRef, args)
    return null
  }
  if (session.state === 'finalized' || !session.storageId) {
    await ctx.db.delete(session._id)
    return null
  }
  if (session.state === 'cleanup-queued') return null
  const taskId = await ctx.db.insert('assetCleanupTasks', {
    storageId: session.storageId,
    uploadSessionId: session._id,
    status: 'cleanup-required',
    generation: 1,
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.patch(session._id, {
    state: 'cleanup-queued',
    generation: session.generation + 1,
  })
  await ctx.scheduler.runAfter(0, cleanupAssetStorageRef, {
    taskId,
    storageId: session.storageId,
    generation: 1,
    attempt: 1,
  })
  return null
}
