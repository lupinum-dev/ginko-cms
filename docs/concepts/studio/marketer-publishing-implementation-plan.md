# Marketer Publishing Implementation Plan

This document is the implementation work order for the marketer publishing
pipeline refactor.

It is intentionally more explicit than the product direction document. The goal
is that a mid-level engineer can take one phase, follow the checklist, and avoid
re-deciding the architecture.

Related document:

- `docs/concepts/studio/marketer-publishing-pipeline.md`
- `docs/concepts/studio/marketer-publishing-agent-success-protocol.md`
- `docs/concepts/studio/marketer-publishing-agent-experiments.md`
- `docs/concepts/studio/marketer-publishing-agent-task-packets.md`
- `docs/concepts/studio/marketer-publishing-full-implementation-goal-prompt.md`

## Document Rules

- [ ] Keep this file focused on implementation, not product positioning.
- [ ] Use the agent success protocol when assigning work to coding agents.
- [ ] Use the experiment log when calibrating prompts or comparing agent runs.
- [ ] Use the task packet file for copyable implementer and reviewer prompts.
- [ ] Update checklist items as work is completed.
- [ ] Add file-level notes only when they change implementation behavior.
- [ ] Do not add new architectural options without marking one as accepted.
- [ ] Do not keep competing implementation paths in this document.
- [ ] When a phase changes, update its acceptance criteria in the same commit.
- [ ] When code is deleted, mark the replacement map item as complete.
- [ ] When a new invariant is discovered, add a backend test item.
- [ ] When a new UI state is introduced, add a frontend rendering test item.
- [ ] Keep phase checklists granular enough for review.
- [ ] Do not use this file as a changelog.
- [ ] Do not mark a task complete until the tests named for that task pass.

## Fixed Product Decisions

- [ ] Ginko CMS is a focused CMS for Ginko/Nuxt marketing and content sites.
- [ ] Ginko CMS is not a generic admin platform.
- [ ] Ginko CMS is not a visual page builder.
- [ ] Ginko CMS is not a schema builder.
- [ ] Ginko CMS is not a backend abstraction framework.
- [ ] Host app code defines collections and presentation.
- [ ] Studio and MCP inspect collection contracts but do not mutate schema.
- [ ] Raw MDC is the canonical editable body source.
- [ ] Public website reads use active published projections only.
- [ ] Convex is the hard v1 backend foundation.
- [ ] Better Auth is the hard v1 auth foundation.
- [ ] Missing translations are incomplete work, not global publish blockers.
- [ ] Each locale can be previewed independently.
- [ ] Each locale can be published independently.
- [ ] Required fields may be empty in saved drafts.
- [ ] Required fields block publish in every collection mode.
- [ ] Data-only collections obey the same required-field publish rules.
- [ ] Humans and agents use the same permission model.
- [ ] Humans and agents use the same guarded operation paths.
- [ ] An agent with publish permission can publish directly.
- [ ] An agent without publish permission requests review or fails closed.
- [ ] Direct AI publishing is a v1 product goal.
- [ ] Delete is not a normal v1 content operation.
- [ ] Archive and restore are the normal reversible content operations.
- [ ] MCP is opt-in, authenticated, scoped, and operation-based.
- [ ] MCP tools must not bypass Convex operations for sensitive writes.
- [ ] Public provider is not a readiness consumer.
- [ ] Public provider output must match active projections after publish.
- [ ] Parent route changes automatically rebuild published descendants in the same locale.
- [ ] Descendant draft content is not published as a side effect of route rebuild.
- [ ] Descendant route collisions block publish before projections change.
- [ ] Asset metadata must have one explicit freshness model.
- [ ] Developer diagnostics remain available but secondary.
- [ ] Primary marketer UI avoids backend vocabulary.

## Hard Non-Goals

- [ ] Do not introduce a stored workflow state table.
- [ ] Do not store `ready`, `needs_work`, or `live_with_changes` as canonical state.
- [ ] Do not create a second source of truth for publishability.
- [ ] Do not make public provider queries read draft/editor readiness.
- [ ] Do not add generic runtime relation expansion.
- [ ] Do not promise broad include/depth APIs for v1.
- [ ] Do not add a visual page builder.
- [ ] Do not move CMS policy into `ginko-content`.
- [ ] Do not put CMS domain logic in Nuxt bridge transport code.
- [ ] Do not put publish invariants in Vue components.
- [ ] Do not let MCP store caller-provided review preview JSON as truth.
- [ ] Do not let AI tools use raw Convex table writes for editorial operations.
- [ ] Do not add compatibility shims for unreleased internal paths.
- [ ] Do not keep old readiness helpers alive beside the new readiness model.
- [ ] Do not add a route-tree state machine.
- [ ] Do not silently publish descendant draft content during subtree route rebuild.
- [ ] Do not create route redirects automatically unless a dedicated redirect decision is made.
- [ ] Do not change public package exports before the shape is stable.
- [ ] Do not add stored projections without a rebuild story and tests.
- [ ] Do not hide publish warnings behind a simple `Ready` state.

## Implementation North Star

The implementation must make this workflow true:

```txt
Write -> Check -> Preview -> Review -> Publish -> Track
```

The implementation must also make this technical statement true:

```txt
Studio, MCP, review approval, publish preview, and publish execution derive
their workflow decisions from the same backend readiness vocabulary and exact
readiness detail. Public provider reads active projections only.
```

## Implementation Summary

- [ ] Define canonical readiness vocabulary.
- [ ] Define exact `EntryReadinessDetail`.
- [ ] Define cheap `EntryWorkflowSummary`.
- [ ] Compute exact readiness in Convex from canonical state.
- [ ] Compute cheap workflow summaries in Convex from canonical state.
- [ ] Replace page-specific Studio readiness rules.
- [ ] Replace local publish readiness presentation paths.
- [ ] Replace review preview presentation paths.
- [ ] Make Convex compute review preview.
- [ ] Make review approval re-check current backend preview.
- [ ] Make authorized human publish and authorized agent publish share one path.
- [ ] Make archive and restore operation-based for humans and agents.
- [ ] Move locale/default-locale truth into the first vertical slice.
- [ ] Implement automatic subtree route rebuild.
- [ ] Keep public provider published-only.
- [ ] Add invariant tests before broad UI work.

## Packages And Ownership

### `@lupinum/ginko-cms-contract`

- [ ] Own stable readiness state vocabulary.
- [ ] Own stable readiness issue code vocabulary.
- [ ] Own stable readiness action code vocabulary.
- [ ] Own shared public content shapes.
- [ ] Own field definitions and validators.
- [ ] Own Convex-compatible schemas that are stable enough to export.
- [ ] Do not expose experimental Studio-only shapes as public API too early.

### `@lupinum/ginko-cms-convex`

- [ ] Own exact readiness computation.
- [ ] Own cheap workflow summary computation.
- [ ] Own publish preview.
- [ ] Own publish execute.
- [ ] Own review request creation.
- [ ] Own review approval.
- [ ] Own agent operation enforcement.
- [ ] Own destructive confirmations.
- [ ] Own audit logs.
- [ ] Own subtree route rebuild.
- [ ] Own published projections.
- [ ] Own asset refs.
- [ ] Own revalidation events.
- [ ] Own diagnostics.

### `@lupinum/ginko-cms`

- [ ] Own Nuxt module integration.
- [ ] Own Studio host.
- [ ] Own auth pages.
- [ ] Own public API routes.
- [ ] Own filesystem migration UX.
- [ ] Own CMS provider integration.
- [ ] Own setup validation.
- [ ] Own Studio UI copy mapping from readiness codes.
- [ ] Own MCP server surface.
- [ ] Do not own backend publish invariants.

### `ginko-content`

- [ ] Remain provider-neutral.
- [ ] Read published provider output only.
- [ ] Own provider-facing cache hints.
- [ ] Own the revalidation endpoint contract.
- [ ] Do not gain CMS-specific workflow behavior.
- [ ] Do not know draft/editor readiness.

## Canonical Source Of Truth Map

| Concept            | Canonical Owner                               | Derived Consumers                   | Notes                                        |
| ------------------ | --------------------------------------------- | ----------------------------------- | -------------------------------------------- |
| Collection schema  | Host app code and contract definitions        | Studio, Convex, MCP                 | Studio and MCP inspect only.                 |
| Draft content      | Convex `entries` plus draft rows              | Studio editor, readiness detail     | Draft saves can be incomplete.               |
| Canonical body     | Raw MDC                                       | AST/search/TOC projections          | Raw MDC remains editable source.             |
| Editor state       | Studio local state                            | None                                | Unsaved UI state is not backend truth.       |
| Localized fields   | Draft locale rows                             | Readiness, publish                  | Per-locale publishability.                   |
| Published content  | Active public projections                     | Public provider, sitemap/search/nav | Public reads use this only.                  |
| Public routes      | `publicRoutes`                                | Provider, diagnostics, readiness    | Unique by `locale/path`.                     |
| Relations          | Stable references in canonical content        | Diagnostics, publish preview        | No broad runtime expansion v1.               |
| Assets             | Asset records and asset refs                  | Readiness, public projections       | Freshness model must be explicit.            |
| Members/auth       | Better Auth plus Convex members               | Studio, MCP guards                  | Same actor model for human and agent.        |
| MCP authority      | Scoped MCP credentials and app identity       | MCP tools                           | Tools call operations.                       |
| Publish state      | Revisions and active projections              | Readiness, history                  | No stored workflow state.                    |
| Revalidation state | Convex revalidation events                    | Track UI, diagnostics               | Durable delivery owned by CMS.               |
| Cache dependencies | CMS dependency resolution plus provider hints | Revalidation                        | Host owns concrete cache adapters.           |
| Site data          | Convex site data records                      | Provider, Studio                    | Same publish/readiness rules where relevant. |
| Review requests    | Convex review request records                 | Review UI, MCP                      | Preview computed in Convex.                  |
| Agent runs         | Convex agent run records                      | MCP, review UI                      | Operation audit remains authoritative.       |
| Locale config      | Convex/site runtime config decision           | Readiness, provider, Studio         | Must be settled before UI expansion.         |

## Canonical Readiness States

### `draft`

- [ ] Means a draft exists.
- [ ] Means the locale is not currently publish-ready.
- [ ] Means no publish-blocking preview has been requested or computed for the current draft.
- [ ] Does not mean invalid.
- [ ] Does not mean unpublished forever.
- [ ] May include saved empty required fields.
- [ ] May include unsatisfied SEO requirements.
- [ ] May include missing assets.
- [ ] May include missing route data.
- [ ] Must not be manually assigned by Studio.

### `needs_work`

- [ ] Means the locale cannot publish now.
- [ ] Means at least one blocking issue exists.
- [ ] Required empty fields produce this state.
- [ ] Missing parent locale route produces this state.
- [ ] Route collision produces this state.
- [ ] Descendant route collision produces this state.
- [ ] Invalid asset policy produces this state when asset policy is required for publish.
- [ ] Invalid relation target produces this state when relation validity blocks publish.
- [ ] Stale review request can produce this state for review action.
- [ ] Must include issue codes that explain the blocker.

### `ready`

- [ ] Means canonical publish preview can execute for the current draft version.
- [ ] Means required fields are valid.
- [ ] Means route rules are valid.
- [ ] Means parent route dependencies are valid.
- [ ] Means descendant rebuild preflight passes when relevant.
- [ ] Means route collisions do not exist.
- [ ] Means publish confirmation can be requested.
- [ ] Does not mean warnings are absent.
- [ ] Does not mean all translations exist.
- [ ] Does not mean public provider has already updated.

### `in_review`

- [ ] Means a non-stale review request exists for the entry, locale, and version.
- [ ] May be created by a human.
- [ ] May be created by an agent.
- [ ] Must be stale if current draft version changes.
- [ ] Must be stale if current readiness becomes blocked.
- [ ] Must not trust caller-provided preview JSON.
- [ ] Must retain developer details outside primary marketer UI.
- [ ] Must expose approve/reject/request-changes actions according to permissions.

