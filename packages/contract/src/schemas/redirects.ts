import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const redirectStateValidator = v.union(v.literal('active'), v.literal('retired'))
export const redirectKindValidator = v.union(v.literal('exact'), v.literal('prefix'))
export const redirectSourceValidator = v.union(
  v.literal('manual'),
  v.literal('publish'),
  v.literal('import'),
)

export const redirectInventoryItemValidator = v.object({
  id: v.string(),
  collection: v.string(),
  locale: v.string(),
  kind: redirectKindValidator,
  fromPath: v.string(),
  targetEntryId: v.string(),
  targetPath: v.union(v.string(), v.null()),
  targetReachable: v.boolean(),
  state: redirectStateValidator,
  statusCode: v.number(),
  source: redirectSourceValidator,
  operationId: v.string(),
  createdBy: v.string(),
  createdAt: v.number(),
  retiredBy: v.union(v.string(), v.null()),
  retiredAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
})

export const redirectInventoryPageValidator = v.object({
  page: v.array(redirectInventoryItemValidator),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
})

export const retireRedirectResultValidator = v.object({
  redirectId: v.string(),
  fromPath: v.string(),
  targetPath: v.union(v.string(), v.null()),
  retiredAt: v.number(),
})

export const listRedirects = defineArgs({
  description: 'Page through the canonical redirect inventory for one collection and locale.',
  args: {
    collection: v.string(),
    locale: v.string(),
    state: redirectStateValidator,
    paginationOpts: paginationOptsValidator,
  },
})

export const retireRedirect = defineArgs({
  description: 'Retire one active redirect through the guarded public-output operation path.',
  args: {
    redirectId: v.string(),
  },
})
