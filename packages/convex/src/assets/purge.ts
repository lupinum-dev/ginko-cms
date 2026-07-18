import type { Doc } from '../_generated/dataModel.js'
import {
  type AssetRecoveryPurgeVerification,
  assertCurrentAssetMatchesRecoveryVerification,
} from '../assetRecovery.js'
import { throwCmsError } from '../errors.js'
import type { MutationCtx } from '../lib/types.js'
import { hashValue, operationIssue } from '../operationHelpers.js'

function readCmsErrorData(error: unknown): { code: string; message: string } | null {
  const data =
    typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: unknown }).data
      : null
  if (
    data &&
    typeof data === 'object' &&
    typeof (data as { code?: unknown }).code === 'string' &&
    typeof (data as { message?: unknown }).message === 'string'
  ) {
    return data as { code: string; message: string }
  }
  return null
}

export function cmsErrorOperationIssue(error: unknown) {
  const data = readCmsErrorData(error)
  if (!data) throw error
  const publicCode =
    data.code === 'ASSET_RECOVERY_STALE_FOR_PURGE'
      ? 'asset-recovery-stale-for-purge'
      : data.code === 'ASSET_RECOVERY_SCOPE_MISMATCH'
        ? 'asset-recovery-artifact-mismatch'
        : data.code.toLowerCase().replaceAll('_', '-')
  return operationIssue({ code: publicCode, message: data.message })
}

export function assertArtifactMatchesPurgeVerification(
  artifact: Doc<'assetRecoveryArtifacts'> | null,
  verification: AssetRecoveryPurgeVerification,
): asserts artifact is Doc<'assetRecoveryArtifacts'> {
  if (
    !artifact ||
    artifact.assetId !== verification.assetId ||
    artifact.generation !== verification.generation ||
    artifact.checksum !== verification.checksum ||
    artifact.storageRef !== verification.storageRef ||
    artifact.assetFactsHash !== verification.assetFactsHash ||
    artifact.assetUpdatedAt !== verification.assetUpdatedAt
  ) {
    throwCmsError(
      'ASSET_RECOVERY_DATA_CHECKSUM_MISMATCH',
      'Asset recovery artifact changed after byte verification.',
      { artifactId: verification.artifactId, assetId: verification.assetId },
    )
  }
}

export async function assertAndConsumePurgeVerificationFence(
  ctx: MutationCtx,
  verification: AssetRecoveryPurgeVerification,
  fenceToken: string,
  userId: string,
) {
  const artifact = await ctx.db
    .query('assetRecoveryArtifacts')
    .withIndex('by_artifact', (query) => query.eq('artifactId', verification.artifactId))
    .unique()
  assertArtifactMatchesPurgeVerification(artifact, verification)
  const now = Date.now()
  if (
    artifact.purgeFenceTokenHash !== (await hashValue(fenceToken)) ||
    artifact.purgeFenceIssuedTo !== userId
  ) {
    throwCmsError('ASSET_RECOVERY_FENCE_INVALID', 'Asset recovery verification was not issued.')
  }
  if (artifact.purgeFenceExpiresAt === undefined || artifact.purgeFenceExpiresAt <= now) {
    throwCmsError('ASSET_RECOVERY_FENCE_EXPIRED', 'Asset recovery verification expired.')
  }
  await assertCurrentAssetMatchesRecoveryVerification(ctx, verification)
  await ctx.db.patch(artifact._id, {
    generation: artifact.generation + 1,
    purgeFenceTokenHash: undefined,
    purgeFenceIssuedTo: undefined,
    purgeFenceExpiresAt: undefined,
  })
}