### `live`

- [ ] Means the locale has an active public projection.
- [ ] Means the draft has no unpublished changes for that locale.
- [ ] Means public provider can read the active projection.
- [ ] Does not mean every translation is live.
- [ ] Does not mean descendants are unchanged.
- [ ] Must include public URL when route-backed.

### `live_with_changes`

- [ ] Means the locale has an active public projection.
- [ ] Means draft content differs from the active published revision for that locale.
- [ ] Must be derived from backend canonical hashes or equivalent precise comparison.
- [ ] Must not be guessed by Vue components.
- [ ] Must be per-locale.
- [ ] Must not become global entry dirty state.

### `missing`

- [ ] Means the locale is configured.
- [ ] Means no draft variant exists for that locale.
- [ ] Means this locale cannot publish.
- [ ] Must not block publishing other ready locales.
- [ ] Must appear in readiness detail.
- [ ] Must appear in language version UI.
- [ ] Must be available to AI translation actions.

## Canonical Readiness Type Shapes

The first implementation should keep full detail internal until the shape has
proven stable. Stable state, issue, and action codes can live in the contract
package earlier than the full detail shape.

```ts
export type ReadinessState =
  | 'draft'
  | 'needs_work'
  | 'ready'
  | 'in_review'
  | 'live'
  | 'live_with_changes'
  | 'missing'

export type ReadinessSeverity = 'blocker' | 'warning' | 'info'

export type ReadinessIssue = {
  code: ReadinessIssueCode
  severity: ReadinessSeverity
  locale: string | null
  fieldPath: string | null
  messageParams: Record<string, string | number | boolean | null>
  diagnosticId: string | null
}

export type ReadinessAction = {
  kind: ReadinessActionKind
  locale: string | null
  target: ReadinessActionTarget
  params: Record<string, string | number | boolean | null>
}

export type ReadinessActionTarget =
  | 'editor'
  | 'field'
  | 'locale'
  | 'asset'
  | 'route'
  | 'review'
  | 'publish'
  | 'settings'
  | 'diagnostics'

export type EntryReadinessLocale = {
  locale: string
  state: ReadinessState
  blockers: ReadinessIssue[]
  warnings: ReadinessIssue[]
  infos: ReadinessIssue[]
  nextAction: ReadinessAction
  draftExists: boolean
  published: boolean
  hasUnpublishedChanges: boolean
  canPreview: boolean
  canRequestReview: boolean
  canPublish: boolean
  canArchive: boolean
  publicUrl: string | null
  draftUrl: string | null
  affectedPublicUrls: AffectedPublicUrl[]
  reviewRequestId: string | null
  currentDraftVersion: number | null
  currentPublishedRevisionId: string | null
}

export type AffectedPublicUrl = {
  entryId: string
  locale: string
  kind: 'current_entry' | 'descendant'
  beforePath: string | null
  afterPath: string | null
  beforeHref: string | null
  afterHref: string | null
  reason: 'publish' | 'route_changed' | 'parent_route_changed' | 'unpublish' | 'archive'
}

export type EntryReadinessDetail = {
  entryId: string
  collection: string
  primaryLocale: string
  locales: EntryReadinessLocale[]
  updatedAt: number
}

export type EntryWorkflowSummary = {
  entryId: string
  collection: string
  primaryLocale: string
  statesByLocale: Record<string, ReadinessState>
  highestPriorityState: ReadinessState
  issueCounts: {
    blockers: number
    warnings: number
    infos: number
  }
  nextAction: ReadinessAction
  publishedLocales: string[]
  missingLocales: string[]
  readyLocales: string[]
  reviewLocales: string[]
  updatedAt: number
}
```

## Readiness Issue Code Registry

### Required Content Issues

- [ ] `required_field_missing`: a required field is empty or invalid for publish.
- [ ] `required_localized_field_missing`: a required localized field is empty or invalid for publish.
- [ ] `required_shared_field_missing`: a required shared field is empty or invalid for publish.
- [ ] `body_required`: body content is required and empty.
- [ ] `seo_title_required`: SEO title is required and missing.
- [ ] `seo_description_required`: SEO description is required and missing.
- [ ] `asset_alt_required`: asset alt text is required and missing.
- [ ] `asset_caption_required`: asset caption is required and missing.
- [ ] `collection_schema_invalid`: draft content does not satisfy the collection schema.
- [ ] `data_only_required_field_missing`: data-only publish is blocked by a required field.

### Locale Issues

- [ ] `locale_missing`: configured locale has no draft variant.
- [ ] `locale_not_configured`: requested locale is not configured for this collection/site.
- [ ] `primary_locale_missing`: primary locale draft is missing.
- [ ] `default_locale_unknown`: runtime default locale cannot be resolved.
- [ ] `fallback_not_configured`: requested fallback behavior is not configured.
- [ ] `locale_parent_missing`: parent is not public in the same locale.
- [ ] `locale_public_projection_missing`: expected public projection is missing.
- [ ] `locale_public_route_missing`: expected public route is missing.
- [ ] `locale_slug_missing`: localized slug is required and missing.
- [ ] `locale_switch_target_missing`: language switch target does not exist.

### Route Issues

- [ ] `route_missing`: route-backed entry has no publishable route.
- [ ] `route_collision`: route collides with another active public route.
- [ ] `route_reserved`: route uses a reserved path.
- [ ] `route_invalid`: route does not satisfy route validation.
- [ ] `route_parent_not_public`: parent route is not public in the same locale.
- [ ] `route_descendant_collision`: automatic subtree rebuild would collide.
- [ ] `route_descendant_rebuild_failed`: descendant projection rebuild failed.
- [ ] `route_cycle_detected`: parent relationship creates a cycle.
- [ ] `route_depth_exceeded`: route tree exceeds supported depth.
- [ ] `route_slug_unchanged_noop`: route change request has no effective change.

### Review Issues

- [ ] `review_request_stale`: review request no longer matches current draft version.
- [ ] `review_preview_stale`: review preview no longer matches current backend preview.
- [ ] `review_preview_missing`: review request has no Convex-computed preview.
- [ ] `review_not_authorized`: actor cannot approve or reject this review.
- [ ] `review_already_closed`: review request is already approved, rejected, or canceled.
- [ ] `review_publish_blocked`: approval cannot publish because current preview is blocked.
- [ ] `review_locale_mismatch`: review locales do not match current operation locales.
- [ ] `review_version_hash_mismatch`: expected review version hash does not match.

### Permission Issues

- [ ] `permission_publish_missing`: actor cannot publish this entry/locale.
- [ ] `permission_review_missing`: actor cannot request review.
- [ ] `permission_archive_missing`: actor cannot archive this entry.
- [ ] `permission_restore_missing`: actor cannot restore this entry.
- [ ] `permission_agent_scope_missing`: agent credential lacks required scope.
- [ ] `permission_member_inactive`: member identity is inactive.
- [ ] `permission_api_key_revoked`: API key is revoked.
- [ ] `permission_role_not_allowed`: role does not grant the requested operation.

### Agent Issues

- [ ] `agent_run_missing`: requested agent run does not exist.
- [ ] `agent_run_not_owned`: actor cannot use this agent run.
- [ ] `agent_run_closed`: agent run is already completed or canceled.
- [ ] `agent_publish_requires_permission`: direct agent publish requires publish permission.
- [ ] `agent_archive_requires_permission`: direct agent archive requires archive permission.
- [ ] `agent_restore_requires_permission`: direct agent restore requires restore permission.
- [ ] `agent_review_required`: agent lacks publish permission and must request review.
- [ ] `agent_operation_not_supported`: requested agent operation is not supported.

### Asset Issues

- [ ] `asset_missing`: referenced asset does not exist.
- [ ] `asset_not_public`: referenced asset cannot be used in published content.
- [ ] `asset_policy_blocked`: asset policy blocks publish.
- [ ] `asset_metadata_stale`: published asset metadata no longer matches chosen freshness model.
- [ ] `asset_alt_missing`: asset alt metadata is missing.
- [ ] `asset_caption_missing`: asset caption metadata is missing.
- [ ] `asset_ref_rebuild_failed`: asset reference rebuild failed.
- [ ] `asset_upload_pending`: asset upload is not complete.

### Relation Issues

- [ ] `relation_target_missing`: referenced content does not exist.
- [ ] `relation_target_not_public`: referenced content must be public but is not.
- [ ] `relation_locale_missing`: relation target is missing required locale.
- [ ] `relation_collection_invalid`: relation points to an unsupported collection.
- [ ] `relation_cycle_detected`: relation creates an unsupported cycle.
- [ ] `relation_validation_failed`: relation validator blocked publish.

### Projection Issues

- [ ] `projection_public_entry_missing`: public entry projection is missing.
- [ ] `projection_public_route_missing`: public route projection is missing.
- [ ] `projection_revision_missing`: projection points at missing revision.
- [ ] `projection_revision_locale_missing`: revision lacks requested locale snapshot.
- [ ] `projection_rebuild_failed`: projection rebuild failed.
- [ ] `projection_route_mismatch`: route projection does not match public entry projection.
- [ ] `projection_asset_ref_mismatch`: public asset refs do not match projection content.
- [ ] `projection_cache_tags_missing`: projection lacks expected cache tags.

### Revalidation Issues

- [ ] `revalidation_pending`: website refresh has not completed yet.
- [ ] `revalidation_failed`: website refresh failed.
- [ ] `revalidation_delivery_missing`: durable delivery record is missing.
- [ ] `revalidation_adapter_unconfigured`: host cache adapter is not configured.
- [ ] `revalidation_cache_tag_missing`: required cache tag is missing.
- [ ] `revalidation_event_stale`: revalidation event is stale.

### System Issues

- [ ] `settings_missing`: CMS settings are missing.
- [ ] `collection_missing`: collection does not exist.
- [ ] `entry_missing`: entry does not exist.
- [ ] `entry_archived`: entry is archived.
- [ ] `entry_collection_mismatch`: entry does not belong to collection.
- [ ] `draft_version_conflict`: draft changed since preview.
- [ ] `draft_hash_mismatch`: draft hash changed since preview.
- [ ] `confirmation_missing`: destructive confirmation token is missing.
- [ ] `confirmation_expired`: destructive confirmation token expired.
- [ ] `confirmation_mismatch`: destructive confirmation does not match preview.

## Readiness Action Code Registry

### Editing Actions

- [ ] `continue_editing`: open editor for current locale.
- [ ] `fill_required_field`: focus missing required field.
- [ ] `fill_required_localized_field`: focus missing localized field.
- [ ] `fill_required_shared_field`: focus missing shared field.
- [ ] `edit_body`: focus body editor.
- [ ] `edit_seo`: open SEO section.
- [ ] `edit_asset_metadata`: open asset metadata editor.
- [ ] `replace_asset`: open asset picker.
- [ ] `fix_relation`: open relation field.

### Locale Actions

- [ ] `add_locale`: create missing locale variant.
- [ ] `copy_from_primary`: copy primary locale as translation starter.
- [ ] `ask_ai_to_translate`: start agent translation operation.
- [ ] `switch_locale`: switch editor locale.
- [ ] `publish_locale`: publish one locale.
- [ ] `publish_all_ready`: publish all ready locales.
- [ ] `check_language_switch`: open language switch readiness.
- [ ] `fix_parent_locale`: open parent entry in same locale.

### Route Actions

- [ ] `set_slug`: focus slug field.
- [ ] `check_routes`: run route readiness diagnostics.
- [ ] `resolve_route_collision`: show colliding route.
- [ ] `preview_subtree_rebuild`: show descendant URL changes.
- [ ] `publish_with_subtree_rebuild`: publish parent and rebuild descendants.
- [ ] `open_parent_entry`: open parent entry.
- [ ] `open_child_entry`: open child entry.

### Review Actions

