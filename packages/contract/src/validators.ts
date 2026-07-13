import { v } from 'convex/values'
import type { Validator } from 'convex/values'

import {
  readinessActionKinds,
  readinessActionTargets,
  entryListWorkStates,
  readinessIssueCodes,
  readinessSeverities,
  readinessStates,
  type AffectedPublicUrl,
  type EntryReadinessDetail,
  type EntryListWorkState,
  type EntryReadinessLocale,
  type PublishImpactChangeKind,
  type PublishImpactStatus,
  type PublishReviewPreview,
  type ReadinessAction,
  type ReadinessActionKind,
  type ReadinessActionTarget,
  type ReadinessIssue,
  type ReadinessIssueCode,
  type ReadinessParams,
  type ReadinessSeverity,
  type ReadinessState,
  type ReviewSummary,
} from './readiness.js'
import type {
  AssetDeleteMode,
  AssetScope,
  CmsRole,
  CollectionDefinition,
  CollectionMode,
  CollectionRouting,
  CollectionType,
  EntryStatus,
  FieldDefinition,
  FieldType,
  JsonObject,
  JsonValue,
  LocaleConfig,
  LocaleText,
  MediaDefinition,
  NodeKind,
  RelationDefinition,
  SlugMode,
  SortDirection,
} from './types.js'

type RequiredValidator<T> = Validator<T, 'required', string>

function literalUnion<T extends readonly [string, string, ...string[]]>(
  values: T,
): RequiredValidator<T[number]> {
  const literals = values.map((value) => v.literal(value))
  return v.union(literals[0]!, literals[1]!, ...literals.slice(2)) as RequiredValidator<T[number]>
}

function createJsonValueValidator(depth: number): RequiredValidator<JsonValue> {
  const scalar = v.union(v.null(), v.boolean(), v.number(), v.string())
  if (depth <= 0) return scalar as RequiredValidator<JsonValue>
  const child = createJsonValueValidator(depth - 1)
  return v.union(
    scalar,
    v.array(child),
    v.record(v.string(), child),
  ) as RequiredValidator<JsonValue>
}

function createFieldValidator(depth: number): RequiredValidator<FieldDefinition> {
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
  }) as RequiredValidator<FieldDefinition>
}

export const cmsRoleValidator = v.union(
  v.literal('owner'),
  v.literal('publisher'),
  v.literal('editor'),
  v.literal('viewer'),
) as RequiredValidator<CmsRole>

export const jsonValueValidator = createJsonValueValidator(8)

export const jsonObjectValidator = v.record(
  v.string(),
  jsonValueValidator,
) as RequiredValidator<JsonObject>

// Markdown AST shape is proven at publish time by the parser. Convex return
// validators are kept shallow here because recursive JSON validators become
// multi-megabyte deployment payloads on real MDC trees.
export const publicBodyAstValidator = v.any() as RequiredValidator<JsonValue>

export const localeTextValidator = v.union(
  v.string(),
  v.record(v.string(), v.string()),
) as RequiredValidator<LocaleText>

export const slugModeValidator = v.union(
  v.literal('shared'),
  v.literal('localized'),
  v.literal('stable'),
  v.literal('localizedStable'),
) as RequiredValidator<SlugMode>

export const collectionTypeValidator = v.union(
  v.literal('flat'),
  v.literal('tree'),
) as RequiredValidator<CollectionType>

export const collectionModeValidator = v.union(
  v.literal('route'),
  v.literal('none'),
) as RequiredValidator<CollectionMode>

export const entryStatusValidator = v.union(
  v.literal('draft'),
  v.literal('published'),
  v.literal('archived'),
) as RequiredValidator<EntryStatus>

export const readinessStateValidator = literalUnion(
  readinessStates,
) as RequiredValidator<ReadinessState>

export const readinessSeverityValidator = literalUnion(
  readinessSeverities,
) as RequiredValidator<ReadinessSeverity>

export const readinessIssueCodeValidator = literalUnion(
  readinessIssueCodes,
) as RequiredValidator<ReadinessIssueCode>

export const readinessActionKindValidator = literalUnion(
  readinessActionKinds,
) as RequiredValidator<ReadinessActionKind>

export const readinessActionTargetValidator = literalUnion(
  readinessActionTargets,
) as RequiredValidator<ReadinessActionTarget>

export const readinessParamsValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.null()),
) as RequiredValidator<ReadinessParams>

export const readinessIssueValidator = v.object({
  code: readinessIssueCodeValidator,
  severity: readinessSeverityValidator,
  locale: v.union(v.string(), v.null()),
  fieldPath: v.union(v.string(), v.null()),
  messageParams: readinessParamsValidator,
  diagnosticId: v.union(v.string(), v.null()),
}) as RequiredValidator<ReadinessIssue>

export const readinessActionValidator = v.object({
  kind: readinessActionKindValidator,
  locale: v.union(v.string(), v.null()),
  target: readinessActionTargetValidator,
  params: readinessParamsValidator,
}) as RequiredValidator<ReadinessAction>

export const affectedPublicUrlValidator = v.object({
  entryId: v.string(),
  locale: v.string(),
  kind: v.union(v.literal('current_entry'), v.literal('descendant')),
  beforePath: v.union(v.string(), v.null()),
  afterPath: v.union(v.string(), v.null()),
  beforeHref: v.union(v.string(), v.null()),
  afterHref: v.union(v.string(), v.null()),
  reason: v.union(
    v.literal('publish'),
    v.literal('route_changed'),
    v.literal('parent_route_changed'),
    v.literal('unpublish'),
    v.literal('archive'),
  ),
}) as RequiredValidator<AffectedPublicUrl>

