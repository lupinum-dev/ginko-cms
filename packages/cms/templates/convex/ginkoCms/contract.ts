import { jsonValueValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery, query } from '../_generated/server.js'
import { bindCmsCaller } from './caller.js'

const contractArgs = {
  content: jsonValueValidator,
  contentHash: v.string(),
  presentation: jsonValueValidator,
  presentationHash: v.string(),
}

export const checkCmsContract = internalQuery({
  args: contractArgs,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.contract.checkCmsContract, args),
})

export const installCmsContract = internalMutation({
  args: contractArgs,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.contract.installCmsContract, args),
})

export const getInstalledContractStatus = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.contract.getInstalledContractStatus,
      await bindCmsCaller(ctx, args),
    ),
})
