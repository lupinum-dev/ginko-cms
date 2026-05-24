import { updateSettings as updateSettingsArgs } from '@lupinum/ginko-cms-contract/convex/schemas/settings.js'
import {
  cmsSettingsValidator,
  studioSettingsValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

export const entries = [
  {
    exportName: 'getStudioSettings',
    operation: 'query',
    component: 'getStudioSettings',
    args: {},
    returns: studioSettingsValidator,
  },
  {
    exportName: 'getSettings',
    operation: 'query',
    component: 'getSettings',
    args: {},
    returns: cmsSettingsValidator,
  },
  {
    exportName: 'updateSettings',
    operation: 'mutation',
    component: 'updateSettings',
    args: updateSettingsArgs.args,
    returns: v.null(),
  },
] as const satisfies readonly BridgeEntry[]

export function createSettingsBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
