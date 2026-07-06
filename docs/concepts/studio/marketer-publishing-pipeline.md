# Marketer Publishing Pipeline

This document turns the backend architecture review into a product and core
refactor direction for the marketer-facing Studio experience. Ginko CMS is a
focused CMS for Ginko/Nuxt marketing and content sites. It is not a generic
admin platform, schema builder, backend abstraction layer, or visual page
builder.

The goal is not to expose more workflow machinery. The goal is to make
publishing website content feel obvious, trustworthy, and easy to explain
because the backend truth is unified.

## Product Goal

Ginko CMS should feel like a calm website publishing workspace for marketers.

A marketer should be able to open the CMS and understand:

- what content needs attention;
- what language versions exist;
- what can publish now;
- what is blocked and why;
- what will change on the website;
- what an AI assistant prepared;
- what is already live.

The marketer-facing story is:

```txt
Write -> Check -> Preview -> Review -> Publish -> Track
```

Everything else is internal. Draft hashes, confirmation tokens, checkpoints,
revision snapshots, projections, cache tags, route diagnostics, and revalidation
events may exist in the backend, but they should not be the primary product
language.

## Core Refactor Thesis

The central refactor is not a new page, a new state table, or a bigger workflow
component. The central refactor is one canonical readiness vocabulary, plus one
exact per-entry/per-locale readiness query for editor, review, MCP, and publish
surfaces.

Studio, MCP, AI operations, review requests, publish previews, publish
execution, and diagnostics must agree on the answer to one question:

```txt
For this entry and locale, can this content go live, and what happens if it does?
```

If that answer is computed differently in the entry rail, publish dialog,
reviews page, MCP tools, and diagnostics, the CMS will feel simple only on the
surface. The first mismatch will break trust.

The target is backend-derived readiness data with stable codes, not backend UI
copy:

```ts
type EntryReadinessDetail = {
  entryId: string
  collection: string
  locales: Array<{
    locale: string
    state: 'draft' | 'needs_work' | 'ready' | 'in_review' | 'live' | 'live_with_changes' | 'missing'
    blockers: ReadinessIssue[]
    warnings: ReadinessIssue[]
    nextAction: ReadinessAction
    draftExists: boolean
    published: boolean
    hasUnpublishedChanges: boolean
    publicUrl: string | null
    affectedPublicUrls: string[]
    canPreview: boolean
    canRequestReview: boolean
    canPublish: boolean
  }>
  primaryLocale: string
  updatedAt: number
}
```

This object should be derived, not stored. The canonical state remains entries,
draft rows, revision snapshots, public projections, asset records, review
requests, members, and settings. The readiness detail is the exact workflow
contract that human and agent surfaces consume.

Dashboard/list views may use a cheaper `EntryWorkflowSummary`, but it must use
the same state and issue vocabulary. It can be conservative; it must not invent
different readiness rules.

This refactor must consolidate and replace the overlapping presentation models:
publish impact presentation, Studio public workflow helpers, entry list
work-state, local publish readiness state, and review preview presentation. It
must not add a new readiness layer beside them.

Ownership:

- `@lupinum/ginko-cms-contract` owns stable issue/action/state vocabulary.
- `@lupinum/ginko-cms-convex` computes the summary from canonical state.
- Studio maps codes to copy and triggers canonical operations.
- MCP/AI consumes the same readiness truth and triggers the same guarded
  operations as humans.
- `ginko-content` remains provider-neutral and only sees published provider
  output.
- The public provider is not a readiness consumer. It must agree with the
  published projection side of readiness after publish, not with draft/editor
  state.

Do not add a stored workflow state machine unless a real invariant cannot be
derived. Stored states like `ready` or `needs_work` would become a second source
of truth.

## Marketer Mental Model

Use five plain states:

| State        | Meaning                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------ |
| `Draft`      | The marketer is writing. Autosave keeps work safe.                                         |
| `Needs work` | Required content, translation, route, SEO, asset, or parent-page readiness is missing.     |
| `Ready`      | The selected language/version can publish.                                                 |
| `In review`  | A publisher, human or agent, needs to approve the prepared change.                         |
| `Live`       | This language/version is published. If edited again, show `Live with unpublished changes`. |

This is the model Studio, MCP, and AI review requests should share. Backend
terms should be mapped into these states before reaching the primary UI.

The states are not manually assigned. They are derived:

- `Draft`: draft exists and no current readiness preview marks it ready or
  blocked.
