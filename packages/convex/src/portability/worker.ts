import type { FunctionReference } from 'convex/server'

import type { Id } from '../_generated/dataModel.js'
import {
  assertCmsContractWritable,
  cmsContractWriteToken,
  type CmsContractWriteToken,
} from '../lib/installedContract.js'
import type { MutationCtx } from '../lib/types.js'

export const PORTABLE_WORK_LEASE_MS = 5 * 60_000
const PORTABLE_WORK_MAX_ATTEMPTS = 5
const PORTABLE_WORK_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const

export type PortableWorkLease = {
  runId: string
  generation: number
  token: string
  contractWriteToken: CmsContractWriteToken
}

export type PortableWorkerRefs = {
  run: FunctionReference<'action', 'public' | 'internal', PortableWorkLease, null>
  watchdog: FunctionReference<'mutation', 'public' | 'internal', PortableWorkLease, null>
}

type PortableWorkerRun = {
  _id: Id<'portableRuns'>
  runId: string
  workGeneration: number
  workAttempts: number
}

function safePortableWorkError(error: string): string {
  return error
    .replace(/https?:\/\/[^/@\s]+@/gi, 'https://[redacted]@')
    .replace(/\b(Bearer\s+)[\w.~+/=-]{8,}/gi, '$1[redacted]')
    .replace(/\b(?:mcp|cms|ba)_[\w.~+/=-]{6,}\b/g, '[redacted]')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}\b/g, '[redacted]')
    .replace(
      /\b((?:api[_-]?key|authorization|cookie|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[redacted]',
    )
    .slice(0, 2_000)
}

async function portableWorkLease(
  ctx: MutationCtx,
  runId: string,
  generation: number,
): Promise<PortableWorkLease> {
  return {
    runId,
    generation,
    token: globalThis.crypto.randomUUID(),
    contractWriteToken: cmsContractWriteToken(await assertCmsContractWritable(ctx)),
  }
}

export async function schedulePortableWork(
  ctx: MutationCtx,
  lease: PortableWorkLease,
  refs: PortableWorkerRefs,
  delayMs = 0,
): Promise<void> {
  await ctx.scheduler.runAfter(delayMs, refs.run, lease)
  await schedulePortableWorkWatchdog(ctx, lease, refs, delayMs)
}

async function schedulePortableWorkWatchdog(
  ctx: MutationCtx,
  lease: PortableWorkLease,
  refs: PortableWorkerRefs,
  delayMs = 0,
): Promise<void> {
  await ctx.scheduler.runAfter(delayMs + PORTABLE_WORK_LEASE_MS, refs.watchdog, lease)
}

export function clearPortableWorkFields() {
  return {
    workPhase: null,
    workCursor: null,
    workToken: null,
    workLeaseExpiresAt: null,
    workAttempts: 0,
    workNextAttemptAt: null,
    workLastError: null,
    workDeadLetteredAt: null,
  } as const
}

export async function claimPortableWork(
  ctx: MutationCtx,
  run: PortableWorkerRun,
  refs: PortableWorkerRefs,
  patch: Record<string, unknown>,
  options: { scheduleProcess?: boolean; callerClaim?: boolean } = {},
): Promise<PortableWorkLease> {
  const now = Date.now()
  const lease = await portableWorkLease(ctx, run.runId, run.workGeneration + 1)
  await ctx.db.patch(run._id, {
    ...patch,
    workGeneration: lease.generation,
    workToken: lease.token,
    workLeaseExpiresAt: now + PORTABLE_WORK_LEASE_MS,
    workAttempts: 0,
    workNextAttemptAt: options.callerClaim === true ? null : now,
    workLastError: null,
    workDeadLetteredAt: null,
    updatedAt: now,
  })
  if (options.scheduleProcess === false) {
    await schedulePortableWorkWatchdog(ctx, lease, refs)
  } else {
    await schedulePortableWork(ctx, lease, refs)
  }
  return lease
}

export async function failPortableWork(
  ctx: MutationCtx,
  run: PortableWorkerRun,
  refs: PortableWorkerRefs,
  error: string,
): Promise<{ status: string }> {
  const attempts = run.workAttempts + 1
  const now = Date.now()
  const safeError = safePortableWorkError(error)
  if (attempts >= PORTABLE_WORK_MAX_ATTEMPTS) {
    await ctx.db.patch(run._id, {
      workToken: null,
      workLeaseExpiresAt: null,
      workAttempts: attempts,
      workNextAttemptAt: null,
      workLastError: safeError,
      workDeadLetteredAt: now,
      updatedAt: now,
    })
    return { status: 'dead-lettered' }
  }
  const delay = PORTABLE_WORK_BACKOFF_MS[attempts - 1]!
  const lease = await portableWorkLease(ctx, run.runId, run.workGeneration + 1)
  await ctx.db.patch(run._id, {
    workGeneration: lease.generation,
    workToken: lease.token,
    workLeaseExpiresAt: now + delay + PORTABLE_WORK_LEASE_MS,
    workAttempts: attempts,
    workNextAttemptAt: now + delay,
    workLastError: safeError,
    workDeadLetteredAt: null,
    updatedAt: now,
  })
  await schedulePortableWork(ctx, lease, refs, delay)
  return { status: 'retrying' }
}
