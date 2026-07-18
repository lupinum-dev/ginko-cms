import {
  acceptMemberInvitation as acceptMemberInvitationArgs,
  bootstrapCmsOwnerComponent as bootstrapCmsOwnerArgs,
  getMember as getMemberArgs,
  prepareMemberInvitationDelivery as prepareMemberInvitationDeliveryArgs,
  prepareMemberInvitationResend as prepareMemberInvitationResendArgs,
  recordMemberInvitationDelivery as recordMemberInvitationDeliveryArgs,
  removeMember as removeMemberArgs,
  revokeMemberInvitation as revokeMemberInvitationArgs,
  updateMemberRole as updateMemberRoleArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import {
  accessContextValidator,
  memberInvitationValidator,
  memberValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel.js'
import { internalMutation } from './_generated/server.js'
import type { CmsAppIdentity } from './auth/appIdentity.js'
import {
  can,
  cmsPermissionGuards,
  canManageMembers,
  isAuthenticated,
  isBootstrapUser,
} from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerAction, callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { toStringId } from './lib/ids.js'
import type { MutationCtx } from './lib/types.js'
import {
  acceptMemberInvitation as acceptPendingInvitation,
  listPendingMemberInvitations,
  normalizeMemberEmail,
  prepareMemberInvitation,
  prepareMemberInvitationResend,
  recordMemberInvitationDelivery as recordPendingInvitationDelivery,
  revokeMemberInvitation as revokePendingInvitation,
  serializeMemberInvitation,
} from './members/invitations.js'
import {
  blockedPreview,
  defineCmsOperation,
  operationEffect,
  operationIssue,
  buildPreview,
  previewResultValidator,
  definePreview,
} from './operationHelpers.js'

type MemberDoc = Doc<'members'>
type McpCredentialSettingsDoc = Doc<'mcpCredentialSettings'>
const MEMBER_LIST_MAX = 500

async function countOwners(ctx: MutationCtx): Promise<number> {
  return (
    await ctx.db
      .query('members')
      .withIndex('by_role', (q) => q.eq('role', 'owner'))
      .take(MEMBER_LIST_MAX + 1)
  ).length
}

function serializeMember(member: MemberDoc) {
  return {
    _id: toStringId(member._id),
    userId: member.userId,
    displayName: member.displayName ?? null,
    email: member.email ?? null,
    role: member.role,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt ?? null,
    updatedBy: member.updatedBy ?? null,
  }
}

export async function bootstrapCmsOwnerRecord(
  ctx: MutationCtx,
  userId: string,
  profile?: { displayName?: string; email?: string },
) {
  const firstMember = await ctx.db.query('members').first()
  if (firstMember) {
    throwCmsError('CMS_BOOTSTRAP_COMPLETED', 'CMS bootstrap has already been completed')
  }

  const now = Date.now()
  const memberId = await ctx.db.insert('members', {
    userId,
    displayName: profile?.displayName ?? null,
    email: normalizeMemberEmail(profile?.email) ?? null,
    role: 'owner',
    createdAt: now,
    updatedAt: now,
    updatedBy: userId,
  })
  const member = await ctx.db.get(memberId)
  if (!member) {
    throwCmsError('CMS_BOOTSTRAP_FAILED', 'Failed to bootstrap CMS owner')
  }

  await logActivity(ctx, {
    kind: 'member.added',
    summary: `Bootstrapped CMS owner "${userId}"`,
    appIdentityId: userId,
    detail: { userId, role: 'owner', bootstrap: true },
  })

  return serializeMember(member)
}

const accessPermissionGuards = [
  ...cmsPermissionGuards,
  { key: cmsPermissionKeys.bootstrap, guard: isBootstrapUser },
] as const

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized && normalized.length > 0 ? normalized : null
}

const getAccessContextDefinition = {
  id: 'members:getAccessContext',
  args: {},
  returns: accessContextValidator,
  handler: async (ctx: { appIdentity: () => Promise<CmsAppIdentity> }) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) return null
    const effectivePermissions = Object.fromEntries(
      accessPermissionGuards.map(({ key, guard }) => [key, can(appIdentity, guard)]),
    )
    return {
      userId:
        appIdentity && typeof appIdentity === 'object' && 'userId' in appIdentity
          ? appIdentity.userId
          : null,
      role:
        appIdentity && typeof appIdentity === 'object' && 'role' in appIdentity
          ? appIdentity.role
          : null,
      can: effectivePermissions,
      member:
        appIdentity &&
        typeof appIdentity === 'object' &&
        'kind' in appIdentity &&
        appIdentity.kind === 'member'
          ? serializeMember(appIdentity.member)
          : null,
      canBootstrap:
        appIdentity && typeof appIdentity === 'object' && 'canBootstrap' in appIdentity
          ? Boolean(appIdentity.canBootstrap)
          : false,
    }
  },
}

