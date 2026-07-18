import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import { logActivity } from '../lib/activity.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'

export const MEMBER_INVITATION_MAX_PENDING = 500
export const MEMBER_INVITATION_MIN_HOURS = 1
export const MEMBER_INVITATION_MAX_HOURS = 30 * 24

const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/u

type InvitationRole = Extract<CmsRole, 'owner' | 'publisher' | 'editor' | 'viewer'>

function invalidInvitation(): never {
  return throwCmsError(
    'MEMBER_INVITATION_INVALID',
    'This invitation cannot be accepted. Ask the CMS owner for a new invitation.',
  )
}

export function normalizeMemberEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? ''
  if (
    email.length < 3 ||
    email.length > 320 ||
    email.startsWith('@') ||
    email.endsWith('@') ||
    email.split('@').length !== 2 ||
    /\s/u.test(email)
  ) {
    return null
  }
  return email
}

function invitationExpiry(now: number, expiresInHours: number): number {
  if (
    !Number.isInteger(expiresInHours) ||
    expiresInHours < MEMBER_INVITATION_MIN_HOURS ||
    expiresInHours > MEMBER_INVITATION_MAX_HOURS
  ) {
    return throwCmsError(
      'MEMBER_INVITATION_EXPIRY_INVALID',
      'Invitation expiry must be between 1 hour and 30 days.',
      {
        minHours: MEMBER_INVITATION_MIN_HOURS,
        maxHours: MEMBER_INVITATION_MAX_HOURS,
      },
    )
  }
  return now + expiresInHours * 60 * 60 * 1_000
}

function assertTokenHash(value: string) {
  if (!TOKEN_HASH_PATTERN.test(value)) {
    throwCmsError('MEMBER_INVITATION_TOKEN_INVALID', 'Invitation token material is invalid.')
  }
}

async function assertCurrentOwner(ctx: QueryOrMutationCtx, userId: string) {
  const member = await ctx.db
    .query('members')
    .withIndex('by_userId', (query) => query.eq('userId', userId))
    .unique()
  if (!member || member.role !== 'owner') {
    throwCmsError('MEMBER_INVITATION_FORBIDDEN', 'Only a current CMS owner can manage invitations.')
  }
  return member
}

export function serializeMemberInvitation(invitation: Doc<'memberInvitations'>, now = Date.now()) {
  return {
    invitationId: invitation.invitationId,
    email: invitation.email,
    role: invitation.role,
    status:
      invitation.deliveryState === 'failed'
        ? ('delivery_failed' as const)
        : invitation.expiresAt <= now
          ? ('expired' as const)
          : ('pending' as const),
    deliveryState: invitation.deliveryState,
    generation: invitation.generation,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    deliveredAt: invitation.deliveredAt,
  }
}

export async function listPendingMemberInvitations(ctx: QueryOrMutationCtx) {
  const rows = await ctx.db.query('memberInvitations').take(MEMBER_INVITATION_MAX_PENDING + 1)
  if (rows.length > MEMBER_INVITATION_MAX_PENDING) {
    throwCmsError(
      'MEMBER_INVITATION_LIMIT_EXCEEDED',
      `Pending invitations are capped at ${MEMBER_INVITATION_MAX_PENDING}. Revoke stale invitations before creating more.`,
      { limit: MEMBER_INVITATION_MAX_PENDING },
    )
  }
  const now = Date.now()
  return rows
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((row) => serializeMemberInvitation(row, now))
}

