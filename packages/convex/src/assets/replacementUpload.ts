import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { verifyPublicImageBytes } from '@lupinum/ginko-content/cms-contract'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel.js'
import type { ActionCtx } from '../_generated/server.js'
import type { CmsMemberAppIdentity } from '../auth/appIdentity.js'
import { canManageAssets } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { requireCms, requireCmsContractWriteToken, resolveCmsAppIdentity } from '../functions.js'
import {
  assertCmsContractWriteToken,
  cmsContractWriteTokenValidator,
  type CmsContractWriteToken,
} from '../lib/installedContract.js'
import { sanitizeFilename, validateAssetUploadPolicy } from '../lib/sanitize.js'
import type { MutationCtx, QueryCtx } from '../lib/types.js'
import { hashValue } from '../operationHelpers.js'
import { assertStorageOutsidePortableExportHold } from '../portability/lease.js'
import { isStorageClaimedByAnotherOwner } from './storageOwnership.js'
import { assertAssetUploadSession, type ReadAssetUploadSessionResult } from './uploadSessions.js'

export type VerifiedMediaType = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
export type VerifiedReplacementFacts = {
  storageId: Id<'_storage'>
  filename: string
  mimeType: VerifiedMediaType
  size: number
  sha256: string
  width: number
  height: number
  frames: number
}

export type ProtectedActionCtx = ActionCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
  cmsContractWriteToken: () => CmsContractWriteToken | null
}

type StageVerifiedAssetReplacementArgs = {
  contractWriteToken: CmsContractWriteToken
  assetId: string
  sessionId: string
  ownerId: string
  tokenHash: string
  expectedGeneration: number
  storageId: Id<'_storage'>
  filename: string
  mimeType: VerifiedMediaType
  size: number
  sha256: string
  width: number
  height: number
  frames: number
  recoveryArtifactId: string
}

const verifiedMediaTypeValidator = v.union(
  v.literal('image/gif'),
  v.literal('image/jpeg'),
  v.literal('image/png'),
  v.literal('image/webp'),
)

export const stageVerifiedAssetReplacementArgs = {
  contractWriteToken: cmsContractWriteTokenValidator,
  assetId: v.string(),
  sessionId: v.string(),
  ownerId: v.string(),
  tokenHash: v.string(),
  expectedGeneration: v.number(),
  storageId: v.id('_storage'),
  filename: v.string(),
  mimeType: verifiedMediaTypeValidator,
  size: v.number(),
  sha256: v.string(),
  width: v.number(),
  height: v.number(),
  frames: v.number(),
  recoveryArtifactId: v.string(),
}

export const stagedReplacementValidator = v.object({
  assetId: v.string(),
  sessionId: v.string(),
  generation: v.number(),
  recoveryArtifactId: v.string(),
  filename: v.string(),
  mimeType: verifiedMediaTypeValidator,
  size: v.number(),
  sha256: v.string(),
  width: v.number(),
  height: v.number(),
  frames: v.number(),
  expiresAt: v.number(),
})

export const verifiedReplacementSessionValidator = v.object({
  assetId: v.string(),
  sessionId: v.string(),
  generation: v.number(),
  storageId: v.id('_storage'),
  recoveryArtifactId: v.string(),
  filename: v.string(),
  mimeType: verifiedMediaTypeValidator,
  size: v.number(),
  sha256: v.string(),
  width: v.number(),
  height: v.number(),
  frames: v.number(),
  expiresAt: v.number(),
})

const readAssetUploadSessionRef = makeFunctionReference<
  'query',
  { sessionId: string; ownerId: string; tokenHash: string },
  ReadAssetUploadSessionResult
>('assets:readAssetUploadSession')
const stageVerifiedAssetReplacementRef = makeFunctionReference<
  'mutation',
  StageVerifiedAssetReplacementArgs,
  typeof stagedReplacementValidator.type
>('assets:stageVerifiedAssetReplacement')
export const readVerifiedAssetReplacementSessionRef = makeFunctionReference<
  'query',
  { assetId: string; sessionId: string; ownerId: string },
  typeof verifiedReplacementSessionValidator.type
>('assets:readVerifiedAssetReplacementSession')

