/* eslint-disable */
import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { components } from '../_generated/api.js'
import { internalMutation, internalQuery } from '../_generated/server.js'

const contentMigrationLocaleValidator = v.union(
  v.object({
    values: jsonObjectValidator,
    bodyMdc: v.optional(v.union(v.string(), v.null())),
  }),
  v.null(),
)

const contentMigrationEntryValidator = v.object({
  collection: v.string(),
  entryId: v.string(),
  stableId: v.union(v.string(), v.null()),
  draftVersion: v.number(),
  shared: jsonObjectValidator,
  locales: v.record(v.string(), contentMigrationLocaleValidator),
})

export const listContentMigrationEntries = internalQuery({
  args: {
    collection: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.migrations.listContentMigrationEntries, args as never),
})

export const applyContentMigrationEntries = internalMutation({
  args: {
    migrationId: v.string(),
    entries: v.array(contentMigrationEntryValidator),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      components.ginkoCms.migrations.applyContentMigrationEntries,
      args as never,
    ),
})
