import type { FunctionReference } from 'convex/server'

import type { Doc } from '../_generated/dataModel.js'
import type { MutationCtx } from '../lib/types.js'
import type { RepairPhase } from './projectionMaintenance.js'

export const PROJECTION_REPAIR_LEASE_MS = 60_000
export const PROJECTION_REPAIR_MAX_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [1_000, 2_000] as const

export type ProjectionRepairLease = {
  runId: string
  generation: number
  workGeneration: number
  token: string
  expectedPhase: RepairPhase
  expectedCursor: string | null
}

export type ProjectionRepairWorkerRefs = {
  run: FunctionReference<'action', 'public' | 'internal', ProjectionRepairLease, null>
  watchdog: FunctionReference<'mutation', 'public' | 'internal', ProjectionRepairLease, null>
}

export function createProjectionRepairLease(
  run: Pick<Doc<'projectionRepairRuns'>, 'runId' | 'generation' | 'phase' | 'cursor'>,
  workGeneration: number,
): ProjectionRepairLease {
  return {
    runId: run.runId,
    generation: run.generation,
    workGeneration,
    token: globalThis.crypto.randomUUID(),
    expectedPhase: run.phase,
    expectedCursor: run.cursor,
  }
}

export function projectionRepairLeasePatch(lease: ProjectionRepairLease, now: number) {
  return {
    workGeneration: lease.workGeneration,
    workToken: lease.token,
    workLeaseExpiresAt: now + PROJECTION_REPAIR_LEASE_MS,
  } as const
}

export async function scheduleProjectionRepairLease(
  ctx: MutationCtx,
  lease: ProjectionRepairLease,
  refs: ProjectionRepairWorkerRefs,
  delayMs = 0,
) {
  await ctx.scheduler.runAfter(delayMs, refs.run, lease)
  await ctx.scheduler.runAfter(delayMs + PROJECTION_REPAIR_LEASE_MS, refs.watchdog, lease)
}

function safeRepairError(error: string) {
  return error
    .replace(/\b(Bearer\s+)[\w.~+/=-]{8,}/giu, '$1[redacted]')
    .replace(/\b(?:mcp|cms|ba)_[\w.~+/=-]{6,}\b/giu, '[redacted]')
    .replace(/\b(password|secret|token)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .slice(0, 2_000)
}

export async function failProjectionRepairLease(
  ctx: MutationCtx,
  run: Doc<'projectionRepairRuns'>,
  refs: ProjectionRepairWorkerRefs,
  error: string,
) {
  const attempts = run.workAttempts + 1
  const now = Date.now()
  const workLastError = safeRepairError(error)
  if (attempts >= PROJECTION_REPAIR_MAX_ATTEMPTS) {
    await ctx.db.patch(run._id, {
      state: 'dead',
      workToken: null,
      workLeaseExpiresAt: null,
      workAttempts: attempts,
      workNextAttemptAt: null,
      workLastError,
      workDeadLetteredAt: now,
      updatedAt: now,
    })
    return 'dead-lettered' as const
  }

  const delayMs = RETRY_BACKOFF_MS[attempts - 1]!
  const lease = createProjectionRepairLease(run, run.workGeneration + 1)
  await ctx.db.patch(run._id, {
    ...projectionRepairLeasePatch(lease, now + delayMs),
    workAttempts: attempts,
    workNextAttemptAt: now + delayMs,
    workLastError,
    workDeadLetteredAt: null,
    updatedAt: now,
  })
  if (run.autoContinue) {
    await scheduleProjectionRepairLease(ctx, lease, refs, delayMs)
  }
  return 'retrying' as const
}
