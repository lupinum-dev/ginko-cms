import {
  applyImport as applyImportArgs,
  listImportRuns as listImportRunsArgs,
  previewImport as previewImportArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/imports.js'
import {
  importPreviewResultValidator,
  importResultValidator,
  jsonObjectValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

export const entries = [
  {
    exportName: 'previewImport',
    operation: 'mutation',
    component: 'previewImport',
    args: previewImportArgs.args,
    returns: importPreviewResultValidator,
  },
  {
    exportName: 'applyImport',
    operation: 'mutation',
    component: 'applyImport',
    args: applyImportArgs.args,
    returns: importResultValidator,
  },
  {
    exportName: 'listImportRuns',
    operation: 'query',
    component: 'listImportRuns',
    args: listImportRunsArgs.args,
    returns: v.array(jsonObjectValidator),
  },
] as const satisfies readonly BridgeEntry[]

export function createImportsBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
