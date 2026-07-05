/* eslint-disable */
import {
  createSiteDataBlock as createSiteDataBlockArgs,
  deleteSiteDataBlock as deleteSiteDataBlockArgs,
  getSiteDataBlock as getSiteDataBlockArgs,
  saveSiteData as saveSiteDataArgs,
  updateSiteDataBlock as updateSiteDataBlockArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/siteData.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const listSiteData = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.siteData.listSiteData, args as never),
})

export const getSiteDataBlock = query({
  args: getSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.siteData.getSiteDataBlock, args as never),
})

export const createSiteDataBlock = mutation({
  args: createSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.siteData.createSiteDataBlock, args as never),
})

export const saveSiteData = mutation({
  args: saveSiteDataArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.siteData.saveSiteData, args as never),
})

export const updateSiteDataBlock = mutation({
  args: updateSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.siteData.updateSiteDataBlock, args as never),
})

export const deleteSiteDataBlock = mutation({
  args: confirmedArgs(deleteSiteDataBlockArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.deleteSiteDataBlockOperationExecute,
      args as never,
    ),
})

export const previewDeleteSiteDataBlockOperation = mutation({
  args: deleteSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.previewDeleteSiteDataBlockOperation,
      args as never,
    ),
})