- `Needs work`: required content, route, parent, SEO, asset, relation, or review
  invariant blocks publishing.
- `Ready`: the current locale can publish through the canonical publish
  operation.
- `In review`: a non-stale review request exists for this locale/version.
- `Live`: the locale is published and has no unpublished changes.
- `Live with unpublished changes`: the locale is published and the draft differs
  from the active public version.
- `Missing`: the locale is configured but no draft variant exists.

Draft saves may contain empty fields. Publishing may not. Required fields block
publish for every collection mode, including data-only collections.

## First-Class I18n Goal

The CMS should treat each locale as a first-class publishable version of the
same canonical entry.

For example:

```txt
About us

English   Live
German    Draft, missing SEO description
French    Missing translation
Spanish   Ready
```

The marketer should be able to:

- write the primary language first;
- publish the primary language without waiting for every translation;
- see which locales are missing;
- create a missing locale later;
- copy the primary language into a new locale as a starting point;
- ask AI to draft or adapt a translation;
- preview and publish one locale independently;
- publish all ready locales when desired;
- see language-switching readiness before publishing.

Fallback chains, locale route prefixes, translated slug mechanics, and route
diagnostics are configuration/developer concerns. The marketer-facing concept is
locale readiness.

## AI-Assisted Marketing Goal

AI should feel like a real CMS collaborator inside the same publishing pipeline,
not a separate technical surface and not a weaker second-class workflow.

AI can:

- draft a missing locale;
- rewrite a title or SEO description;
- summarize changes before review;
- check tone or completeness;
- prepare a publish review request;
- explain blockers in plain language;
- publish directly when the agent identity has publish permission;
- archive/restore content when the agent identity has the right permission and
  the operation is reversible or explicitly gated.

The core rule is actor parity:

```txt
same identity model + same permissions + same operation guards
```

A human with publish permission can publish. An agent with publish permission can
publish. A human without publish permission requests review. An agent without
publish permission requests review. MCP tools must not bypass Convex guards,
publish previews, destructive confirmations, audit logging, or soft-delete
boundaries.

Default product flows can still be conservative:

```txt
AI prepares draft -> review when required -> authorized actor publishes
```

But direct AI publishing is a supported v1 product goal when the site owner gives
that agent the right role. The safety boundary is permission and audit, not
human-only workflow.

Delete is not a normal content operation. v1 should prefer archive/restore and
soft-delete semantics for both humans and agents.

## Target Editing Screen

The entry editor should have one primary job: help the marketer get the current
locale ready for the website.

Recommended layout:

```txt
Top bar
  Title, save state, preview, request review, publish current locale

Main editor
  Shared fields
  Current locale fields
  Body editor
  SEO and media fields in context

Right rail: Publish readiness
  Overall state
  Locale matrix
  Blocking issues
  Website preview
  Review / publish action
  History link
```

The right rail should be the confidence panel. It should answer:

```txt
Can this go live?
If not, what exactly do I need to fix?
If yes, what pages and locales will change?
```

## Marketer-Facing Copy

Prefer:

- `Publish readiness`
- `Website changes`
- `Affected public URLs`
- `Language versions`
- `Missing translation`
- `Ready to publish`
- `Live with unpublished changes`
- `Save version`
- `History`
- `Website refresh`

Avoid in primary UI:

- `checkpoint`
- `revision snapshot`
- `projection`
- `public row`
- `draft hash`
- `confirmation token`
- `route collision`
- `cache tag`
- `outbox`
- `revalidation event`

Those terms can remain in developer diagnostics.

## Current Code Evidence

The product already has many of the ingredients:

- Entry publish preview and confirmation state:
  `packages/cms/studio-app/src/composables/internal/useEntryPublishing.ts`.
- Publish readiness derivation:
  `packages/cms/studio-app/src/lib/publicWorkflow.ts`.
- Entry right rail with status, public URL, translations, issues, diagnostics,
  and history:
  `packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue`.
- Per-locale translation creation and side-by-side translation mode:
  `packages/cms/studio-app/src/composables/internal/useEntryLocales.ts`.
- Publish dialog with website changes and confirmation:
  `packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue`.
- Advanced public workflow diagnostics:
  `packages/cms/studio-app/src/components/studio/editor/StudioEntryPublicWorkflowPanel.vue`.
- Review requests:
  `packages/cms/studio-app/src/pages/reviews.vue` and
  `packages/convex/src/reviewRequests.ts`.