- [ ] `request_review`: create review request.
- [ ] `approve_review`: approve and publish.
- [ ] `reject_review`: reject review request.
- [ ] `request_changes`: request changes on review.
- [ ] `refresh_review_preview`: recompute review preview.
- [ ] `open_review`: open review card.

### Publish Actions

- [ ] `preview_publish`: run publish preview.
- [ ] `refresh_publish_preview`: refresh stale publish preview.
- [ ] `confirm_publish`: confirm publish operation.
- [ ] `publish_direct`: direct publish by authorized actor.
- [ ] `track_website_refresh`: open website refresh status.
- [ ] `view_public_page`: open public URL.

### Agent Actions

- [ ] `start_agent_run`: start agent run.
- [ ] `continue_agent_run`: continue agent run.
- [ ] `cancel_agent_run`: cancel agent run.
- [ ] `agent_prepare_draft`: agent prepares draft.
- [ ] `agent_request_review`: agent requests review.
- [ ] `agent_publish`: authorized agent publishes.
- [ ] `agent_archive`: authorized agent archives.
- [ ] `agent_restore`: authorized agent restores.
- [ ] `review_agent_scope`: open agent credential settings.

### Recovery Actions

- [ ] `save_version`: create version checkpoint with marketer copy.
- [ ] `restore_version`: restore version.
- [ ] `archive_entry`: archive entry.
- [ ] `restore_entry`: restore archived entry.
- [ ] `open_history`: open history panel.
- [ ] `open_diagnostics`: open developer diagnostics.
- [ ] `retry_revalidation`: retry website refresh.

## Existing Code Replacement Map

### Studio Readiness Helpers

- [ ] Replace `packages/cms/studio-app/src/lib/publicWorkflow.ts` entry next-action derivation with readiness action mapping.
- [ ] Replace `deriveEntryNextAction` with backend-provided action kind.
- [ ] Replace `derivePublishReadinessFromOperationPreview` presentation decisions with backend readiness detail mapping.
- [ ] Keep formatting helpers only if they map stable codes to copy.
- [ ] Delete duplicated route status mapping once readiness detail covers it.
- [ ] Delete duplicated translation suggested-action rules once readiness detail covers it.
- [ ] Keep UI-only date formatting and count formatting in Studio.

### Entry Editor Page

- [ ] Replace local `publicVisibility` readiness decisions in `packages/cms/studio-app/src/pages/[collection]/[id].vue`.
- [ ] Replace local `publishImpact` readiness decisions in the entry page.
- [ ] Replace local `translationReadiness` derived rules in the entry page.
- [ ] Keep state for selected locale and panel visibility only.
- [ ] Keep local unsaved-draft UI state only.
- [ ] Ensure save-before-preview remains explicit.
- [ ] Ensure stale preview state comes from backend version/hash checks.

### Publish Composable

- [ ] Replace `PublishReadinessState` duplication in `useEntryPublishing.ts`.
- [ ] Keep mutation orchestration.
- [ ] Keep dialog visibility state.
- [ ] Keep current publish mode UI state.
- [ ] Remove frontend-only publishability decisions.
- [ ] Ensure confirmation token handling remains tied to backend preview.

### Entry Status Rail

- [ ] Replace locally merged blocking issues with readiness detail blockers.
- [ ] Replace translation readiness panel data with readiness detail locales.
- [ ] Replace public visibility labels with readiness detail public URLs and state.
- [ ] Keep developer diagnostics accordion.
- [ ] Keep visual grouping and copy mapping.
- [ ] Ensure issue code mapping is tested.

### Review Page

- [ ] Replace raw preview JSON as primary review content.
- [ ] Keep raw preview JSON in developer details only.
- [ ] Display Convex-computed review summary.
- [ ] Display actor type: human or agent.
- [ ] Display permission-aware actions.
- [ ] Display stale state from backend.
- [ ] Display affected public URLs.
- [ ] Display direct publish path when authorized.

### Convex Review Requests

- [ ] Stop trusting caller-provided preview JSON as review truth.
- [ ] Compute review preview in Convex during request creation.
- [ ] Store derived marketer review summary.
- [ ] Store enough version/hash data to detect stale reviews.
- [ ] Recompute current preview on approval.
- [ ] Fail approval if current preview is blocked.
- [ ] Publish through canonical backend path.
- [ ] Audit review approval and publish result.

### MCP Review Tools

- [ ] Remove client-side preview truth from request-review tool.
- [ ] Make MCP request review call Convex operation that computes preview.
- [ ] Add authorized direct publish tool only through operation path.
- [ ] Add archive tool only through operation path.
- [ ] Add restore tool only through operation path.
- [ ] Ensure every MCP write requires app identity.
- [ ] Ensure every MCP write checks role and scope.
- [ ] Ensure diagnostics redact sensitive values.

### Publish Operation

- [ ] Make publish preview produce readiness-compatible detail.
- [ ] Make publish execute consume the same loaded context as preview when safe.
- [ ] Keep destructive confirmation for destructive or website-changing operations.
- [ ] Re-run preview before execute.
- [ ] Hash preview and version.
- [ ] Audit operation.
- [ ] Emit revalidation events durably.
- [ ] Include descendant route rebuild effects in preview and execute.

### Diagnostics

- [ ] Keep developer diagnostics detailed.
- [ ] Reuse route collision helper in readiness and projection maintenance.
- [ ] Reuse required-field helper in readiness and publish preview.
- [ ] Reuse relation diagnostics in readiness and publish preview.
- [ ] Reuse asset diagnostics in readiness and publish preview.
- [ ] Ensure diagnostics can explain exact issue code.
- [ ] Ensure diagnostics are not the primary marketer UI contract.

### Public Provider

- [ ] Keep provider reads on active projections only.
- [ ] Remove hardcoded default locale.
- [ ] Ensure provider receives runtime default locale.
- [ ] Ensure public translations include only published provider output.
- [ ] Ensure missing configured locales appear in Studio readiness, not public content output.
- [ ] Ensure provider contract tests cover subtree route rebuild output after publish.

## Phase 0: Freeze Vocabulary, Scope, And Test Fixtures

### Goal

Define the vocabulary, invariants, fixture shape, and PR boundaries before
implementation starts.

### Files Likely Touched

- [ ] `docs/concepts/studio/marketer-publishing-implementation-plan.md`
- [ ] `docs/concepts/studio/marketer-publishing-pipeline.md`
- [ ] `packages/contract/src`
- [ ] `test/shared/studio-workflow.test.ts`
- [ ] `test/component/diagnostics.test.ts`
- [ ] `test/component/reviewRequests.test.ts`
- [ ] `test/component/public-api.test.ts`
- [ ] `test/refactor/provider-contract.test.ts`
- [ ] `test/module/module-i18n.test.ts`

### Phase 0 Checklist

- [ ] Confirm state vocabulary exactly matches this document.
- [ ] Confirm issue code registry exactly matches this document or update both.
- [ ] Confirm action code registry exactly matches this document or update both.
- [ ] Decide which vocabulary exports are public contract exports.
- [ ] Decide which detail shapes remain internal during first implementation.
- [ ] Create fixture for one route-backed collection.
- [ ] Create fixture for one data-only collection.
- [ ] Create fixture for locales `en`, `de`, and `fr`.
- [ ] Create fixture with primary locale published.
- [ ] Create fixture with secondary locale missing.
- [ ] Create fixture with secondary locale draft missing required SEO.
- [ ] Create fixture with secondary locale ready.
- [ ] Create fixture with parent page and child page.
- [ ] Create fixture with published child page.
- [ ] Create fixture with route collision candidate.
- [ ] Create fixture with non-`en` default locale.
- [ ] Create fixture with agent identity that can edit only.
- [ ] Create fixture with agent identity that can publish.
- [ ] Create fixture with human editor that cannot publish.
- [ ] Create fixture with human publisher.
- [ ] Create fixture with asset requiring alt text.
- [ ] Create fixture with relation target not public.
- [ ] Add failing test for exact readiness detail states.
- [ ] Add failing test for cheap workflow summary states.
- [ ] Add failing test for required fields blocking publish.
- [ ] Add failing test for data-only required fields blocking publish.
- [ ] Add failing test for Convex-computed review preview.
- [ ] Add failing test for authorized agent publish parity.
- [ ] Add failing test for unauthorized agent publish fail-closed behavior.
- [ ] Add failing test for subtree rebuild preview.
- [ ] Add failing test for subtree rebuild execute.
- [ ] Add failing test for subtree collision blocking.
- [ ] Add failing test for provider reads after subtree rebuild.
- [ ] Add failing test for public provider default locale.
- [ ] Add failing test for missing configured locales in readiness detail.
- [ ] Add failing test for missing configured locales not leaking as public content.

### Phase 0 Review Gate

- [ ] A reviewer can explain every readiness state without reading Vue code.
- [ ] A reviewer can explain actor parity for humans and agents.
- [ ] A reviewer can explain why public provider is not a readiness consumer.
- [ ] A reviewer can explain automatic subtree rebuild.
- [ ] A reviewer can point to failing tests for each core invariant.
- [ ] No implementation code has added a stored workflow state.
- [ ] No public export has been widened accidentally.

### Phase 0 Completion Criteria

- [ ] Failing tests exist for all core invariants.
- [ ] Vocabulary ownership is documented.
- [ ] The implementation phases are accepted.
- [ ] The first PR can start without architectural guessing.

## Phase 1: Contract Vocabulary And Internal Types

### Goal

Create stable readiness vocabulary and internal detail types without freezing
experimental shapes as public API too early.

### Files Likely Touched

- [ ] `packages/contract/src`
- [ ] `packages/contract/package.json`
- [ ] `packages/convex/src`
- [ ] `packages/cms/studio-app/src`
- [ ] `test/shared/studio-workflow.test.ts`

### Phase 1 Checklist

- [ ] Add `ReadinessState` type.
- [ ] Add `ReadinessSeverity` type.
- [ ] Add `ReadinessIssueCode` type.
- [ ] Add `ReadinessActionKind` type.
- [ ] Add `ReadinessActionTarget` type.
- [ ] Add runtime validator for readiness state.
- [ ] Add runtime validator for readiness severity.
- [ ] Add runtime validator for readiness issue code.
- [ ] Add runtime validator for readiness action kind.
- [ ] Add runtime validator for readiness action target.
- [ ] Add shared issue-code metadata if needed for grouping.
- [ ] Add shared action-code metadata if needed for grouping.
- [ ] Avoid marketer-facing final copy in contract metadata.
- [ ] Keep copy mapping in Studio.
- [ ] Keep MCP response text generated from codes and params.
- [ ] Add type tests for state vocabulary.
- [ ] Add type tests for issue-code vocabulary.
- [ ] Add type tests for action-code vocabulary.
- [ ] Add internal `EntryReadinessDetail` type in Convex or internal CMS path.
- [ ] Add internal `EntryWorkflowSummary` type in Convex or internal CMS path.
- [ ] Do not expose full detail shape from public contract package unless explicitly approved.
- [ ] Add serializer helpers for Convex return values.
- [ ] Add issue builder helper.
- [ ] Add action builder helper.
- [ ] Add test ensuring unknown issue code fails validation.
- [ ] Add test ensuring unknown action code fails validation.
- [ ] Add test ensuring unknown state fails validation.
- [ ] Add test ensuring issue message params are JSON-safe.
- [ ] Add test ensuring action params are JSON-safe.

### Phase 1 Deletion Checklist

- [ ] Do not delete frontend helpers yet if no backend consumer exists.
- [ ] Mark frontend readiness helpers as pending replacement.
- [ ] Mark local publish readiness types as pending replacement.
- [ ] Mark review preview presentation types as pending replacement.

### Phase 1 Review Gate

- [ ] Public exports are intentionally minimal.
- [ ] Type names match this document.
- [ ] Validators reject invalid states.
- [ ] No UI copy moved into backend contract.
- [ ] No stored workflow state was added.

## Phase 2: Exact Readiness Detail Engine

