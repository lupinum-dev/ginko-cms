import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import {
  mcpDelegatedScopeKeys,
  type CmsPermissionKey,
} from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel.js'
import { hasLiveMcpDelegatedAccess, type CmsMemberAppIdentity } from './auth/appIdentity.js'
import { can, canManageSettings, cmsPermissionGuards } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import type { MutationCtx, QueryCtx } from './lib/types.js'

type MemberDoc = Doc<'members'>
type DelegationDoc = Doc<'mcpOAuthDelegations'>

const MAX_DELEGATIONS = 100
const oauthClientIdValidator = v.string()
const mcpScopeValidator = v.union(...mcpDelegatedScopeKeys.map((scope) => v.literal(scope)))

const delegationValidator = v.object({
  _id: v.string(),
  delegationId: v.string(),
  oauthClientId: v.string(),
  ownerUserId: v.string(),
  label: v.union(v.string(), v.null()),
  scopes: v.array(mcpScopeValidator),
  status: v.union(v.literal('active'), v.literal('revoked')),
  expiresAt: v.union(v.number(), v.null()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.string(),
  updatedAt: v.number(),
  revokedAt: v.union(v.number(), v.null()),
})

function serializeDelegation(delegation: DelegationDoc) {
  return {
    _id: String(delegation._id),
    delegationId: delegation.delegationId,
    oauthClientId: delegation.oauthClientId,
    ownerUserId: delegation.ownerUserId,
    label: delegation.label ?? null,
    scopes: delegation.scopes as CmsPermissionKey[],
    status: delegation.status,
    expiresAt: delegation.expiresAt ?? null,
    createdBy: delegation.createdBy,
    createdAt: delegation.createdAt,
    updatedBy: delegation.updatedBy,
    updatedAt: delegation.updatedAt,
    revokedAt: delegation.revokedAt ?? null,
  }
}

function memberIdentity(member: MemberDoc): CmsMemberAppIdentity {
  return {
    kind: 'member',
    userId: member.userId,
    role: member.role,
    member,
    canBootstrap: false,
    caller: cmsUserCaller(member.userId),
    audit: { origin: 'user' },
  }
}

function permissionsForMember(member: MemberDoc): Record<CmsPermissionKey, boolean> {
  const identity = memberIdentity(member)
  return Object.fromEntries(
    cmsPermissionGuards.map(({ key, guard }) => [key, can(identity, guard)]),
  ) as Record<CmsPermissionKey, boolean>
}

function normalizeScopes(scopes: readonly CmsPermissionKey[]): CmsPermissionKey[] {
  return Array.from(new Set(scopes))
}

function requireCanonicalClientId(value: string): string {
  const clientId = value.trim()
  const containsControlCharacter = [...clientId].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  if (!clientId || clientId !== value || clientId.length > 256 || containsControlCharacter) {
    throwCmsError('MCP_OAUTH_CLIENT_INVALID', 'OAuth client ID is invalid.')
  }
  return clientId
}

function assertScopesFitRole(member: MemberDoc, scopes: readonly CmsPermissionKey[]) {
  const rolePermissions = permissionsForMember(member)
  for (const scope of scopes) {
    if (rolePermissions[scope]) continue
    throwCmsError(
      'MCP_DELEGATION_SCOPE_EXCEEDS_ROLE',
      'Delegation scope exceeds current member role.',
      {
        ownerUserId: member.userId,
        role: member.role,
        scope,
      },
    )
  }
}

async function getMemberByUserId(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query('members')
    .withIndex('by_userId', (query) => query.eq('userId', userId))
    .unique()
}

async function getDelegationById(ctx: QueryCtx | MutationCtx, delegationId: string) {
  return await ctx.db
    .query('mcpOAuthDelegations')
    .withIndex('by_delegation_id', (query) => query.eq('delegationId', delegationId))
    .unique()
}

export const createDelegation = callerMutation.protected({
  id: 'mcpOAuthDelegations:createDelegation',
  contractWrite: 'bypass',
  args: {
    ownerUserId: v.string(),
    oauthClientId: oauthClientIdValidator,
    label: v.optional(v.union(v.string(), v.null())),
    scopes: v.array(mcpScopeValidator),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  guard: canManageSettings,
  returns: delegationValidator,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const member = await getMemberByUserId(ctx, args.ownerUserId)
    if (!member) {
      throwCmsError('MCP_DELEGATION_OWNER_NOT_FOUND', 'Delegation owner is not a CMS member.', {
        ownerUserId: args.ownerUserId,
      })
    }
    const oauthClientId = requireCanonicalClientId(args.oauthClientId)
    const scopes = normalizeScopes(args.scopes)
    if (scopes.length === 0) {
      throwCmsError('MCP_DELEGATION_SCOPE_REQUIRED', 'Select at least one delegation scope.')
    }
    assertScopesFitRole(member, scopes)
    if (typeof args.expiresAt === 'number' && args.expiresAt <= Date.now()) {
      throwCmsError('MCP_DELEGATION_EXPIRY_IN_PAST', 'Delegation expiry must be in the future.', {
        expiresAt: args.expiresAt,
      })
    }
    const active = await ctx.db
      .query('mcpOAuthDelegations')
      .withIndex('by_owner_client_status', (query) =>
        query
          .eq('ownerUserId', args.ownerUserId)
          .eq('oauthClientId', oauthClientId)
          .eq('status', 'active'),
      )
      .unique()
    if (active) {
      throwCmsError(
        'MCP_DELEGATION_ALREADY_ACTIVE',
        'An active delegation already exists for this user and client.',
      )
    }
    const now = Date.now()
    const delegationId = `mcpd_${crypto.randomUUID()}`
    const id = await ctx.db.insert('mcpOAuthDelegations', {
      delegationId,
      oauthClientId,
      ownerUserId: args.ownerUserId,
      label: args.label ?? null,
      scopes,
      status: 'active',
      expiresAt: args.expiresAt ?? null,
      createdBy: appIdentity.userId,
      createdAt: now,
      updatedBy: appIdentity.userId,
      updatedAt: now,
      revokedAt: null,
    })
    const created = await ctx.db.get(id)
    if (!created) throw new Error('OAuth delegation disappeared after create.')
    await logActivity(ctx, {
      kind: 'mcpOAuthDelegation.created',
      summary: `Created MCP OAuth delegation for "${args.ownerUserId}"`,
      appIdentityId: appIdentity.userId,
      detail: { delegationId, oauthClientId, ownerUserId: args.ownerUserId, scopes },
    })
    return serializeDelegation(created)
  },
})

export const listDelegations = callerQuery.protected({
  id: 'mcpOAuthDelegations:listDelegations',
  args: {},
  guard: canManageSettings,
  returns: v.array(delegationValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('mcpOAuthDelegations')
      .withIndex('by_updated_at')
      .order('desc')
      .take(MAX_DELEGATIONS)
    return rows.map(serializeDelegation)
  },
})

export const revokeDelegation = callerMutation.protected({
  id: 'mcpOAuthDelegations:revokeDelegation',
  contractWrite: 'bypass',
  args: { delegationId: v.string() },
  guard: canManageSettings,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const existing = await getDelegationById(ctx, args.delegationId)
    if (!existing || existing.status === 'revoked') return null
    const now = Date.now()
    await ctx.db.patch(existing._id, {
      status: 'revoked',
      updatedBy: appIdentity.userId,
      updatedAt: now,
      revokedAt: now,
    })
    await logActivity(ctx, {
      kind: 'mcpOAuthDelegation.revoked',
      summary: `Revoked MCP OAuth delegation for "${existing.ownerUserId}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        delegationId: existing.delegationId,
        oauthClientId: existing.oauthClientId,
        ownerUserId: existing.ownerUserId,
      },
    })
    return null
  },
})

/** Host-auth bridge: Better Auth still binds the session user before consulting this result. */
export const hasOAuthAdminPrivilege = callerQuery.public({
  args: { authUserId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query('members')
      .withIndex('by_userId', (query) => query.eq('userId', args.authUserId))
      .unique()
    return member?.role === 'owner'
  },
})

/**
 * Host-auth bridge for MCP requests. Better Auth validates the grant first;
 * this check keeps the CMS-owned delegation, member, and role authoritative.
 */
export const hasLiveDelegatedAccess = callerQuery.public({
  args: {
    ownerUserId: v.string(),
    oauthClientId: oauthClientIdValidator,
    scopes: v.array(mcpScopeValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    await hasLiveMcpDelegatedAccess(ctx, args.ownerUserId, args.oauthClientId, args.scopes),
})
