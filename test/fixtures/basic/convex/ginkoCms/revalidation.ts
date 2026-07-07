import {
  listRevalidationJobs as listRevalidationJobsArgs,
  retryRevalidationJob as retryRevalidationJobArgs,
  upsertRevalidationTarget as upsertRevalidationTargetArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/revalidation.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { mutation, query } from '../_generated/server.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const listRevalidationTargets = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.revalidation.listRevalidationTargets, args as never),
})

export const upsertRevalidationTarget = mutation({
  args: upsertRevalidationTargetArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.revalidation.upsertRevalidationTarget, args as never),
})

export const listRevalidationJobs = query({
  args: listRevalidationJobsArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.revalidation.listRevalidationJobs, args as never),
})

export const retryRevalidationJob = mutation({
  args: confirmedArgs(retryRevalidationJobArgs.args),
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.revalidation.retryRevalidationJobOperationExecute,
      args,
    ),
})

export const previewRetryRevalidationJobOperation = mutation({
  args: retryRevalidationJobArgs.args,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.revalidation.previewRetryRevalidationJobOperation,
      args,
    ),
})
