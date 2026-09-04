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
    targetPresentation: jsonObjectValidator,
    targetPresentationHash: v.string(),
    actor: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.contractTransitions.beginContractTransition, args),
})

export const listContractTransitionPage = internalQuery({
  args: {
    runId: v.string(),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.contractTransitions.listContractTransitionPage, args),
})

export const stageContractTransitionPage = internalMutation({
  args: {
    runId: v.string(),
    generation: v.number(),
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
      components.ginkoCms.contractTransitions.stageContractTransitionPage,
      args,
    ),
})

export const validateContractTransitionPage = internalMutation({
  args: {
    runId: v.string(),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.contractTransitions.validateContractTransitionPage,
      args,
    ),
})

export const applyContractTransitionPage = internalMutation({
  args: {
    runId: v.string(),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    actor: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.contractTransitions.applyContractTransitionPage,
      args,
    ),
})

export const activateContractTransition = internalMutation({
  args: { runId: v.string(), generation: v.number(), actor: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.contractTransitions.activateContractTransition, args),
})

export const cancelContractTransition = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.contractTransitions.cancelContractTransition, args),
})

export const getContractTransitionStatus = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.contractTransitions.getContractTransitionStatus, args),
})
