// @ts-nocheck - Component-internal maintenance functions are intentionally
// absent from the public ComponentApi type. These host-internal wrappers are
// reached only by the deploy-key authenticated ginko-cms migrate CLI.
import {
  jsonObjectValidator,
  jsonValueValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
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

export const beginContentMigration = internalMutation({
  args: {
    migrationId: v.string(),
    sourceHash: v.string(),
    toContractHash: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.beginContentMigration, args as never),
})

export const listContentMigrationEntries = internalQuery({
  args: {
    collection: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await ctx.runQuery(components.ginkoCms.migrations.listContentMigrationEntries, args as never),
})

export const applyContentMigrationBatch = internalMutation({
  args: {
    runId: v.string(),
    cursor: v.string(),
    entries: v.array(
      v.object({
        inputHash: v.string(),
        outputHash: v.string(),
        entry: contentMigrationEntryValidator,
      }),
    ),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.applyContentMigrationBatch, args as never),
})

export const finalizeContentMigration = internalMutation({
  args: {
    runId: v.string(),
    contract: jsonValueValidator,
    contractSha256: v.string(),
    publicStrategy: v.union(v.literal('preserve'), v.literal('rebuild'), v.literal('unpublish')),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.finalizeContentMigration, args as never),
})

export const activateContentMigration = internalMutation({
  args: {
    runId: v.string(),
    contract: jsonValueValidator,
    contractSha256: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(components.ginkoCms.migrations.activateContentMigration, args as never),
})
