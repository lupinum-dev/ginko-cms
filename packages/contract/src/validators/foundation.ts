import { v } from 'convex/values'
import type { Validator } from 'convex/values'

import type {
  AssetScope,
  ActivityOutcome,
  CmsRole,
  CollectionMode,
  CollectionType,
  EntryStatus,
  FieldType,
  JsonObject,
  JsonValue,
  LocaleText,
  NodeKind,
  SlugMode,
  SortDirection,
} from '../types.js'

export function literalUnion<T extends readonly [string, string, ...string[]]>(
  values: T,
): Validator<T[number], 'required', string> {
  const literals = values.map((value) => v.literal(value))
  return v.union(literals[0]!, literals[1]!, ...literals.slice(2)) as Validator<
    T[number],
    'required',
    string
  >
}

function createJsonValueValidator(depth: number): Validator<JsonValue, 'required', string> {
  const scalar = v.union(v.null(), v.boolean(), v.number(), v.string())
  if (depth <= 0) return scalar as Validator<JsonValue, 'required', string>
  const child = createJsonValueValidator(depth - 1)
  return v.union(scalar, v.array(child), v.record(v.string(), child)) as Validator<
    JsonValue,
    'required',
    string
  >
}

export const cmsRoleValidator = v.union(
  v.literal('owner'),
  v.literal('publisher'),
  v.literal('editor'),
  v.literal('viewer'),
) as Validator<CmsRole, 'required', string>

export const jsonValueValidator = createJsonValueValidator(8)

export const jsonObjectValidator = v.record(v.string(), jsonValueValidator) as Validator<
  JsonObject,
  'required',
  string
>

// Markdown AST shape is proven at publish time by the parser. Convex return
// validators are kept shallow here because recursive JSON validators become
// multi-megabyte deployment payloads on real MDC trees.
export const publicBodyAstValidator = v.any() as Validator<JsonValue, 'required', string>

export const localeTextValidator = v.union(
  v.string(),
  v.record(v.string(), v.string()),
) as Validator<LocaleText, 'required', string>

export const slugModeValidator = v.union(
  v.literal('shared'),
  v.literal('localized'),
  v.literal('stable'),
  v.literal('localizedStable'),
) as Validator<SlugMode, 'required', string>

export const collectionTypeValidator = v.union(v.literal('flat'), v.literal('tree')) as Validator<
  CollectionType,
  'required',
  string
>

export const collectionModeValidator = v.union(v.literal('route'), v.literal('none')) as Validator<
  CollectionMode,
  'required',
  string
>

export const entryStatusValidator = v.union(
  v.literal('draft'),
  v.literal('published'),
  v.literal('archived'),
) as Validator<EntryStatus, 'required', string>

export const nodeKindValidator = v.union(
  v.literal('page'),
  v.literal('folder'),
  v.literal('group'),
  v.literal('section'),
) as Validator<NodeKind, 'required', string>

export const assetScopeValidator = v.union(
  v.literal('global'),
  v.literal('collection'),
  v.literal('entry'),
) as Validator<AssetScope, 'required', string>

export const sortDirectionValidator = v.union(v.literal('asc'), v.literal('desc')) as Validator<
  SortDirection,
  'required',
  string
>

export const activityOutcomeValidator = v.union(
  v.literal('applied'),
  v.literal('failed'),
  v.literal('blocked'),
  v.literal('stale'),
) as Validator<ActivityOutcome, 'required', string>

export const fieldTypeValidator = v.union(
  v.literal('text'),
  v.literal('textarea'),
  v.literal('richtext'),
  v.literal('slug'),
  v.literal('email'),
  v.literal('url'),
  v.literal('number'),
  v.literal('range'),
  v.literal('select'),
  v.literal('multiselect'),
  v.literal('radio'),
  v.literal('checkbox'),
  v.literal('toggle'),
  v.literal('date'),
  v.literal('datetime'),
  v.literal('time'),
  v.literal('json'),
  v.literal('object'),
  v.literal('array'),
  v.literal('blocks'),
  v.literal('relation'),
  v.literal('relations'),
  v.literal('image'),
  v.literal('images'),
  v.literal('file'),
  v.literal('icon'),
  v.literal('code'),
  v.literal('color'),
  v.literal('divider'),
  v.literal('section'),
) as Validator<FieldType, 'required', string>
