import { cmsCallerValidator } from '@lupinum/ginko-cms-contract/convex/caller.js'
import { cmsRoleValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import {
  assertCmsCallerConsistency,
  cmsUserCaller,
} from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsCaller } from '@lupinum/ginko-cms-contract/shared/caller.js'
import type { CmsRole } from '@lupinum/ginko-cms-contract/shared/types.js'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import { internal } from '../_generated/api.js'
import type { DataModel, Doc } from '../_generated/dataModel.js'
import { internalQuery } from '../_generated/server.js'
import { can, cmsPermissionGuards } from './checks.js'

type CmsCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>
type AnyCmsCtx = CmsCtx | GenericActionCtx<DataModel>
type MemberDoc = Doc<'members'>
type McpCredentialSettingsDoc = Doc<'mcpCredentialSettings'>

const appIdentityMemberValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  userId: v.string(),
  displayName: v.optional(v.union(v.string(), v.null())),
  email: v.optional(v.union(v.string(), v.null())),
  role: cmsRoleValidator,
  createdAt: v.number(),
  updatedAt: v.optional(v.union(v.number(), v.null())),
  updatedBy: v.optional(v.union(v.string(), v.null())),
})

export type CmsAuthenticatedAppIdentity = {
  kind: 'authenticated'
  userId: string
  role: null
  member: null
  canBootstrap: boolean
  caller: CmsCaller
  audit: {
    origin: 'user'
  }
}

export type CmsMemberAppIdentity = {
  kind: 'member'
  userId: string
  role: CmsRole
  member: MemberDoc
  canBootstrap: false
  caller: CmsCaller
  mcpEffectivePermissions?: Record<string, boolean>
  audit:
    | {
        origin: 'user'
      }
    | {
        origin: 'mcp'
        apiKeyId: string
      }
}

export type CmsAppIdentity = CmsAuthenticatedAppIdentity | CmsMemberAppIdentity | null

const cmsAppIdentityValidator = v.union(
  v.object({
    kind: v.literal('authenticated'),
    userId: v.string(),
    role: v.null(),
    member: v.null(),
    canBootstrap: v.boolean(),
    caller: cmsCallerValidator,
    audit: v.object({
      origin: v.literal('user'),
    }),
  }),
  v.object({
    kind: v.literal('member'),
    userId: v.string(),
    role: cmsRoleValidator,
    member: appIdentityMemberValidator,
    canBootstrap: v.literal(false),
    caller: cmsCallerValidator,
    mcpEffectivePermissions: v.optional(v.record(v.string(), v.boolean())),
    audit: v.union(
      v.object({
        origin: v.literal('user'),
      }),
      v.object({
        origin: v.literal('mcp'),
        apiKeyId: v.string(),
      }),
    ),
  }),
  v.null(),
)

async function getCmsMember(ctx: CmsCtx, userId: string): Promise<MemberDoc | null> {
  return await ctx.db
    .query('members')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()
}

async function getMcpCredentialSettings(ctx: CmsCtx, apiKeyId: string) {
  return await ctx.db
    .query('mcpCredentialSettings')
    .withIndex('by_api_key_id', (q) => q.eq('apiKeyId', apiKeyId))
    .first()
}

function effectiveMcpPermissions(
  member: MemberDoc,
  settings: McpCredentialSettingsDoc,
): Record<string, boolean> {
  const scopes = new Set(settings.scopes)
  const identity: CmsMemberAppIdentity = {
    kind: 'member',
    userId: member.userId,
    role: member.role,
    member,
    canBootstrap: false,
    caller: cmsUserCaller(member.userId),
    audit: { origin: 'user' },
  }
  return Object.fromEntries(
    cmsPermissionGuards.map(({ key, guard }) => [key, scopes.has(key) && can(identity, guard)]),
  )
}

async function getBootstrapState(ctx: CmsCtx): Promise<boolean> {
  const firstMember = await ctx.db.query('members').first()
  return !firstMember
}

async function resolveUserAppIdentity(
  ctx: CmsCtx,
  caller: Extract<CmsCaller, { kind: 'user' }>,
): Promise<CmsAppIdentity> {
  const member = await getCmsMember(ctx, caller.userId)
  const canBootstrap = await getBootstrapState(ctx)

  if (!member) {
    return {
      kind: 'authenticated',
      userId: caller.userId,
      role: null,
      member: null,
      canBootstrap,
      caller,
      audit: {
        origin: 'user',
      },
    }
  }

  return {
    kind: 'member',
    userId: caller.userId,
    role: member.role,
    member,
    canBootstrap: false,
    caller,
    audit: {
      origin: 'user',
    },
  }
}

async function resolveMcpAppIdentity(
  ctx: CmsCtx,
  caller: Extract<CmsCaller, { kind: 'mcp' }>,
): Promise<CmsAppIdentity> {
  const settings = await getMcpCredentialSettings(ctx, caller.apiKeyId)
  if (!settings || settings.status !== 'active') return null

  const member = await getCmsMember(ctx, settings.ownerUserId)
  if (!member) return null

  return {
    kind: 'member',
    userId: member.userId,
    role: member.role,
    member,
    canBootstrap: false,
    caller,
    mcpEffectivePermissions: effectiveMcpPermissions(member, settings),
    audit: {
      origin: 'mcp',
      apiKeyId: caller.apiKeyId,
    },
  }
}

export async function getAppIdentity(ctx: AnyCmsCtx, caller?: CmsCaller): Promise<CmsAppIdentity> {
  if (!caller || caller.kind === 'anonymous' || caller.kind === 'deploy') return null
  assertCmsCallerConsistency(caller)
  if (!('db' in ctx)) {
    return (await ctx.runQuery(internal.auth.appIdentity.resolveAppIdentityForAction, {
      caller,
    })) as CmsAppIdentity
  }
  if (caller.kind === 'user') {
    return await resolveUserAppIdentity(ctx, caller)
  }
  return await resolveMcpAppIdentity(ctx, caller)
}

export const resolveAppIdentityForAction = internalQuery({
  args: { caller: cmsCallerValidator },
  returns: cmsAppIdentityValidator,
  handler: async (ctx, args) => await getAppIdentity(ctx, args.caller as CmsCaller),
})