export async function prepareMemberInvitation(
  ctx: MutationCtx,
  args: {
    actorUserId: string
    email: string
    role: InvitationRole
    expiresInHours: number
    tokenHash: string
  },
) {
  await assertCurrentOwner(ctx, args.actorUserId)
  assertTokenHash(args.tokenHash)
  const email = normalizeMemberEmail(args.email)
  if (!email) {
    throwCmsError('MEMBER_INVITATION_EMAIL_INVALID', 'Enter a valid email address.')
  }
  const [existingMember, existingInvitation, tokenCollision, pendingRows] = await Promise.all([
    ctx.db
      .query('members')
      .withIndex('by_email', (query) => query.eq('email', email))
      .unique(),
    ctx.db
      .query('memberInvitations')
      .withIndex('by_email', (query) => query.eq('email', email))
      .unique(),
    ctx.db
      .query('memberInvitations')
      .withIndex('by_token_hash', (query) => query.eq('tokenHash', args.tokenHash))
      .unique(),
    ctx.db.query('memberInvitations').take(MEMBER_INVITATION_MAX_PENDING),
  ])
  if (existingMember) {
    throwCmsError('MEMBER_INVITATION_MEMBER_EXISTS', 'This email already belongs to a CMS member.')
  }
  if (existingInvitation) {
    throwCmsError(
      'MEMBER_INVITATION_EXISTS',
      'A pending invitation already exists for this email. Resend or revoke it instead.',
      { invitationId: existingInvitation.invitationId },
    )
  }
  if (tokenCollision) {
    throwCmsError('MEMBER_INVITATION_TOKEN_COLLISION', 'Generate a new invitation token.')
  }
  if (pendingRows.length >= MEMBER_INVITATION_MAX_PENDING) {
    throwCmsError(
      'MEMBER_INVITATION_LIMIT_EXCEEDED',
      `Pending invitations are capped at ${MEMBER_INVITATION_MAX_PENDING}. Revoke stale invitations before creating more.`,
      { limit: MEMBER_INVITATION_MAX_PENDING },
    )
  }

  const now = Date.now()
  const invitationId = `member_invitation_${globalThis.crypto.randomUUID()}`
  const id = await ctx.db.insert('memberInvitations', {
    invitationId,
    email,
    role: args.role,
    tokenHash: args.tokenHash,
    generation: 1,
    deliveryState: 'prepared',
    expiresAt: invitationExpiry(now, args.expiresInHours),
    createdBy: args.actorUserId,
    createdAt: now,
    updatedBy: args.actorUserId,
    updatedAt: now,
    deliveredAt: null,
  })
  const invitation = await ctx.db.get(id)
  if (!invitation) throw new Error('Member invitation disappeared after creation.')

  await logActivity(ctx, {
    kind: 'member.invitation.created',
    summary: 'Created member invitation',
    appIdentityId: args.actorUserId,
    detail: {
      invitationId,
      email,
      role: args.role,
      expiresAt: invitation.expiresAt,
      generation: invitation.generation,
    },
    createdAt: now,
  })
  return invitation
}

export async function prepareMemberInvitationResend(
  ctx: MutationCtx,
  args: {
    actorUserId: string
    invitationId: string
    expiresInHours: number
    tokenHash: string
  },
) {
  await assertCurrentOwner(ctx, args.actorUserId)
  assertTokenHash(args.tokenHash)
  const invitation = await ctx.db
    .query('memberInvitations')
    .withIndex('by_invitation_id', (query) => query.eq('invitationId', args.invitationId))
    .unique()
  if (!invitation) {
    throwCmsError('MEMBER_INVITATION_NOT_FOUND', 'Pending invitation not found.')
  }
  if (invitation.tokenHash === args.tokenHash) {
    throwCmsError('MEMBER_INVITATION_TOKEN_COLLISION', 'Generate a new invitation token.')
  }
  const tokenCollision = await ctx.db
    .query('memberInvitations')
    .withIndex('by_token_hash', (query) => query.eq('tokenHash', args.tokenHash))
    .unique()
  if (tokenCollision) {
    throwCmsError('MEMBER_INVITATION_TOKEN_COLLISION', 'Generate a new invitation token.')
  }
  const now = Date.now()
  await ctx.db.patch(invitation._id, {
    tokenHash: args.tokenHash,
    generation: invitation.generation + 1,
    deliveryState: 'prepared',
    expiresAt: invitationExpiry(now, args.expiresInHours),
    updatedBy: args.actorUserId,
    updatedAt: now,
    deliveredAt: null,
  })
  const updated = await ctx.db.get(invitation._id)
  if (!updated) throw new Error('Member invitation disappeared during resend.')
  await logActivity(ctx, {
    kind: 'member.invitation.resent',
    summary: 'Rotated and resent member invitation',
    appIdentityId: args.actorUserId,
    detail: {
      invitationId: invitation.invitationId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: updated.expiresAt,
      generation: updated.generation,
    },
    createdAt: now,
  })
  return updated
}

