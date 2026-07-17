import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../_generated/dataModel.js'
import type { MutationCtx } from './types.js'

export async function logActivity(
  ctx: MutationCtx,
  args: {
    kind: string
    summary: string
    appIdentityId: string
    entryId?: Id<'entries'> | null
    collection?: string | null
    locale?: string | null
    detail?: Record<string, JsonValue> | null
    createdAt?: number
  },
) {
  // Resolve the actor's display name at write time so the audit trail keeps
  // the name the actor had when they acted. listActivity still resolves
  // missing labels at read time for rows written before this field existed.
  const member = await ctx.db
    .query('members')
    .withIndex('by_userId', (query) => query.eq('userId', args.appIdentityId))
    .first()

  await ctx.db.insert('activity', {
    kind: args.kind,
    summary: args.summary,
    appIdentityId: args.appIdentityId,
    entryId: args.entryId ?? null,
    collection: args.collection ?? null,
    locale: args.locale ?? null,
    detail: args.detail ?? null,
    actorLabel: member?.displayName ?? member?.email ?? null,
    createdAt: args.createdAt ?? Date.now(),
  })
}
