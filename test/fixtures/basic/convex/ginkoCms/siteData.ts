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
import { bindExpectedCmsContract } from './contractBinding.js'
import { bindCmsCaller } from './mcpCaller.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.optional(v.string()),
  }
}

export const listSiteData = query({
  args: {},
  handler: async (ctx, args) => await ctx.runQuery(components.ginkoCms.siteData.listSiteData, args),
})

export const getSiteDataBlock = query({
  args: getSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.siteData.getSiteDataBlock, args),
})

export const createSiteDataBlock = mutation({
  args: createSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.createSiteDataBlock,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})

export const saveSiteData = mutation({
  args: saveSiteDataArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.saveSiteData,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})

export const updateSiteDataBlock = mutation({
  args: updateSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.updateSiteDataBlock,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})

export const deleteSiteDataBlock = mutation({
  args: confirmedArgs(deleteSiteDataBlockArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.deleteSiteDataBlockOperationExecute,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})

export const previewDeleteSiteDataBlockOperation = mutation({
  args: deleteSiteDataBlockArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.siteData.previewDeleteSiteDataBlockOperation,
      bindExpectedCmsContract(await bindCmsCaller(ctx, args)),
    ),
})
