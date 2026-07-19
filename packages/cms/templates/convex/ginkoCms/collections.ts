import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'
import { bindMcpCaller, mcpCallerArgs } from './mcpCaller.js'

export const listCollections = query({
  args: { ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.collections.listCollections,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/collections:listCollections'),
    ),
})

export const getCollection = query({
  args: { ...getCollectionArgs.args, ...mcpCallerArgs },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.ginkoCms.collections.getCollection,
      await bindMcpCaller(ctx, args, 'query:ginkoCms/collections:getCollection'),
    ),
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
