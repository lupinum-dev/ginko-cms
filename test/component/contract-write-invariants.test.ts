/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { CONTRACT_WRITE_BYPASS_IDS } from '../../packages/convex/src/functions'
import { api, createCtx, installTestContract, seedOwner } from '../helpers'

function hasCmsError(code: string) {
  return (error: unknown) => getCmsErrorData(error)?.code === code
}

function directOwner(ctx: ReturnType<typeof createCtx>) {
  return ctx.raw.withIdentity({
    subject: 'owner-1',
    sessionId: 'direct-component-test',
    token_use: 'convex-session',
  })
}

describe('transactional CMS contract write invariants', () => {
  it('keeps the control-plane bypass whitelist explicit and reviewable', () => {
    expect([...CONTRACT_WRITE_BYPASS_IDS].sort()).toEqual([
      'agentRuns:completeRun',
      'agentRuns:revokeRun',
      'ginko-cms.remove-member',
      'mcpAuthLimiter:recordFailure',
      'mcpCredentials:admitAccessBySecretHash',
      'mcpCredentials:createCredential',
      'mcpCredentials:revokeSettings',
      'members:acceptMemberInvitation',
      'members:bootstrapCmsOwner',
      'members:prepareMemberInvitationDelivery',
      'members:prepareMemberInvitationResendDelivery',
      'members:previewRemoveMemberOperation',
      'members:recordMemberInvitationDelivery',
      'members:revokeMemberInvitation',
      'members:updateMemberRole',
      'revalidation:testRevalidationTarget',
      'storageMaintenance:runStorageDiagnostic',
    ])
  })

  it('rejects direct component writes without the trusted pair or with either hash mismatched', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const installed = (await ctx.readAll('cmsContract'))[0]!
    const owner = directOwner(ctx)
    const args = {
      collection: 'posts',
      slug: 'guarded-entry',
      localized: { title: 'Guarded entry' },
    }

    await expect(owner.mutation(api.entries.tree.createEntry, args)).rejects.toSatisfy(
      hasCmsError('CMS_CONTRACT_EXPECTATION_REQUIRED'),
    )
    await expect(
      owner.mutation(api.entries.tree.createEntry, {
        ...args,
        _expectedContentHash: '0'.repeat(64),
        _expectedPresentationHash: installed.presentationHash,
      }),
    ).rejects.toSatisfy(hasCmsError('CMS_CONTRACT_HOST_MISMATCH'))
    await expect(
      owner.mutation(api.entries.tree.createEntry, {
        ...args,
        _expectedContentHash: installed.contentHash,
        _expectedPresentationHash: '0'.repeat(64),
      }),
    ).rejects.toSatisfy(hasCmsError('CMS_CONTRACT_HOST_MISMATCH'))
    expect(await ctx.readAll('entries')).toEqual([])

    await expect(
      owner.mutation(api.entries.tree.createEntry, {
        ...args,
        _expectedContentHash: installed.contentHash,
        _expectedPresentationHash: installed.presentationHash,
      }),
    ).resolves.toEqual(expect.any(String))
    expect(await ctx.readAll('entries')).toHaveLength(1)
  })

  it('rechecks the transition lock in the same transaction as a direct component write', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const installed = (await ctx.readAll('cmsContract'))[0]!
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(installed._id as never, {
        transitionState: 'locked',
        transitionRunId: 'test-transition',
      })
    })

    await expect(
      directOwner(ctx).mutation(api.entries.tree.createEntry, {
        collection: 'posts',
        slug: 'blocked-by-lock',
        localized: { title: 'Blocked by lock' },
        _expectedContentHash: installed.contentHash,
        _expectedPresentationHash: installed.presentationHash,
      }),
    ).rejects.toSatisfy(hasCmsError('CMS_CONTRACT_TRANSITION_LOCKED'))
    expect(await ctx.readAll('entries')).toEqual([])
  })

  it('rejects a direct component action before its orchestration can bypass the host pair', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const installed = (await ctx.readAll('cmsContract'))[0]!

    await expect(
      directOwner(ctx).action(api.assetRecovery.createAssetRecoveryArtifact, {
        assetId: 'missing-asset',
        _expectedContentHash: '0'.repeat(64),
        _expectedPresentationHash: installed.presentationHash,
      }),
    ).rejects.toSatisfy(hasCmsError('CMS_CONTRACT_HOST_MISMATCH'))
    expect(await ctx.readAll('assetRecoveryArtifacts')).toEqual([])
  })

  it('rejects an action write when a transition starts after action preflight', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const installed = (await ctx.readAll('cmsContract'))[0]!
    const contractWriteToken = await ctx.raw.query(api.contract.assertExpectedCmsContract, {
      expectedContentHash: installed.contentHash,
      expectedPresentationHash: installed.presentationHash,
    })
    const storageRef = await ctx.raw.run(
      async (inner) => await inner.storage.store(new Blob(['race-proof'])),
    )

    // This is the deterministic interleaving an action can otherwise hit:
    // preflight succeeds, a transition owns the database, then it is cancelled
    // before the action reaches its state-changing internal mutation.
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(installed._id as never, {
        transitionState: 'locked',
        transitionRunId: 'race-transition',
        writeGeneration: installed.writeGeneration + 1,
      })
      await inner.db.patch(installed._id as never, {
        transitionState: 'ready',
        transitionRunId: null,
        writeGeneration: installed.writeGeneration + 2,
      })
    })

    await expect(
      ctx.raw.mutation(api.assets.issueAssetPurgeVerificationFence, {
        contractWriteToken,
        userId: 'owner-1',
        verification: {
          artifactId: 'race-artifact',
          assetId: 'race-asset',
          generation: 1,
          checksum: '0'.repeat(64),
          storageRef,
          assetFactsHash: '0'.repeat(64),
          assetUpdatedAt: 1,
        },
        fenceTokenHash: '0'.repeat(64),
      }),
    ).rejects.toSatisfy(hasCmsError('CMS_CONTRACT_WRITE_FENCE_STALE'))
    expect(await ctx.readAll('assetRecoveryArtifacts')).toEqual([])
  })

  it('keeps credential revocation available under a transition lock without opening content writes', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await installTestContract(ctx, ['en'])
    const installed = (await ctx.readAll('cmsContract'))[0]!
    const now = Date.now()
    await ctx.seed('mcpCredentialSettings', {
      apiKeyId: 'credential-1',
      ownerUserId: 'owner-1',
      label: null,
      scopes: ['content:read'],
      status: 'active',
      expiresAt: null,
      createdBy: 'owner-1',
      createdAt: now,
      updatedBy: 'owner-1',
      updatedAt: now,
      revokedAt: null,
    })
    await ctx.raw.run(async (inner) => {
      await inner.db.patch(installed._id as never, {
        transitionState: 'locked',
        transitionRunId: 'test-transition',
      })
    })

    await expect(
      directOwner(ctx).mutation(api.mcpCredentials.revokeSettings, {
        apiKeyId: 'credential-1',
      }),
    ).resolves.toBeNull()
    expect(await ctx.readAll('mcpCredentialSettings')).toEqual([
      expect.objectContaining({ apiKeyId: 'credential-1', status: 'revoked' }),
    ])
    await expect(
      directOwner(ctx).mutation(api.entries.tree.createEntry, {
        collection: 'posts',
        slug: 'still-blocked',
        localized: { title: 'Still blocked' },
      }),
    ).rejects.toSatisfy(hasCmsError('CMS_CONTRACT_EXPECTATION_REQUIRED'))
  })
})