export const entryReadinessLocaleValidator = v.object({
  locale: v.string(),
  state: readinessStateValidator,
  blockers: v.array(readinessIssueValidator),
  warnings: v.array(readinessIssueValidator),
  infos: v.array(readinessIssueValidator),
  nextAction: readinessActionValidator,
  draftExists: v.boolean(),
  published: v.boolean(),
  hasUnpublishedChanges: v.boolean(),
  canPreview: v.boolean(),
  canRequestReview: v.boolean(),
  canPublish: v.boolean(),
  canArchive: v.boolean(),
  publicUrl: v.union(v.string(), v.null()),
  draftUrl: v.union(v.string(), v.null()),
  affectedPublicUrls: v.array(affectedPublicUrlValidator),
  reviewRequestId: v.union(v.string(), v.null()),
  currentDraftVersion: v.union(v.number(), v.null()),
  currentPublishedRevisionId: v.union(v.string(), v.null()),
}) as RequiredValidator<EntryReadinessLocale>

export const entryReadinessDetailValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  primaryLocale: v.string(),
  locales: v.array(entryReadinessLocaleValidator),
  updatedAt: v.number(),
}) as RequiredValidator<EntryReadinessDetail>

export const nodeKindValidator = v.union(
  v.literal('page'),
  v.literal('folder'),
  v.literal('group'),
  v.literal('section'),
) as RequiredValidator<NodeKind>

export const assetScopeValidator = v.union(
  v.literal('global'),
  v.literal('collection'),
  v.literal('entry'),
) as RequiredValidator<AssetScope>

export const assetDeleteModeValidator = v.union(
  v.literal('delete'),
  v.literal('moveToCollection'),
) as RequiredValidator<AssetDeleteMode>

export const sortDirectionValidator = v.union(
  v.literal('asc'),
  v.literal('desc'),
) as RequiredValidator<SortDirection>

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
) as RequiredValidator<FieldType>

export const relationValidator = v.object({
  collectionId: v.string(),
  multiple: v.optional(v.boolean()),
}) as RequiredValidator<RelationDefinition>

export const mediaValidator = v.object({
  accept: v.optional(v.array(v.string())),
  aspectRatio: v.optional(v.union(v.string(), v.null())),
}) as RequiredValidator<MediaDefinition>

export const fieldValidator = createFieldValidator(8)

export const localeConfigValidator = v.object({
  code: v.string(),
  label: v.optional(v.string()),
  isDefault: v.optional(v.boolean()),
  fallback: v.optional(v.string()),
}) as RequiredValidator<LocaleConfig>