export function requiredReplacementFacts(
  session: Doc<'assetUploadSessions'>,
): VerifiedReplacementFacts & { assetId: Id<'assets'>; recoveryArtifactId: string } {
  if (
    session.state !== 'verified-replacement' ||
    !session.storageId ||
    !session.replacementAssetId ||
    !session.replacementFilename ||
    !session.replacementMimeType ||
    session.replacementSize === undefined ||
    !session.replacementSha256 ||
    session.replacementWidth === undefined ||
    session.replacementHeight === undefined ||
    session.replacementFrames === undefined ||
    !session.replacementRecoveryArtifactId
  ) {
    return throwCmsError(
      'ASSET_REPLACEMENT_SESSION_INVALID',
      'The asset replacement upload is incomplete. Select and verify the file again.',
      { sessionId: session.sessionId },
    )
  }
  return {
    assetId: session.replacementAssetId,
    storageId: session.storageId,
    filename: session.replacementFilename,
    mimeType: session.replacementMimeType,
    size: session.replacementSize,
    sha256: session.replacementSha256,
    width: session.replacementWidth,
    height: session.replacementHeight,
    frames: session.replacementFrames,
    recoveryArtifactId: session.replacementRecoveryArtifactId,
  }
}

export function assertCompatibleReplacement(
  asset: Doc<'assets'>,
  replacement: Pick<
    VerifiedReplacementFacts,
    'mimeType' | 'sha256' | 'width' | 'height' | 'frames'
  >,
) {
  if (asset.mimeType !== replacement.mimeType) {
    throwCmsError(
      'ASSET_REPLACEMENT_TYPE_MISMATCH',
      `Replacement must keep the existing media type (${asset.mimeType}).`,
      { currentMimeType: asset.mimeType, replacementMimeType: replacement.mimeType },
    )
  }
  if (
    asset.width !== replacement.width ||
    asset.height !== replacement.height ||
    asset.frames !== replacement.frames
  ) {
    throwCmsError(
      'ASSET_REPLACEMENT_DIMENSIONS_MISMATCH',
      `Replacement must keep ${asset.width} × ${asset.height} and the existing frame count.`,
      {
        current: { width: asset.width, height: asset.height, frames: asset.frames },
        replacement: {
          width: replacement.width,
          height: replacement.height,
          frames: replacement.frames,
        },
      },
    )
  }
  if (asset.sha256 === replacement.sha256) {
    throwCmsError(
      'ASSET_REPLACEMENT_IDENTICAL',
      'The selected file is byte-identical to the current asset.',
    )
  }
}

export async function verifyReplacementBlob(ctx: ActionCtx, storageId: Id<'_storage'>) {
  const blob = await ctx.storage.get(storageId)
  if (!blob) {
    throwCmsError('ASSET_STORAGE_MISSING', 'Replacement upload bytes were not found.')
  }
  const claimed = validateAssetUploadPolicy({ mimeType: blob.type, size: blob.size })
  const verified = await verifyPublicImageBytes(
    new Uint8Array(await blob.arrayBuffer()),
    claimed.mimeType,
  )
  const { mediaType, bytes, ...rest } = verified
  return { mimeType: mediaType, size: bytes, ...rest }
}

export function assertVerifiedFactsMatch(
  expected: Omit<VerifiedReplacementFacts, 'filename'>,
  actual: Awaited<ReturnType<typeof verifyReplacementBlob>>,
) {
  if (
    expected.mimeType !== actual.mimeType ||
    expected.size !== actual.size ||
    expected.sha256 !== actual.sha256 ||
    expected.width !== actual.width ||
    expected.height !== actual.height ||
    expected.frames !== actual.frames
  ) {
    throwCmsError(
      'ASSET_REPLACEMENT_UPLOAD_CHANGED',
      'Replacement bytes changed after verification. Select and verify the file again.',
    )
  }
}

export async function verifyAssetReplacementUploadHandler(
  ctx: ProtectedActionCtx,
  args: { assetId: string; sessionId: string; token: string; filename: string },
) {
  const appIdentity = await ctx.appIdentity()
  const tokenHash = await hashValue(args.token)
  const session = await ctx.runQuery(readAssetUploadSessionRef, {
    sessionId: args.sessionId,
    ownerId: appIdentity.userId,
    tokenHash,
  })
  if (session.state !== 'uploaded') {
    throwCmsError('ASSET_UPLOAD_SESSION_REPLAYED', 'Asset upload session was already finalized.')
  }
  const verified = await verifyReplacementBlob(ctx, session.storageId)
  return await ctx.runMutation(stageVerifiedAssetReplacementRef, {
    contractWriteToken: requireCmsContractWriteToken(ctx),
    assetId: args.assetId,
    sessionId: args.sessionId,
    ownerId: appIdentity.userId,
    tokenHash,
    expectedGeneration: session.generation,
    storageId: session.storageId,
    filename: args.filename,
    ...verified,
    recoveryArtifactId: `asset_recovery_replacement_${globalThis.crypto.randomUUID()}`,
  })
}

