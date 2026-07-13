import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'

import { components } from '../_generated/api.js'
import { query } from '../_generated/server.js'

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
