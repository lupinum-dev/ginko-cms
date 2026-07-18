import type { Doc } from '../_generated/dataModel.js'
import type { QueryOrMutationCtx } from '../lib/types.js'

export type ExportRun = Extract<Doc<'portableRuns'>, { mode: 'export' }>
export type ExportCallerCtx = QueryOrMutationCtx & {
  appIdentity: () => Promise<{ userId: string }>
}

export function requireExportRun(run: Doc<'portableRuns'> | null): ExportRun {
  if (!run || run.mode !== 'export') throw new Error('Portable export run not found.')
  return run
}

export async function getExportRun(ctx: QueryOrMutationCtx, runId: string): Promise<ExportRun> {
  return requireExportRun(
    await ctx.db
      .query('portableRuns')
      .withIndex('by_run_id', (query) => query.eq('runId', runId))
      .unique(),
  )
}

export async function requireOwnedExport(ctx: ExportCallerCtx, runId: string): Promise<ExportRun> {
  const identity = await ctx.appIdentity()
  const run = await getExportRun(ctx, runId)
  if (run.callerId !== identity.userId) {
    throw new Error('Portable export belongs to another caller.')
  }
  return run
}
