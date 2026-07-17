// @ts-nocheck - Component-internal maintenance functions are intentionally
// absent from the public ComponentApi type. Only the deploy-key authenticated
// owner CLI can invoke these host-internal wrappers.
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery } from '../_generated/server.js'

const nodeKindValidator = v.union(
  v.literal('page'),
  v.literal('folder'),
  v.literal('group'),
  v.literal('section'),
  v.null(),
)

const transitionOutputValidator = v.object({
  slug: v.string(),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  shared: jsonObjectValidator,
  locales: v.record(
    v.string(),
    v.object({
      slug: v.union(v.string(), v.null()),
      values: jsonObjectValidator,
      bodyMdc: v.string(),
    }),
  ),
})

export const beginContractTransition = internalMutation({
  args: {
    runKey: v.string(),
    targetContent: jsonObjectValidator,
    targetContentHash: v.string(),
    actor: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.beginContractTransition, args as never),
})

export const listContractTransitionPage = internalQuery({
  args: {
    runId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.migrations.listContractTransitionPage, args as never),
})

export const stageContractTransitionPage = internalMutation({
  args: {
    runId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    items: v.array(
      v.object({
        entryId: v.string(),
        inputDraftVersion: v.number(),
        inputHash: v.string(),
        outputHash: v.string(),
        output: transitionOutputValidator,
      }),
    ),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.migrations.stageContractTransitionPage,
      args as never,
    ),
})

export const applyContractTransitionPage = internalMutation({
  args: {
    runId: v.string(),
    limit: v.optional(v.number()),
    actor: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.migrations.applyContractTransitionPage,
      args as never,
    ),
})

export const activateContractTransition = internalMutation({
  args: { runId: v.string(), actor: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.activateContractTransition, args as never),
})

export const cancelContractTransition = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.cancelContractTransition, args as never),
})

export const getContractTransitionStatus = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.migrations.getContractTransitionStatus, args as never),
})