### Goal

Compute exact per-entry/per-locale readiness in Convex from canonical state.

### Files Likely Touched

- [ ] `packages/convex/src/diagnostics.ts`
- [ ] `packages/convex/src/entries/read.ts`
- [ ] `packages/convex/src/entries/workflow/commands.ts`
- [ ] `packages/convex/src/reviewRequests.ts`
- [ ] `packages/convex/src/settings.ts`
- [ ] `packages/convex/src/lib/locale.ts`
- [ ] `test/component/diagnostics.test.ts`
- [ ] `test/shared/studio-workflow.test.ts`

### Exact Readiness Algorithm

- [ ] Load entry by id.
- [ ] Load collection for entry.
- [ ] Load CMS settings.
- [ ] Resolve configured locales.
- [ ] Resolve primary locale.
- [ ] Resolve runtime default locale.
- [ ] Load draft rows.
- [ ] Load active public projections for entry.
- [ ] Load active public routes for entry.
- [ ] Load non-stale review requests for entry.
- [ ] Load current revision metadata.
- [ ] For each configured locale, create one readiness locale record.
- [ ] If locale has no draft row, set `draftExists` false.
- [ ] If locale has no draft row and no public projection, set state `missing`.
- [ ] If locale has no draft row but has public projection, set state `live`.
- [ ] If locale has draft row, validate required fields.
- [ ] If locale has draft row, validate localized required fields.
- [ ] If locale has draft row, validate shared required fields.
- [ ] If collection is data-only, still validate publish-required fields.
- [ ] If collection is route-backed, validate route data.
- [ ] If collection is route-backed, validate parent route in same locale.
- [ ] If collection is route-backed, validate route collision.
- [ ] If parent route changes, compute descendant rebuild preview.
- [ ] If descendant rebuild preview has collision, add blocker.
- [ ] Validate relation diagnostics.
- [ ] Validate asset diagnostics.
- [ ] Attach review state if matching non-stale review exists.
- [ ] Compute published boolean from active projection.
- [ ] Compute `hasUnpublishedChanges` per locale.
- [ ] Compute public URL from active projection.
- [ ] Compute draft URL from draft route preview.
- [ ] Compute affected public URLs.
- [ ] Compute permissions for current actor.
- [ ] Compute `canPreview`.
- [ ] Compute `canRequestReview`.
- [ ] Compute `canPublish`.
- [ ] Compute `canArchive`.
- [ ] Choose next action from issues and permissions.
- [ ] Return sorted locales in configured locale order.
- [ ] Include updated timestamp.

### State Derivation Order

- [ ] If entry missing, throw typed CMS error.
- [ ] If collection missing, throw typed CMS error.
- [ ] If entry archived, return states that block publish.
- [ ] If locale not configured, return blocker for requested locale.
- [ ] If configured locale missing draft and missing public projection, use `missing`.
- [ ] If non-stale review exists and no blockers, use `in_review`.
- [ ] If blockers exist, use `needs_work`.
- [ ] If published and no unpublished changes, use `live`.
- [ ] If published and unpublished changes exist and preview is ready, use `live_with_changes`.
- [ ] If unpublished and preview is ready, use `ready`.
- [ ] If draft exists and readiness has not been previewed exactly, use `draft`.
- [ ] If exact preview is stale, return issue and action to refresh preview.

### Required Field Rules

- [ ] Saved drafts can omit required fields.
- [ ] Publish preview cannot allow required missing fields.
- [ ] Publish execute cannot allow required missing fields.
- [ ] Data-only collections cannot publish required missing fields.
- [ ] Route-backed collections cannot publish required missing fields.
- [ ] Missing localized required field blocks only that locale.
- [ ] Missing shared required field blocks every locale included in publish.
- [ ] Missing body blocks locale only when body is locale-specific.
- [ ] Missing body blocks all requested locales when body is shared.
- [ ] Required asset metadata blocks the locale using that asset.
- [ ] Required relation target blocks the locale using that relation.

### Review State Rules

- [ ] Review request belongs to entry.
- [ ] Review request includes locale.
- [ ] Review request status is pending.
- [ ] Review expected version equals current draft version.
- [ ] Review preview hash equals current backend preview hash.
- [ ] Review version hash equals current version hash when supplied.
- [ ] Stale review produces warning or blocker according to action context.
- [ ] Non-stale review sets `reviewRequestId`.
- [ ] Non-stale review can set state `in_review` when no publish blockers exist.

### Permission Rules

- [ ] Current actor can edit entry if edit guard passes.
- [ ] Current actor can request review if review guard passes.
- [ ] Current actor can publish if publish guard passes.
- [ ] Current actor can archive if archive guard passes.
- [ ] Human and agent actors use same guard path.
- [ ] Agent scopes restrict operations before role permissions allow them.
- [ ] Missing permission sets action to request review or explain blocker.
- [ ] Missing permission never changes backend publishability.

### Phase 2 Tests

- [ ] Test `missing` state for configured locale without draft.
- [ ] Test `draft` state for incomplete saved draft.
- [ ] Test `needs_work` for missing required localized field.
- [ ] Test `needs_work` for missing required shared field.
- [ ] Test `needs_work` for data-only missing required field.
- [ ] Test `ready` for valid unpublished locale.
- [ ] Test `in_review` for non-stale pending review.
- [ ] Test stale review does not produce valid `in_review`.
- [ ] Test `live` for published locale with no changes.
- [ ] Test `live_with_changes` for published locale with draft changes.
- [ ] Test primary locale can be ready while secondary locale is missing.
- [ ] Test missing secondary locale does not block primary publish.
- [ ] Test configured locale order is preserved.
- [ ] Test non-`en` default locale appears correctly.
- [ ] Test public provider is not called by readiness detail.
- [ ] Test exact detail includes issue codes, not final UI copy.

### Phase 2 Review Gate

- [ ] Exact readiness detail is computed in Convex.
- [ ] Vue components do not own new readiness rules.
- [ ] Tests cover every state.
- [ ] Tests cover data-only required-field behavior.
- [ ] Tests cover locale-specific behavior.
- [ ] No stored workflow state was added.

## Phase 3: Cheap Workflow Summary Engine

### Goal

Provide dashboard/list summaries that use the same vocabulary without running
the full heavy publish preview for every row.

### Files Likely Touched

- [ ] `packages/convex/src/entries/read.ts`
- [ ] `packages/convex/src/diagnostics.ts`
- [ ] `packages/cms/studio-app/src/pages/index.vue`
- [ ] `test/shared/studio-workflow.test.ts`

### Summary Rules

- [ ] Use same `ReadinessState` values as exact detail.
- [ ] Use same issue code values as exact detail.
- [ ] Use same action kind values as exact detail.
- [ ] Summary may be conservative.
- [ ] Summary must not claim exact `ready` if exact readiness would need expensive checks.
- [ ] Summary may say `draft` or `needs_work` with `check_required` action when uncertain.
- [ ] Summary must include configured missing locales when cheap to know.
- [ ] Summary must include published locale list.
- [ ] Summary must include ready locale list only when confidently known.
- [ ] Summary must include review locale list.
- [ ] Summary must include issue counts.
- [ ] Summary must not include full diagnostic payload.
- [ ] Summary must not include confirmation tokens.
- [ ] Summary must not include raw review preview JSON.
- [ ] Summary must not call public provider.

### Dashboard Lanes

- [ ] `Needs attention`: entries with blockers or failed refresh.
- [ ] `Continue writing`: drafts with incomplete or unpublished work.
- [ ] `Ready to publish`: locales confidently ready or needing exact preview.
- [ ] `AI prepared`: agent-prepared work needing review or publish.
- [ ] `Live`: published content without changes when dashboard needs it.
- [ ] Keep dashboard lanes work-oriented, not metrics-oriented.

### Phase 3 Tests

- [ ] Test summary uses same state enum as exact detail.
- [ ] Test summary uses same issue code enum as exact detail.
- [ ] Test summary includes missing configured locales.
- [ ] Test summary does not claim ready when required fields are missing.
- [ ] Test summary groups review requests.
- [ ] Test summary groups agent-prepared drafts.
- [ ] Test summary remains cheap by avoiding full route-tree rebuild preview.
- [ ] Test dashboard rendering maps lane names correctly.

### Phase 3 Review Gate

- [ ] Dashboard can render from summary.
- [ ] Summary does not become a second truth.
- [ ] Exact surfaces still use exact detail.
- [ ] No heavy per-row publish impact query is introduced.

## Phase 4: Locale And Public Provider Foundation

### Goal

Make i18n reliable before Studio expands on top of it.

### Files Likely Touched

- [ ] `packages/convex/src/settings.ts`
- [ ] `packages/convex/src/lib/locale.ts`
- [ ] `packages/cms/src/nuxt-provider.mjs`
- [ ] `packages/cms/src/module/i18n.ts`
- [ ] `packages/cms/src/module/content-contract.ts`
- [ ] `packages/convex/src/public.ts`
- [ ] `test/component/public-api.test.ts`
- [ ] `test/module/module-i18n.test.ts`
- [ ] `test/refactor/provider-contract.test.ts`

### Locale Ownership Rules

- [ ] Define one source for configured locales.
- [ ] Define one source for primary locale.
- [ ] Define one source for runtime default locale.
- [ ] Define how bootstrap settings seed locales.
- [ ] Define how Studio settings update locales.
- [ ] Define how provider reads locale config.
- [ ] Remove hardcoded provider default locale.
- [ ] Ensure non-`en` default locale works in tests.
- [ ] Ensure missing configured locales appear in Studio readiness.
- [ ] Ensure missing configured locales do not appear as published content.
- [ ] Ensure language switch data is based on active public projections.
- [ ] Ensure language switch UI can show missing work in Studio.
- [ ] Ensure fallback behavior is explicit.
- [ ] Ensure fallback behavior is not inferred by Vue components.

### Public Provider Rules

- [ ] Public provider reads `publicEntries`.
- [ ] Public provider reads `publicRoutes`.
- [ ] Public provider may read assets needed for published output.
- [ ] Public provider may read site data needed for published output.
- [ ] Public provider does not read draft rows.
- [ ] Public provider does not read exact readiness detail.
- [ ] Public provider does not read workflow summaries.
- [ ] Public provider does not infer missing translations as content.
- [ ] Public provider output matches active projection after publish.
- [ ] Public provider output updates after subtree rebuild.

### Phase 4 Tests

- [ ] Test provider default locale is configurable.
- [ ] Test provider does not hardcode `en`.
- [ ] Test public translations include only published locales.
- [ ] Test Studio readiness includes configured missing locales.
- [ ] Test missing configured locale does not create public content.
- [ ] Test language switching after per-locale publish.
- [ ] Test language switching after automatic subtree rebuild.
- [ ] Test sitemap/search/nav after per-locale publish.
- [ ] Test sitemap/search/nav after automatic subtree rebuild.

### Phase 4 Review Gate

- [ ] i18n source of truth is clear.
- [ ] Public provider remains published-only.
- [ ] Studio readiness can show missing locales.
- [ ] Non-`en` default locale passes provider tests.

## Phase 5: Canonical Publish, Review, And Agent Operations

### Goal

Make manual publish, review approval, and authorized agent publish share one
backend operation path.

### Files Likely Touched

- [ ] `packages/convex/src/entries/publish.ts`
- [ ] `packages/convex/src/entries/workflow/commands.ts`
- [ ] `packages/convex/src/operationHelpers.ts`
- [ ] `packages/convex/src/reviewRequests.ts`
- [ ] `packages/convex/src/agentRuns.ts`
- [ ] `packages/cms/src/server/mcp/tools/content/request-publish-review.ts`
- [ ] `packages/cms/src/server/mcp/tools/content/preview-publish.ts`
- [ ] `packages/cms/src/server/mcp/tools/content`
- [ ] `test/component/reviewRequests.test.ts`
- [ ] `test/runtime/mcp-request-publish-review.test.ts`
- [ ] `test/runtime/mcp-preview-publish.test.ts`

