import { getEntry as getEntryArgs } from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  entryReadinessDetailValidator,
  studioEntryValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import { canRead } from '../auth/checks.js'
import { attachEntryRecordAccess } from '../auth/recordAccess.js'
import { callerQuery } from '../functions.js'
import type { HandlerQueryCtx } from '../lib/types.js'
import { buildStudioEntry } from './context.js'
import { computeEntryReadinessDetail, computeEntryReadinessSummary } from './readiness.js'

export const getEntry = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'editor:getEntry',
  args: getEntryArgs.args,
  guard: canRead,
  returns: v.union(v.null(), studioEntryValidator),
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entryId = ctx.db.normalizeId('entries', args.id)
    const entry = entryId ? await ctx.db.get(entryId) : null
    if (!entry) return null
    return attachEntryRecordAccess(
      await ctx.appIdentity(),
      await buildStudioEntry(ctx, entry, args.locale),
    )
  },
})

export const getEntryReadinessDetail = callerQuery.protected({
  acceptsTrustedCaller: true,
  id: 'editor:getEntryReadinessDetail',
  args: { entryId: v.string() },
  guard: canRead,
  returns: entryReadinessDetailValidator,
  handler: async (ctx: HandlerQueryCtx, args) => computeEntryReadinessDetail(ctx, args),
})

export const getEntryReadinessSummary = callerQuery.protected({
  id: 'editor:getEntryReadinessSummary',
  args: { entryId: v.string() },
  guard: canRead,
  returns: entryReadinessDetailValidator,
  handler: async (ctx: HandlerQueryCtx, args) => computeEntryReadinessSummary(ctx, args),
})