- Backend publish preview:
  `packages/convex/src/entries/publish.ts` and `packages/convex/src/diagnostics.ts`.

The issue is not absence of features. The issue is that the product language and
workflow are still split across diagnostics, publish impact, translation
readiness, checkpoints, reviews, and advanced panels.

## Main Product Gaps

### 1. Readiness is not yet the central product concept

Current UI has readiness-related pieces, but the primary top-bar action still
behaves like `Publish`, while the right rail and advanced panels separately
show status, translation state, public visibility, route checks, and website
impact.

Target: one `Publish readiness` model that drives the rail, top bar, publish
dialog, review page, dashboard work queue, and MCP/AI review summaries.

### 2. Checkpoints are backend language leaking into the UI

Current code exposes `Checkpoint` from version history and the entry action menu.
That is useful backend machinery, but not marketer language.

Target: call this `Save version` or move it under `History`. The concept should
be:

```txt
Autosaved just now
Last published yesterday
History
Save named version
Restore this version
```

### 3. Locale readiness needs to become actionable, not diagnostic

Current code can show missing locale, missing route, missing fields, and parent
blockers. That is useful, but the marketer should see clear next actions:

- `Add German translation`
- `Copy from English`
- `Ask AI to draft German`
- `Fill SEO description`
- `Preview German`
- `Publish German`

Target: every locale row has a state, blockers, and one primary next action.

### 4. Review requests are still too technical

The review page exposes request ids, expected draft versions, raw preview JSON,
agent run ids, and operation details. Those details belong behind developer
diagnostics.

Target: review cards should show:

- who/what prepared the change;
- affected entry and locales;
- plain-language change summary;
- readiness state;
- affected public URLs;
- blockers or warnings;
- approve/reject actions.

### 5. Backend has to guarantee the simple UI is truthful

The marketer UI can only be simple if the backend enforces the actual
invariants. Known backend hardening still matters:

- review approval must use the canonical publish operation;
- backend must recompute review previews;
- i18n locale settings need one source of truth;
- published descendant routes need automatic subtree rebuild;
- asset metadata drift needs a single freshness strategy;
- MCP/API-key flows need Convex-level fail-closed behavior.

## Most Fragile System

The fragile system is the intersection of:

```txt
i18n + per-locale drafts + publish readiness + review/AI approvals + public projections
```

Each part is manageable alone. Together they create the failure cases that make
an editor stop trusting the CMS.

Example failure:

1. English is live.
2. German is draft-only and missing SEO.
3. An AI assistant prepares German and requests review.
4. The parent page slug changes.
5. A publisher approves the German review.
6. Public routes, language switch links, sitemap, nav, search, and review
   preview need to agree.

If one surface says German is ready while another blocks publish, the product
has failed, even if every individual component looks polished.

## How This Refactor Could Fail

### Failure mode: frontend becomes the workflow engine

Risk: Vue components combine entry status, locale variants, diagnostics, publish
impact, review requests, and public visibility queries differently on every
screen.

Mitigation: one backend-derived readiness vocabulary, exact readiness detail for
entry/review/publish surfaces, and a cheap conservative summary for lists.
Components render those results. They do not invent readiness rules.

### Failure mode: review/AI remains a second publish path

Risk: AI review approval bypasses canonical publish preview, destructive audit,
or current publishability checks.

Mitigation: review request creation must compute and store the preview in Convex,
not accept caller-provided preview JSON as truth. Approval must re-check the
current backend preview and publish through the same canonical backend path as
manual publishing. Human and agent operations share this path.

### Failure mode: route tree rebuild is treated as a UI detail

Risk: a parent page URL changes, but child public URLs, language switch links,
sitemap/search/nav state, cache invalidation, review previews, and public
provider reads do not all move together.

Mitigation: automatic subtree rebuild is a v1 product requirement. The backend
must preview and execute route-tree changes as one canonical publish effect.

Strict v1 rules:

- per-locale publishing is allowed;
- missing translations are allowed but visible;
- parent route must already be public in the same locale;
- `Publish all ready` never publishes blocked locales;
- parent route changes automatically rebuild affected published descendant
  projections/routes in the same locale;
- descendant route collisions block the parent publish before anything changes;
- fallback behavior is explicit and tested, not inferred by the UI.

Plain-language example: if `/about` has a published child page
`/about/team`, changing the parent slug to `/company` also affects the child
URL. Ginko CMS should automatically move the published child URL to
`/company/team` as part of the parent publish. The marketer should not have to
manually republish every child page.