### Publish Path Rules

- [ ] Preview loads entry, collection, draft, and actor.
- [ ] Preview computes exact readiness detail.
- [ ] Preview blocks if readiness has blockers.
- [ ] Preview includes affected public URLs.
- [ ] Preview includes subtree rebuild effects.
- [ ] Preview includes warnings.
- [ ] Preview includes confirmation token when operation requires confirmation.
- [ ] Execute re-runs preview.
- [ ] Execute verifies confirmation token.
- [ ] Execute verifies preview hash.
- [ ] Execute verifies version hash.
- [ ] Execute writes revision.
- [ ] Execute writes active public projection.
- [ ] Execute writes active public route.
- [ ] Execute rebuilds descendant projections when needed.
- [ ] Execute writes public asset refs.
- [ ] Execute writes audit log.
- [ ] Execute writes revalidation events.
- [ ] Execute returns marketer-safe result.

### Review Request Rules

- [ ] Request review requires edit or review permission.
- [ ] Request review validates agent run when agent-created.
- [ ] Request review computes preview in Convex.
- [ ] Request review stores Convex-computed preview summary.
- [ ] Request review stores version/hash data.
- [ ] Request review stores affected locales.
- [ ] Request review stores affected public URLs.
- [ ] Request review does not store caller-provided preview JSON as truth.
- [ ] Request review records actor identity.
- [ ] Request review records human or agent actor kind.
- [ ] Approval requires publish permission.
- [ ] Approval re-runs current preview.
- [ ] Approval fails if current preview is blocked.
- [ ] Approval fails if review is stale.
- [ ] Approval publishes through canonical publish path.
- [ ] Approval updates review status.
- [ ] Rejection updates review status.
- [ ] Request changes updates review status or creates change request state.

### Agent Operation Rules

- [ ] Agent identity resolves through same app identity system as human.
- [ ] Agent operation checks credential scope.
- [ ] Agent operation checks member role permissions.
- [ ] Agent operation checks collection/entry/locale permission context.
- [ ] Agent direct publish calls canonical publish operation.
- [ ] Agent direct publish uses same preview and confirmation semantics.
- [ ] Agent direct publish writes same audit semantics.
- [ ] Agent direct publish writes same revalidation semantics.
- [ ] Agent archive calls canonical archive operation.
- [ ] Agent restore calls canonical restore operation.
- [ ] Unauthorized agent publish fails closed or creates review according to tool contract.
- [ ] Agent diagnostics redact sensitive data.
- [ ] Agent tools never write raw tables for editorial state.

### Phase 5 Tests

- [ ] Test manual publish uses canonical path.
- [ ] Test review approval uses canonical path.
- [ ] Test authorized agent publish uses canonical path.
- [ ] Test manual publish and agent publish produce same revision shape.
- [ ] Test manual publish and agent publish produce same projection shape.
- [ ] Test manual publish and agent publish produce same audit shape.
- [ ] Test manual publish and agent publish produce same revalidation shape.
- [ ] Test review request computes preview in Convex.
- [ ] Test spoofed review preview is ignored or rejected.
- [ ] Test review approval re-checks current preview.
- [ ] Test stale review approval fails.
- [ ] Test unauthorized agent publish fails closed.
- [ ] Test unauthorized agent can request review when allowed.
- [ ] Test agent archive is guarded.
- [ ] Test agent restore is guarded.

### Phase 5 Review Gate

- [ ] There is one publish execution path.
- [ ] Review request preview is server-computed.
- [ ] Agent publish has parity with human publish.
- [ ] Unauthorized agent operations fail closed.
- [ ] MCP tools are operation-based.

## Phase 6: Automatic Subtree Route Rebuild

### Goal

When a published parent route changes, automatically rebuild affected published
descendant projections/routes in the same locale without publishing descendant
draft changes.

### Files Likely Touched

- [ ] `packages/convex/src/entries/workflow/commands.ts`
- [ ] `packages/convex/src/entries/workflow/projection.ts`
- [ ] `packages/convex/src/entries/workflow/path.ts`
- [ ] `packages/convex/src/entries/projectionMaintenance.ts`
- [ ] `packages/convex/src/entries/projections.ts`
- [ ] `packages/convex/src/diagnostics.ts`
- [ ] `packages/convex/src/revalidation.ts`
- [ ] `test/component/entries/publish.test.ts`
- [ ] `test/component/diagnostics.test.ts`
- [ ] `test/component/public-api.test.ts`
- [ ] `test/refactor/provider-contract.test.ts`

### Subtree Concepts

- [ ] Parent route is the public path of the current entry in one locale.
- [ ] Descendant is any entry below the current entry in the entry tree.
- [ ] Affected descendant is a published descendant in the same locale.
- [ ] Descendant draft content must not be read as publish content.
- [ ] Descendant active published revision is the source for rebuilt content.
- [ ] Descendant route path is recomputed with the new ancestor slug chain.
- [ ] Descendant projection content remains from its active published revision.
- [ ] Descendant public route changes when ancestor path changes.
- [ ] Descendant public URL appears in publish preview.
- [ ] Descendant cache tags appear in revalidation output.

### Subtree Preview Algorithm

- [ ] Detect whether current entry route changes for requested locale.
- [ ] If route does not change, return no subtree rebuild effects.
- [ ] Query direct children using `entries.by_parent`.
- [ ] Traverse descendants breadth-first or depth-first.
- [ ] Keep traversal deterministic.
- [ ] Detect cycles and block publish if found.
- [ ] For each descendant, check active public projection for locale.
- [ ] Skip unpublished descendants for that locale.
- [ ] Load descendant active revision.
- [ ] Load descendant locale snapshot from active revision.
- [ ] Preserve descendant snapshot values.
- [ ] Preserve descendant published revision id.
- [ ] Compute new ancestor slug chain.
- [ ] Compute descendant new path.
- [ ] Compute descendant new href.
- [ ] Compare old path and new path.
- [ ] Add affected URL entry when path changes.
- [ ] Build route claim set for current entry and affected descendants.
- [ ] Validate route uniqueness by `locale/path`.
- [ ] Validate against unrelated existing public routes.
- [ ] Validate against sibling descendant collisions.
- [ ] Validate sitemap/search/nav output if route impacts it.
- [ ] Return blockers for collisions.
- [ ] Return warnings for large subtree if needed.
- [ ] Return affected URLs in parent-first order.

### Subtree Execute Algorithm

- [ ] Re-run subtree preview during execute.
- [ ] Abort if subtree preview has blockers.
- [ ] Publish current entry normally.
- [ ] Rebuild each affected descendant from active published revision.
- [ ] Upsert descendant `publicEntries`.
- [ ] Upsert descendant `publicRoutes`.
- [ ] Replace descendant public asset refs.
- [ ] Emit descendant revalidation events.
- [ ] Emit cache tags for old descendant URL.
- [ ] Emit cache tags for new descendant URL.
- [ ] Emit cache tags for parent URL.
- [ ] Emit sitemap cache tags when sitemap visibility changes.
- [ ] Emit search cache tags when search visibility changes.
- [ ] Emit nav cache tags when nav visibility changes.
- [ ] Do not append descendant content revision unless route revision history requires it.
- [ ] If route-only descendant revision is needed, define explicit revision kind.
- [ ] Do not clear descendant dirty locales.
- [ ] Do not update descendant draft rows.
- [ ] Do not mark descendant unpublished changes as published.
- [ ] Write audit detail with affected descendant count.
- [ ] Return affected descendant URLs in publish result.

### Subtree Collision Rules

- [ ] Collision with unrelated route blocks publish.
- [ ] Collision between affected descendants blocks publish.
- [ ] Collision with current entry route blocks publish.
- [ ] Collision with old route being replaced does not block if same entry/locale.
- [ ] Collision with descendant's own old route does not block if same entry/locale.
- [ ] Collision check uses the same helper as projection upsert.
- [ ] Collision blocker includes colliding path.
- [ ] Collision blocker includes colliding entry id when safe.
- [ ] Collision blocker includes locale.
- [ ] Collision blocker maps to marketer copy in Studio.

### Subtree Revalidation Rules

- [ ] Revalidate old parent URL.
- [ ] Revalidate new parent URL.
- [ ] Revalidate old descendant URLs.
- [ ] Revalidate new descendant URLs.
- [ ] Revalidate sitemap when any included URL changes.
- [ ] Revalidate search when any searchable URL changes.
- [ ] Revalidate nav when any nav-visible URL changes.
- [ ] Revalidate language switch data when locale route changes.
- [ ] Store durable revalidation events.
- [ ] Surface refresh tracking in Studio.

### Phase 6 Tests

- [ ] Test parent route change previews descendant URL changes.
- [ ] Test parent route publish rebuilds child public route.
- [ ] Test parent route publish rebuilds grandchild public route.
- [ ] Test subtree rebuild affects only same locale.
- [ ] Test unpublished descendants are skipped.
- [ ] Test descendant draft content is not published.
- [ ] Test descendant dirty locale remains dirty.
- [ ] Test descendant active revision remains content source.
- [ ] Test old descendant path no longer resolves.
- [ ] Test new descendant path resolves.
- [ ] Test provider reads new descendant path.
- [ ] Test sitemap reflects new descendant path.
- [ ] Test search reflects new descendant path.
- [ ] Test nav reflects new descendant path.
- [ ] Test cache tags include old and new URLs.
- [ ] Test revalidation events include descendants.
- [ ] Test collision with unrelated route blocks before mutation.
- [ ] Test collision between descendants blocks before mutation.
- [ ] Test cycle detection blocks before mutation.
- [ ] Test review preview includes subtree effects.
- [ ] Test agent publish includes subtree effects.

### Phase 6 Review Gate

- [ ] Subtree preview is deterministic.
- [ ] Subtree execute is atomic from product perspective.
- [ ] Descendant drafts are untouched.
- [ ] Public provider reads correct new paths.
- [ ] Collision tests prove no partial mutation.
- [ ] Revalidation tests cover old and new URLs.

## Phase 7: Studio Entry Editor Migration

### Goal

Make the entry editor render backend readiness detail instead of assembling
workflow truth locally.

### Files Likely Touched

- [ ] `packages/cms/studio-app/src/pages/[collection]/[id].vue`
- [ ] `packages/cms/studio-app/src/composables/internal/useEntryPublishing.ts`
- [ ] `packages/cms/studio-app/src/composables/internal/useEntryLocales.ts`
- [ ] `packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue`
- [ ] `packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue`
- [ ] `packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue`
- [ ] `packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue`
- [ ] `packages/cms/studio-app/src/lib/publicWorkflow.ts`
- [ ] `test/shared/studio-workflow.test.ts`

### Entry Editor UI Rules

- [ ] Top bar shows current locale workflow state.
- [ ] Top bar shows autosave state separately from readiness.
- [ ] Top bar publish button respects `canPublish`.
- [ ] Top bar review button respects `canRequestReview`.
- [ ] Right rail shows exact readiness detail.
- [ ] Right rail shows locale matrix.
- [ ] Right rail shows blockers from backend issues.
- [ ] Right rail shows warnings from backend issues.
- [ ] Right rail shows affected public URLs.
- [ ] Right rail shows subtree affected URLs when relevant.
- [ ] Right rail shows developer diagnostics only behind advanced disclosure.
- [ ] Publish dialog uses backend preview.
- [ ] Publish dialog lists affected public URLs.
- [ ] Publish dialog shows descendant route changes.
- [ ] Publish dialog shows warnings and blockers.
- [ ] Publish dialog confirms with backend token.
- [ ] Translation panel shows configured missing locales.
- [ ] Translation panel offers add/copy/AI actions.
- [ ] Language switch readiness uses readiness detail.
- [ ] Checkpoint copy becomes save-version copy.
- [ ] Route diagnostics copy becomes check-links copy.

### Studio Copy Mapping

