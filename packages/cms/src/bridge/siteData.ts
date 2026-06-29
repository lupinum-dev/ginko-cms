import {
  createSiteDataBlock as createSiteDataBlockArgs,
  deleteSiteDataBlock as deleteSiteDataBlockArgs,
  getSiteDataBlock as getSiteDataBlockArgs,
  saveSiteData as saveSiteDataArgs,
  updateSiteDataBlock as updateSiteDataBlockArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/siteData.js'
import {
  siteDataBlockValidator,
  siteDataListItemValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { cmsOperationPreviewValidator } from './operation-runtime'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

export const entries = [
  {
    exportName: 'listSiteData',
    operation: 'query',
    component: 'listSiteData',
    args: {},
    returns: v.array(siteDataListItemValidator),
  },
  {
    exportName: 'getSiteDataBlock',
    operation: 'query',
    component: 'getSiteDataBlock',
    args: getSiteDataBlockArgs.args,
    returns: siteDataBlockValidator,
  },
  {
    exportName: 'createSiteDataBlock',
    operation: 'mutation',
    component: 'createSiteDataBlock',
    args: createSiteDataBlockArgs.args,
    returns: v.string(),
  },
  {
    exportName: 'saveSiteData',
    operation: 'mutation',
    component: 'saveSiteData',
    args: saveSiteDataArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'updateSiteDataBlock',
    operation: 'mutation',
    component: 'updateSiteDataBlock',
    args: updateSiteDataBlockArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'deleteSiteDataBlock',
    operation: 'mutation',
    component: 'deleteSiteDataBlockOperationExecute',
    args: confirmedArgs(deleteSiteDataBlockArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'previewDeleteSiteDataBlockOperation',
    operation: 'mutation',
    component: 'previewDeleteSiteDataBlockOperation',
    args: deleteSiteDataBlockArgs.args,
    returns: cmsOperationPreviewValidator(),
  },
] as const satisfies readonly BridgeEntry[]

export function createSiteDataBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