This is automatic from the marketer's perspective, but not invisible. Publish
preview must show the direct parent URL and affected descendant URLs before the
publish is confirmed.

### Failure mode: new workflow tables create a second truth

Risk: the refactor stores `ready`, `needs_work`, or `live_with_changes` rows and
then must keep them synchronized with drafts, revisions, projections, and
reviews.

Mitigation: derive marketer workflow state from canonical rows. Add invariant
tests around the derivation. Do not persist the derived state.

### Failure mode: scope turns into "fix everything"

Risk: assets, imports, MCP, settings, backups, reviews, revalidation, and all
Studio screens are refactored at once. The work stalls before one end-to-end
workflow is trustworthy.

Mitigation: ship one vertical slice first:

```txt
one route-backed entry
  -> primary locale draft
  -> secondary locale missing
  -> AI prepares secondary locale
  -> review request
  -> publisher approves
  -> one locale publishes
  -> public provider reads active projection
  -> dashboard and entry rail agree
```

Only after that slice is green should the refactor expand to assets, imports,
bulk publishing, and broader diagnostics.

### Failure mode: simple copy hides real uncertainty

Risk: the UI says `Ready` while the backend still has warnings that can become
publish failures.

Mitigation: `Ready` means canonical publish operation preview can execute with
the same current draft version. Anything else is `Needs work`, `Preview stale`,
or `Check again`.

## Non-Negotiable Invariants

- Studio, MCP, reviews, publish preview, and publish execute must agree on
  per-locale readiness.
- Public provider output must agree with active published projections and the
  published side of readiness after publish.
- The frontend must not own backend invariants.
- Marketer workflow state is derived, not stored.
- Review approval uses the same publish semantics as manual publish.
- Humans and agents use the same permission model and guarded operation paths.
- An agent with publish permission can publish directly; an agent without publish
  permission requests review.
- Required fields may be empty in saved drafts, but block publishing.
- Missing translations are incomplete work, not global publish blockers.
- A locale can publish independently only when its own readiness is valid.
- Public website reads use active published projections only.
- The public provider does not consume draft/editor readiness.
- Public route uniqueness is global by `locale/path`.
- Parent route changes automatically rebuild affected published descendant
  projections/routes in the same locale.
- Descendant route collisions block the parent publish before projections change.
- Asset metadata either resolves live from canonical assets or has one rebuild
  path. It must not drift silently.
- Developer diagnostics can expose raw ids and cache tags; primary marketer UI
  cannot depend on them.

## Desired End State

### Dashboard

The first screen is an editorial inbox:

```txt
Needs attention
  3 pages blocked
  2 translations missing
  1 website refresh failed

Continue writing
  8 drafts with unpublished changes

Ready to publish
  4 language versions ready

AI prepared
  2 drafts ready for review or publish
```

Avoid making the dashboard feel like an operations dashboard. Counts should lead
to work, not metrics.

### Entry editor

The top bar should make the current state obvious:

```txt
About us    Autosaved just now    Live with unpublished changes

[Preview] [Request review] [Publish English]
```

If blocked:

```txt
About us    Autosaved just now    Needs work

[Preview] [Fix blockers]
```

### Publish readiness rail

```txt
Publish readiness

English is ready to publish

Before publishing:
  No blocking issues

Website changes:
  /about
  sitemap: included
  search: included

Languages:
  English    Ready
  German     Missing SEO description
  French     Missing translation

[Preview page] [Publish English]
```

If a locale is blocked:

```txt
German needs work

Before publishing:
  Add SEO description
  Add image alt text

[Fix SEO] [Edit image metadata]
```

### Translation flow

```txt
Language versions

English    Live
German     Draft, needs work
French     Missing

[Add French] [Ask AI to draft French] [Publish all ready]
```

### Review flow

```txt
AI prepared German translation for "About us"

Ready for review

Changes:
  Added German title, body, SEO description
  Reused hero image

Affected page:
  /de/ueber-uns

[Preview] [Approve and publish] [Request changes]
```

If the agent has publish permission, the direct flow is:

```txt
AI prepared German translation for "About us"

Ready to publish

Changes:
  Added German title, body, SEO description

Affected public URL:
  /de/ueber-uns

[Preview] [Publish German]
```

## Work Estimate

This is not a rewrite. The repo already has draft rows, locale variants,
published per-locale projections, publish preview, destructive confirmations,
review requests, version history, and Studio components.