export const assetValidator = v.object({
  _id: v.string(),
  filename: v.string(),
  mimeType: v.string(),
  size: v.number(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  alt: v.union(localeTextValidator, v.null()),
  caption: v.union(localeTextValidator, v.null()),
  scope: assetScopeValidator,
  entryId: v.union(v.string(), v.null()),
  collectionId: v.union(v.string(), v.null()),
  ownerPath: v.array(v.string()),
  url: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
})

export const assetRefUsageValidator = v.object({
  entryId: v.string(),
  entryTitle: v.string(),
  fieldPath: v.string(),
  locale: v.string(),
  collectionSlug: v.string(),
  collectionLabel: v.string(),
})

export const assetManagerAssetValidator = v.object({
  id: v.string(),
  filename: v.string(),
  mimeType: v.string(),
  size: v.number(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  scope: assetScopeValidator,
  entryId: v.union(v.string(), v.null()),
  collectionId: v.union(v.string(), v.null()),
  collectionSlug: v.union(v.string(), v.null()),
  collectionLabel: v.union(v.string(), v.null()),
  entryTitle: v.union(v.string(), v.null()),
  ownerPath: v.array(v.string()),
  url: v.union(v.string(), v.null()),
  thumbnailUrl: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  deletedAt: v.union(v.number(), v.null()),
  alt: v.union(localeTextValidator, v.null()),
  caption: v.union(localeTextValidator, v.null()),
  tags: v.array(v.string()),
  usages: v.array(assetRefUsageValidator),
})

export const assetManagerPageValidator = v.object({
  page: v.array(assetManagerAssetValidator),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
})

export const assetColocationGroupsValidator = v.object({
  entry: v.array(assetManagerAssetValidator),
  collection: v.array(assetManagerAssetValidator),
  global: v.array(assetManagerAssetValidator),
  otherCollections: v.array(assetManagerAssetValidator),
})

export const memberValidator = v.object({
  _id: v.string(),
  userId: v.string(),
  displayName: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: cmsRoleValidator,
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  updatedBy: v.union(v.string(), v.null()),
})

export const permissionMapValidator = v.record(v.string(), v.boolean())

export const accessContextValidator = v.union(
  v.object({
    userId: v.union(v.string(), v.null()),
    workspaceId: v.union(v.string(), v.null()),
    role: v.union(cmsRoleValidator, v.null()),
    can: permissionMapValidator,
    member: v.union(memberValidator, v.null()),
    canBootstrap: v.boolean(),
  }),
  v.null(),
)

export const studioSettingsValidator = v.union(
  v.object({
    locales: v.array(localeConfigValidator),
    updatedAt: v.number(),
    updatedBy: v.union(v.string(), v.null()),
  }),
  v.null(),
)

export const webhookEventValidator = v.union(
  v.literal('entry.published'),
  v.literal('entry.unpublished'),
  v.literal('entry.deleted'),
  v.literal('asset.created'),
  v.literal('asset.deleted'),
)

export const webhookConfigValidator = v.object({
  id: v.string(),
  name: v.string(),
  url: v.string(),
  enabled: v.boolean(),
  events: v.array(webhookEventValidator),
  secretFingerprint: v.union(v.string(), v.null()),
})

export const cmsSettingsValidator = v.union(
  v.object({
    key: v.literal('site'),
    locales: v.array(localeConfigValidator),
    webhooks: v.array(webhookConfigValidator),
    updatedBy: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),
  v.null(),
)

export const ginkoRouteClaimValidator = v.object({
  kind: v.union(v.literal('route'), v.literal('redirect')),
  collection: v.string(),
  entryId: v.string(),
  locale: v.string(),
  path: v.string(),
  href: v.optional(v.union(v.string(), v.null())),
  targetPath: v.optional(v.union(v.string(), v.null())),
  targetHref: v.optional(v.union(v.string(), v.null())),
})

export const ginkoRouteDiagnosticCodeValidator = v.union(
  v.literal('route_collision'),
  v.literal('route_redirect_collision'),
  v.literal('redirect_collision'),
  v.literal('redirect_target_missing'),
)

export const ginkoVisibilityDiagnosticCodeValidator = v.union(
  v.literal('invalid_entry_id'),
  v.literal('data_only_collection'),
  v.literal('entry_collection_mismatch'),
  v.literal('archived_entry'),
  v.literal('unpublished_entry'),
  v.literal('missing_locale_route'),
  v.literal('missing_required_localized_field'),
  v.literal('missing_parent_route'),
  ginkoRouteDiagnosticCodeValidator,
  v.literal('excluded_from_sitemap'),
  v.literal('excluded_from_search'),
  v.literal('excluded_from_nav'),
  v.literal('broken_relation'),
  v.literal('capability_mismatch'),
)

export const ginkoVisibilityDiagnosticDetailsValidator = v.union(
  v.object({
    claims: v.optional(v.array(ginkoRouteClaimValidator)),
    parentEntryId: v.optional(v.union(v.string(), v.null())),
    parentPath: v.optional(v.union(v.string(), v.null())),
    targetHref: v.optional(v.union(v.string(), v.null())),
    fields: v.optional(v.array(v.string())),
    statuses: v.optional(v.array(v.string())),
    relationField: v.optional(v.union(v.string(), v.null())),
    targetCollection: v.optional(v.union(v.string(), v.null())),
    targetId: v.optional(v.union(v.string(), v.null())),
  }),
  v.null(),
)

export const ginkoVisibilityDiagnosticValidator = v.object({
  code: ginkoVisibilityDiagnosticCodeValidator,
  severity: v.union(v.literal('info'), v.literal('warning'), v.literal('error')),
  collection: v.string(),
  entryId: v.union(v.string(), v.null()),
  locale: v.union(v.string(), v.null()),
  path: v.union(v.string(), v.null()),
  href: v.union(v.string(), v.null()),
  details: ginkoVisibilityDiagnosticDetailsValidator,
  message: v.string(),
})

export const ginkoPublicVisibilityLocaleValidator = v.object({
  locale: v.string(),
  status: v.union(
    v.literal('public'),
    v.literal('archived'),
    v.literal('draft_only'),
    v.literal('missing_route'),
    v.literal('missing_required_fields'),
    v.literal('parent_not_public'),
    v.literal('collision'),
    v.literal('excluded'),
  ),
  published: v.boolean(),
  path: v.union(v.string(), v.null()),
  href: v.union(v.string(), v.null()),
  sitemap: v.union(v.literal('included'), v.literal('excluded')),
  search: v.union(v.literal('included'), v.literal('excluded')),
  nav: v.union(v.literal('included'), v.literal('excluded')),
  reasons: v.array(v.string()),
  missingRequiredFields: v.array(v.string()),
  secondaryStatuses: v.array(v.string()),
})

export const ginkoPublicVisibilityExplanationValidator = v.object({
  collection: v.string(),
  entryId: v.string(),
  mode: v.union(v.literal('route'), v.literal('none')),
  locales: v.array(ginkoPublicVisibilityLocaleValidator),
  diagnostics: v.array(ginkoVisibilityDiagnosticValidator),
})

export const ginkoPublishImpactStatusValidator = v.union(
  v.literal('ready'),
  v.literal('blocked'),
  v.literal('no_changes'),
  v.literal('not_publishable'),
) as RequiredValidator<PublishImpactStatus>

export const ginkoPublishImpactChangeKindValidator = v.union(
  v.literal('route'),
  v.literal('redirect'),
  v.literal('sitemap'),
  v.literal('search'),
  v.literal('nav'),
  v.literal('seo'),
) as RequiredValidator<PublishImpactChangeKind>

export const ginkoPublishImpactChangeValidator = v.object({
  locale: v.string(),
  entryId: v.optional(v.string()),
  scope: v.optional(v.union(v.literal('current_entry'), v.literal('descendant'))),
  kind: ginkoPublishImpactChangeKindValidator,
  label: v.string(),
  before: v.union(v.string(), v.boolean(), v.null()),
  after: v.union(v.string(), v.boolean(), v.null()),
})

export const ginkoPublishImpactLocaleValidator = v.object({
  locale: v.string(),
  status: ginkoPublishImpactStatusValidator,
  currentPath: v.union(v.string(), v.null()),
  nextPath: v.union(v.string(), v.null()),
  currentHref: v.union(v.string(), v.null()),
  nextHref: v.union(v.string(), v.null()),
  sitemap: v.object({
    before: v.boolean(),
    after: v.boolean(),
  }),
  search: v.object({
    before: v.boolean(),
    after: v.boolean(),
  }),
  nav: v.object({
    before: v.boolean(),
    after: v.boolean(),
  }),
  changes: v.array(ginkoPublishImpactChangeValidator),
  blockingDiagnostics: v.array(ginkoVisibilityDiagnosticValidator),
  warnings: v.array(ginkoVisibilityDiagnosticValidator),
})

export const ginkoPublishImpactResultValidator = v.object({
  collection: v.string(),
  entryId: v.string(),
  status: ginkoPublishImpactStatusValidator,
  mode: v.union(v.literal('route'), v.literal('none')),
  locales: v.array(ginkoPublishImpactLocaleValidator),
  blockingDiagnostics: v.array(ginkoVisibilityDiagnosticValidator),
  warnings: v.array(ginkoVisibilityDiagnosticValidator),
  changes: v.array(ginkoPublishImpactChangeValidator),
  cacheTags: v.array(v.string()),
  events: v.array(v.string()),
})

export const publishReviewPreviewAffectedUrlValidator = v.object({
  locale: v.string(),
  entryId: v.string(),
  scope: v.union(v.literal('current_entry'), v.literal('descendant')),
  label: v.string(),
  beforeHref: v.union(v.string(), v.null()),
  afterHref: v.union(v.string(), v.null()),
})

export const publishReviewPreviewValidator = v.object({
  kind: v.literal('publish-review-preview'),
  status: ginkoPublishImpactStatusValidator,
  collection: v.string(),
  entryId: v.string(),
  locales: v.array(
    v.object({
      locale: v.string(),
      status: ginkoPublishImpactStatusValidator,
      currentHref: v.union(v.string(), v.null()),
      nextHref: v.union(v.string(), v.null()),
      blockingIssueCodes: v.array(v.string()),
      warningIssueCodes: v.array(v.string()),
      changeKinds: v.array(ginkoPublishImpactChangeKindValidator),
    }),
  ),
  affectedPublicUrls: v.array(publishReviewPreviewAffectedUrlValidator),
  changes: v.array(
    v.object({
      locale: v.string(),
      entryId: v.optional(v.string()),
      scope: v.optional(v.union(v.literal('current_entry'), v.literal('descendant'))),
      kind: ginkoPublishImpactChangeKindValidator,
      label: v.string(),
      before: v.union(v.string(), v.boolean(), v.null()),
      after: v.union(v.string(), v.boolean(), v.null()),
    }),
  ),
  blockingIssueCodes: v.array(v.string()),
  warningIssueCodes: v.array(v.string()),
  computedAt: v.number(),
}) as RequiredValidator<PublishReviewPreview>

export const reviewSummaryValidator = v.object({
  status: ginkoPublishImpactStatusValidator,
  localeStatuses: v.array(
    v.object({
      locale: v.string(),
      status: ginkoPublishImpactStatusValidator,
      currentHref: v.union(v.string(), v.null()),
      nextHref: v.union(v.string(), v.null()),
    }),
  ),
  affectedPublicUrls: v.array(publishReviewPreviewAffectedUrlValidator),
  changeCount: v.number(),
  blockerCount: v.number(),
  warningCount: v.number(),
  blockingIssueCodes: v.array(v.string()),
  warningIssueCodes: v.array(v.string()),
}) as RequiredValidator<ReviewSummary>

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

export const collectionRoutingValidator = v.object({
  mode: v.optional(collectionModeValidator),
  pathPrefix: v.string(),
  slugMode: v.optional(slugModeValidator),
  rootSlug: v.optional(v.union(v.string(), v.null())),
  singleton: v.optional(v.boolean()),
}) as RequiredValidator<CollectionRouting>

export const collectionDefinitionValidator = v.object({
  slug: v.string(),
  label: localeTextValidator,
  icon: v.optional(v.union(v.string(), v.null())),
  type: collectionTypeValidator,
  routing: collectionRoutingValidator,
  locales: v.array(v.string()),
  fields: v.array(fieldValidator),
  settings: v.optional(jsonValueValidator),
}) as RequiredValidator<CollectionDefinition>

// ---------------------------------------------------------------------------
// Return type validators for query/mutation handlers
// ---------------------------------------------------------------------------

/** Locale state shape used in studio entries */
const localeStateValidator = v.object({
  values: v.record(v.string(), jsonValueValidator),
  bodyMdc: v.optional(v.union(v.string(), v.null())),
})

/** Completion state for a locale */
const completionStateValidator = v.object({
  filledRequired: v.number(),
  totalRequired: v.number(),
  complete: v.boolean(),
  errors: v.array(
    v.object({
      field: v.string(),
      message: v.string(),
    }),
  ),
})

/** A single localized entry in the studio entry response */
const localizedEntryValidator = v.object({
  locale: v.string(),
  entryId: v.string(),
  draftSlug: v.union(v.string(), v.null()),
  draftPath: v.string(),
  publishedSlug: v.union(v.string(), v.null()),
  publishedPath: v.union(v.string(), v.null()),
  draft: localeStateValidator,
  published: v.union(localeStateValidator, v.null()),
  updatedBy: v.string(),
  updatedAt: v.number(),
  completion: completionStateValidator,
  data: v.record(v.string(), jsonValueValidator),
  publishedData: v.record(v.string(), jsonValueValidator),
})

const localeVariantValidator = v.object({
  locale: v.string(),
  entryId: v.string(),
  label: v.string(),
  isCurrent: v.boolean(),
  filledRequired: v.number(),
  totalRequired: v.number(),
  complete: v.boolean(),
  draftPath: v.string(),
  publishedPath: v.union(v.string(), v.null()),
  updatedAt: v.number(),
})

const schemaInfoValidator = v.object({
  slug: v.string(),
  type: collectionTypeValidator,
  routing: collectionRoutingValidator,
  locales: v.array(v.string()),
  fields: v.array(fieldValidator),
  settings: jsonValueValidator,
})

const localeDataValidator = v.object({
  draftSlug: v.union(v.string(), v.null()),
  draftPath: v.string(),
  publishedSlug: v.union(v.string(), v.null()),
  publishedPath: v.union(v.string(), v.null()),
  draft: localeStateValidator,
  published: v.union(localeStateValidator, v.null()),
})

/** Full studio entry returned by getEntry / buildStudioEntry */
export const studioEntryValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  collectionId: v.string(),
  baseSlug: v.string(),
  stableId: v.union(v.string(), v.null()),
  status: entryStatusValidator,
  dirtyLocales: v.array(v.string()),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  draft: jsonValueValidator,
  published: v.union(jsonValueValidator, v.null()),
  draftVersion: v.number(),
  createdBy: v.string(),
  updatedBy: v.string(),
  publishedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  locale: v.string(),
  slug: v.string(),
  path: v.union(v.string(), v.null()),
  data: jsonValueValidator,
  publishedData: v.union(jsonValueValidator, v.null()),
  localeData: v.union(localeDataValidator, v.null()),
  locales: v.array(localizedEntryValidator),
  localeVariants: v.array(localeVariantValidator),
  schema: schemaInfoValidator,
  // capabilities attached by auth layer
  _can: v.optional(v.record(v.string(), v.boolean())),
})

/** Item returned by listEntries */
export const entryListItemValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  slug: v.string(),
  stableId: v.union(v.string(), v.null()),
  path: v.string(),
  title: v.string(),
  status: entryStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  parentEntryId: v.union(v.string(), v.null()),
  order: v.string(),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  data: v.record(v.string(), jsonValueValidator),
})

