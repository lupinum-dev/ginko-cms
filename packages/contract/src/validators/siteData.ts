import { v } from 'convex/values'

import { jsonValueValidator, localeTextValidator } from './foundation.js'

export const siteDataListItemValidator = v.object({
  _id: v.string(),
  key: v.string(),
  label: v.union(localeTextValidator, v.null()),
  schemaType: v.union(v.string(), v.null()),
  localized: v.boolean(),
  visibility: v.union(v.literal('private'), v.literal('public')),
  updatedBy: v.union(v.string(), v.null()),
  updatedAt: v.number(),
})

export const siteDataBlockValidator = v.union(
  v.object({
    _id: v.string(),
    key: v.string(),
    label: v.union(localeTextValidator, v.null()),
    schemaType: v.union(v.string(), v.null()),
    localized: v.boolean(),
    visibility: v.union(v.literal('private'), v.literal('public')),
    data: jsonValueValidator,
    updatedBy: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),
  v.null(),
)
