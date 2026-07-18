import {
  getEntryActivity as getEntryActivityArgs,
  listActivity as listActivityArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  activityListResultValidator,
  entryActivityListResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'

import { canPublishEntries, canRead } from '../auth/checks.js'
import { callerQuery } from '../functions.js'
import type { HandlerQueryCtx } from '../lib/types.js'
import {
  activityScopeKey,
  boundedActivityLimit,
  encodeActivityCursor,
  encodeEntryActivityCursor,
  normalizeActivityFilter,
  parseActivityCursor,
  parseEntryActivityCursor,
} from './activityFilters.js'
import { presentActivityRows, presentEntryActivityRows } from './activityPresentation.js'
import { readActivityRows, readEntryActivityRows } from './activityRows.js'
import { getEntryOrThrow } from './context.js'

export const listActivity = callerQuery.protected({
  id: 'editor:listActivity',
  args: listActivityArgs.args,
  guard: canPublishEntries,
  returns: activityListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const limit = boundedActivityLimit(args.paginationOpts.numItems)
    const filter = normalizeActivityFilter(ctx, args.filter)
    const scope = activityScopeKey(filter)
    const cursor = parseActivityCursor(args.paginationOpts.cursor, scope, filter)
    const rows = await readActivityRows(ctx, filter, cursor, limit + 1)
    const isDone = rows.length <= limit
    const page = isDone ? rows : rows.slice(0, limit)
    return {
      page: await presentActivityRows(ctx, page),
      isDone,
      continueCursor:
        isDone || page.length === 0 ? null : encodeActivityCursor(page.at(-1)!, scope),
    }
  },
})

export const getEntryActivity = callerQuery.protected({
  id: 'editor:getEntryActivity',
  args: getEntryActivityArgs.args,
  guard: canRead,
  returns: entryActivityListResultValidator,
  handler: async (ctx: HandlerQueryCtx, args) => {
    const entry = await getEntryOrThrow(ctx, args.entryId)
    const limit = boundedActivityLimit(args.paginationOpts.numItems)
    const cursor = parseEntryActivityCursor(args.paginationOpts.cursor, args.entryId)
    const rows = await readEntryActivityRows(ctx, entry._id, cursor, limit + 1)
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const isDone = rows.length <= limit
    return {
      page: presentEntryActivityRows(page),
      isDone,
      continueCursor: isDone || !last ? null : encodeEntryActivityCursor(last, args.entryId),
    }
  },
})