export const getAccessContext = callerQuery.protected({
  acceptsTrustedCaller: true,
  ...getAccessContextDefinition,
})

/** Validates that the first owner claim is being made by the configured owner email. */
export function validateFirstOwnerEmail(
  email: string | undefined,
  configuredEmail: string | undefined,
): void {
  const configured = normalizeEmail(configuredEmail)
  const candidate = normalizeEmail(email)

  if (!configured) {
    throwCmsError(
      'CMS_BOOTSTRAP_NOT_CONFIGURED',
      'CMS initial owner email is not configured. Set GINKO_FIRST_OWNER_EMAIL before claiming ownership.',
    )
  }
  if (!candidate) {
    throwCmsError(
      'CMS_BOOTSTRAP_EMAIL_REQUIRED',
      'The signed-in account must have an email address to claim CMS ownership.',
    )
  }
  if (configured !== candidate) {
    throwCmsError(
      'CMS_BOOTSTRAP_EMAIL_MISMATCH',
      'This account is not authorized to claim CMS ownership.',
    )
  }
}

export const bootstrapCmsOwner = callerMutation.protected({
  id: 'members:bootstrapCmsOwner',
  contractWrite: 'bypass',
  args: bootstrapCmsOwnerArgs.args,
  guard: isAuthenticated,
  returns: memberValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const trustedEmail = appIdentity.caller.kind === 'user' ? appIdentity.caller.email : undefined

    validateFirstOwnerEmail(trustedEmail, args.configuredOwnerEmail)

    return await bootstrapCmsOwnerRecord(ctx, appIdentity.userId, {
      displayName: args.displayName ?? appIdentity.member?.displayName ?? undefined,
      email: trustedEmail ?? appIdentity.member?.email ?? undefined,
    })
  },
})

export const listMembers = callerQuery.protected({
  id: 'members:listMembers',
  args: {},
  guard: canManageMembers,
  returns: v.array(memberValidator),
  handler: async (ctx) => {
    const members = await ctx.db.query('members').take(MEMBER_LIST_MAX + 1)
    if (members.length > MEMBER_LIST_MAX) {
      throwCmsError(
        'MEMBER_LIST_TOO_LARGE',
        `Member listing is capped at ${MEMBER_LIST_MAX} members for the MVP.`,
        { maxRows: MEMBER_LIST_MAX },
      )
    }
    return members.map((member: MemberDoc) => serializeMember(member))
  },
})

export const getMember = callerQuery.protected({
  id: 'members:getMember',
  args: getMemberArgs.args,
  guard: canManageMembers,
  returns: v.union(v.null(), memberValidator),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query('members')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first()
    if (!member) return null
    return serializeMember(member)
  },
})

export const listMemberInvitations = callerQuery.protected({
  id: 'members:listMemberInvitations',
  args: {},
  guard: canManageMembers,
  returns: v.array(memberInvitationValidator),
  handler: async (ctx) => await listPendingMemberInvitations(ctx),
})

const prepareMemberInvitationRecordRef = makeFunctionReference<
  'mutation',
  {
    actorUserId: string
    email: string
    role: 'owner' | 'publisher' | 'editor' | 'viewer'
    expiresInHours: number
    tokenHash: string
  },
  (typeof memberInvitationValidator)['type']
