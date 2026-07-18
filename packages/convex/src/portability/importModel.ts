import type { Doc } from '../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../lib/types.js'

export type ImportRun = Extract<Doc<'portableRuns'>, { mode: 'import' }>

export async function getImportRunByPlan(
  ctx: QueryOrMutationCtx,
  planId: string,
): Promise<ImportRun> {
  const plan = await ctx.db
    .query('portableRuns')
    .withIndex('by_plan_id', (query) => query.eq('planId', planId))
    .unique()
  if (!plan || plan.mode !== 'import') throw new Error('Portable plan not found.')
  return plan
}

export async function getImportRun(ctx: QueryOrMutationCtx, runId: string): Promise<ImportRun> {
  const run = await ctx.db
    .query('portableRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', runId))
    .unique()
  if (!run || run.mode !== 'import') throw new Error('Portable import run not found.')
  return run
}

export async function readActiveAssetMatch(
  ctx: QueryOrMutationCtx,
  input: { sha256: string; bytes: number; mediaType: string },
) {
  const active = await ctx.db
    .query('assets')
    .withIndex('by_sha256_active_facts', (query) =>
      query.eq('sha256', input.sha256).eq('deletedAt', null),
    )
    .first()
  const exact = await ctx.db
    .query('assets')
    .withIndex('by_sha256_active_facts', (query) =>
      query
        .eq('sha256', input.sha256)
        .eq('deletedAt', null)
        .eq('size', input.bytes)
        .eq('mimeType', input.mediaType),
    )
    .first()
  return { active, exact }
}

export function requireCurrentImportRun(
  run: ImportRun,
  args: { callerId: string; payloadSha256: string; state: ImportRun['state'] },
) {
  if (run.callerId !== args.callerId) throw new Error('Portable run belongs to another caller.')
  if (run.payloadSha256 !== args.payloadSha256) throw new Error('Portable run payload mismatch.')
  if (run.expiresAt <= Date.now()) throw new Error('Portable run expired.')
  if (run.state !== args.state) {
    throw new Error(`Portable run state is ${run.state}, expected ${args.state}.`)
  }
}
