import {
  createMcpKey as createMcpKeyArgs,
  revokeMcpKey as revokeMcpKeyArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/mcpKeys.js'
import { mcpKeyValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

export const entries = [
  {
    exportName: 'list',
    operation: 'query',
    component: 'list',
    args: {},
    returns: v.array(mcpKeyValidator),
  },
  {
    exportName: 'create',
    operation: 'mutation',
    component: 'create',
    args: createMcpKeyArgs.args,
    returns: v.string(),
  },
  {
    exportName: 'revoke',
    operation: 'mutation',
    component: 'revoke',
    args: revokeMcpKeyArgs.args,
    returns: v.null(),
  },
] as const satisfies readonly BridgeEntry[]

export function createMcpKeysBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
