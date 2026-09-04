import { v } from 'convex/values'

import {
  collectionModeValidator,
  collectionTypeValidator,
  jsonValueValidator,
  localeTextValidator,
  slugModeValidator,
} from './foundation.js'
import { collectionRoutingValidator, fieldValidator } from './model.js'

export const collectionListItemValidator = v.object({
  _id: v.string(),
  slug: v.string(),
  label: v.string(),
  labelMap: localeTextValidator,
  type: collectionTypeValidator,
  icon: v.union(v.string(), v.null()),
  routing: collectionRoutingValidator,
  pathPrefix: v.string(),
  mode: collectionModeValidator,
  slugMode: slugModeValidator,
  rootSlug: v.union(v.string(), v.null()),
  singleton: v.boolean(),
  locales: v.array(v.string()),
  fieldCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})

export const collectionDocValidator = v.object({
  _id: v.string(),
  slug: v.string(),
  label: v.string(),
  labelMap: localeTextValidator,
  type: collectionTypeValidator,
  icon: v.union(v.string(), v.null()),
  routing: collectionRoutingValidator,
  pathPrefix: v.string(),
  mode: collectionModeValidator,
  slugMode: slugModeValidator,
  rootSlug: v.union(v.string(), v.null()),
  singleton: v.boolean(),
  locales: v.array(v.string()),
  fields: v.array(fieldValidator),
  settings: jsonValueValidator,
  contract: v.optional(v.object({ source: v.literal('code'), version: v.string() })),
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})
