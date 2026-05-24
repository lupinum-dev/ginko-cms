import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import {
  collectionDocValidator,
  collectionListItemValidator,
  collectionRoutingValidator,
  fieldValidator,
  jsonValueValidator,
  localeTextValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

const installCollectionContractsArgs = {
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

const installCollectionContractsReturns = v.object({
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  missingFromConfig: v.array(v.string()),
})

const checkCollectionContractsReturns = v.object({
  drift: v.array(
    v.object({
      slug: v.string(),
      reason: v.union(v.literal('missing'), v.literal('different')),
      entryCount: v.number(),
      entryCountExact: v.boolean(),
      migrationRequired: v.boolean(),
      safeToPush: v.boolean(),
      changes: v.array(jsonValueValidator),
    }),
  ),
  missingFromConfigDetails: v.array(
    v.object({
      slug: v.string(),
      entryCount: v.number(),
      entryCountExact: v.boolean(),
      migrationRequired: v.boolean(),
      safeToPush: v.boolean(),
    }),
  ),
  missingFromConfig: v.array(v.string()),
})

export const entries = [
  {
    exportName: 'listCollections',
    operation: 'query',
    component: 'listCollections',
    args: {},
    returns: v.array(collectionListItemValidator),
  },
  {
    exportName: 'getCollection',
    operation: 'query',
    component: 'getCollection',
    args: getCollectionArgs.args,
    returns: v.union(v.null(), collectionDocValidator),
  },
  {
    exportName: 'checkCollectionContracts',
    operation: 'internalQuery',
    component: 'sync.checkCollectionContractsInternal',
    args: installCollectionContractsArgs,
    returns: checkCollectionContractsReturns,
    forwardIdentity: false,
  },
  {
    exportName: 'installCollectionContracts',
    operation: 'internalMutation',
    component: 'sync.installCollectionContractsInternal',
    args: installCollectionContractsArgs,
    returns: installCollectionContractsReturns,
    forwardIdentity: false,
  },
] as const satisfies readonly BridgeEntry[]

export function createCollectionContractsBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
