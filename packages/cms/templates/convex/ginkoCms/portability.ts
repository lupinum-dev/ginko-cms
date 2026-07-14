import {
  abortImport as abortImportArgs,
  appendImportPlanItems as appendImportPlanItemsArgs,
  applyImportItem as applyImportItemArgs,
  beginImportApply as beginImportApplyArgs,
  beginImportVerification as beginImportVerificationArgs,
  createImportPlan as createImportPlanArgs,
  expireImport as expireImportArgs,
  finalizeImport as finalizeImportArgs,
  inspectPortableDrafts as inspectPortableDraftsArgs,
  sealImportPlan as sealImportPlanArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'

import { components } from '../_generated/api'
import { action, mutation, query } from '../_generated/server'

export const inspectPortableDrafts = query({
  args: inspectPortableDraftsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.portability.inspectPortableDrafts, args as never),
})

export const createImportPlan = mutation({
  args: createImportPlanArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.createImportPlan, args as never),
})

export const appendImportPlanItems = mutation({
  args: appendImportPlanItemsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.appendImportPlanItems, args as never),
})

export const sealImportPlan = action({
  args: sealImportPlanArgs.args,
  handler: async (ctx, args) =>
    await ctx.runAction(components.ginkoCms.portability.sealImportPlan, args as never),
})

export const beginImportApply = mutation({
  args: beginImportApplyArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.beginImportApply, args as never),
})

export const applyImportItem = mutation({
  args: applyImportItemArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.applyImportItem, args as never),
})

export const beginImportVerification = mutation({
  args: beginImportVerificationArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.beginImportVerification, args as never),
})

export const finalizeImport = mutation({
  args: finalizeImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.finalizeImport, args as never),
})

export const abortImport = mutation({
  args: abortImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.abortImport, args as never),
})

export const expireImport = mutation({
  args: expireImportArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.portability.expireImport, args as never),
})
