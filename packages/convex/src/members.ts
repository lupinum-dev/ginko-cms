import {
  addMember as addMemberArgs,
  bootstrapCmsOwnerComponent as bootstrapCmsOwnerArgs,
  getMember as getMemberArgs,
  removeMember as removeMemberArgs,
  updateMemberRole as updateMemberRoleArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import { memberValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel.js'
import {
  can,
  canArchiveEntries,
  canCreateEntries,
  canDeleteEntries,
  canEditEntries,
  canManageAssets,
  canManageBackups,
  canManageCollections,
  canManageMembers,
  canManagePortability,
  canManageSettings,
  canPublishEntries,
  canRead,
  isAuthenticated,
  isBootstrapUser,
  type CmsGuard,
} from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import { toStringId } from './lib/ids.js'
import type { MutationCtx } from './lib/types.js'
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

function definePermission(input: { key: string; label: string; check: CmsGuard }) {
  return input
}

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
    email: profile?.email ?? null,
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

const cmsPermissions = [
  definePermission({ key: cmsPermissionKeys.read, label: 'Read CMS', check: canRead }),
  definePermission({
    key: cmsPermissionKeys.bootstrap,
    label: 'Bootstrap CMS',
    check: isBootstrapUser,
  }),
  definePermission({
    key: cmsPermissionKeys.createEntries,
    label: 'Create entries',
    check: canCreateEntries,
  }),
  definePermission({
    key: cmsPermissionKeys.editEntries,
    label: 'Edit entries',
    check: canEditEntries,
  }),
  definePermission({
    key: cmsPermissionKeys.publishEntries,
    label: 'Publish entries',
    check: canPublishEntries,
  }),
  definePermission({
    key: cmsPermissionKeys.archiveEntries,
    label: 'Archive entries',
    check: canArchiveEntries,
  }),
  definePermission({
    key: cmsPermissionKeys.deleteEntries,
    label: 'Delete entries',
    check: canDeleteEntries,
  }),
  definePermission({
    key: cmsPermissionKeys.manageCollections,
    label: 'Manage collections',
    check: canManageCollections,
  }),
  definePermission({
    key: cmsPermissionKeys.manageSettings,
    label: 'Manage settings',
    check: canManageSettings,
  }),
  definePermission({
    key: cmsPermissionKeys.manageMembers,
    label: 'Manage members',
    check: canManageMembers,
  }),
  definePermission({
    key: cmsPermissionKeys.manageAssets,
    label: 'Manage assets',
    check: canManageAssets,
  }),
  definePermission({
    key: cmsPermissionKeys.manageBackups,
    label: 'Manage backups',
    check: canManageBackups,
  }),
  definePermission({
    key: cmsPermissionKeys.managePortability,
    label: 'Manage portability',
    check: canManagePortability,
  }),
] as const

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized && normalized.length > 0 ? normalized : null
}

const getAccessContextDefinition = {
  id: 'members:getAccessContext',
  args: {},
  returns: v.any(),
  handler: async (ctx: { appIdentity: () => Promise<unknown> }) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) return null
    const effectivePermissions = Object.fromEntries(
      cmsPermissions.map((permission) => [
        permission.key,
        appIdentity ? can(appIdentity as never, permission.check) : false,
      ]),
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
      permissions: effectivePermissions,
      member:
        appIdentity &&
        typeof appIdentity === 'object' &&
        'kind' in appIdentity &&
        appIdentity.kind === 'member'
          ? serializeMember((appIdentity as unknown as { member: MemberDoc }).member)
          : null,
      canBootstrap:
        appIdentity && typeof appIdentity === 'object' && 'canBootstrap' in appIdentity
          ? Boolean(appIdentity.canBootstrap)
          : false,
    }
  },
}

export const getAccessContext = callerQuery.public({
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

export const addMember = callerMutation.protected({
  id: 'members:addMember',
  args: addMemberArgs.args,
  guard: canManageMembers,
  returns: v.string(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const existing = await ctx.db
      .query('members')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first()
    if (existing) {
      throwCmsError('MEMBER_ALREADY_EXISTS', 'User is already a member', {
        userId: args.userId,
      })
    }

    const id = await ctx.db.insert('members', {
      userId: args.userId,
      displayName: args.displayName ?? null,
      email: args.email ?? null,
      role: args.role,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: appIdentity.userId,
    })

    await logActivity(ctx, {
      kind: 'member.added',
      summary: `Added member "${args.userId}"`,
      appIdentityId: appIdentity.userId,
      detail: { userId: args.userId, role: args.role },
    })

    return toStringId(id)
  },
})

export const updateMemberRole = callerMutation.protected({
  id: 'members:updateMemberRole',
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
  name: 'remove-member',
  kind: 'destructive',
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
  preview: async (_ctx, args, { member }) => {
    if (!member) {
      return blockedPreview({
        summary: 'Member not found.',
        blockers: [operationIssue({ code: 'member-not-found', message: 'Member not found.' })],
        confirm: { operationId: 'ginko-cms.remove-member', args },
      })
    }
    return buildPreview({
      summary: `Will remove member "${member.displayName || args.userId}".`,
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
