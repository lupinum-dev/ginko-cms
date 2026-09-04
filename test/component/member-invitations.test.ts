/// <reference types="vite/client" />

import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { getCmsErrorData } from '#ginko-cms-public/utils/cmsErrors'

import { createCtx, seedMember, seedOwner } from '../helpers'

const api = anyApi
const SAFE_INVALID_MESSAGE =
  'This invitation cannot be accepted. Ask the CMS owner for a new invitation.'

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function tokenMaterial(label: string) {
  const rawToken = `${label}-${'x'.repeat(64)}`
  const tokenProof = await sha256Hex(rawToken)
  return { rawToken, tokenProof, tokenHash: await sha256Hex(tokenProof) }
}

function trustedOwner() {
  return { _trustedCaller: cmsUserCaller('owner-1') }
}

function isInvalidInvitation(error: unknown) {
  const data = getCmsErrorData(error)
  return data?.code === 'MEMBER_INVITATION_INVALID' && data.message === SAFE_INVALID_MESSAGE
}

async function prepareDeliveredInvitation(
  ctx: ReturnType<typeof createCtx>,
  input: {
    label: string
    email: string
    role?: 'owner' | 'publisher' | 'editor' | 'viewer'
    expiresInHours?: number
  },
) {
  const owner = ctx.asCmsUser('owner-1')
  const token = await tokenMaterial(input.label)
  const invitation = await owner.action(api.members.prepareMemberInvitationDelivery, {
    email: input.email,
    role: input.role ?? 'editor',
    expiresInHours: input.expiresInHours ?? 168,
    tokenHash: token.tokenHash,
    ...trustedOwner(),
  })
  const delivered = await owner.action(api.members.recordMemberInvitationDelivery, {
    invitationId: invitation.invitationId,
    generation: invitation.generation,
    delivered: true,
    ...trustedOwner(),
  })
  return { invitation: delivered, token }
}

