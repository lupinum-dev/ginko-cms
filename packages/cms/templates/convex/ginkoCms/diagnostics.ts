import { explainPublicVisibility as explainPublicVisibilityArgs } from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'

export const explainPublicVisibility = query({
  args: explainPublicVisibilityArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.diagnostics.explainPublicVisibility, args),
})
