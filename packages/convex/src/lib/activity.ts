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
    collectionId?: Id<'collections'> | null
    locale?: string | null
    detail?: Record<string, JsonValue> | null
    createdAt?: number
  },
) {
  await ctx.db.insert('activity', {
    kind: args.kind,
    summary: args.summary,
    appIdentityId: args.appIdentityId,
    entryId: args.entryId ?? null,
    collectionId: args.collectionId ?? null,
    locale: args.locale ?? null,
    detail: args.detail ?? null,
    createdAt: args.createdAt ?? Date.now(),
  })
}