/** Locale summary for studio list items */
const localeSummaryValidator = v.object({
  locale: v.string(),
  draftPath: v.string(),
  publishedPath: v.union(v.string(), v.null()),
  published: v.boolean(),
  updatedAt: v.number(),
})

/** Item returned by listEntriesForStudio */
export const studioEntryListItemValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  locale: v.string(),
  baseSlug: v.string(),
  stableId: v.union(v.string(), v.null()),
  title: v.string(),
  status: entryStatusValidator,
  dirtyLocales: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  path: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  localeSummaries: v.array(localeSummaryValidator),
  // capabilities attached by auth layer
  _can: v.optional(v.record(v.string(), v.boolean())),
})

/** Paginated entry list result (listEntriesForStudio) */
export const studioEntryListResultValidator = v.object({
  page: v.array(studioEntryListItemValidator),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
})

const studioPublicStateValidator = v.union(
  v.literal('public'),
  v.literal('draft_only'),
  v.literal('needs_attention'),
  v.literal('data_only'),
)

const studioRouteModeValidator = v.union(v.literal('route'), v.literal('none'))

const studioLocaleReadinessValidator = v.object({
  locale: v.string(),
  draftPath: v.string(),
  publishedPath: v.union(v.string(), v.null()),
  published: v.boolean(),
  changed: v.boolean(),
  state: v.union(v.literal('public'), v.literal('draft_only'), v.literal('changed')),
})