export async function recordMemberInvitationDelivery(
  ctx: MutationCtx,
  args: {
    actorUserId: string
    invitationId: string
    generation: number
    delivered: boolean
  },
) {
  await assertCurrentOwner(ctx, args.actorUserId)
  const invitation = await ctx.db
    .query('memberInvitations')
    .withIndex('by_invitation_id', (query) => query.eq('invitationId', args.invitationId))
    .unique()
  if (!invitation || invitation.generation !== args.generation) {
    throwCmsError(
      'MEMBER_INVITATION_DELIVERY_STALE',
      'Invitation delivery was superseded by a newer generation.',
    )
  }
  const targetState = args.delivered ? 'delivered' : 'failed'
  if (invitation.deliveryState !== 'prepared') {
    if (invitation.deliveryState === targetState) return invitation
    throwCmsError(
      'MEMBER_INVITATION_DELIVERY_STALE',
      'Invitation delivery was already recorded for this generation.',
    )
  }
  const now = Date.now()
  await ctx.db.patch(invitation._id, {
    deliveryState: targetState,
    deliveredAt: args.delivered ? now : null,
    updatedBy: args.actorUserId,
    updatedAt: now,
  })
  const updated = await ctx.db.get(invitation._id)
  if (!updated) throw new Error('Member invitation disappeared after delivery.')
  await logActivity(ctx, {
    kind: args.delivered ? 'member.invitation.delivered' : 'member.invitation.deliveryFailed',
    summary: args.delivered ? 'Delivered member invitation' : 'Member invitation delivery failed',
    appIdentityId: args.actorUserId,
    detail: {
      invitationId: invitation.invitationId,
      generation: invitation.generation,
      delivered: args.delivered,
    },
    createdAt: now,
  })
  return updated
}

export async function revokeMemberInvitation(
  ctx: MutationCtx,
  args: { actorUserId: string; invitationId: string },
) {
  await assertCurrentOwner(ctx, args.actorUserId)
  const invitation = await ctx.db
    .query('memberInvitations')
    .withIndex('by_invitation_id', (query) => query.eq('invitationId', args.invitationId))
    .unique()
  if (!invitation) {
    throwCmsError('MEMBER_INVITATION_NOT_FOUND', 'Pending invitation not found.')
  }
  const now = Date.now()
  await ctx.db.delete(invitation._id)
  await logActivity(ctx, {
    kind: 'member.invitation.revoked',
    summary: 'Revoked member invitation',
    appIdentityId: args.actorUserId,
    detail: {
      invitationId: invitation.invitationId,
      email: invitation.email,
      role: invitation.role,
      generation: invitation.generation,
    },
    createdAt: now,
  })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function acceptMemberInvitation(
  ctx: MutationCtx,
  args: {
    userId: string
    name?: string
    email?: string
    emailVerified: boolean
    tokenProof: string
  },
) {
  if (!TOKEN_HASH_PATTERN.test(args.tokenProof)) invalidInvitation()
  const tokenHash = await sha256Hex(args.tokenProof)
  const invitation = await ctx.db
    .query('memberInvitations')
    .withIndex('by_token_hash', (query) => query.eq('tokenHash', tokenHash))
    .unique()
  const email = normalizeMemberEmail(args.email)
  const now = Date.now()
  if (
    !invitation ||
    invitation.deliveryState !== 'delivered' ||
    invitation.expiresAt <= now ||
    !args.emailVerified ||
    !email ||
    email !== invitation.email
  ) {
    invalidInvitation()
  }
  const [existingUser, existingEmail] = await Promise.all([
    ctx.db
      .query('members')
      .withIndex('by_userId', (query) => query.eq('userId', args.userId))
      .unique(),
    ctx.db
      .query('members')
      .withIndex('by_email', (query) => query.eq('email', email))
      .unique(),
  ])
  if (existingUser || existingEmail) invalidInvitation()

  const memberId = await ctx.db.insert('members', {
    userId: args.userId,
    displayName: args.name?.trim() || null,
    email,
    role: invitation.role,
    createdAt: now,
    updatedAt: now,
    updatedBy: args.userId,
  })
  await ctx.db.delete(invitation._id)
  await logActivity(ctx, {
    kind: 'member.invitation.accepted',
    summary: 'Accepted member invitation',
    appIdentityId: args.userId,
    detail: {
      invitationId: invitation.invitationId,
      userId: args.userId,
      email,
      role: invitation.role,
      generation: invitation.generation,
    },
    createdAt: now,
  })
  await logActivity(ctx, {
    kind: 'member.added',
    summary: 'Activated invited CMS member',
    appIdentityId: args.userId,
    detail: {
      userId: args.userId,
      invitationId: invitation.invitationId,
      role: invitation.role,
      invited: true,
    },
    createdAt: now,
  })
  const member = await ctx.db.get(memberId)
  if (!member) throw new Error('Accepted member disappeared after creation.')
  return member
}
