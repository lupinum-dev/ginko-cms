import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'

export const listCollections = query({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.collections.listCollections, args),
})

export const getCollection = query({
  args: getCollectionArgs.args,
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.collections.getCollection, args),
})

export const searchStudioEntries = query({
  args: {
    query: v.string(),
    locale: v.string(),
    collection: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.collections.searchStudioEntries, args),
})
