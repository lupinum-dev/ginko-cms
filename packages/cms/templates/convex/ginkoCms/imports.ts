/* eslint-disable */
import {
  applyImport as applyImportArgs,
  listImportRuns as listImportRunsArgs,
  previewImport as previewImportArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/imports.js'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

export const previewImport = mutation({
  args: previewImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.imports.previewImport, args as never),
})

export const applyImport = mutation({
  args: applyImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.imports.applyImport, args as never),
})

export const listImportRuns = query({
  args: listImportRunsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.imports.listImportRuns, args as never),
})