>('members:prepareMemberInvitationRecord')

const prepareMemberInvitationResendRecordRef = makeFunctionReference<
  'mutation',
  {
    actorUserId: string
    invitationId: string
    expiresInHours: number
    tokenHash: string
  },
  (typeof memberInvitationValidator)['type']
>('members:prepareMemberInvitationResendRecord')

const recordMemberInvitationDeliveryRecordRef = makeFunctionReference<
  'mutation',
  {
    actorUserId: string
    invitationId: string
    generation: number
    delivered: boolean
  },
  (typeof memberInvitationValidator)['type']
>('members:recordMemberInvitationDeliveryRecord')

export const prepareMemberInvitationRecord = internalMutation({
  args: {
    actorUserId: v.string(),
    ...prepareMemberInvitationDeliveryArgs.args,
  },
  returns: memberInvitationValidator,
  handler: async (ctx, args) => serializeMemberInvitation(await prepareMemberInvitation(ctx, args)),
})

export const prepareMemberInvitationResendRecord = internalMutation({
  args: {
    actorUserId: v.string(),
    ...prepareMemberInvitationResendArgs.args,
  },
  returns: memberInvitationValidator,
  handler: async (ctx, args) =>
    serializeMemberInvitation(await prepareMemberInvitationResend(ctx, args)),
})

export const recordMemberInvitationDeliveryRecord = internalMutation({
  args: {
    actorUserId: v.string(),
    ...recordMemberInvitationDeliveryArgs.args,
  },
  returns: memberInvitationValidator,
  handler: async (ctx, args) =>
    serializeMemberInvitation(await recordPendingInvitationDelivery(ctx, args)),
})

export const prepareMemberInvitationDelivery = callerAction.protected({
  id: 'members:prepareMemberInvitationDelivery',
  contractWrite: 'bypass',
  args: prepareMemberInvitationDeliveryArgs.args,
  guard: canManageMembers,
  returns: memberInvitationValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    return await ctx.runMutation(prepareMemberInvitationRecordRef, {
      actorUserId: appIdentity.userId,
      ...args,
    })
  },
})

export const prepareMemberInvitationResendDelivery = callerAction.protected({
  id: 'members:prepareMemberInvitationResendDelivery',
  contractWrite: 'bypass',
  args: prepareMemberInvitationResendArgs.args,
  guard: canManageMembers,
  returns: memberInvitationValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    return await ctx.runMutation(prepareMemberInvitationResendRecordRef, {
      actorUserId: appIdentity.userId,
      ...args,
    })
  },
})

export const recordMemberInvitationDelivery = callerAction.protected({
  id: 'members:recordMemberInvitationDelivery',
  contractWrite: 'bypass',
  args: recordMemberInvitationDeliveryArgs.args,
  guard: canManageMembers,
  returns: memberInvitationValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    return await ctx.runMutation(recordMemberInvitationDeliveryRecordRef, {
      actorUserId: appIdentity.userId,
      ...args,
    })
  },
})

export const revokeMemberInvitation = callerMutation.protected({
  id: 'members:revokeMemberInvitation',
  contractWrite: 'bypass',
  args: revokeMemberInvitationArgs.args,
  guard: canManageMembers,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    await revokePendingInvitation(ctx, { actorUserId: appIdentity.userId, ...args })
    return null
  },
})

export const acceptMemberInvitation = callerMutation.public({
  id: 'members:acceptMemberInvitation',
  contractWrite: 'bypass',
  args: acceptMemberInvitationArgs.args,
  returns: memberValidator,
  handler: async (ctx, args) => {
    const caller = await ctx.cmsCaller()
    if (caller.kind !== 'user') {
      throwCmsError(
        'MEMBER_INVITATION_INVALID',
        'This invitation cannot be accepted. Ask the CMS owner for a new invitation.',
      )
    }
    return serializeMember(
      await acceptPendingInvitation(ctx, {
        userId: caller.userId,
        name: caller.name,
        email: caller.email,
        emailVerified: caller.emailVerified === true,
        tokenProof: args.tokenProof,
      }),
    )
  },
})

