import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'

export const getStudioSettings = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.settings.getStudioSettings, args),
})
