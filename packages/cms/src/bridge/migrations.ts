import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

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

export const entries = [
  {
    exportName: 'listContentMigrationEntries',
    operation: 'internalQuery',
    component: 'listContentMigrationEntriesInternal',
    args: {
      collection: v.string(),
      cursor: v.union(v.string(), v.null()),
      limit: v.optional(v.number()),
    },
    returns: v.object({
      page: v.array(contentMigrationEntryValidator),
      isDone: v.boolean(),
      continueCursor: v.union(v.string(), v.null()),
    }),
    forwardIdentity: false,
  },
  {
    exportName: 'applyContentMigrationEntries',
    operation: 'internalMutation',
    component: 'applyContentMigrationEntriesInternal',
    args: {
      migrationId: v.string(),
      entries: v.array(contentMigrationEntryValidator),
    },
    returns: v.object({
      migrationId: v.string(),
      changed: v.number(),
      unchanged: v.number(),
    }),
    forwardIdentity: false,
  },
] as const satisfies readonly BridgeEntry[]

export function createMigrationsBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