- [ ] Map `draft` to `Draft`.
- [ ] Map `needs_work` to `Needs work`.
- [ ] Map `ready` to `Ready to publish`.
- [ ] Map `in_review` to `In review`.
- [ ] Map `live` to `Live`.
- [ ] Map `live_with_changes` to `Live with unpublished changes`.
- [ ] Map `missing` to `Missing translation`.
- [ ] Map issue codes to marketer copy.
- [ ] Map action codes to button labels.
- [ ] Keep raw issue code visible only in developer details.
- [ ] Keep raw diagnostic id visible only in developer details.
- [ ] Keep cache tags visible only in developer details.
- [ ] Keep route claims visible only in developer details.
- [ ] Keep confirmation token hidden.

### Studio Deletion Checklist

- [ ] Delete local entry next-action publishability rules.
- [ ] Delete local translation suggested-action publishability rules.
- [ ] Delete duplicated publish readiness state enum when no longer needed.
- [ ] Delete duplicated route status label logic when no longer needed.
- [ ] Delete duplicated blocking issue merge logic when no longer needed.
- [ ] Delete raw review preview summary as primary UI.
- [ ] Keep UI-only copy and formatting helpers.

### Phase 7 Tests

- [ ] Test rail renders each readiness state.
- [ ] Test rail renders backend blockers.
- [ ] Test rail renders backend warnings.
- [ ] Test rail renders affected public URLs.
- [ ] Test rail renders descendant affected URLs.
- [ ] Test publish dialog uses backend readiness.
- [ ] Test publish button disabled when `canPublish` false.
- [ ] Test request review button visible when `canRequestReview` true.
- [ ] Test language matrix shows missing configured locales.
- [ ] Test checkpoint terminology no longer primary.
- [ ] Test developer diagnostics still available.

### Phase 7 Review Gate

- [ ] Entry editor does not own backend invariants.
- [ ] Readiness state is consistent between rail and publish dialog.
- [ ] Marketer copy avoids backend vocabulary.
- [ ] Developer diagnostics remain accessible.

## Phase 8: Dashboard And Review Inbox Migration

### Goal

Make the dashboard and review inbox reflect the same readiness vocabulary as the
entry editor.

### Files Likely Touched

- [ ] `packages/cms/studio-app/src/pages/index.vue`
- [ ] `packages/cms/studio-app/src/pages/reviews.vue`
- [ ] `packages/cms/studio-app/src/lib/publicWorkflow.ts`
- [ ] `packages/convex/src/entries/read.ts`
- [ ] `packages/convex/src/reviewRequests.ts`
- [ ] `test/shared/studio-workflow.test.ts`
- [ ] `test/component/reviewRequests.test.ts`

### Dashboard Rules

- [ ] Dashboard uses `EntryWorkflowSummary`.
- [ ] Dashboard does not run exact readiness for every row.
- [ ] Dashboard lanes use canonical states.
- [ ] Dashboard issue counts use canonical issue severity.
- [ ] Dashboard actions use canonical action kinds.
- [ ] Dashboard `Needs attention` links to filtered content.
- [ ] Dashboard `Continue writing` links to drafts.
- [ ] Dashboard `Ready to publish` links to ready locales.
- [ ] Dashboard `AI prepared` links to review/agent-prepared work.
- [ ] Dashboard hides raw ids.
- [ ] Dashboard hides cache tags.
- [ ] Dashboard hides preview JSON.

### Review Inbox Rules

- [ ] Review cards show who or what prepared the change.
- [ ] Review cards show human actor when human-created.
- [ ] Review cards show agent actor when agent-created.
- [ ] Review cards show entry and locales.
- [ ] Review cards show marketer summary.
- [ ] Review cards show readiness state.
- [ ] Review cards show affected public URLs.
- [ ] Review cards show descendant affected URLs.
- [ ] Review cards show blockers.
- [ ] Review cards show warnings.
- [ ] Review cards show approve/publish when authorized.
- [ ] Review cards show request changes when authorized.
- [ ] Review cards show reject when authorized.
- [ ] Review cards show stale state.
- [ ] Review cards hide raw preview JSON by default.
- [ ] Review cards expose raw preview JSON in developer details.

### Phase 8 Tests

- [ ] Test dashboard lane grouping.
- [ ] Test dashboard missing locale count.
- [ ] Test dashboard ready locale count.
- [ ] Test dashboard agent-prepared count.
- [ ] Test dashboard avoids exact per-row publish preview.
- [ ] Test review card shows Convex-computed summary.
- [ ] Test review card hides raw preview JSON.
- [ ] Test stale review card blocks approval.
- [ ] Test authorized agent-prepared review approval.
- [ ] Test request changes action.

### Phase 8 Review Gate

- [ ] Dashboard and entry editor agree on vocabulary.
- [ ] Review inbox and publish preview agree on backend truth.
- [ ] Raw technical data is no longer primary UI.

## Phase 9: MCP And Agent Tooling

### Goal

Make MCP a powerful first-class CMS surface while preserving operation safety.

### Files Likely Touched

- [ ] `packages/cms/src/server/mcp`
- [ ] `packages/cms/src/server/mcp/tools/content`
- [ ] `packages/convex/src/mcpCredentials.ts`
- [ ] `packages/convex/src/agentRuns.ts`
- [ ] `packages/convex/src/reviewRequests.ts`
- [ ] `test/runtime/mcp-request-publish-review.test.ts`
- [ ] `test/runtime/mcp-preview-publish.test.ts`

### MCP Tool Set

- [ ] Tool: start agent run.
- [ ] Tool: get readiness detail.
- [ ] Tool: prepare draft.
- [ ] Tool: request review.
- [ ] Tool: preview publish.
- [ ] Tool: publish when authorized.
- [ ] Tool: archive when authorized.
- [ ] Tool: restore when authorized.
- [ ] Tool: list own review state.
- [ ] Tool: list own operation state.
- [ ] Tool: read developer diagnostics with redaction.

### MCP Safety Rules

- [ ] Every tool authenticates.
- [ ] Every write tool resolves app identity.
- [ ] Every write tool checks API key status.
- [ ] Every write tool checks MCP scope.
- [ ] Every write tool checks member role.
- [ ] Every write tool calls Convex operation.
- [ ] No write tool mutates raw tables.
- [ ] No tool returns confirmation tokens unless needed by operation flow.
- [ ] No tool exposes secret settings.
- [ ] Diagnostics redact credentials.
- [ ] Diagnostics redact session tokens.
- [ ] Diagnostics redact raw auth headers.
- [ ] Destructive operations require explicit confirmation flow.
- [ ] Archive/restore operations are audited.
- [ ] Publish operations are audited.

### Phase 9 Tests

- [ ] Test unauthenticated MCP tool fails.
- [ ] Test revoked API key fails.
- [ ] Test missing scope fails.
- [ ] Test edit-only agent can prepare draft.
- [ ] Test edit-only agent cannot publish.
- [ ] Test edit-only agent can request review when allowed.
- [ ] Test publish-scoped agent can publish.
- [ ] Test publish-scoped agent uses canonical publish path.
- [ ] Test archive-scoped agent can archive.
- [ ] Test restore-scoped agent can restore.
- [ ] Test MCP publish includes subtree rebuild effects.
- [ ] Test MCP diagnostics are redacted.

### Phase 9 Review Gate

- [ ] MCP tools are operation-based.
- [ ] Agent and human permission behavior matches.
- [ ] Powerful AI usage is enabled without raw table bypasses.

## Phase 10: Assets, History, And Website Refresh Tracking

### Goal

Make supporting workflow surfaces clear for marketers and reliable for published
website output.

### Files Likely Touched

- [ ] `packages/convex/src/assets.ts`
- [ ] `packages/convex/src/entries/workflow/commands.ts`
- [ ] `packages/convex/src/revalidation.ts`
- [ ] `packages/cms/studio-app/src/composables/internal/useEntryHistory.ts`
- [ ] `packages/cms/studio-app/src/components/studio/editor/StudioVersionHistoryCard.vue`
- [ ] `packages/cms/studio-app/src/components/studio/editor/StudioCheckpointDialog.vue`
- [ ] `packages/cms/studio-app/src/components/studio/StudioAssetBrowser.vue`
- [ ] `test/component/entries/publish.test.ts`
- [ ] `test/component/revalidation.test.ts`

### Asset Freshness Decision

- [ ] Decide publish-time asset metadata snapshot or live asset metadata.
- [ ] Recommended: publish-time metadata snapshot plus explicit republish/refresh.
- [ ] Document chosen model.
- [ ] Ensure readiness can detect stale asset metadata if chosen model requires it.
- [ ] Ensure publish projection writes chosen asset metadata.
- [ ] Ensure asset update shows affected content when possible.
- [ ] Ensure public provider output matches chosen model.
- [ ] Ensure subtree rebuild preserves descendant asset metadata correctly.

### History Copy Rules

- [ ] Replace primary `checkpoint` copy with `save version`.
- [ ] Display publish events as `Published English`.
- [ ] Display restore events as `Restored version`.
- [ ] Display agent events as `AI drafted German` or equivalent copy.
- [ ] Keep raw revision ids in developer details.
- [ ] Keep revision kind available in diagnostics.
- [ ] Keep recovery actions clear.

### Website Refresh Rules

- [ ] Show post-publish tracking as `Website refresh`.
- [ ] Show pending state.
- [ ] Show success state.
- [ ] Show failed state.
- [ ] Show retry action when safe.
- [ ] Keep cache tags in developer details.
- [ ] Keep revalidation event ids in developer details.
- [ ] Include subtree route rebuild URLs in refresh tracking.

### Phase 10 Tests

- [ ] Test asset metadata model after publish.
- [ ] Test asset metadata model after asset edit.
- [ ] Test asset metadata model after subtree rebuild.
- [ ] Test history copy no longer exposes checkpoint as primary term.
- [ ] Test restore action remains available.
- [ ] Test website refresh pending state.
- [ ] Test website refresh success state.
- [ ] Test website refresh failed state.
- [ ] Test website refresh includes descendant URLs after subtree rebuild.

### Phase 10 Review Gate

- [ ] Asset freshness is explicit.
- [ ] History is marketer-readable.
- [ ] Website refresh tracking is durable and understandable.

## Phase 11: Hard Cutover And Deletion

### Goal

Remove old paths after the new paths pass tests.

### Deletion Rules

- [ ] Delete unreleased internal compatibility paths.
- [ ] Delete duplicate frontend readiness derivation.
- [ ] Delete duplicate backend presentation models.
- [ ] Delete raw review preview primary rendering.
- [ ] Delete old MCP preview trust path.
- [ ] Delete hardcoded default locale path.
- [ ] Delete route blocking language now that subtree rebuild is v1.
- [ ] Keep released public APIs compatible unless explicitly versioned.
- [ ] Keep developer diagnostics.
- [ ] Keep migration paths for user data.

### Cutover Checklist

- [ ] All exact readiness tests pass.
- [ ] All workflow summary tests pass.
- [ ] All publish/review/agent tests pass.
- [ ] All subtree rebuild tests pass.
- [ ] All i18n/provider tests pass.
- [ ] All Studio readiness rendering tests pass.
- [ ] All MCP tests pass.
- [ ] Search for old helper names.
- [ ] Search for old state enum names.
- [ ] Search for raw preview primary UI usage.
- [ ] Search for hardcoded `en`.
- [ ] Search for public provider draft/readiness reads.
- [ ] Search for MCP raw table writes.
- [ ] Delete obsolete tests that only protected removed behavior.
- [ ] Add replacement tests for new behavior.

### Phase 11 Review Gate

- [ ] No old path remains for unreleased internals.
- [ ] No duplicate source of truth remains.
- [ ] Public/released APIs retain compatibility or have explicit migration notes.
- [ ] `pnpm run check` passes.

## Global Test Commands

