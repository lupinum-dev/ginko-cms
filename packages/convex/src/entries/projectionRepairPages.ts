import type { Doc } from '../_generated/dataModel.js'
import type { MutationCtx } from '../lib/types.js'
import { processCanonicalProjectionRepairPage } from './projectionRepairCanonicalPages.js'
import { processDerivedProjectionRepairPage } from './projectionRepairDerivedPages.js'
import { emptyProjectionResult, type PhaseWork } from './projectionRepairPageSupport.js'

export async function processProjectionRepairPhasePage(
  ctx: MutationCtx,
  run: Doc<'projectionRepairRuns'>,
): Promise<PhaseWork> {
  const canonical = await processCanonicalProjectionRepairPage(ctx, run, emptyProjectionResult())
  if (canonical) return canonical

  const derived = await processDerivedProjectionRepairPage(ctx, run, emptyProjectionResult())
  if (derived) return derived

  throw new Error(`PROJECTION_REPAIR_PHASE_UNSUPPORTED:${run.phase}`)
}
