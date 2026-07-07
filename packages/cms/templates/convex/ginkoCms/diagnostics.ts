import {
  explainPublicVisibility as explainPublicVisibilityArgs,
  previewPublishImpact as previewPublishImpactArgs,
  validatePublicRoutes as validatePublicRoutesArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'

export const validatePublicRoutes = query({
  args: validatePublicRoutesArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.diagnostics.validatePublicRoutes, args as never),
})

export const explainPublicVisibility = query({
  args: explainPublicVisibilityArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.diagnostics.explainPublicVisibility, args as never),
})

export const previewPublishImpact = query({
  args: previewPublishImpactArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.diagnostics.previewPublishImpact, args as never),
})

export const storageHygieneReport = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.diagnostics.storageHygieneReport, args as never),
})