It is also not just copy polish. The simple marketer pipeline needs backend
truth and one shared workflow model.

Estimated effort for one senior full-stack engineer:

| Scope                        |               Estimate | Notes                                                                                                                      |
| ---------------------------- | ---------------------: | -------------------------------------------------------------------------------------------------------------------------- |
| Thin UI language polish only |               4-7 days | Rename checkpoint, simplify labels, move diagnostics deeper. Useful, but not enough.                                       |
| Core readiness refactor      | 25-35 engineering days | Canonical readiness vocabulary/detail, strict i18n rules, canonical human/agent publish path, initial vertical slice.      |
| Marketer-ready Studio v1     | 35-50 engineering days | Adds full entry rail, dashboard, review page, locale actions, AI review UX, and focused tests.                             |
| Production-complete pipeline | 60-85 engineering days | Adds automatic subtree route rebuild, asset freshness, MCP lifecycle hardening, imports alignment, and broader invariant coverage. |

Calendar estimate:

- one engineer: 8-12 weeks for the production-complete version;
- two engineers with clean ownership split: 5-7 weeks;
- a thin visual pass can happen in about a week, but it would not fix the
  backend trust issues.

## Recommended Phases

### Phase 0: Freeze the target invariant

Goal: stop the refactor from becoming UI polish or a hidden state machine.

Tasks:

- Define the canonical readiness state, issue, and action vocabulary.
- Decide which parts belong in the public contract package now and which remain
  internal until the shape is proven.
- Define two read depths:
  cheap `EntryWorkflowSummary` for lists and exact `EntryReadinessDetail` for
  editor/review/publish.
- Decide strict v1 i18n rules:
  per-locale publish, missing translations allowed, parent must be public in
  locale, automatic descendant route rebuild for published children in the same
  locale.
- Make configured missing locales and runtime default locale part of the first
  vertical slice.
- Define subtree rebuild semantics:
  which descendants are affected, how route collisions block publish, how
  public projections/routes/cache tags are rebuilt, and how the publish preview
  reports affected descendant URLs.
- Define actor parity:
  humans and agents use the same permissions and guarded operations; direct AI
  publish is allowed when the agent has publish permission.
- Decide required-field publish behavior:
  saving incomplete drafts is allowed, publishing required-empty fields is not.
- Add failing tests for the vertical slice before implementation.
- Mark existing readiness/publish/review UI as consumers of the future
  vocabulary/detail, not separate rule owners.

Files likely touched:

- `packages/contract/src`
- `packages/convex/src/diagnostics.ts`
- `packages/cms/studio-app/src/lib/publicWorkflow.ts`
- `test/shared/studio-workflow.test.ts`
- `test/component/diagnostics.test.ts`
- `test/component/reviewRequests.test.ts`

Estimate: 3-5 days.

Review gate:

- Can the team explain the derived readiness rules without mentioning Vue
  components?
- Is every stored field still canonical, not derived workflow state?
- Is there a failing test for the vertical slice?

### Phase 1: Build the canonical readiness engine

Goal: make backend-derived readiness vocabulary/detail the source for Studio,
MCP, reviews, and publish UI.

Tasks:

- Implement exact `computeEntryReadinessDetail` in the Convex component.
- Implement cheap `computeEntryWorkflowSummary` for dashboard/list views using
  the same vocabulary.
- Derive per-locale state from drafts, revisions, public projections,
  diagnostics, and review requests.
- Return configured missing locales, not only existing/published locale rows.
- Include next action codes and blocker/warning issue codes, not final UI copy.
- Keep developer diagnostics linked but secondary.
- Add a Studio query for exact readiness detail.
- Add MCP operation helpers that consume the same readiness truth.
- Do not make public provider reads consume draft/editor readiness.
- Include descendant URL impact in exact readiness detail when a published parent
  route changes.

Files likely touched:

- `packages/contract/src`
- `packages/convex/src/diagnostics.ts`
- `packages/convex/src/entries/read.ts`
- `packages/convex/src/reviewRequests.ts`
- `packages/cms/studio-app/src/lib/publicWorkflow.ts`
- `packages/cms/studio-app/src/pages/[collection]/[id].vue`
- `test/component/diagnostics.test.ts`
- `test/shared/studio-workflow.test.ts`

Estimate: 7-10 days.

Review gate:

- Entry rail, dashboard prototype, and MCP preview use the same readiness
  vocabulary; exact surfaces use exact detail.
- No new stored workflow status exists.
- Missing configured locales appear as `Missing`.

