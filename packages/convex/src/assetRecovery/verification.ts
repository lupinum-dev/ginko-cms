import { makeFunctionReference } from 'convex/server'

import type { Doc, Id } from '../_generated/dataModel.js'
import type { ActionCtx } from '../_generated/server.js'
import { throwCmsError } from '../errors.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import {
  type AssetRecoveryArchive,
  type AssetSnapshot,
  assetSnapshot,
  base64ToBytes,
  canonicalJson,
  decodeAssetRecoveryArchive,
  sha256Bytes,
  sha256Text,
} from './archive.js'

const readAssetForRecoveryRef = makeFunctionReference<
  'query',
  { assetId: string },
  { storageId: Id<'_storage'>; snapshot: AssetSnapshot } | null
>('assetRecovery:readAssetForRecovery')
const getAssetRecoveryArtifactRef = makeFunctionReference<
  'query',
  { artifactId: string },
  Doc<'assetRecoveryArtifacts'> | null
>('assetRecovery:getAssetRecoveryArtifact')

export type AssetRecoveryPurgeVerification = {
  artifactId: string
  assetId: string
  generation: number
  checksum: string
  storageRef: Id<'_storage'>
  assetFactsHash: string
  assetUpdatedAt: number
}

export async function readAssetRecoverySource(ctx: ActionCtx, assetId: string) {
  return await ctx.runQuery(readAssetForRecoveryRef, { assetId })
}

export async function loadVerifiedArchive(
  ctx: ActionCtx,
  artifactId: string,
): Promise<{
  artifact: Doc<'assetRecoveryArtifacts'>
  archive: AssetRecoveryArchive
  archiveJson: string
  bytes: Uint8Array
}> {
  const artifact = await ctx.runQuery(getAssetRecoveryArtifactRef, { artifactId })
  if (!artifact) {
    throwCmsError('ASSET_RECOVERY_NOT_FOUND', 'Asset recovery artifact was not found.', {
      artifactId,
    })
  }
  const blob = await ctx.storage.get(artifact.storageRef)
  if (!blob) {
    throwCmsError('ASSET_RECOVERY_STORAGE_MISSING', 'Recovery artifact bytes are missing.', {
      artifactId,
    })
  }
  const archiveJson = await blob.text()
  if ((await sha256Text(archiveJson)) !== artifact.checksum) {
    throwCmsError('ASSET_RECOVERY_CHECKSUM_MISMATCH', 'Recovery artifact checksum is invalid.', {
      artifactId,
    })
  }
  const archive = decodeAssetRecoveryArchive(archiveJson, artifactId)
  const bytes = base64ToBytes(archive.bytesBase64)
  if (
    bytes.byteLength !== archive.manifest.byteSize ||
    (await sha256Bytes(bytes)) !== archive.manifest.bytesSha256 ||
    (await sha256Text(canonicalJson(archive.asset))) !== archive.manifest.assetSha256 ||
    archive.asset.originalAssetId !== artifact.assetId ||
    archive.manifest.byteSize !== artifact.byteSize ||
    archive.manifest.bytesSha256 !== artifact.bytesSha256 ||
    archive.manifest.assetSha256 !== artifact.assetFactsHash ||
    archive.manifest.assetUpdatedAt !== artifact.assetUpdatedAt
  ) {
    throwCmsError(
      'ASSET_RECOVERY_DATA_CHECKSUM_MISMATCH',
      'Recovery artifact payload is corrupt.',
      { artifactId },
    )
  }
  return { artifact, archive, archiveJson, bytes }
}

