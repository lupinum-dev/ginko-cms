import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../_generated/dataModel.js'
import type { MutationCtx } from './types.js'

type RevalidationEventInput = {
  idempotencyKey: string
  versionId: string | null
  tags: string[]
  paths: string[]
  payload: JsonObject
  now: number
}

export async function enqueueRevalidationEvent(
  ctx: MutationCtx,
  input: RevalidationEventInput,
): Promise<{ id: Id<'outboxEvents'>; inserted: boolean }> {
  const existing = await ctx.db
    .query('outboxEvents')
    .withIndex('by_idempotency_key', (query) => query.eq('idempotencyKey', input.idempotencyKey))
    .first()
  if (existing) return { id: existing._id, inserted: false }

  const id = await ctx.db.insert('outboxEvents', {
    type: 'content.revalidate',
    status: 'pending',
    idempotencyKey: input.idempotencyKey,
    versionId: input.versionId,
    targetId: null,
    tags: [...new Set(input.tags)],
    paths: [...new Set(input.paths)],
    payload: input.payload,
    attempts: 0,
    deliveryGeneration: 0,
    leaseId: null,
    nextAttemptAt: input.now,
    lastError: null,
    lockedAt: null,
    lockExpiresAt: null,
    deliveredAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  })
  return { id, inserted: true }
}