export async function stageVerifiedAssetReplacementHandler(
  ctx: MutationCtx,
  args: StageVerifiedAssetReplacementArgs,
) {
  await assertCmsContractWriteToken(ctx, args.contractWriteToken)
  const caller = cmsUserCaller(args.ownerId)
  const authorized = requireCms(await resolveCmsAppIdentity(ctx, caller), canManageAssets)
  if (authorized.kind !== 'member') throw new Error('Asset replacement requires a CMS member.')
  const session = await ctx.db
    .query('assetUploadSessions')
    .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
    .unique()
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
  const assetId = ctx.db.normalizeId('assets', args.assetId)
  const asset = assetId ? await ctx.db.get(assetId) : null
  if (!asset || asset.deletedAt != null) {
    throwCmsError('ASSET_NOT_FOUND', 'The active asset to replace was not found.', {
      assetId: args.assetId,
    })
  }
  await assertStorageOutsidePortableExportHold(ctx, asset.storageId)
  if (await isStorageClaimedByAnotherOwner(ctx, asset.storageId, { assetId: asset._id })) {
    throwCmsError('ASSET_STORAGE_SHARED', 'The current asset storage has an ownership conflict.')
  }
  if (
    await isStorageClaimedByAnotherOwner(ctx, args.storageId, {
      uploadSessionId: session._id,
    })
  ) {
    throwCmsError('ASSET_UPLOAD_STORAGE_ALREADY_CLAIMED', 'Uploaded storage is already claimed.')
  }
  assertCompatibleReplacement(asset, args)
  const generation = session.generation + 1
  const filename = sanitizeFilename(args.filename)
  await ctx.db.patch(session._id, {
    state: 'verified-replacement',
    generation,
    replacementAssetId: asset._id,
    replacementFilename: filename,
    replacementMimeType: args.mimeType,
    replacementSize: args.size,
    replacementSha256: args.sha256,
    replacementWidth: args.width,
    replacementHeight: args.height,
    replacementFrames: args.frames,
    replacementRecoveryArtifactId: args.recoveryArtifactId,
    replacementVerifiedAt: Date.now(),
  })
  return {
    assetId: args.assetId,
    sessionId: args.sessionId,
    generation,
    recoveryArtifactId: args.recoveryArtifactId,
    filename,
    mimeType: args.mimeType,
    size: args.size,
    sha256: args.sha256,
    width: args.width,
    height: args.height,
    frames: args.frames,
    expiresAt: session.expiresAt,
  }
}

export async function readVerifiedAssetReplacementSessionHandler(
  ctx: QueryCtx,
  args: { assetId: string; sessionId: string; ownerId: string },
) {
  const session = await ctx.db
    .query('assetUploadSessions')
    .withIndex('by_session', (query) => query.eq('sessionId', args.sessionId))
    .unique()
  if (!session) {
    throwCmsError('ASSET_UPLOAD_SESSION_NOT_FOUND', 'Asset replacement session was not found.')
  }
  if (session.ownerId !== args.ownerId) {
    throwCmsError(
      'ASSET_UPLOAD_SESSION_OWNER_MISMATCH',
      'Asset replacement session owner mismatch.',
    )
  }
  if (session.expiresAt <= Date.now()) {
    throwCmsError('ASSET_UPLOAD_SESSION_EXPIRED', 'Asset replacement session expired.')
  }
  const replacement = requiredReplacementFacts(session)
  if (String(replacement.assetId) !== args.assetId) {
    throwCmsError(
      'ASSET_REPLACEMENT_TARGET_MISMATCH',
      'Asset replacement session belongs to a different asset.',
    )
  }
  return {
    assetId: args.assetId,
    sessionId: session.sessionId,
    generation: session.generation,
    storageId: replacement.storageId,
    recoveryArtifactId: replacement.recoveryArtifactId,
    filename: replacement.filename,
    mimeType: replacement.mimeType,
    size: replacement.size,
    sha256: replacement.sha256,
    width: replacement.width,
    height: replacement.height,
    frames: replacement.frames,
    expiresAt: session.expiresAt,
  }
}
