// @ts-nocheck - Excluded from the host type program on purpose.
// listContentMigrationEntries / applyContentMigrationEntries wrap
// component-INTERNAL functions that are intentionally NOT exposed on the
// generated ComponentApi<"ginkoCms"> host boundary (there is no `migrations`
// member); the CLI `ginko-cms migrate` reaches them via anyApi at runtime.
// They cannot typecheck against the typed `components` reference, and a plain
// tsconfig `exclude` cannot drop this file because _generated/api.d.ts pulls it
// back in via `import type`. Do not "fix" this by exposing the internal
// component functions.
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