export const updateMemberRole = callerMutation.protected({
  id: 'members:updateMemberRole',
  contractWrite: 'bypass',
  args: updateMemberRoleArgs.args,
  guard: canManageMembers,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const member = await ctx.db
      .query('members')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first()
    if (!member)
      throwCmsError('MEMBER_NOT_FOUND', 'Member not found', {
        userId: args.userId,
      })

    if (member.role === 'owner' && args.role !== 'owner' && (await countOwners(ctx)) <= 1) {
      throwCmsError('MEMBER_LAST_OWNER', 'Cannot demote the last owner')
    }

    await ctx.db.patch(member._id, {
      role: args.role,
      updatedAt: Date.now(),
      updatedBy: appIdentity.userId,
    })

    await logActivity(ctx, {
      kind: 'member.roleChanged',
      summary: `Changed member role for "${args.userId}"`,
      appIdentityId: appIdentity.userId,
      detail: { userId: args.userId, from: member.role, to: args.role },
    })

    return null
  },
})

export const removeMemberOperation = defineCmsOperation({
  id: 'ginko-cms.remove-member',
  kind: 'destructive',
  contractWrite: 'bypass',
  executeFunctionRef: 'members:removeMemberOperationExecute',
  args: removeMemberArgs.args,
  guard: canManageMembers,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => {
    const member =
      (await ctx.db
        .query('members')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .first()) ?? null
    return { member }
  },
  preview: async (ctx, args, { member }) => {
    if (!member) {
      return blockedPreview({
        summary: 'Member not found.',
        blockers: [operationIssue({ code: 'member-not-found', message: 'Member not found.' })],
        confirm: { operationId: 'ginko-cms.remove-member', args },
      })
    }
    const lastOwner = member.role === 'owner' && (await countOwners(ctx)) <= 1
    return buildPreview({
      summary: `Will remove member "${member.displayName || args.userId}".`,
      allowed: !lastOwner,
      blockers: lastOwner
        ? [
            operationIssue({
              code: 'member-last-owner',
              message: 'Cannot remove the last owner.',
            }),
          ]
        : [],
      warnings: [
        operationIssue({
          code: 'access-revoked',
          message: 'The user will lose all CMS access.',
        }),
      ],
      effects: [operationEffect({ kind: 'members', summary: 'Members removed', count: 1 })],
      details: { userId: member.userId, role: member.role },
      confirm: {
        operationId: 'ginko-cms.remove-member',
        args,
        effect: {
          userId: member.userId,
          role: member.role,
        },
      },
      version: { updatedAt: member.updatedAt },
    })
  },
  handler: async (ctx, args, { member }) => {
    const appIdentity = await ctx.appIdentity()
    if (!member) return null

    if (member.role === 'owner' && (await countOwners(ctx)) <= 1) {
      throwCmsError('MEMBER_LAST_OWNER', 'Cannot remove the last owner')
    }

    const now = Date.now()
    const credentialSettings: McpCredentialSettingsDoc[] = await ctx.db
      .query('mcpCredentialSettings')
      .withIndex('by_owner_user', (q) => q.eq('ownerUserId', member.userId))
      .collect()
    for (const settings of credentialSettings) {
      if (settings.status !== 'active') continue
      await ctx.db.patch(settings._id, {
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
        updatedBy: appIdentity.userId,
      })
    }

    await ctx.db.delete(member._id)

    await logActivity(ctx, {
      kind: 'member.removed',
      summary: `Removed member "${args.userId}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        userId: args.userId,
        revokedMcpCredentials: credentialSettings.filter((settings) => settings.status === 'active')
          .length,
      },
    })

    return null
  },
})

export const removeMemberOperationExecute = callerMutation.protected(removeMemberOperation)
export const previewRemoveMemberOperation = callerMutation.protected(
  Object.assign(definePreview(removeMemberOperation), {
    id: 'members:previewRemoveMemberOperation',
  }),
)