export const entryListWorkStateValidator = literalUnion(
  entryListWorkStates,
) as RequiredValidator<EntryListWorkState>

const entryWorkflowSummaryValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  primaryLocale: v.string(),
  workStatesByLocale: v.record(v.string(), entryListWorkStateValidator),
  readinessStatesByLocale: v.record(v.string(), readinessStateValidator),
  issueCounts: v.object({
    blocker: v.number(),
    warning: v.number(),
    info: v.number(),
  }),
  missingLocales: v.array(v.string()),
  publishedLocales: v.array(v.string()),
  nextAction: readinessActionValidator,
})

/** Item returned by listEntrySummaries */
export const entrySummaryValidator = v.object({
  _id: v.string(),
  entryId: v.string(),
  collection: v.string(),
  collectionLabel: localeTextValidator,
  title: v.string(),
  slug: v.string(),
  path: v.string(),
  status: entryStatusValidator,
  routeMode: studioRouteModeValidator,
  nodeKind: nodeKindValidator,
  parentEntryId: v.union(v.string(), v.null()),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  publicState: studioPublicStateValidator,
  draftChangedSincePublish: v.boolean(),
  blockingIssueCount: v.number(),
  missingTranslationLocales: v.array(v.string()),
  localeReadiness: v.array(studioLocaleReadinessValidator),
  workflowSummary: entryWorkflowSummaryValidator,
  nextAction: v.string(),
  _can: v.optional(v.record(v.string(), v.boolean())),
})

const overviewEntryValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  collectionLabel: localeTextValidator,
  title: v.string(),
  path: v.string(),
  status: entryStatusValidator,
  publicState: studioPublicStateValidator,
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  blockingIssueCount: v.number(),
  missingTranslationLocales: v.array(v.string()),
  nextAction: v.string(),
  _can: v.optional(v.record(v.string(), v.boolean())),
})

export const studioOverviewValidator = v.object({
  counts: v.object({
    needsAttention: v.number(),
    changedDrafts: v.number(),
    readyToPreview: v.number(),
    missingTranslations: v.number(),
    failedRevalidation: v.number(),
    importBlockers: v.number(),
    pendingRevalidation: v.number(),
  }),
  collections: v.array(
    v.object({
      slug: v.string(),
      label: localeTextValidator,
      routeMode: studioRouteModeValidator,
      type: collectionTypeValidator,
      locales: v.array(v.string()),
      entryCount: v.number(),
      changedDrafts: v.number(),
      blocked: v.number(),
      missingTranslations: v.number(),
    }),
  ),
  changedDrafts: v.array(entrySummaryValidator),
  readyToPreview: v.array(entrySummaryValidator),
  blocked: v.array(entrySummaryValidator),
  missingTranslations: v.array(entrySummaryValidator),
  recentPublished: v.array(overviewEntryValidator),
  revalidationJobs: v.array(
    v.object({
      id: v.string(),
      status: v.union(
        v.literal('pending'),
        v.literal('delivering'),
        v.literal('delivered'),
        v.literal('failed'),
      ),
      paths: v.array(v.string()),
      attempts: v.number(),
      lastError: v.union(v.string(), v.null()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  importRuns: v.array(
    v.object({
      id: v.string(),
      importRunId: v.string(),
      kind: v.union(v.literal('preview'), v.literal('apply')),
      status: v.string(),
      entryCount: v.number(),
      assetCount: v.number(),
      collectionSlugs: v.array(v.string()),
      createdAt: v.number(),
    }),
  ),
  activity: v.array(
    v.object({
      _id: v.string(),
      kind: v.string(),
      summary: v.string(),
      displaySummary: v.string(),
      entryId: v.union(v.string(), v.null()),
      collectionId: v.union(v.string(), v.null()),
      locale: v.union(v.string(), v.null()),
      appIdentityId: v.string(),
      createdAt: v.number(),
    }),
  ),
})

/** Publish result */
export const publishResultValidator = v.object({
  versionId: v.string(),
  dirtyLocales: v.array(v.string()),
  draftVersion: v.number(),
})

/** Draft save / undo / revert result */
export const draftSaveResultValidator = v.object({
  draftVersion: v.number(),
  dirtyLocales: v.array(v.string()),
})

/** Rollback result */
export const rollbackResultValidator = v.object({
  versionId: v.string(),
})

/** Version diff result */
export const versionDiffValidator = v.object({
  leftVersionId: v.string(),
  rightVersionId: v.string(),
  changes: v.array(
    v.object({
      field: v.string(),
      left: v.union(jsonValueValidator, v.null()),
      right: v.union(jsonValueValidator, v.null()),
    }),
  ),
})

/** Activity item */
export const activityItemValidator = v.object({
  _id: v.string(),
  kind: v.string(),
  summary: v.string(),
  displaySummary: v.string(),
  entryId: v.union(v.string(), v.null()),
  collectionId: v.union(v.string(), v.null()),
  locale: v.union(v.string(), v.null()),
  detail: v.union(jsonValueValidator, v.null()),
  appIdentityId: v.string(),
  createdAt: v.number(),
})

/** Activity list result (paginated) */
export const activityListResultValidator = v.object({
  page: v.array(activityItemValidator),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
})

/** Entry activity item (no entryId/collectionId) */
export const entryActivityItemValidator = v.object({
  _id: v.string(),
  kind: v.string(),
  summary: v.string(),
  displaySummary: v.string(),
  locale: v.union(v.string(), v.null()),
  detail: v.union(jsonValueValidator, v.null()),
  appIdentityId: v.string(),
  createdAt: v.number(),
})

/** Version list item */
export const versionListItemValidator = v.object({
  _id: v.string(),
  version: v.number(),
  action: v.string(),
  displayAction: v.union(
    v.literal('published'),
    v.literal('restoredPublished'),
    v.literal('unpublished'),
    v.literal('archived'),
    v.literal('checkpoint'),
    v.literal('routeUpdated'),
  ),
  publishedLocales: v.array(v.string()),
  message: v.union(v.string(), v.null()),
  createdBy: v.string(),
  createdAt: v.number(),
  isCurrentPublished: v.boolean(),
})

/** Locale snapshot preview (filtered to a single locale) */
const snapshotLocalePreviewValidator = v.object({
  slug: v.union(v.string(), v.null()),
  path: v.string(),
  values: v.union(jsonObjectValidator, v.null()),
})

/** Snapshot preview shared shape */
const snapshotPreviewBaseValidator = v.object({
  baseSlug: v.string(),
  shared: jsonObjectValidator,
  locale: v.union(snapshotLocalePreviewValidator, v.null()),
})

/** Version snapshot preview result */
export const versionSnapshotPreviewValidator = v.object({
  _id: v.string(),
  version: v.number(),
  action: v.string(),
  message: v.union(v.string(), v.null()),
  createdAt: v.number(),
  snapshot: snapshotPreviewBaseValidator,
})

/** Draft vs published diff result */
export const draftVsPublishedDiffValidator = v.object({
  changes: v.array(
    v.object({
      field: v.string(),
      left: v.union(jsonValueValidator, v.null()),
      right: v.union(jsonValueValidator, v.null()),
    }),
  ),
})

/** Search result item */
export const searchResultItemValidator = v.object({
  _id: v.string(),
  collection: v.string(),
  slug: v.string(),
  path: v.string(),
  title: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  snippet: v.union(v.string(), v.null()),
  highlights: v.array(
    v.object({
      start: v.number(),
      end: v.number(),
    }),
  ),
})

/** Locked public content route */
export const ginkoRouteValidator = v.object({
  slug: v.string(),
  path: v.string(),
  locale: v.string(),
  source: v.literal('published'),
  href: v.optional(v.string()),
})

/** Locked public locale metadata */
export const ginkoLocaleResolutionValidator = v.object({
  requested: v.string(),
  resolved: v.string(),
  policy: v.union(v.literal('strict'), v.literal('transparent')),
  fallbacks: v.object({
    fields: v.array(
      v.object({
        path: v.string(),
        from: v.string(),
      }),
    ),
  }),
})

/** Locked public entry */
export const ginkoPublicEntryValidator = v.object({
  id: v.string(),
  collection: v.string(),
  route: ginkoRouteValidator,
  translations: v.array(
    v.object({
      locale: v.string(),
      route: ginkoRouteValidator,
      status: v.union(v.literal('published'), v.literal('missing')),
    }),
  ),
  locale: ginkoLocaleResolutionValidator,
  title: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  bodyAst: v.optional(publicBodyAstValidator),
  toc: v.optional(jsonValueValidator),
  publishedAt: v.string(),
  updatedAt: v.string(),
  revision: v.string(),
  stableId: v.string(),
})

export const ginkoBreadcrumbValidator = v.object({
  title: v.string(),
  route: ginkoRouteValidator,
  routable: v.boolean(),
})

export const ginkoPublicNavigationEntryValidator = v.object({
  id: v.string(),
  collection: v.string(),
  route: ginkoRouteValidator,
  translations: v.array(
    v.object({
      locale: v.string(),
      route: ginkoRouteValidator,
      status: v.union(v.literal('published'), v.literal('missing')),
    }),
  ),
  locale: ginkoLocaleResolutionValidator,
  title: v.string(),
  data: v.record(v.string(), jsonValueValidator),
  publishedAt: v.string(),
  updatedAt: v.string(),
  revision: v.string(),
  stableId: v.string(),
})

function createGinkoNavNodeValidator(depth: number): RequiredValidator<unknown> {
  return v.object({
    entry: ginkoPublicNavigationEntryValidator,
    children:
      depth > 0 ? v.array(createGinkoNavNodeValidator(depth - 1)) : v.array(jsonObjectValidator),
  }) as RequiredValidator<unknown>
}

export const ginkoNavNodeValidator = createGinkoNavNodeValidator(12)

/** Locked public page result */
export const ginkoPageResultValidator = v.union(
  v.object({
    status: v.literal('found'),
    page: ginkoPublicEntryValidator,
    collection: v.string(),
    locale: ginkoLocaleResolutionValidator,
    breadcrumbs: v.array(ginkoBreadcrumbValidator),
    seo: v.object({
      title: v.string(),
      description: v.string(),
      canonical: v.string(),
      alternates: v.array(
        v.object({
          locale: v.string(),
          hreflang: v.string(),
          route: ginkoRouteValidator,
        }),
      ),
      xDefault: v.union(ginkoRouteValidator, v.null()),
    }),
  }),
  v.object({
    status: v.literal('redirect'),
    page: v.null(),
    collection: v.string(),
    locale: ginkoLocaleResolutionValidator,
    breadcrumbs: v.array(ginkoBreadcrumbValidator),
    seo: v.null(),
    redirectTo: ginkoRouteValidator,
    redirectedFrom: v.string(),
  }),
  v.object({
    status: v.literal('not-found'),
    page: v.null(),
    collection: v.string(),
    locale: ginkoLocaleResolutionValidator,
    breadcrumbs: v.array(ginkoBreadcrumbValidator),
    seo: v.null(),
  }),
)

export const ginkoPageInfoValidator = v.object({
  hasNextPage: v.boolean(),
  endCursor: v.union(v.string(), v.null()),
})

export const ginkoRoutesResultValidator = v.object({
  routes: v.array(
    v.object({
      collection: v.string(),
      stableId: v.string(),
      locale: v.string(),
      path: v.string(),
      sitemapIncluded: v.boolean(),
      lastmod: v.string(),
    }),
  ),
  pageInfo: ginkoPageInfoValidator,
})

export const ginkoListResultValidator = v.object({
  entries: v.array(ginkoPublicEntryValidator),
  pageInfo: ginkoPageInfoValidator,
  collection: v.string(),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoNavResultValidator = v.object({
  tree: v.array(ginkoNavNodeValidator),
  collection: v.string(),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoSurroundResultValidator = v.object({
  previous: v.array(ginkoPublicEntryValidator),
  next: v.array(ginkoPublicEntryValidator),
  collection: v.string(),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoSearchResultValidator = v.object({
  results: v.array(ginkoPublicEntryValidator),
  pageInfo: ginkoPageInfoValidator,
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoSitemapResultValidator = v.object({
  urls: v.array(
    v.object({
      collection: v.string(),
      id: v.string(),
      route: ginkoRouteValidator,
      alternates: v.array(
        v.object({
          locale: v.string(),
          hreflang: v.string(),
          route: ginkoRouteValidator,
        }),
      ),
      xDefault: v.union(ginkoRouteValidator, v.null()),
      lastmod: v.string(),
    }),
  ),
  pageInfo: ginkoPageInfoValidator,
})

export const ginkoSingletonResultValidator = v.object({
  name: v.string(),
  singleton: v.union(ginkoPublicEntryValidator, v.null()),
  locale: ginkoLocaleResolutionValidator,
  failure: v.union(
    v.literal('missing_locale'),
    v.literal('unknown_collection'),
    v.literal('not_singleton'),
    v.literal('mode_mismatch'),
    v.literal('no_published_entry'),
    v.null(),
  ),
})

export const ginkoSiteDataResultValidator = v.object({
  key: v.string(),
  data: v.union(jsonValueValidator, v.null()),
  locale: ginkoLocaleResolutionValidator,
})

export const ginkoRouteDiagnosticValidator = v.object({
  code: ginkoRouteDiagnosticCodeValidator,
  message: v.string(),
  href: v.string(),
  claims: v.array(ginkoRouteClaimValidator),
})

export const importRunStatusValidator = v.union(
  v.literal('previewed'),
  v.literal('blocked'),
  v.literal('applied'),
  v.literal('published'),
  v.literal('failed'),
)

/** Collection list item */
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
  entryCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})

export const collectionProjectionStatusValidator = v.object({
  activeCollectionProjectionRunId: v.union(v.string(), v.null()),
  activeSiteProjectionRunId: v.union(v.string(), v.null()),
  activatedAt: v.union(v.number(), v.null()),
})

export const collectionImportStatusValidator = v.union(
  v.object({
    importRunId: v.string(),
    kind: v.union(v.literal('preview'), v.literal('apply')),
    status: importRunStatusValidator,
    publish: v.boolean(),
    blockerCount: v.number(),
    warningCount: v.number(),
    publishedCount: v.number(),
    createdAt: v.number(),
  }),
  v.null(),
)

/** Collection detail (getCollection) */
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
  contract: v.optional(
    v.object({
      source: v.literal('code'),
      version: v.string(),
    }),
  ),
  projectionStatus: v.optional(collectionProjectionStatusValidator),
  lastImportRun: collectionImportStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})

/** Import result */
export const importResultValidator = v.object({
  importRunId: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal('previewed'),
      v.literal('blocked'),
      v.literal('applied'),
      v.literal('published'),
      v.literal('failed'),
    ),
  ),
  created: v.array(v.string()),
  updated: v.array(v.string()),
  skipped: v.array(v.string()),
  noops: v.array(v.string()),
  blockedChanges: v.array(jsonValueValidator),
  warnings: v.optional(v.array(jsonValueValidator)),
  changes: v.optional(v.array(jsonValueValidator)),
  summary: v.optional(jsonValueValidator),
  assets: v.optional(
    v.object({
      referenced: v.number(),
      uploaded: v.number(),
      skipped: v.number(),
      unresolvedAllowed: v.optional(v.boolean()),
    }),
  ),
  entries: v.optional(
    v.object({
      created: v.array(v.string()),
      updated: v.array(v.string()),
      skipped: v.array(v.string()),
      published: v.optional(v.array(v.string())),
    }),
  ),
})

/** Import preview result */
export const importPreviewResultValidator = v.object({
  importRunId: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal('previewed'),
      v.literal('blocked'),
      v.literal('applied'),
      v.literal('published'),
      v.literal('failed'),
    ),
  ),
  collections: v.array(jsonValueValidator),
  entries: v.optional(v.array(jsonValueValidator)),
  assets: v.optional(v.array(jsonValueValidator)),
  warnings: v.optional(v.array(jsonValueValidator)),
  blockers: v.optional(v.array(jsonValueValidator)),
  summary: v.optional(jsonValueValidator),
})

/** Persisted collection import preview/apply report */
export const importRunValidator = v.object({
  _id: v.string(),
  importRunId: v.string(),
  kind: v.union(v.literal('preview'), v.literal('apply')),
  status: importRunStatusValidator,
  publish: v.boolean(),
  publishLocales: v.array(v.string()),
  source: jsonObjectValidator,
  request: jsonObjectValidator,
  summary: jsonObjectValidator,
  collectionSlugs: v.array(v.string()),
  collectionCount: v.number(),
  entryCount: v.number(),
  assetCount: v.number(),
  result: jsonObjectValidator,
  createdBy: v.string(),
  createdAt: v.number(),
})