### Phase 2: Make publish and review one canonical path

Goal: the simple UI must be backed by one backend truth.

Tasks:

- Make publish operation preview consume or produce the same readiness result.
- Make review request creation compute preview in Convex; caller-provided preview
  JSON is never stored as truth.
- Make review approval re-check the current backend preview and execute the
  canonical publish path.
- Make direct AI publish use the same publish operation, permission checks,
  preview/confirmation rules, audit, and revalidation path as human publish.
- Make archive/restore operation-based and reversible for both humans and agents.
- Store a marketer-readable review summary derived from canonical preview.
- Hide raw preview JSON by default on the Reviews page.
- Ensure stale reviews are based on version and current publishability, not only
  client-provided data.
- Add MCP/AI review tools only for the lifecycle that matters:
  start run, prepare draft, request review, publish when authorized, archive when
  authorized, restore when authorized, list own review/operation state.

Files likely touched:

- `packages/convex/src/reviewRequests.ts`
- `packages/convex/src/entries/publish.ts`
- `packages/convex/src/operationHelpers.ts`
- `packages/cms/src/server/mcp/tools/content/request-publish-review.ts`
- `packages/cms/studio-app/src/pages/reviews.vue`
- `test/component/reviewRequests.test.ts`
- `test/runtime/mcp-request-publish-review.test.ts`

Estimate: 6-9 days.

Review gate:

- A spoofed review preview cannot be stored.
- A review approval fails if the current canonical publish preview is blocked.
- Manual publish and review approval produce the same revision/projection/audit
  semantics.
- Authorized human publish and authorized agent publish produce the same
  revision/projection/audit/revalidation semantics.

### Phase 3: Make per-locale readiness first-class in Studio

Goal: let marketers publish each language independently without confusion.

Tasks:

- Replace locally assembled rail readiness with backend readiness detail.
- Make each locale row show:
  state, blockers, published/draft status, public URL, and next action.
- Add primary actions:
  `Add translation`, `Copy from primary`, `Ask AI to draft`, `Preview`, `Publish`.
- Ensure primary-language publish is allowed even when secondary locales are
  missing, while showing missing translations clearly.
- Show `Publish all ready` only when multiple locales are ready.
- Make language-switch readiness use the same model as publish readiness.
- Rename primary UI terms:
  `Checkpoint` -> `Save version`;
  `Publishing diagnostics` -> `Publish readiness`;
  `Preview impact` -> `Preview website changes`;
  `Validate routes` -> `Check links`.

Files likely touched:

- `packages/cms/studio-app/src/composables/internal/useEntryLocales.ts`
- `packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue`
- `packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue`
- `packages/cms/studio-app/src/components/studio/editor/StudioEntryCompareToolbar.vue`
- `packages/cms/studio-app/src/components/studio/editor/StudioLocaleEditorPanel.vue`
- `packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue`
- `packages/cms/studio-app/src/pages/[collection]/[id].vue`

Estimate: 7-10 days.

Review gate:

- A marketer can publish English while German is missing.
- A blocked German locale shows exact next action.
- Entry rail and publish dialog show the same state.

### Phase 4: Close i18n and public-output invariants

Goal: published website reads and language switching remain reliable after
marketers publish language versions independently.

Tasks:

- Make locale/fallback/routing config have one source of truth for v1.
- Ensure public translation summaries include configured missing locales, not
  only published rows.
- Implement automatic subtree rebuild for parent route changes with published
  descendants in the same locale.
- Preview affected descendant public URLs before publish confirmation.
- Rebuild descendant `publicEntries`, `publicRoutes`, public asset refs,
  sitemap/search/nav visibility, cache tags, and revalidation events from active
  published descendant revisions.
- Block publish if any affected descendant route would collide.
- Do not publish draft changes on descendants as a side effect of rebuilding
  their route projections.
- Ensure route collision/readiness checks use the same invariant helper as
  projection maintenance.
- Ensure public provider default locale is not hardcoded.

Files likely touched:

- `packages/convex/src/settings.ts`
- `packages/convex/src/lib/locale.ts`
- `packages/convex/src/diagnostics.ts`
- `packages/convex/src/entries/workflow/commands.ts`
- `packages/convex/src/entries/projectionMaintenance.ts`
- `packages/cms/src/nuxt-provider.mjs`
- `packages/cms/src/module/i18n.ts`
- `packages/cms/src/module/content-contract.ts`
- `test/component/diagnostics.test.ts`
- `test/component/public-api.test.ts`
- `test/module/module-i18n.test.ts`
- `test/refactor/provider-contract.test.ts`

