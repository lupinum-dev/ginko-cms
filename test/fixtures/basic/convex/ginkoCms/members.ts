/* eslint-disable */
import {
  addMember as addMemberArgs,
  bootstrapCmsOwner as bootstrapCmsOwnerArgs,
  getMember as getMemberArgs,
  removeMember as removeMemberArgs,
  updateMemberRole as updateMemberRoleArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/members.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

declare const process: {
  env: Record<string, string | undefined>
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const getAccessContext = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.members.getAccessContext, args as never),
})

export const bootstrapCmsOwner = mutation({
  args: bootstrapCmsOwnerArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.bootstrapCmsOwner, {
      ...args,
      configuredOwnerEmail: process.env.GINKO_FIRST_OWNER_EMAIL,
    }),
})

export const listMembers = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.members.listMembers, args as never),
})

export const getMember = query({
  args: getMemberArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.members.getMember, args as never),
})

export const addMember = mutation({
  args: addMemberArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.addMember, args as never),
})

export const updateMemberRole = mutation({
  args: updateMemberRoleArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.updateMemberRole, args as never),
})

export const removeMember = mutation({
  args: confirmedArgs(removeMemberArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.removeMemberOperationExecute, args as never),
})

export const previewRemoveMemberOperation = mutation({
  args: removeMemberArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.members.previewRemoveMemberOperation, args as never),
})
