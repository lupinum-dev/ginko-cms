import { updateSettings as updateSettingsArgs } from '@lupinum/ginko-cms-contract/convex/schemas/settings.js'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

export const getStudioSettings = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.settings.getStudioSettings, args as never),
})

export const getSettings = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.settings.getSettings, args as never),
})

export const updateSettings = mutation({
  args: updateSettingsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.settings.updateSettings, args as never),
})
