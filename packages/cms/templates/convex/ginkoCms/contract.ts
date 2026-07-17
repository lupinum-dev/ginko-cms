import { jsonValueValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery } from '../_generated/server.js'

const contractArgs = {
  content: jsonValueValidator,
  contentHash: v.string(),
  presentation: jsonValueValidator,
  presentationHash: v.string(),
}

export const checkCmsContract = internalQuery({
  args: contractArgs,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.contract.checkCmsContract, args as never),
})

export const installCmsContract = internalMutation({
  args: contractArgs,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.contract.installCmsContract, args as never),
})