export async function assertCurrentAssetMatchesRecoveryVerification(
  ctx: QueryOrMutationCtx,
  verification: AssetRecoveryPurgeVerification,
): Promise<Doc<'assets'>> {
  const assetId = ctx.db.normalizeId('assets', verification.assetId)
  const asset = assetId ? await ctx.db.get(assetId) : null
  if (!asset) {
    throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId: verification.assetId })
  }
  const currentFactsHash = await sha256Text(canonicalJson(assetSnapshot(asset)))
  const currentUpdatedAt = asset.updatedAt ?? asset.createdAt
  if (
    currentFactsHash !== verification.assetFactsHash ||
    currentUpdatedAt !== verification.assetUpdatedAt
  ) {
    throwCmsError('ASSET_RECOVERY_STALE_FOR_PURGE', 'Asset recovery artifact is stale.', {
      artifactId: verification.artifactId,
      assetId: verification.assetId,
      artifactAssetUpdatedAt: verification.assetUpdatedAt,
      assetUpdatedAt: currentUpdatedAt,
    })
  }
  return asset
}

export async function verifyAssetRecoveryForPurge(
  ctx: ActionCtx,
  artifactId: string,
  assetId: string,
): Promise<AssetRecoveryPurgeVerification> {
  const { artifact, archive } = await loadVerifiedArchive(ctx, artifactId)
  if (artifact.assetId !== assetId || archive.asset.originalAssetId !== assetId) {
    throwCmsError(
      'ASSET_RECOVERY_SCOPE_MISMATCH',
      'The verified recovery artifact belongs to a different asset.',
      { artifactId, assetId },
    )
  }
  const current = await readAssetRecoverySource(ctx, assetId)
  if (!current) throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId })
  const currentFactsHash = await sha256Text(canonicalJson(current.snapshot))
  const currentUpdatedAt = current.snapshot.updatedAt ?? current.snapshot.createdAt
  if (
    currentFactsHash !== artifact.assetFactsHash ||
    currentUpdatedAt !== artifact.assetUpdatedAt ||
    canonicalJson(current.snapshot) !== canonicalJson(archive.asset)
  ) {
    throwCmsError('ASSET_RECOVERY_STALE_FOR_PURGE', 'Asset recovery artifact is stale.', {
      artifactId,
      assetId,
      artifactAssetUpdatedAt: artifact.assetUpdatedAt,
      assetUpdatedAt: currentUpdatedAt,
    })
  }
  return {
    artifactId,
    assetId,
    generation: artifact.generation,
    checksum: artifact.checksum,
    storageRef: artifact.storageRef,
    assetFactsHash: artifact.assetFactsHash,
    assetUpdatedAt: artifact.assetUpdatedAt,
  }
}

export async function assertAssetRecoveryArtifactCoversPurge(
  ctx: QueryOrMutationCtx,
  artifactId: string,
  assetIdValue: string,
): Promise<void> {
  const artifact = await ctx.db
    .query('assetRecoveryArtifacts')
    .withIndex('by_artifact', (query) => query.eq('artifactId', artifactId))
    .first()
  if (
    !artifact ||
    artifact.assetId !== assetIdValue ||
    artifact.generation < 1 ||
    !/^[a-f0-9]{64}$/.test(artifact.checksum) ||
    !/^[a-f0-9]{64}$/.test(artifact.bytesSha256) ||
    !/^[a-f0-9]{64}$/.test(artifact.assetFactsHash) ||
    artifact.byteSize < 0 ||
    !artifact.storageRef
  ) {
    throwCmsError(
      'ASSET_RECOVERY_SCOPE_MISMATCH',
      'A current verified recovery artifact for this asset is required.',
      { artifactId, assetId: assetIdValue },
    )
  }
  const assetId = ctx.db.normalizeId('assets', assetIdValue)
  const asset = assetId ? await ctx.db.get(assetId) : null
  if (!asset) throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId: assetIdValue })
  const updatedAt = asset.updatedAt ?? asset.createdAt
  const factsHash = await sha256Text(canonicalJson(assetSnapshot(asset)))
  if (artifact.assetUpdatedAt !== updatedAt || artifact.assetFactsHash !== factsHash) {
    throwCmsError('ASSET_RECOVERY_STALE_FOR_PURGE', 'Asset recovery artifact is stale.', {
      artifactId,
      artifactCreatedAt: artifact.createdAt,
      assetUpdatedAt: updatedAt,
    })
  }
}
