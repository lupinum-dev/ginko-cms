import { jsonValueValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery } from '../_generated/server.js'

const policyArgs = {
  contract: jsonValueValidator,
  contractSha256: v.string(),
}

export const checkCmsPolicy = internalQuery({
  args: policyArgs,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.policy.checkCmsPolicy, args as never),
})

export const installCmsPolicy = internalMutation({
  args: policyArgs,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.policy.installCmsPolicy, args as never),
})
