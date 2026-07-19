import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

const budgets = {
  // W8 decomposition: the ~2150-line browser was split into a shell + focused
  // ./assets components behind a provided context seam. The shell now owns only
  // props/expose, the finder call, context assembly, the split-pane skeleton and
  // the view dispatch; the toolbar and manage drawer are the two heaviest leaves.
  'packages/cms/studio-app/src/components/studio/StudioAssetBrowser.vue': 480,
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetToolbar.vue': 300,
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetManageDrawer.vue': 280,
  'packages/cms/studio-app/src/composables/internal/studioAssetBrowserContext.ts': 480,
  // Finder orchestration keeps reactive state and mutations; deterministic
  // browsing/filtering/sorting lives in the pure item builder.
  'packages/cms/studio-app/src/composables/internal/useStudioAssetFinder.ts': 800,
  'packages/cms/studio-app/src/composables/internal/assetFinderItems.ts': 250,
  // Collection orchestration stays in the route while the flat and tree row
  // renderers share one typed presentation model. The editor keeps lifecycle
  // and conversion synchronization in its shell; media commands and scoped
  // presentation styles have focused owners.
  'packages/cms/studio-app/src/pages/[collection]/index.vue': 730,
  'packages/cms/studio-app/src/components/studio/collections/StudioCollectionFlatList.vue': 130,
  'packages/cms/studio-app/src/components/studio/collections/StudioCollectionTreeList.vue': 150,
  'packages/cms/studio-app/src/lib/studioCollectionRows.ts': 160,
  'packages/cms/studio-app/src/editor/ui/Editor.vue': 720,
  'packages/cms/studio-app/src/editor/ui/Editor.css': 360,
  'packages/cms/studio-app/src/editor/model/useEditorMedia.ts': 160,
  // The package keeps one stable Convex validator entry point. Focused modules
  // own canonical domain validators; the entry point only re-exports them.
  'packages/contract/src/validators.ts': 150,
  'packages/contract/src/validators/foundation.ts': 160,
  'packages/contract/src/validators/model.ts': 120,
  'packages/contract/src/validators/readiness.ts': 140,
  'packages/contract/src/validators/assets.ts': 90,
  'packages/contract/src/validators/access.ts': 60,
  'packages/contract/src/validators/diagnostics.ts': 280,
  'packages/contract/src/validators/siteData.ts': 50,
  'packages/contract/src/validators/editor.ts': 430,
  'packages/contract/src/validators/public.ts': 260,
  'packages/contract/src/validators/routes.ts': 30,
  'packages/contract/src/validators/collections.ts': 80,
  // Public Convex function paths remain registered in one small module while
  // focused handlers own projection mapping, page lookup and discovery reads.
  'packages/convex/src/public.ts': 130,
  'packages/convex/src/publicReads/validation.ts': 160,
  'packages/convex/src/publicReads/entries.ts': 500,
  'packages/convex/src/publicReads/pageHandlers.ts': 240,
  'packages/convex/src/publicReads/navigationHandlers.ts': 240,
  'packages/convex/src/publicReads/discoveryHandlers.ts': 320,
  'packages/convex/src/publicReads/siteHandlers.ts': 160,
  // Workflow callers retain one stable import surface. Focused command modules
  // own draft creation, publication activation, lifecycle, and history.
  'packages/convex/src/entries/workflow/commands.ts': 30,
  'packages/convex/src/entries/workflow/draftCommands.ts': 340,
  'packages/convex/src/entries/workflow/publicationCommands.ts': 480,
  'packages/convex/src/entries/workflow/lifecycleCommands.ts': 320,
  'packages/convex/src/entries/workflow/historyCommands.ts': 300,
  'packages/convex/src/entries/workflow/historyPlacement.ts': 90,
  // The public-tree import surface stays stable while path resolution,
  // placement/collision policy, and redirect validation have focused owners.
  'packages/convex/src/entries/workflow/publicTree.ts': 60,
  'packages/convex/src/entries/workflow/publicTree/model.ts': 40,
  'packages/convex/src/entries/workflow/publicTree/pathResolution.ts': 420,
  'packages/convex/src/entries/workflow/publicTree/placement.ts': 160,
  'packages/convex/src/entries/workflow/publicTree/redirectPlacement.ts': 180,
  'packages/convex/src/entries/workflow/publicTree/redirects.ts': 390,
  // Redirect registrations own the guarded lifecycle; indexed inventory and
  // its scope-bound keyset cursor stay in the focused read helper.
  'packages/convex/src/redirects.ts': 240,
  'packages/convex/src/redirects/inventory.ts': 220,
  // Diagnostics keeps the historical query registration/export surface while
  // focused modules own visibility reasoning, publish impact, and shared route facts.
  'packages/convex/src/diagnostics.ts': 80,
  'packages/convex/src/diagnostics/shared.ts': 360,
  'packages/convex/src/diagnostics/visibility.ts': 500,
  'packages/convex/src/diagnostics/publishImpact.ts': 700,
  // Contract transition registrations stay at the historical public module;
  // focused helpers own canonical validation, staging, apply, and lifecycle.
  'packages/convex/src/contractTransitions.ts': 180,
  'packages/convex/src/contractTransitions/model.ts': 400,
  'packages/convex/src/contractTransitions/staging.ts': 320,
  'packages/convex/src/contractTransitions/apply.ts': 250,
  'packages/convex/src/contractTransitions/lifecycle.ts': 220,
  'packages/convex/src/entries/read.ts': 300,
  'packages/convex/src/entries/studioRows.ts': 260,
  'packages/convex/src/entries/studioSummary.ts': 260,
  'packages/convex/src/entries/studioInventory.ts': 350,
  'packages/convex/src/entries/studioOverview.ts': 260,
  'packages/convex/src/entries/studioKeyset.ts': 300,
  'packages/convex/src/entries/studioSearchIndex.ts': 160,
  'packages/convex/src/entries/history.ts': 300,
  'packages/convex/src/entries/activity.ts': 280,
  // Durable repair registrations own run/lease state; bounded scan mechanics
  // and retry policy remain independently reviewable focused helpers.
  'packages/convex/src/entries/projectionMaintenance.ts': 700,
  'packages/convex/src/entries/projectionRepairPages.ts': 420,
  'packages/convex/src/entries/projectionRepairWorker.ts': 120,
  // Publication registration remains on its stable module while the focused
  // helper owns confirmation/review authorization and receipt parity.
  'packages/convex/src/entries/publish.ts': 950,
  'packages/convex/src/entries/publicationApproval.ts': 150,
  'packages/convex/src/reviewRequests.ts': 750,
  // Disposable certification setup and cleanup are deployment-admin-only,
  // page-bounded modules. Keep their data construction and teardown owners separate.
  'packages/convex/src/liveFixtures.ts': 520,
  'packages/convex/src/liveFixtures/cleanup.ts': 320,
  'packages/convex/src/operationHelpers.ts': 700,
  'packages/convex/src/operationHash.ts': 40,
  // Asset Convex registrations remain stable in the two public modules while
  // focused helpers own upload cleanup, replacement, purge, scope, and archive codec.
  'packages/convex/src/assets.ts': 900,
  'packages/convex/src/assets/uploadSessions.ts': 500,
  'packages/convex/src/assets/cleanupOperations.ts': 420,
  'packages/convex/src/assets/replacement.ts': 700,
  'packages/convex/src/assets/replacementUpload.ts': 420,
  'packages/convex/src/assets/scope.ts': 180,
  'packages/convex/src/assets/storageOwnership.ts': 100,
  'packages/convex/src/assets/purge.ts': 120,
  'packages/convex/src/assets/purgeOperation.ts': 240,
  'packages/convex/src/assets/purgeExecution.ts': 230,
  'packages/convex/src/assetRecovery.ts': 900,
  'packages/convex/src/assetRecovery/archive.ts': 380,
  'packages/convex/src/assetRecovery/verification.ts': 260,
  // Revalidation keeps every historical Convex registration in the root
  // module. Focused modules own target policy, retry semantics, and the
  // generation-fenced outbox delivery worker.
  'packages/convex/src/revalidation.ts': 200,
  'packages/convex/src/revalidation/targets.ts': 280,
  'packages/convex/src/revalidation/retryOperation.ts': 120,
  'packages/convex/src/revalidation/worker.ts': 380,
  // Portability keeps Convex registrations at their historical module paths,
  // while focused modules own status, planning, workers, lifecycle, and cleanup.
  'packages/convex/src/portability/runs.ts': 100,
  'packages/convex/src/portability/runStatus.ts': 400,
  'packages/convex/src/portability/importPlanning.ts': 400,
  'packages/convex/src/portability/importWorker.ts': 650,
  'packages/convex/src/portability/importLifecycle.ts': 750,
  'packages/convex/src/portability/importModel.ts': 100,
  'packages/convex/src/portability/portableJson.ts': 100,
  'packages/convex/src/portability/exports.ts': 850,
  'packages/convex/src/portability/exportPreflight.ts': 425,
  'packages/convex/src/portability/exportCleanup.ts': 500,
  'packages/convex/src/portability/exportModel.ts': 100,
} as const

describe('maintainability size budgets', () => {
  it('prevents the reviewed ownership boundaries from growing again', () => {
    for (const [file, maxLines] of Object.entries(budgets)) {
      const lines = readFileSync(resolve(root, file), 'utf8').split('\n').length
      expect(lines, `${file} exceeds its ${maxLines}-line reviewed budget`).toBeLessThanOrEqual(
        maxLines,
      )
    }
  })
})