Estimate: 7-12 days.

Review gate:

- Public provider reads active projections only and match the published URLs,
  locales, sitemap/search/nav state predicted by readiness after publish.
- Language switch data includes missing/configured locale state where needed.
- Parent route changes automatically rebuild affected descendant published URLs
  in the same locale, or block before mutation on collision.

### Phase 5: Build the marketer dashboard and review inbox

Goal: make the first screen and review page reflect the same readiness model.

Tasks:

- Update dashboard rows to reflect editorial lanes:
  `Needs attention`, `Continue writing`, `Ready to publish`, `AI prepared`.
- Make dashboard rows drill into filtered content based on readiness.
- Rework reviews as marketer review cards, not operation records.
- Keep request ids, agent run ids, preview JSON, and draft versions in developer
  details only.
- Add review actions:
  `Preview`, `Approve and publish`, `Request changes`.

Files likely touched:

- `packages/cms/studio-app/src/pages/index.vue`
- `packages/cms/studio-app/src/pages/reviews.vue`
- `packages/cms/studio-app/src/lib/publicWorkflow.ts`
- `packages/convex/src/entries/read.ts`
- `packages/convex/src/reviewRequests.ts`
- `test/shared/studio-workflow.test.ts`
- `test/component/reviewRequests.test.ts`

Estimate: 5-8 days.

Review gate:

- Dashboard, entry rail, and reviews page show the same state for the same
  entry/locale.
- AI-prepared work is visible as editorial work, not as technical agent output.

### Phase 6: Polish history, assets, and tracking

Goal: marketers can recover confidently and trust media/website refresh state.

Tasks:

- Rename and reorganize checkpoint/history actions.
- Show history as marketer events:
  `Saved version`, `Published English`, `Restored version`, `AI drafted German`.
- Fix asset metadata freshness so published content does not show stale alt or
  caption metadata.
- Show post-publish tracking as `Website refresh`, not revalidation internals.
- Keep detailed events, cache tags, and ids in developer diagnostics.

Files likely touched:

- `packages/cms/studio-app/src/composables/internal/useEntryHistory.ts`
- `packages/cms/studio-app/src/components/studio/editor/StudioVersionHistoryCard.vue`
- `packages/cms/studio-app/src/components/studio/editor/StudioCheckpointDialog.vue`
- `packages/cms/studio-app/src/components/studio/StudioAssetBrowser.vue`
- `packages/convex/src/assets.ts`
- `packages/convex/src/entries/workflow/commands.ts`
- `packages/convex/src/revalidation.ts`
- `test/component/entries/publish.test.ts`
- `test/component/revalidation.test.ts`

Estimate: 5-8 days.

Review gate:

- A marketer can restore a version without seeing checkpoint terminology.
- Published media metadata cannot silently drift, or publish-time snapshots are
  explicitly presented as intentional.
- Post-publish state says whether the website refresh succeeded.

## Execution Rules

- Start with tests for the vertical slice.
- Prefer one derived readiness engine over page-specific helpers.
- Do not add compatibility paths for unreleased internals.
- Do not introduce a stored workflow table.
- Do not let MCP tools bypass operation guards.
- Do not move CMS-specific behavior into `ginko-content`.
- Keep diagnostics available, but secondary.
- After each phase, run the focused tests for that phase and do a product review
  against the marketer mental model.

## Review Checklist

Use this after every phase:

- Can a marketer explain the current screen without backend vocabulary?
- Does Studio render readiness from the canonical vocabulary and backend detail?
- Does MCP/AI use the same readiness truth?
- Does review approval use the same publish semantics as manual publish?
- Does authorized agent publish use the same operation semantics as authorized
  human publish?
- Can one locale publish while another remains missing or blocked?
- Are missing translations visible but not global blockers?
- Do required fields block publish while still allowing draft saves?
- Are public reads projection-backed?
- Is public provider separated from draft/editor readiness?
- Did we add a second source of truth?
- Did we leave old UI/rule paths behind?
- Do tests cover invariants, not only happy paths?

## Acceptance Criteria

The pipeline is solid when these statements are true:

- A marketer can explain the workflow as
  `Write -> Check -> Preview -> Review -> Publish -> Track`.
- Every entry and locale has one visible workflow state.
- That state uses the canonical readiness vocabulary, not page-specific component
  logic.
