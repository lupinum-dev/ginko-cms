// Contract sync is private at the host boundary: only these internal wrappers
// expose the component operations to the admin-authenticated CLI.
import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import {
  collectionRoutingValidator,
  fieldValidator,
  jsonValueValidator,
  localeTextValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery, query } from '../_generated/server.js'

const collectionContractsArgs = {
  collections: v.array(
    v.object({
      slug: v.string(),
      label: v.optional(localeTextValidator),
      icon: v.optional(v.string()),
      type: v.union(v.literal('flat'), v.literal('tree')),
      routing: collectionRoutingValidator,
      locales: v.array(v.string()),
      fields: v.optional(v.array(fieldValidator)),
      settings: v.optional(jsonValueValidator),
    }),
  ),
}

export const listCollections = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.collections.listCollections, args as never),
})

export const getCollection = query({
  args: getCollectionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.collections.getCollection, args as never),
})

export const checkCollectionContracts = internalQuery({
  args: collectionContractsArgs,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.collections.checkCollectionContracts, args as never),
})

export const installCollectionContracts = internalMutation({
  args: collectionContractsArgs,
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.collections.installCollectionContracts,
      args as never,
    ),
})
