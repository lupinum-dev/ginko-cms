import type { ActivityOutcome, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../_generated/dataModel.js'
import type { MutationCtx } from './types.js'

function activityOutcomeSignal(value: unknown): ActivityOutcome | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'stale' || normalized === 'expired' || normalized === 'outdated') {
    return 'stale'
  }
  if (normalized === 'blocked' || normalized === 'denied' || normalized === 'forbidden') {
    return 'blocked'
  }
  if (
    normalized === 'failed' ||
    normalized === 'failure' ||
    normalized === 'terminal-failure' ||
    normalized === 'dead'
  ) {
    return 'failed'
  }
  return null
}

export function inferActivityOutcome(args: {
  kind: string
  summary: string
  detail?: Record<string, JsonValue> | null
}): ActivityOutcome {
  const detailOutcome =
    activityOutcomeSignal(args.detail?.outcome) ?? activityOutcomeSignal(args.detail?.status)
  if (detailOutcome) return detailOutcome

  const signal = `${args.kind} ${args.summary}`.toLowerCase()
  if (/\b(?:stale|expired|outdated|superseded)\b/u.test(signal)) return 'stale'
  if (/\b(?:blocked|denied|forbidden|unauthorized)\b/u.test(signal)) return 'blocked'
  if (
    /\b(?:failed|failure|error|dead-lettered)\b/u.test(signal) ||
    /deliveryfailed/u.test(signal)
  ) {
    return 'failed'
  }
  return 'applied'
}

export async function logActivity(
  ctx: MutationCtx,
  args: {
    kind: string
    outcome?: ActivityOutcome
    summary: string
    retention?: 'standard' | 'legal'
    appIdentityId: string
    entryId?: Id<'entries'> | null
    collection?: string | null
    locale?: string | null
    detail?: Record<string, JsonValue> | null
    subjectKey?: string | null
    createdAt?: number
  },
) {
  // Resolve the actor's display name at write time so the audit trail keeps
  // the name the actor had when they acted.
  const member = await ctx.db
    .query('members')
    .withIndex('by_userId', (query) => query.eq('userId', args.appIdentityId))
    .first()

  await ctx.db.insert('activity', {
    kind: args.kind,
    outcome: args.outcome ?? inferActivityOutcome(args),
    summary: args.summary,
    retention: args.retention ?? 'standard',
    appIdentityId: args.appIdentityId,
    entryId: args.entryId ?? null,
    collection: args.collection ?? null,
    locale: args.locale ?? null,
    detail: args.detail ?? null,
    subjectKey: args.subjectKey ?? null,
    actorLabel: member?.displayName ?? member?.email ?? null,
    createdAt: args.createdAt ?? Date.now(),
  })
}
