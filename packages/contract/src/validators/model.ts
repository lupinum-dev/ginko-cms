import { v } from 'convex/values'
import type { Validator } from 'convex/values'

import type {
  CollectionDefinition,
  CollectionRouting,
  FieldDefinition,
  LocaleConfig,
  MediaDefinition,
  RelationDefinition,
} from '../types.js'
import {
  collectionModeValidator,
  collectionTypeValidator,
  fieldTypeValidator,
  jsonObjectValidator,
  jsonValueValidator,
  localeTextValidator,
  slugModeValidator,
} from './foundation.js'

export const relationValidator = v.object({
  collection: v.string(),
  multiple: v.optional(v.boolean()),
}) as Validator<RelationDefinition, 'required', string>

export const mediaValidator = v.object({
  accept: v.optional(v.array(v.string())),
  aspectRatio: v.optional(v.union(v.string(), v.null())),
}) as Validator<MediaDefinition, 'required', string>

function createFieldValidator(depth: number): Validator<FieldDefinition, 'required', string> {
  const nestedFields =
    depth > 0
      ? v.optional(v.union(v.array(createFieldValidator(depth - 1)), v.null()))
      : v.optional(v.null())

  return v.object({
    key: v.string(),
    type: fieldTypeValidator,
    label: v.optional(v.union(localeTextValidator, v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    required: v.optional(v.boolean()),
    localized: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
    searchable: v.optional(v.boolean()),
    sortable: v.optional(v.boolean()),
    order: v.optional(v.number()),
    width: v.optional(v.union(v.literal('full'), v.literal('half'))),
    defaultValue: v.optional(jsonValueValidator),
    validation: v.optional(v.union(jsonObjectValidator, v.null())),
    condition: v.optional(v.union(jsonObjectValidator, v.null())),
    options: v.optional(v.union(v.array(v.string()), v.null())),
    relation: v.optional(v.union(relationValidator, v.null())),
    media: v.optional(v.union(mediaValidator, v.null())),
    fields: nestedFields,
    min: v.optional(v.union(v.number(), v.null())),
    max: v.optional(v.union(v.number(), v.null())),
    step: v.optional(v.union(v.number(), v.null())),
    slugFrom: v.optional(v.union(v.string(), v.null())),
    language: v.optional(v.union(v.string(), v.null())),
  }) as Validator<FieldDefinition, 'required', string>
}

export const fieldValidator = createFieldValidator(8)

export const localeConfigValidator = v.object({
  code: v.string(),
  label: v.optional(v.string()),
  isDefault: v.optional(v.boolean()),
  fallback: v.optional(v.string()),
}) as Validator<LocaleConfig, 'required', string>

export const collectionRoutingValidator = v.object({
  mode: v.optional(collectionModeValidator),
  pathPrefix: v.string(),
  slugMode: v.optional(slugModeValidator),
  rootSlug: v.optional(v.union(v.string(), v.null())),
  singleton: v.optional(v.boolean()),
}) as Validator<CollectionRouting, 'required', string>

export const collectionDefinitionValidator = v.object({
  slug: v.string(),
  label: localeTextValidator,
  icon: v.optional(v.union(v.string(), v.null())),
  type: collectionTypeValidator,
  routing: collectionRoutingValidator,
  locales: v.array(v.string()),
  fields: v.array(fieldValidator),
  settings: v.optional(jsonValueValidator),
}) as Validator<CollectionDefinition, 'required', string>