Run focused tests while implementing:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts
pnpm exec vitest run test/component/diagnostics.test.ts
pnpm exec vitest run test/component/reviewRequests.test.ts
pnpm exec vitest run test/component/public-api.test.ts
pnpm exec vitest run test/component/entries/publish.test.ts
pnpm exec vitest run test/component/revalidation.test.ts
pnpm exec vitest run test/runtime/mcp-request-publish-review.test.ts
pnpm exec vitest run test/runtime/mcp-preview-publish.test.ts
pnpm exec vitest run test/refactor/provider-contract.test.ts
pnpm exec vitest run test/module/module-i18n.test.ts
```

Run type checks:

```bash
pnpm run typecheck
```

Run full gate before handoff:

```bash
pnpm run check
```

Run release verification only when release surfaces changed:

```bash
pnpm run release:verify
```

## PR Breakdown

### PR 1: Vocabulary And Failing Tests

- [ ] Add readiness state vocabulary.
- [ ] Add issue code vocabulary.
- [ ] Add action code vocabulary.
- [ ] Add failing exact readiness tests.
- [ ] Add failing workflow summary tests.
- [ ] Add failing review preview tests.
- [ ] Add failing agent publish tests.
- [ ] Add failing subtree rebuild tests.
- [ ] Add failing i18n provider tests.
- [ ] Do not migrate UI in this PR.
- [ ] Do not add stored workflow state in this PR.

### PR 2: Exact Readiness Detail

- [ ] Implement exact readiness detail.
- [ ] Cover all states.
- [ ] Cover blockers.
- [ ] Cover warnings.
- [ ] Cover next actions.
- [ ] Cover permissions.
- [ ] Cover missing locales.
- [ ] Cover required fields.
- [ ] Cover data-only publish blocking.
- [ ] Keep shape internal if not stable.

### PR 3: Cheap Workflow Summary

- [ ] Implement workflow summary.
- [ ] Use same vocabulary.
- [ ] Avoid heavy exact preview for every row.
- [ ] Update dashboard data source.
- [ ] Add dashboard tests.

### PR 4: I18n And Provider Foundation

- [ ] Remove hardcoded provider default locale.
- [ ] Clarify locale source of truth.
- [ ] Add missing configured locales to readiness.
- [ ] Keep public provider published-only.
- [ ] Add provider tests.

### PR 5: Publish/Review/Agent Canonical Path

- [ ] Make review preview Convex-computed.
- [ ] Make review approval re-check current preview.
- [ ] Make review approval use canonical publish path.
- [ ] Add authorized agent direct publish.
- [ ] Add unauthorized agent fail-closed behavior.
- [ ] Add archive/restore operation parity.

### PR 6: Automatic Subtree Rebuild

- [ ] Implement subtree preview.
- [ ] Implement subtree collision preflight.
- [ ] Implement subtree execute.
- [ ] Rebuild descendant projections.
- [ ] Rebuild descendant routes.
- [ ] Preserve descendant drafts.
- [ ] Add revalidation events.
- [ ] Add provider tests.

### PR 7: Entry Editor Migration

- [ ] Wire readiness detail query.
- [ ] Replace rail readiness logic.
- [ ] Replace publish dialog readiness logic.
- [ ] Replace translation readiness logic.
- [ ] Replace checkpoint copy.
- [ ] Keep developer diagnostics.

### PR 8: Dashboard And Reviews Migration

- [ ] Wire dashboard summary.
- [ ] Update dashboard lanes.
- [ ] Update review card summary.
- [ ] Hide raw preview JSON by default.
- [ ] Add review UI tests.

### PR 9: MCP Tool Hardening

- [ ] Add readiness detail tool.
- [ ] Update request-review tool.
- [ ] Add authorized publish tool.
- [ ] Add archive/restore tools.
- [ ] Add redaction tests.
- [ ] Add scope tests.

### PR 10: Assets, History, Refresh Tracking

- [ ] Implement chosen asset freshness model.
- [ ] Update history copy.
- [ ] Update website refresh tracking.
- [ ] Add asset and revalidation tests.

### PR 11: Hard Cutover

- [ ] Delete replaced helpers.
- [ ] Delete old presentation paths.
- [ ] Delete old MCP preview trust path.
- [ ] Delete stale docs language.
- [ ] Run full gate.

## Invariant Test Matrix

### Readiness State Matrix

- [ ] Missing locale yields `missing`.
- [ ] Saved empty draft yields `draft` or `needs_work` according to exact check context.
- [ ] Missing required field yields `needs_work`.
- [ ] Valid draft yields `ready`.
- [ ] Pending non-stale review yields `in_review`.
- [ ] Published unchanged locale yields `live`.
- [ ] Published changed locale yields `live_with_changes`.
- [ ] Archived entry blocks publish.
- [ ] Collection mismatch blocks publish.
- [ ] Missing settings blocks publish with clear issue.

### Locale Matrix

- [ ] Primary locale can publish while German missing.
- [ ] English can publish while German blocked.
- [ ] German can publish while English live.
- [ ] French missing appears in Studio readiness.
- [ ] French missing does not appear as public content.
- [ ] Non-`en` default locale works.
- [ ] Parent locale must be public before child locale can publish.
- [ ] Language switch reads published projections.

### Required Field Matrix

- [ ] Shared required missing blocks all requested locales.
- [ ] Localized required missing blocks one locale.
- [ ] Body required missing blocks correct scope.
- [ ] SEO required missing blocks publish.
- [ ] Data-only required missing blocks publish.
- [ ] Draft save allows required missing field.
- [ ] Agent draft save allows required missing field.
- [ ] Review request is blocked or marked needs work when required field missing.

### Route Matrix

- [ ] Missing route blocks route-backed publish.
- [ ] Route collision blocks publish.
- [ ] Parent route missing blocks child publish.
- [ ] Parent route change previews child URL changes.
- [ ] Parent route change previews grandchild URL changes.
- [ ] Parent route change rebuilds child URL.
- [ ] Parent route change rebuilds grandchild URL.
- [ ] Descendant collision blocks before mutation.
- [ ] Route cycle blocks before mutation.
- [ ] Public provider resolves new route after publish.
- [ ] Public provider does not resolve old route after publish unless redirects are added later.

### Review Matrix

- [ ] Human editor can request review.
- [ ] Agent editor can request review.
- [ ] Human publisher can approve review.
- [ ] Agent publisher can approve review if permission model allows it.
- [ ] Review approval publishes through canonical path.
- [ ] Stale review approval fails.
- [ ] Spoofed review preview cannot become truth.
- [ ] Review card shows Convex-computed summary.

### Agent Matrix

- [ ] Agent with edit scope can draft.
- [ ] Agent with edit scope cannot publish.
- [ ] Agent with review scope can request review.
- [ ] Agent with publish scope can publish.
- [ ] Agent with archive scope can archive.
- [ ] Agent with restore scope can restore.
- [ ] Agent without required scope fails closed.
- [ ] Revoked API key fails closed.
- [ ] Agent publish and human publish produce equivalent audit.

### Public Provider Matrix

- [ ] Provider reads active projection.
- [ ] Provider does not read draft.
- [ ] Provider does not read readiness detail.
- [ ] Provider default locale is configurable.
- [ ] Provider output updates after publish.
- [ ] Provider output updates after subtree rebuild.
- [ ] Provider output matches sitemap/search/nav expectations.

## Acceptance Checklist

- [ ] A marketer can explain the workflow as `Write -> Check -> Preview -> Review -> Publish -> Track`.
- [ ] Every entry and locale has one visible workflow state.
- [ ] Exact editor readiness comes from backend readiness detail.
- [ ] Review readiness comes from backend readiness detail.
- [ ] Publish readiness comes from backend readiness detail.
- [ ] MCP readiness comes from backend readiness detail.
- [ ] Dashboard readiness uses same vocabulary with cheap summary.
- [ ] Missing translations are visible but not global blockers.
- [ ] Primary locale can publish while secondary locale is missing.
- [ ] Each locale can publish independently.
- [ ] `Publish all ready` never publishes blocked locales.
- [ ] Required fields block publish in every collection mode.
- [ ] Review request cannot misrepresent backend publish readiness.
- [ ] Direct authorized AI publish uses same backend path as manual publish.
- [ ] Archive/restore operations are reversible and guarded.
- [ ] Publish dialog lists affected public URLs.
- [ ] Publish dialog lists affected descendant URLs.
- [ ] Developer details are available but secondary.
- [ ] History lets users restore without learning checkpoint terminology.
- [ ] Public website reads use active published projections only.
- [ ] Public provider does not consume draft readiness.
- [ ] Public provider reads match active projections after publish.
- [ ] Configured missing locales and non-`en` default locale work in first slice.
- [ ] Parent route changes rebuild published descendant routes automatically.
- [ ] Descendant drafts are not published by subtree rebuild.
- [ ] Descendant route collisions block before mutation.
- [ ] Tests cover workflow states and invariants.
- [ ] Old duplicate readiness paths are deleted.
- [ ] Full gate passes.

## Work Tracking Register

### Foundation Tracking

- [ ] FND-001: Confirm current branch and dirty worktree before implementation.
- [ ] FND-002: Confirm no unrelated user changes are reverted.
- [ ] FND-003: Create implementation branch if requested.
- [ ] FND-004: Keep product direction doc and implementation plan linked.
- [ ] FND-005: Add task IDs to PR descriptions.
- [ ] FND-006: Update this register after each merged PR.
- [ ] FND-007: Keep tests close to changed package.
- [ ] FND-008: Run focused tests before broad gate.
- [ ] FND-009: Run broad gate before handoff.
- [ ] FND-010: Document intentional public API changes.

### Vocabulary Tracking

- [ ] VOC-001: Add readiness state constants.
- [ ] VOC-002: Add readiness state type.
- [ ] VOC-003: Add readiness state validator.
- [ ] VOC-004: Add readiness issue code constants.
- [ ] VOC-005: Add readiness issue code type.
- [ ] VOC-006: Add readiness issue code validator.
- [ ] VOC-007: Add readiness action constants.
- [ ] VOC-008: Add readiness action type.
- [ ] VOC-009: Add readiness action validator.
- [ ] VOC-010: Add issue builder helper.
- [ ] VOC-011: Add action builder helper.
- [ ] VOC-012: Add issue params JSON validation.
- [ ] VOC-013: Add action params JSON validation.
- [ ] VOC-014: Add type tests.
- [ ] VOC-015: Add runtime validator tests.
- [ ] VOC-016: Keep UI copy out of contract.
- [ ] VOC-017: Keep experimental detail shape internal.
- [ ] VOC-018: Add Studio copy map.
- [ ] VOC-019: Add MCP copy map.
- [ ] VOC-020: Review public exports.

### Exact Readiness Tracking

- [ ] RDY-001: Add `computeEntryReadinessDetail` module.
- [ ] RDY-002: Load entry.
- [ ] RDY-003: Load collection.
- [ ] RDY-004: Load settings.
- [ ] RDY-005: Resolve locales.
- [ ] RDY-006: Resolve primary locale.
- [ ] RDY-007: Resolve default locale.
- [ ] RDY-008: Load draft rows.
- [ ] RDY-009: Load public projections.
- [ ] RDY-010: Load public routes.
- [ ] RDY-011: Load review requests.
- [ ] RDY-012: Load current actor permissions.
- [ ] RDY-013: Build locale record for every configured locale.
- [ ] RDY-014: Derive missing state.
- [ ] RDY-015: Derive draft state.
- [ ] RDY-016: Derive needs-work state.
- [ ] RDY-017: Derive ready state.
- [ ] RDY-018: Derive in-review state.
- [ ] RDY-019: Derive live state.
- [ ] RDY-020: Derive live-with-changes state.
- [ ] RDY-021: Compute required field blockers.
- [ ] RDY-022: Compute route blockers.
- [ ] RDY-023: Compute parent route blockers.
- [ ] RDY-024: Compute relation warnings/blockers.
- [ ] RDY-025: Compute asset warnings/blockers.
- [ ] RDY-026: Compute subtree affected URLs.
- [ ] RDY-027: Compute subtree collision blockers.
- [ ] RDY-028: Compute public URL.
- [ ] RDY-029: Compute draft URL.
- [ ] RDY-030: Compute next action.
- [ ] RDY-031: Serialize result.
- [ ] RDY-032: Add Convex query.
- [ ] RDY-033: Add tests for every state.
- [ ] RDY-034: Add tests for every blocker class.
- [ ] RDY-035: Add tests for permission fields.
- [ ] RDY-036: Add tests for affected public URLs.
- [ ] RDY-037: Add tests for configured missing locales.
- [ ] RDY-038: Add tests for non-`en` default locale.
- [ ] RDY-039: Add tests for no UI copy in response.
- [ ] RDY-040: Add tests for no public provider dependency.

### Workflow Summary Tracking

- [ ] SUM-001: Add `computeEntryWorkflowSummary`.
- [ ] SUM-002: Reuse readiness vocabulary.
- [ ] SUM-003: Load cheap entry facts.
- [ ] SUM-004: Load cheap draft facts.
- [ ] SUM-005: Load cheap public route facts.
- [ ] SUM-006: Load cheap review facts.
- [ ] SUM-007: Include missing locale facts.
- [ ] SUM-008: Include published locale facts.
- [ ] SUM-009: Include ready locale facts only when cheap and reliable.
- [ ] SUM-010: Include issue counts.
- [ ] SUM-011: Include next action.
- [ ] SUM-012: Avoid full publish preview per row.
- [ ] SUM-013: Add dashboard query.
- [ ] SUM-014: Add summary tests.
- [ ] SUM-015: Add dashboard lane tests.
- [ ] SUM-016: Add performance guard if needed.

### I18n Tracking

- [ ] I18N-001: Identify current locale config paths.
- [ ] I18N-002: Decide canonical locale source.
- [ ] I18N-003: Update bootstrap settings behavior.
- [ ] I18N-004: Update Studio settings behavior.
- [ ] I18N-005: Update provider runtime config behavior.
- [ ] I18N-006: Remove hardcoded provider default locale.
- [ ] I18N-007: Add non-`en` default locale fixture.
- [ ] I18N-008: Add configured missing locale fixture.
- [ ] I18N-009: Update readiness to include configured missing locales.
- [ ] I18N-010: Update provider tests.
- [ ] I18N-011: Update module i18n tests.
- [ ] I18N-012: Update language switch tests.
- [ ] I18N-013: Ensure missing locale does not leak as public content.
- [ ] I18N-014: Ensure fallback behavior is explicit.
- [ ] I18N-015: Document locale ownership in code comments only where helpful.

### Publish And Review Tracking

- [ ] PUB-001: Update publish preview to use readiness detail.
- [ ] PUB-002: Update publish preview blockers.
- [ ] PUB-003: Update publish preview warnings.
- [ ] PUB-004: Update publish preview affected URLs.
- [ ] PUB-005: Update publish preview confirmation hash.
- [ ] PUB-006: Update publish execute to re-run preview.
- [ ] PUB-007: Update publish execute to verify confirmation.
- [ ] PUB-008: Update publish execute to write audit.
- [ ] PUB-009: Update publish execute to emit revalidation.
- [ ] PUB-010: Update review request creation.
- [ ] PUB-011: Compute review preview in Convex.
- [ ] PUB-012: Store review summary.
- [ ] PUB-013: Store review version/hash data.
- [ ] PUB-014: Remove trusted caller preview.
- [ ] PUB-015: Update review approval.
- [ ] PUB-016: Re-check current preview on approval.
- [ ] PUB-017: Fail stale approval.
- [ ] PUB-018: Publish through canonical path.
- [ ] PUB-019: Add review tests.
- [ ] PUB-020: Add spoofed preview tests.

### Agent Tracking

- [ ] AGT-001: Review current MCP credential model.
- [ ] AGT-002: Review current app identity model.
- [ ] AGT-003: Define required scopes for draft.
- [ ] AGT-004: Define required scopes for review.
- [ ] AGT-005: Define required scopes for publish.
- [ ] AGT-006: Define required scopes for archive.
- [ ] AGT-007: Define required scopes for restore.
- [ ] AGT-008: Add direct publish tool.
- [ ] AGT-009: Add archive tool.
- [ ] AGT-010: Add restore tool.
- [ ] AGT-011: Ensure direct publish tool calls operation.
- [ ] AGT-012: Ensure archive tool calls operation.
- [ ] AGT-013: Ensure restore tool calls operation.
- [ ] AGT-014: Add unauthorized publish test.
- [ ] AGT-015: Add authorized publish test.
- [ ] AGT-016: Add revoked key test.
- [ ] AGT-017: Add missing scope test.
- [ ] AGT-018: Add audit parity test.
- [ ] AGT-019: Add redaction test.
- [ ] AGT-020: Update MCP docs if present.

### Subtree Tracking

- [ ] TREE-001: Add descendant traversal helper.
- [ ] TREE-002: Make traversal deterministic.
- [ ] TREE-003: Add cycle detection.
- [ ] TREE-004: Load active public descendant rows.
- [ ] TREE-005: Load active descendant revisions.
- [ ] TREE-006: Compute new ancestor slugs.
- [ ] TREE-007: Compute new descendant paths.
- [ ] TREE-008: Compute new descendant hrefs.
- [ ] TREE-009: Build affected URL list.
- [ ] TREE-010: Build route claim set.
- [ ] TREE-011: Detect unrelated route collision.
- [ ] TREE-012: Detect descendant route collision.
- [ ] TREE-013: Detect current entry collision.
- [ ] TREE-014: Add preview blockers.
- [ ] TREE-015: Add preview warnings.
- [ ] TREE-016: Add execute rebuild loop.
- [ ] TREE-017: Rebuild child public entry.
- [ ] TREE-018: Rebuild child public route.
- [ ] TREE-019: Rebuild grandchild public entry.
- [ ] TREE-020: Rebuild grandchild public route.
- [ ] TREE-021: Preserve descendant published content.
- [ ] TREE-022: Preserve descendant dirty locales.
- [ ] TREE-023: Replace descendant public asset refs.
- [ ] TREE-024: Emit descendant revalidation events.
- [ ] TREE-025: Emit old URL cache tags.
- [ ] TREE-026: Emit new URL cache tags.
- [ ] TREE-027: Add provider tests.
- [ ] TREE-028: Add sitemap tests.
- [ ] TREE-029: Add search tests.
- [ ] TREE-030: Add nav tests.
- [ ] TREE-031: Add collision atomicity test.
- [ ] TREE-032: Add no-descendant-draft-publish test.
- [ ] TREE-033: Add same-locale-only test.
- [ ] TREE-034: Add unpublished descendant skip test.
- [ ] TREE-035: Add MCP subtree publish test.
- [ ] TREE-036: Add review subtree approval test.

### Studio Tracking

- [ ] UI-001: Add readiness detail query hook.
- [ ] UI-002: Add readiness copy map.
- [ ] UI-003: Add issue copy map.
- [ ] UI-004: Add action copy map.
- [ ] UI-005: Wire entry top bar state.
- [ ] UI-006: Wire entry rail state.
- [ ] UI-007: Wire locale matrix.
- [ ] UI-008: Wire blocker list.
- [ ] UI-009: Wire warning list.
- [ ] UI-010: Wire affected public URLs.
- [ ] UI-011: Wire descendant affected URLs.
- [ ] UI-012: Wire publish dialog.
- [ ] UI-013: Wire request review action.
- [ ] UI-014: Wire publish action.
- [ ] UI-015: Wire AI translation action.
- [ ] UI-016: Wire developer diagnostics.
- [ ] UI-017: Rename checkpoint copy.
- [ ] UI-018: Rename diagnostics copy.
- [ ] UI-019: Remove local next-action rules.
- [ ] UI-020: Remove local translation readiness rules.
- [ ] UI-021: Add rail tests.
- [ ] UI-022: Add publish dialog tests.
- [ ] UI-023: Add copy mapping tests.
- [ ] UI-024: Add missing locale rendering tests.
- [ ] UI-025: Add subtree URL rendering tests.

### Dashboard And Review UI Tracking

- [ ] DASH-001: Wire dashboard summary query.
- [ ] DASH-002: Render needs-attention lane.
- [ ] DASH-003: Render continue-writing lane.
- [ ] DASH-004: Render ready-to-publish lane.
- [ ] DASH-005: Render AI-prepared lane.
- [ ] DASH-006: Add dashboard filters.
- [ ] DASH-007: Add dashboard tests.
- [ ] REV-001: Wire review summary.
- [ ] REV-002: Render actor identity.
- [ ] REV-003: Render agent identity.
- [ ] REV-004: Render locales.
- [ ] REV-005: Render affected URLs.
- [ ] REV-006: Render subtree affected URLs.
- [ ] REV-007: Render blockers.
- [ ] REV-008: Render warnings.
- [ ] REV-009: Render approve action.
- [ ] REV-010: Render request-changes action.
- [ ] REV-011: Render stale state.
- [ ] REV-012: Hide preview JSON by default.
- [ ] REV-013: Keep developer details.
- [ ] REV-014: Add review UI tests.

### Asset, History, Refresh Tracking

- [ ] AHR-001: Decide asset metadata model.
- [ ] AHR-002: Implement asset freshness checks.
- [ ] AHR-003: Implement asset projection behavior.
- [ ] AHR-004: Add asset freshness tests.
- [ ] AHR-005: Rename checkpoint copy to save version.
- [ ] AHR-006: Update history event copy.
- [ ] AHR-007: Keep revision ids in developer details.
- [ ] AHR-008: Add history copy tests.
- [ ] AHR-009: Update website refresh UI.
- [ ] AHR-010: Include subtree URLs in refresh tracking.
- [ ] AHR-011: Add revalidation tests.

### Cutover Tracking

- [ ] CUT-001: Search for `deriveEntryNextAction`.
- [ ] CUT-002: Search for old publish readiness enum.
- [ ] CUT-003: Search for raw preview primary rendering.
- [ ] CUT-004: Search for hardcoded `en`.
- [ ] CUT-005: Search for public provider draft reads.
- [ ] CUT-006: Search for MCP raw writes.
- [ ] CUT-007: Search for duplicate route collision helpers.
- [ ] CUT-008: Delete obsolete frontend helpers.
- [ ] CUT-009: Delete obsolete backend helpers.
- [ ] CUT-010: Delete obsolete tests.
- [ ] CUT-011: Update docs.
- [ ] CUT-012: Run focused tests.
- [ ] CUT-013: Run typecheck.
- [ ] CUT-014: Run full check.
- [ ] CUT-015: Prepare handoff notes.

## Final Definition Of Done

- [ ] The implementation follows the fixed product decisions.
- [ ] The implementation obeys hard non-goals.
- [ ] All readiness states are backend-derived.
- [ ] All readiness actions come from canonical action codes.
- [ ] All readiness issues come from canonical issue codes.
- [ ] Studio does not own publishability invariants.
- [ ] MCP does not own publishability invariants.
- [ ] Review creation computes preview in Convex.
- [ ] Review approval uses canonical publish path.
- [ ] Human publish uses canonical publish path.
- [ ] Authorized agent publish uses canonical publish path.
- [ ] Archive/restore are guarded and reversible.
- [ ] Required fields block publish.
- [ ] Missing translations do not block other locales.
- [ ] Public provider reads active projections only.
- [ ] Automatic subtree rebuild works for published descendants.
- [ ] Automatic subtree rebuild does not publish descendant drafts.
- [ ] Route collisions block before mutation.
- [ ] Revalidation is durable.
- [ ] Diagnostics remain available.
- [ ] Developer details are secondary.
- [ ] Old duplicate paths are deleted.
- [ ] Focused tests pass.
- [ ] Typecheck passes.
- [ ] `pnpm run check` passes.