- Exact editor/review/publish readiness comes from the backend readiness detail.
- Dashboard/list readiness uses the same vocabulary and is conservative when it
  cannot compute exact publishability cheaply.
- Existing publish impact, Studio workflow helpers, entry list work-state, local
  publish readiness, and review preview presentation paths are consolidated or
  replaced. They are not parallel sources of truth.
- Missing translations are shown as incomplete work, not as errors.
- The primary locale can publish independently of missing secondary locales.
- Each locale can be previewed and published independently.
- `Publish all ready` never publishes blocked locales.
- Required fields can be empty in saved drafts but block publish in every
  collection mode.
- A review request cannot misrepresent backend publish readiness.
- Convex computes and stores review preview; MCP/client preview JSON is not
  trusted as review truth.
- Approving an AI-prepared change and direct authorized AI publish use the same
  backend publish path as manual publishing.
- Human and agent archive/restore use reversible guarded operations.
- The publish dialog lists affected public URLs/locales in marketer language.
- Developer details are available but not primary.
- History lets users restore work without learning checkpoints.
- Public website reads use only active published projections.
- Studio, MCP, review approval, and publish preview agree for the same
  entry/locale test fixture.
- Public provider reads agree with the active published projection for that same
  fixture after publish.
- Configured missing locales and non-`en` default locales work in the first
  vertical slice.
- Parent route changes automatically rebuild affected descendant public URLs in
  the same locale.
- Descendant draft content is not published as a side effect of parent route
  rebuild.
- Route collisions in the affected subtree block publish before projections
  change.
- Tests cover the workflow states, not only happy-path mutations.

## Tests To Add Or Strengthen

Backend/component tests:

- exact readiness detail derives draft, missing, needs work, ready, in review,
  live, and live-with-changes states;
- cheap workflow summary uses the same state/issue/action vocabulary as exact
  readiness detail;
- publish primary locale while secondary locales are missing;
- block only the affected locale when a required localized field is missing;
- required empty fields block publish for data-only and route-backed
  collections;
- publish all ready locales skips or blocks non-ready locales explicitly;
- review request recomputes preview server-side;
- review approval fails if current publish preview is blocked;
- authorized agent publish and human publish use the same operation path and
  audit semantics;
- unauthorized agent publish requests review or fails closed;
- archive/restore is operation-based and reversible for human and agent actors;
- parent route change with published descendants rebuilds descendant public
  projections/routes in the same locale;
- subtree rebuild preserves descendant published content and does not publish
  descendant drafts;
- subtree rebuild blocks atomically when a descendant route would collide;
- configured missing locales appear in readiness summaries;
- non-`en` default locale works through Studio and provider reads;
- public translation summaries do not require every locale to be published;
- asset metadata changes do not leave stale published metadata, or the product
  clearly defines publish-time snapshots.

Frontend/unit tests:

- rendering of canonical readiness detail/summary in rail, publish dialog,
  dashboard, and review card;
- locale next-action mapping;
- publish dialog copy for single locale, all locales, blocked, no changes;
- review card hides raw technical data by default;
- checkpoint/history copy uses marketer language;
- dashboard editorial queue grouping.

Focused commands:

```bash
pnpm exec vitest run test/shared/studio-workflow.test.ts
pnpm exec vitest run test/component/reviewRequests.test.ts test/component/diagnostics.test.ts test/component/public-api.test.ts
pnpm exec vitest run test/runtime/mcp-request-publish-review.test.ts test/runtime/mcp-preview-publish.test.ts
pnpm exec vitest run test/refactor/provider-contract.test.ts test/module/module-i18n.test.ts
pnpm run typecheck
```

Run the full gate before handoff:

```bash
pnpm run check
```

## Recommendation

Invest in the core readiness refactor before adding more Studio screens. This
is the foundation that makes the CMS feel simple without making it fragile.

The highest-leverage path is:

1. define one canonical readiness vocabulary and exact readiness detail;
2. compute it in the backend from canonical state, with a cheap list summary
   using the same vocabulary;
3. make review, human publishing, and AI publishing canonical in the backend;
4. render the same readiness truth across entry rail, publish dialog, dashboard,
   reviews, and MCP;
5. close i18n/public-output invariants in the first vertical slice;
6. polish history, assets, archive/restore, and post-publish tracking.

This gives Ginko CMS a simple product story without weakening the backend. The
backend can remain rigorous; the marketer gets a CMS that feels like writing,
checking, previewing, and publishing a website.
