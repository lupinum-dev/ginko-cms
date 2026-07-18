import { v } from 'convex/values'
import type { Validator } from 'convex/values'

import type {
  PublishImpactChangeKind,
  PublishImpactStatus,
  PublishReviewPreview,
  ReviewSummary,
} from '../readiness.js'

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
) as Validator<PublishImpactStatus, 'required', string>

export const ginkoPublishImpactChangeKindValidator = v.union(
  v.literal('route'),
  v.literal('redirect'),
  v.literal('sitemap'),
  v.literal('search'),
  v.literal('nav'),
  v.literal('seo'),
) as Validator<PublishImpactChangeKind, 'required', string>

export const ginkoPublishImpactChangeValidator = v.object({
  locale: v.string(),
  entryId: v.optional(v.string()),
  scope: v.optional(v.union(v.literal('current_entry'), v.literal('descendant'))),
  kind: ginkoPublishImpactChangeKindValidator,
  label: v.string(),
  before: v.union(v.string(), v.boolean(), v.null()),
  after: v.union(v.string(), v.boolean(), v.null()),
})

export const ginkoPublishRouteImpactPageValidator = v.object({
  // Exact only once the generation-fenced traversal reaches its final page.
  total: v.union(v.number(), v.null()),
  listed: v.number(),
  hasMore: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  routeGeneration: v.number(),
  impactHash: v.string(),
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
  routeImpact: ginkoPublishRouteImpactPageValidator,
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

export const ginkoPublishRouteImpactPageResultValidator = v.object({
  collection: v.string(),
  entryId: v.string(),
  locale: v.string(),
  draftVersion: v.number(),
  routeGeneration: v.number(),
  changes: v.array(ginkoPublishImpactChangeValidator),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
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
      routeImpact: ginkoPublishRouteImpactPageValidator,
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
}) as Validator<PublishReviewPreview, 'required', string>

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
  affectedPublicUrlCount: v.number(),
  affectedPublicUrlsHasMore: v.boolean(),
  changeCount: v.number(),
  blockerCount: v.number(),
  warningCount: v.number(),
  blockingIssueCodes: v.array(v.string()),
  warningIssueCodes: v.array(v.string()),
}) as Validator<ReviewSummary, 'required', string>