describe('[ADM-02] bounded member invitations', () => {
  it.each(['prepared', 'failed'] as const)(
    '[ADM-02] accepts valid proof despite a %s delivery observation without bypassing verification',
    async (deliveryState) => {
      const ctx = createCtx()
      await seedOwner(ctx)
      const owner = ctx.asCmsUser('owner-1')
      const token = await tokenMaterial(`delivery-${deliveryState}`)
      const invitation = await owner.action(api.members.prepareMemberInvitationDelivery, {
        email: 'invited@example.com',
        role: 'viewer',
        expiresInHours: 24,
        tokenHash: token.tokenHash,
        ...trustedOwner(),
      })
      if (deliveryState === 'failed') {
        await owner.action(api.members.recordMemberInvitationDelivery, {
          invitationId: invitation.invitationId,
          generation: invitation.generation,
          delivered: false,
          ...trustedOwner(),
        })
      }
      expect(await ctx.readAll('members')).toHaveLength(1)
      await expect(
        ctx
          .asCmsUser('invited-user', {
            email: 'invited@example.com',
            emailVerified: false,
          })
          .mutation(api.members.acceptMemberInvitation, { tokenProof: token.tokenProof }),
      ).rejects.toSatisfy(isInvalidInvitation)
      await expect(
        ctx
          .asCmsUser('wrong-user', {
            email: 'other@example.com',
            emailVerified: true,
          })
          .mutation(api.members.acceptMemberInvitation, { tokenProof: token.tokenProof }),
      ).rejects.toSatisfy(isInvalidInvitation)
      const invited = ctx.asCmsUser('invited-user', {
        email: 'invited@example.com',
        emailVerified: true,
      })
      await expect(
        invited.mutation(api.members.acceptMemberInvitation, { tokenProof: token.tokenProof }),
      ).resolves.toMatchObject({ userId: 'invited-user', role: 'viewer' })
      expect(await ctx.readAll('memberInvitations')).toEqual([])
      await expect(
        invited.mutation(api.members.acceptMemberInvitation, { tokenProof: token.tokenProof }),
      ).rejects.toSatisfy(isInvalidInvitation)
      expect(await ctx.readAll('members')).toHaveLength(2)
    },
  )

  it('[ADM-02] activates the reviewed role from a verified Better Auth identity and consumes the token', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const prepared = await prepareDeliveredInvitation(ctx, {
      label: 'happy',
      email: 'Invited@Example.com',
      role: 'publisher',
    })

    expect(prepared.invitation).toMatchObject({
      email: 'invited@example.com',
      role: 'publisher',
      status: 'pending',
      deliveryState: 'delivered',
    })
    const storedBeforeAcceptance = await ctx.readAll('memberInvitations')
    expect(storedBeforeAcceptance).toHaveLength(1)
    expect(storedBeforeAcceptance[0]).toMatchObject({ tokenHash: prepared.token.tokenHash })
    expect(JSON.stringify(storedBeforeAcceptance)).not.toContain(prepared.token.rawToken)
    expect(JSON.stringify(storedBeforeAcceptance)).not.toContain(prepared.token.tokenProof)

    const invited = ctx.asCmsUser('better-auth-user-2', {
      name: 'Invited Publisher',
      email: 'INVITED@example.com',
      emailVerified: true,
    })
    const member = await invited.mutation(api.members.acceptMemberInvitation, {
      tokenProof: prepared.token.tokenProof,
    })

    expect(member).toMatchObject({
      userId: 'better-auth-user-2',
      displayName: 'Invited Publisher',
      email: 'invited@example.com',
      role: 'publisher',
    })
    await expect(invited.query(api.members.getAccessContext, {})).resolves.toMatchObject({
      userId: 'better-auth-user-2',
      role: 'publisher',
      member: { role: 'publisher' },
    })
    expect(await ctx.readAll('memberInvitations')).toEqual([])
    await expect(
      invited.mutation(api.members.acceptMemberInvitation, {
        tokenProof: prepared.token.tokenProof,
      }),
    ).rejects.toSatisfy(isInvalidInvitation)

    const activity = await ctx.readAll('activity')
    expect(activity.map((row) => row.kind)).toEqual(
      expect.arrayContaining([
        'member.invitation.created',
        'member.invitation.delivered',
        'member.invitation.accepted',
        'member.added',
      ]),
    )
    expect(JSON.stringify(activity)).not.toContain(prepared.token.rawToken)
    expect(JSON.stringify(activity)).not.toContain(prepared.token.tokenProof)
  })

  it('[ADM-02] rotates on resend, fences delivery generations, and rejects old or wrong-email proof safely', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const original = await prepareDeliveredInvitation(ctx, {
      label: 'original',
      email: 'resend@example.com',
    })
    const replacement = await tokenMaterial('replacement')
    const owner = ctx.asCmsUser('owner-1')

    const resent = await owner.action(api.members.prepareMemberInvitationResendDelivery, {
      invitationId: original.invitation.invitationId,
      expiresInHours: 168,
      tokenHash: replacement.tokenHash,
      ...trustedOwner(),
    })
    expect(resent).toMatchObject({ generation: 2, deliveryState: 'prepared' })

    const matchingIdentity = ctx.asCmsUser('new-user', {
      email: 'resend@example.com',
      emailVerified: true,
    })
    await expect(
      matchingIdentity.mutation(api.members.acceptMemberInvitation, {
        tokenProof: original.token.tokenProof,
      }),
    ).rejects.toSatisfy(isInvalidInvitation)
    await expect(
      owner.action(api.members.recordMemberInvitationDelivery, {
        invitationId: resent.invitationId,
        generation: 1,
        delivered: true,
        ...trustedOwner(),
      }),
    ).rejects.toThrow('superseded by a newer generation')

    await owner.action(api.members.recordMemberInvitationDelivery, {
      invitationId: resent.invitationId,
      generation: resent.generation,
      delivered: true,
      ...trustedOwner(),
    })
    const wrongIdentity = ctx.asCmsUser('wrong-user', {
      email: 'someone-else@example.com',
      emailVerified: true,
    })
    await expect(
      wrongIdentity.mutation(api.members.acceptMemberInvitation, {
        tokenProof: replacement.tokenProof,
      }),
    ).rejects.toSatisfy(isInvalidInvitation)
    await expect(
      matchingIdentity.mutation(api.members.acceptMemberInvitation, {
        tokenProof: replacement.tokenProof,
      }),
    ).resolves.toMatchObject({ role: 'editor' })
  })

  it('[ADM-02] uses the same safe denial for revoked, expired, unverified, and duplicate-user attempts', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const owner = ctx.asCmsUser('owner-1')

    const revoked = await prepareDeliveredInvitation(ctx, {
      label: 'revoked',
      email: 'revoked@example.com',
    })
    await owner.mutation(api.members.revokeMemberInvitation, {
      invitationId: revoked.invitation.invitationId,
    })
    await expect(
      ctx
        .asCmsUser('revoked-user', {
          email: 'revoked@example.com',
          emailVerified: true,
        })
        .mutation(api.members.acceptMemberInvitation, { tokenProof: revoked.token.tokenProof }),
    ).rejects.toSatisfy(isInvalidInvitation)

    const expired = await prepareDeliveredInvitation(ctx, {
      label: 'expired',
      email: 'expired@example.com',
      expiresInHours: 1,
    })
    await ctx.raw.run(async (inner) => {
      const row = await inner.db
        .query('memberInvitations')
        .withIndex('by_invitation_id', (query) =>
          query.eq('invitationId', expired.invitation.invitationId),
        )
        .unique()
      if (!row) throw new Error('Expected invitation fixture.')
      await inner.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })
    await expect(
      ctx
        .asCmsUser('expired-user', {
          email: 'expired@example.com',
          emailVerified: true,
        })
        .mutation(api.members.acceptMemberInvitation, { tokenProof: expired.token.tokenProof }),
    ).rejects.toSatisfy(isInvalidInvitation)

    const unverified = await prepareDeliveredInvitation(ctx, {
      label: 'unverified',
      email: 'unverified@example.com',
    })
    await expect(
      ctx
        .asCmsUser('unverified-user', {
          email: 'unverified@example.com',
          emailVerified: false,
        })
        .mutation(api.members.acceptMemberInvitation, { tokenProof: unverified.token.tokenProof }),
    ).rejects.toSatisfy(isInvalidInvitation)

    await seedMember(ctx, {
      userId: 'existing-user',
      role: 'viewer',
      email: 'existing-member@example.com',
    })
    const duplicateUser = await prepareDeliveredInvitation(ctx, {
      label: 'duplicate-user',
      email: 'new-address@example.com',
    })
    await expect(
      ctx
        .asCmsUser('existing-user', {
          email: 'new-address@example.com',
          emailVerified: true,
        })
        .mutation(api.members.acceptMemberInvitation, {
          tokenProof: duplicateUser.token.tokenProof,
        }),
    ).rejects.toSatisfy(isInvalidInvitation)
  })

  it('[ADM-02] allows only owners to manage invitations and rejects duplicate member or pending emails', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    await seedMember(ctx, {
      userId: 'viewer-1',
      role: 'viewer',
      email: 'viewer@example.com',
    })
    const owner = ctx.asCmsUser('owner-1')
    const viewer = ctx.asCmsUser('viewer-1')
    const token = await tokenMaterial('viewer-denied')

    await expect(viewer.query(api.members.listMemberInvitations, {})).rejects.toThrow('Forbidden')
    await expect(
      viewer.action(api.members.prepareMemberInvitationDelivery, {
        email: 'blocked@example.com',
        role: 'editor',
        expiresInHours: 168,
        tokenHash: token.tokenHash,
        _trustedCaller: cmsUserCaller('viewer-1'),
      }),
    ).rejects.toThrow('Forbidden')

    await expect(
      owner.action(api.members.prepareMemberInvitationDelivery, {
        email: 'VIEWER@example.com',
        role: 'editor',
        expiresInHours: 168,
        tokenHash: token.tokenHash,
        ...trustedOwner(),
      }),
    ).rejects.toThrow('already belongs to a CMS member')

    const pending = await prepareDeliveredInvitation(ctx, {
      label: 'pending-duplicate',
      email: 'pending@example.com',
    })
    const secondToken = await tokenMaterial('pending-duplicate-2')
    await expect(
      owner.action(api.members.prepareMemberInvitationDelivery, {
        email: 'PENDING@example.com',
        role: 'viewer',
        expiresInHours: 24,
        tokenHash: secondToken.tokenHash,
        ...trustedOwner(),
      }),
    ).rejects.toThrow('pending invitation already exists')
    await expect(
      viewer.mutation(api.members.revokeMemberInvitation, {
        invitationId: pending.invitation.invitationId,
      }),
    ).rejects.toThrow('Forbidden')
  })

  it('[ADM-02] enforces the exact pending-invitation bound before creating more work', async () => {
    const ctx = createCtx()
    await seedOwner(ctx)
    const now = Date.now()
    await ctx.raw.run(async (inner) => {
      for (let index = 0; index < 500; index += 1) {
        await inner.db.insert('memberInvitations', {
          invitationId: `bounded-${index}`,
          email: `bounded-${index}@example.com`,
          role: 'viewer',
          tokenHash: index.toString(16).padStart(64, '0'),
          generation: 1,
          deliveryState: 'delivered',
          expiresAt: now + 86_400_000,
          createdBy: 'owner-1',
          createdAt: now + index,
          updatedBy: 'owner-1',
          updatedAt: now + index,
          deliveredAt: now + index,
        })
      }
    })
    const owner = ctx.asCmsUser('owner-1')
    await expect(owner.query(api.members.listMemberInvitations, {})).resolves.toHaveLength(500)
    const extraToken = await tokenMaterial('limit-plus-one')
    await expect(
      owner.action(api.members.prepareMemberInvitationDelivery, {
        email: 'limit-plus-one@example.com',
        role: 'viewer',
        expiresInHours: 24,
        tokenHash: extraToken.tokenHash,
        ...trustedOwner(),
      }),
    ).rejects.toThrow('Pending invitations are capped at 500')
  })
})
