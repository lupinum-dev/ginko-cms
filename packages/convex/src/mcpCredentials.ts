import { cmsUserCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import {
  mcpCredentialScopeKeys,
  type CmsPermissionKey,
} from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel.js'
import type { CmsMemberAppIdentity } from './auth/appIdentity.js'
import { can, canManageSettings, cmsPermissionGuards } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerMutation, callerQuery } from './functions.js'
import { logActivity } from './lib/activity.js'
import type { MutationCtx, QueryCtx } from './lib/types.js'

type MemberDoc = Doc<'members'>
type CredentialSettingsDoc = Doc<'mcpCredentialSettings'>

const mcpCredentialScopeValidator = v.union(
  ...mcpCredentialScopeKeys.map((scope) => v.literal(scope)),
)

const mcpCredentialSettingsValidator = v.object({
  _id: v.string(),
  apiKeyId: v.string(),
  ownerUserId: v.string(),
  label: v.union(v.string(), v.null()),
  scopes: v.array(mcpCredentialScopeValidator),
  status: v.union(v.literal('active'), v.literal('revoked')),
  expiresAt: v.union(v.number(), v.null()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.string(),
  updatedAt: v.number(),
  revokedAt: v.union(v.number(), v.null()),
})

const resolvedCredentialAccessValidator = v.union(
  v.object({
    apiKeyId: v.string(),
    ownerUserId: v.string(),
    scopes: v.array(mcpCredentialScopeValidator),
    expiresAt: v.union(v.number(), v.null()),
  }),
  v.null(),
)

function serializeCredentialSettings(settings: CredentialSettingsDoc) {
  return {
    _id: String(settings._id),
    apiKeyId: settings.apiKeyId,
    ownerUserId: settings.ownerUserId,
    label: settings.label ?? null,
    scopes: settings.scopes as CmsPermissionKey[],
    status: settings.status,
    expiresAt: settings.expiresAt ?? null,
    createdBy: settings.createdBy,
    createdAt: settings.createdAt,
    updatedBy: settings.updatedBy,
    updatedAt: settings.updatedAt,
    revokedAt: settings.revokedAt ?? null,
  }
}

function generateBearerSecret() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashBearerSecret(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
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

function assertScopesFitRole(member: MemberDoc, scopes: readonly CmsPermissionKey[]) {
  const rolePermissions = permissionsForMember(member)
  for (const scope of scopes) {
    if (rolePermissions[scope]) continue
    throwCmsError(
      'MCP_CREDENTIAL_SCOPE_EXCEEDS_ROLE',
      'Credential scope exceeds current member role.',
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
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()
}

async function getCredentialSettings(ctx: QueryCtx | MutationCtx, apiKeyId: string) {
  return await ctx.db
    .query('mcpCredentialSettings')
    .withIndex('by_api_key_id', (q) => q.eq('apiKeyId', apiKeyId))
    .first()
}

export const createCredential = callerMutation.protected({
  id: 'mcpCredentials:createCredential',
  contractWrite: 'bypass',
  args: {
    ownerUserId: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    scopes: v.array(mcpCredentialScopeValidator),
    expiresAt: v.optional(v.union(v.number(), v.null())),
  },
  guard: canManageSettings,
  returns: v.object({
    settings: mcpCredentialSettingsValidator,
    bearerToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const member = await getMemberByUserId(ctx, args.ownerUserId)
    if (!member) {
      throwCmsError('MCP_CREDENTIAL_OWNER_NOT_FOUND', 'Credential owner is not a CMS member.', {
        ownerUserId: args.ownerUserId,
      })
    }

    const scopes = normalizeScopes(args.scopes)
    assertScopesFitRole(member, scopes)

    if (typeof args.expiresAt === 'number' && args.expiresAt <= Date.now()) {
      throwCmsError(
        'MCP_CREDENTIAL_EXPIRY_IN_PAST',
        'The MCP connection expiry must be in the future.',
        { expiresAt: args.expiresAt },
      )
    }

    const bearerToken = generateBearerSecret()
    const secretHash = await hashBearerSecret(bearerToken)
    const apiKeyId = `mcp_${crypto.randomUUID()}`
    const existingHash = await ctx.db
      .query('mcpCredentialSettings')
      .withIndex('by_secret_hash', (q) => q.eq('secretHash', secretHash))
      .first()
    if (existingHash) {
      throwCmsError('MCP_CREDENTIAL_HASH_COLLISION', 'Credential generation must be retried.')
    }

    const now = Date.now()
    const id = await ctx.db.insert('mcpCredentialSettings', {
      apiKeyId,
      secretHash,
      ownerUserId: args.ownerUserId,
      status: 'active',
      createdBy: appIdentity.userId,
      createdAt: now,
      revokedAt: null,
      label: args.label ?? null,
      scopes,
      expiresAt: args.expiresAt ?? null,
      updatedBy: appIdentity.userId,
      updatedAt: now,
    })
    const created = await ctx.db.get(id)
    if (!created) throw new Error('Credential settings disappeared after create.')

    await logActivity(ctx, {
      kind: 'mcpCredentialSettings.updated',
      summary: `Created MCP credential for "${args.ownerUserId}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        apiKeyId,
        ownerUserId: args.ownerUserId,
        scopes,
      },
    })

    return { settings: serializeCredentialSettings(created), bearerToken }
  },
})

export const listOwnSettings = callerQuery.protected({
  id: 'mcpCredentials:listOwnSettings',
  args: {},
  guard: canManageSettings,
  returns: v.array(mcpCredentialSettingsValidator),
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    const rows = await ctx.db
      .query('mcpCredentialSettings')
      .withIndex('by_owner_user', (q) => q.eq('ownerUserId', appIdentity.userId))
      .collect()

    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((settings) => serializeCredentialSettings(settings))
  },
})

export const revokeSettings = callerMutation.protected({
  id: 'mcpCredentials:revokeSettings',
  contractWrite: 'bypass',
  args: {
    apiKeyId: v.string(),
  },
  guard: canManageSettings,
  returns: v.null(),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const existing = await getCredentialSettings(ctx, args.apiKeyId)
    if (!existing) return null

    await ctx.db.patch(existing._id, {
      status: 'revoked',
      updatedBy: appIdentity.userId,
      updatedAt: Date.now(),
      revokedAt: Date.now(),
    })

    await logActivity(ctx, {
      kind: 'mcpCredentialSettings.revoked',
      summary: `Revoked MCP credential settings for "${existing.ownerUserId}"`,
      appIdentityId: appIdentity.userId,
      detail: {
        apiKeyId: args.apiKeyId,
        ownerUserId: existing.ownerUserId,
      },
    })

    return null
  },
})

export const resolveAccessBySecretHash = callerQuery.public({
  id: 'mcpCredentials:resolveAccessBySecretHash',
  args: {
    secretHash: v.string(),
  },
  returns: resolvedCredentialAccessValidator,
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('mcpCredentialSettings')
      .withIndex('by_secret_hash', (q) => q.eq('secretHash', args.secretHash))
      .first()
    if (!settings || settings.status !== 'active') return null
    if (settings.expiresAt != null && settings.expiresAt <= Date.now()) return null
    const member = await getMemberByUserId(ctx, settings.ownerUserId)
    if (!member) return null

    return {
      apiKeyId: settings.apiKeyId,
      ownerUserId: settings.ownerUserId,
      scopes: settings.scopes,
      expiresAt: settings.expiresAt ?? null,
    }
  },
})
