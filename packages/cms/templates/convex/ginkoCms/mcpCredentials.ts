import { cmsPermissionKeys } from '@lupinum/ginko-cms-contract/shared/permissions.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

const mcpCredentialScopeValidator = v.union(
  ...[
    cmsPermissionKeys.read,
    cmsPermissionKeys.createEntries,
    cmsPermissionKeys.editEntries,
    cmsPermissionKeys.publishEntries,
    cmsPermissionKeys.archiveEntries,
    cmsPermissionKeys.deleteEntries,
    cmsPermissionKeys.manageCollections,
    cmsPermissionKeys.manageSettings,
    cmsPermissionKeys.manageMembers,
    cmsPermissionKeys.manageAssets,
  ].map((scope) => v.literal(scope)),
)

export const upsertSettings = mutation({
  args: {
    apiKeyId: v.string(),
    ownerUserId: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    scopes: v.array(mcpCredentialScopeValidator),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.mcpCredentials.upsertSettings, args as never),
})

export const listOwnSettings = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.mcpCredentials.listOwnSettings, args as never),
})

export const revokeSettings = mutation({
  args: {
    apiKeyId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.mcpCredentials.revokeSettings, args as never),
})

export const resolveAccess = query({
  args: {
    apiKeyId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.mcpCredentials.resolveAccess, args as never),
})
