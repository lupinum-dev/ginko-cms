import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { ActionCtx } from '../_generated/server.js'
import {
  type AssetRecoveryPurgeVerification,
  assertCurrentAssetMatchesRecoveryVerification,
  verifyAssetRecoveryForPurge,
} from '../assetRecovery.js'
import type { CmsMemberAppIdentity } from '../auth/appIdentity.js'
import { canManageAssetRecovery } from '../auth/checks.js'
import { requireCms, requireCmsContractWriteToken, resolveCmsAppIdentity } from '../functions.js'
import {
  assertCmsContractWriteToken,
  type CmsContractWriteToken,
} from '../lib/installedContract.js'
import type { MutationCtx } from '../lib/types.js'
import {
  executeDestructiveOperation,
  hashValue,
  type OperationExecuteResult,
  operationIssueFromCmsError,
} from '../operationHelpers.js'
import {
  assertAndConsumePurgeVerificationFence,
  assertArtifactMatchesPurgeVerification,
} from './purge.js'
import { purgeAssetOperation } from './purgeOperation.js'

type PurgePreflightIssue = Exclude<OperationExecuteResult<null>, { status: 'applied' }>
type ProtectedActionCtx = ActionCtx & {
  appIdentity: () => Promise<CmsMemberAppIdentity>
  cmsContractWriteToken: () => CmsContractWriteToken | null
}

const ASSET_PURGE_VERIFICATION_TTL_MS = 30_000

export const purgeVerificationValidator = v.object({
  artifactId: v.string(),
  assetId: v.string(),
  generation: v.number(),
  checksum: v.string(),
  storageRef: v.id('_storage'),
  assetFactsHash: v.string(),
  assetUpdatedAt: v.number(),
})

export const purgePreflightIssueValidator = v.object({
  status: v.union(v.literal('blocked'), v.literal('stale')),
  code: v.string(),
  message: v.string(),
  details: v.any(),
})

const issueAssetPurgeVerificationFenceRef = makeFunctionReference<
  'mutation',
  {
    contractWriteToken: CmsContractWriteToken
    userId: string
    verification: AssetRecoveryPurgeVerification
    fenceTokenHash: string
  },
  { generation: number; expiresAt: number }
>('assets:issueAssetPurgeVerificationFence')
const executeVerifiedAssetPurgeRef = makeFunctionReference<
  'mutation',
  {
    contractWriteToken: CmsContractWriteToken
    assetId: string
    recoveryArtifactId: string
    confirmationToken?: string
    fenceToken?: string
    userId: string
    verification?: AssetRecoveryPurgeVerification
    preflightIssue?: PurgePreflightIssue
  },
  OperationExecuteResult<null>
>('assets:executeVerifiedAssetPurge')

export async function issueAssetPurgeVerificationFenceHandler(
  ctx: MutationCtx,
  args: {
    contractWriteToken: CmsContractWriteToken
    userId: string
    verification: AssetRecoveryPurgeVerification
    fenceTokenHash: string
  },
) {
  await assertCmsContractWriteToken(ctx, args.contractWriteToken)
  const caller = cmsUserCaller(args.userId)
  const authorized = requireCms(await resolveCmsAppIdentity(ctx, caller), canManageAssetRecovery)
  if (authorized.kind !== 'member') throw new Error('Asset purge requires a CMS member.')
  const artifact = await ctx.db
    .query('assetRecoveryArtifacts')
    .withIndex('by_artifact', (query) => query.eq('artifactId', args.verification.artifactId))
    .unique()
  assertArtifactMatchesPurgeVerification(artifact, args.verification)
  await assertCurrentAssetMatchesRecoveryVerification(ctx, args.verification)

  const now = Date.now()
  const generation = artifact.generation + 1
  const expiresAt = now + ASSET_PURGE_VERIFICATION_TTL_MS
  await ctx.db.patch(artifact._id, {
    generation,
    purgeFenceTokenHash: args.fenceTokenHash,
    purgeFenceIssuedTo: args.userId,
    purgeFenceExpiresAt: expiresAt,
  })
  return { generation, expiresAt }
}

export async function executeVerifiedAssetPurgeHandler(
  ctx: MutationCtx,
  args: {
    contractWriteToken: CmsContractWriteToken
    assetId: string
    recoveryArtifactId: string
    confirmationToken?: string
    fenceToken?: string
    userId: string
    verification?: AssetRecoveryPurgeVerification
    preflightIssue?: PurgePreflightIssue
  },
) {
  await assertCmsContractWriteToken(ctx, args.contractWriteToken)
  const caller = cmsUserCaller(args.userId)
  const authorized = requireCms(await resolveCmsAppIdentity(ctx, caller), canManageAssetRecovery)
  if (authorized.kind !== 'member') throw new Error('Asset purge requires a CMS member.')
  const operationCtx = Object.assign(ctx, {
    cmsCaller: async () => caller,
    appIdentity: async () => authorized,
  })
  return await executeDestructiveOperation(
    operationCtx,
    purgeAssetOperation,
    { assetId: args.assetId, recoveryArtifactId: args.recoveryArtifactId },
    args.confirmationToken,
    {
      preflightIssue: args.preflightIssue,
      beforeHandler: async () => {
        if (!args.verification || !args.fenceToken) {
          throw new Error('Verified asset purge is missing its recovery fence.')
        }
        try {
          await assertAndConsumePurgeVerificationFence(
            ctx,
            args.verification,
            args.fenceToken,
            args.userId,
          )
          return undefined
        } catch (error) {
          return operationIssueFromCmsError(error, 'stale')
        }
      },
    },
  )
}

export async function purgeAssetHandler(
  ctx: ProtectedActionCtx,
  args: { assetId: string; recoveryArtifactId: string; _confirmationToken?: string },
) {
  const appIdentity = await ctx.appIdentity()
  const contractWriteToken = requireCmsContractWriteToken(ctx)
  const execute = async (input: {
    fenceToken?: string
    verification?: AssetRecoveryPurgeVerification
    preflightIssue?: PurgePreflightIssue
  }) =>
    await ctx.runMutation(executeVerifiedAssetPurgeRef, {
      contractWriteToken,
      assetId: args.assetId,
      recoveryArtifactId: args.recoveryArtifactId,
      confirmationToken: args._confirmationToken,
      userId: appIdentity.userId,
      ...input,
    })

  if (!args._confirmationToken) return await execute({})

  try {
    const verification = await verifyAssetRecoveryForPurge(
      ctx,
      args.recoveryArtifactId,
      args.assetId,
    )
    const fenceToken = globalThis.crypto.randomUUID()
    const issued = await ctx.runMutation(issueAssetPurgeVerificationFenceRef, {
      contractWriteToken,
      userId: appIdentity.userId,
      verification,
      fenceTokenHash: await hashValue(fenceToken),
    })
    return await execute({
      fenceToken,
      verification: { ...verification, generation: issued.generation },
    })
  } catch (error) {
    return await execute({ preflightIssue: operationIssueFromCmsError(error, 'stale') })
  }
}
