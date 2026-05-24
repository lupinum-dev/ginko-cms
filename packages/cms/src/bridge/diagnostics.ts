import {
  explainPublicVisibility as explainPublicVisibilityArgs,
  previewPublishImpact as previewPublishImpactArgs,
  validatePublicRoutes as validatePublicRoutesArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'
import {
  ginkoPublicVisibilityExplanationValidator,
  ginkoPublishImpactResultValidator,
  ginkoRouteDiagnosticValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { createBridgeModule, type BridgeEntry } from './create.js'

const storageTableCountsValidator = v.object({
  entries: v.number(),
  entryDrafts: v.number(),
  entryRevisions: v.number(),
  publicEntries: v.number(),
  contentAssetRefs: v.number(),
  outboxEvents: v.number(),
  activity: v.number(),
  collectionImportRuns: v.number(),
  backupArtifacts: v.number(),
  softDeletedAssets: v.number(),
})

const storageDistributionValidator = v.object({
  max: v.number(),
  average: v.number(),
})

const storageHygieneReportValidator = v.object({
  counts: storageTableCountsValidator,
  revisionsPerEntry: storageDistributionValidator,
  assetRefsPerEntry: storageDistributionValidator,
  outbox: v.object({
    delivered: v.number(),
    failed: v.number(),
    pending: v.number(),
    delivering: v.number(),
  }),
  backupArtifacts: v.number(),
  scanLimit: v.number(),
  truncatedTables: v.array(v.string()),
})

export const entries = [
  {
    exportName: 'validatePublicRoutes',
    operation: 'query',
    component: 'validatePublicRoutes',
    args: validatePublicRoutesArgs.args,
    returns: v.array(ginkoRouteDiagnosticValidator),
  },
  {
    exportName: 'explainPublicVisibility',
    operation: 'query',
    component: 'explainPublicVisibility',
    args: explainPublicVisibilityArgs.args,
    returns: ginkoPublicVisibilityExplanationValidator,
  },
  {
    exportName: 'previewPublishImpact',
    operation: 'query',
    component: 'previewPublishImpact',
    args: previewPublishImpactArgs.args,
    returns: ginkoPublishImpactResultValidator,
  },
  {
    exportName: 'storageHygieneReport',
    operation: 'query',
    component: 'storageHygieneReport',
    args: {},
    returns: storageHygieneReportValidator,
  },
] as const satisfies readonly BridgeEntry[]

export function createDiagnosticsBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, unknown>
}) {
  return createBridgeModule(options.component, options.components, entries)
}
