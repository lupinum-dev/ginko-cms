# Autonomous Ginko CMS implementation goal

This is an execution brief to activate through `/goal`, not evidence that the goal has already started. Prepared on 22 September 2026. Once the user activates it, the authorization and defaults below apply.

## Objective

Deliver a working, locally verified, review-ready Ginko CMS experience for an agency and its clients: edit together in Studio or on the website, switch languages and working/published views, preview accurately, and publish deliberately. Finish implementation, integration, debugging, meaningful tests and real browser verification. Human product approval and external release happen afterward.

I will be away for roughly eight hours. Use that uninterrupted window productively. Make reasonable reversible decisions without asking me to approve intermediate plans. Eight hours is a planning horizon, not a guarantee or a reason to mark incomplete work complete. Continue toward the objective while the goal is active and runtime limits permit. Do not stop at a plan, mockup, first passing unit test or partially connected frontend.

## Starting evidence and repositories

- CMS main and existing uncommitted inline prototype: `/Users/matthias/Git/0_libs/ginko-cms`, inspected at `d0e27981`.
- Newer CMS rollout: `/Users/matthias/Git/1_apps/ginko-cms-next-rollout`, branch `codex/ginko-next-rollout`, inspected at `0d8ea2d`. It contains later Content/Better Convex, migration and public-query fixes. Do not assume September 15 main is the appropriate integration base.
- Earlier Editor integration candidate: `/Users/matthias/.codex/worktrees/ginko-editor-step1/cms`, inspected at `5aa12170`, branch `fix/parser-parity`.
- Content: `/Users/matthias/Git/0_libs/ginko-content`, inspected at `0581367`.
- Editor: `/Users/matthias/Git/0_libs/ginko-editor`, inspected at `b834ddf`. Its `plan.md` records additional integration work and an unfinished authenticated CMS acceptance gate; reconcile actual commits/worktrees rather than treating every historical note as current.
- Architecture and product decisions: `/Users/matthias/Git/0_libs/ginko-cms/plans/2026-09-15-collaborative-inline-editing-poc.md`, especially its architecture deep dive.
- Earlier findings: `/Users/matthias/Git/0_libs/ginko-cms/plans/2026-09-06-architecture-review.md`.

Refresh repository instructions, statuses, dependency versions and worktree ownership first. Inspect current source before applying any earlier finding. Reuse completed work. Preserve unrelated changes, user data and running sessions. Use isolated integration worktrees where necessary; transfer only identified relevant changes. Do not overwrite or reset the existing rollout or Editor worktrees.

## Authority and operating boundaries

You are authorized to implement the necessary changes across CMS, Content and Editor, make reversible UI/product decisions, add migrations and compatibility handling where evidence requires them, install repository dependencies, run local services, create synthetic test identities through legitimate auth, run tests and browser checks, and make local Conventional Commits for your changes. Use applicable repository and publishing/stack skills. No pushes, PR creation, merges into shared branches, package publication, hosted deployment, production mutations, real outbound messages, purchases or new paid services are authorized by this brief.

Use bounded parallel subagents for independent implementation and reviews when helpful. One coordinator owns integration; give each writer a non-overlapping scope. Review their changes and run integrated verification. Subagent completion alone is not acceptance.

Use disposable local Convex and explicit local email/delivery substitutes, isolated from existing hosted credentials. Verify actual login, invitations and membership checks; do not forge verified users or disable authorization to make the demo pass. Fix the missing local onboarding path through a supported production-quality boundary if still necessary.

Record decisions and progress in the existing workstream or its integration copy, with a clear authoritative location. Keep a short acceptance checklist and reproducible startup instructions. Do not create layers of planning documents or spend the work window repeatedly reassessing already resolved choices.

## Product defaults you may decide without me

1. One shared working version per language; public visitors see approved published content only. No personal branches or separate light CMS datastore.
2. Automatic saving. Quiet save feedback and explicit failure/conflict recovery. Remove routine Save draft once pending editor work, autosave and navigation are reliably owned by the session.
3. One CMS-owned editing session implementation for Studio and website controls. It handles entry/locale identity, pending rich-text/media work, serial writes, acknowledgments, permissions, conflicts and disposal.
4. Keep Content responsible for definitions/public reads/routing/rendering, Editor responsible for rich-text behavior and conversion safety, CMS responsible for editorial policy. Keep Vue templates developer-owned.
5. Support structured landing pages without an irrelevant article body, while preserving current article defaults, URL/SEO/sitemap behavior and portable data. Do not work around this by silently changing existing data-collection semantics.
6. Landing pages primarily edit in their real website design. Articles have a focused writing editor and website preview. Reuse the existing design system and standalone Editor integration rather than create another editor engine.
7. A compact website toolbar offers working/published or live view, language selection, Edit/Preview and Publish. Use accurate labels: backend publication alone does not prove CDN delivery. Switching view never publishes or discards text. Handle unpublished entries, changed slugs and missing language variants explicitly.
8. A quieter Studio exposes content, languages and the next action. Remove duplicate status panels and publication receipts from the ongoing editor. Put translation comparison, page settings, history and operational diagnostics in contextual views. Keep capabilities accessible to appropriate roles. Use full language names, clear field labels and existing localization conventions; no always-visible technical status dashboard.
9. Independent language/field edits should coexist. Retain server-side validation and conflict detection; preserve both values on genuine overlap. Publishing stays tied to reviewed versions and selected locales. Shared-field changes retain their broader impact checks.
10. Translation review records an optional source-language relationship and immutable reviewed-source baseline. Show changed source text beside the target, support confirming an unchanged translation, and guard against either side changing during review. Independent language versions remain valid. Existing translations with unknown provenance must not be falsely marked reviewed.
11. Editorial globals, if used in the pilot, follow the same working/published lifecycle as pages. Prefer existing singleton entry mechanisms. Migrate applicable site data only after inspecting real consumers, with output parity and rollback; leave operational configuration distinct.
12. An editor requiring approval sees Request review; a publisher sees Publish. Show shared changes accurately, including changes made by another team member. Presence may help coordination but must never substitute for safe write behavior.

Do not turn this into a general page builder, universal backend adapter, new tenancy service or full offline-first platform. Same-paragraph rich-text merging is a separate optional experiment after the required experience works; do not claim whole-document subscriptions provide it. Keep one authoritative representation and conversion fidelity. Never bypass unsupported-content safeguards just to simplify controls.

## Execution order

Start with the smallest integrated journey, then extend it. Reconcile the newer rollout and Editor work; establish a reproducible authenticated local runtime; consolidate session behavior; implement safe narrower edits; simplify Studio and website controls; complete translation provenance/review and structured-page contracts; handle applicable editorial globals; finish publication/delivery integration and regression verification.

Adjust this order when real dependencies warrant it. Finish coherent vertical slices rather than leave many half-connected refactors. If a slice is blocked, preserve its state and complete independent authorized work. Fix relevant existing setup/type/build failures instead of repeatedly reporting them without investigation. Do not bypass required checks or rewrite unrelated files merely to obtain green output.

## Required demonstration and acceptance

Use a realistic synthetic landing page, an article and English/German variants. Include a global footer when exercising the shared-content workflow.

- Two independently authenticated authorized users: A edits Studio, B edits the website. Both receive acknowledged changes without reload. Two tabs sharing one login are insufficient evidence for this acceptance criterion.
- Anonymous visitor C cannot read private content in HTML, payloads or APIs, and cannot write. A signed-in non-member is also denied. Revocation prevents subsequent protected operations.
- Headline, introduction, CTA destination and supported image/alt-text changes work on the page. The actual template matches public rendering. Blog body and media survive immediate preview, locale switching, navigation and reload, including pending conversion/uploads.
- Unrelated languages/fields do not cause unnecessary conflicts. Overlapping edits preserve local work and expose a clear recovery path. Test query/mutation ordering, edits during save, retry after ambiguous failure and changes during publication review.
- Working/published switching and language selection preserve identity and pending work. New content previews before a public URL exists. A missing translation never silently edits a fallback language.
- Translation source changes produce a focused review action. Review can update the target or confirm it remains suitable. Source/target changes during review invalidate stale acknowledgments. Publishing English does not silently publish German.
- Publication updates local public output without a frontend rebuild. Subsequent working edits remain private. Draft responses are private/no-store/noindex. Public visitors do not need draft subscriptions or editing bundles.
- Implement the Vercel delivery adapter and test its meaningful behavior locally, including signing/auth, duplicate or stale delivery and failure/retry behavior. Actual hosted Vercel verification is an explicit post-approval gate; do not fake it or block unrelated implementation waiting for deployment authorization.
- Inspect the real interface on desktop and a narrow viewport. Exercise keyboard access, meaningful loading/empty/error states, long text and both interface/content language behavior where supported. Fix observed defects and recheck them.
- Run repository-required checks, relevant package/consumer builds and focused behavioral tests. Include backend authorization and migration/rollback tests for changed policies/data. Record actual failures and exact evidence; source-string tests and screenshots alone do not prove behavior.

Preserve existing published output, assets, contracts and unrelated functionality. Inventory dependents before cutover; temporary compatibility must have one owner and an exact removal condition recorded in `internals/migrations.md` when required by instructions. Avoid permanent duplicate write paths or editable copies of derived status.

## Completion and return handoff

The goal is complete when the required local experience works end to end, relevant checks pass, migrations are reviewable, and the remaining human work is product acceptance plus separately authorized external rollout. Optional rich-text collaboration and actual hosted delivery proof are clearly separate from that local acceptance scope.

Before handoff, inspect integrated diffs, perform a focused independent review of auth, data loss, concurrency, translation and cache isolation, fix actionable findings, and remove obsolete implementations introduced by this work. Keep the relevant preview running for my return; clean up other processes created only for verification. Provide one startup command and safe test access without exposing secrets in documentation.

Deliver a concise report with: runnable Studio/website links; exact integration worktrees/commits; what works; browser/test evidence; migration and rollback notes; unresolved issues; and a short human acceptance checklist. Clearly separate passed, failed, untested and deferred claims. Do not call it production-ready without hosted evidence. Do not mark the goal complete merely because eight hours or a runtime budget has elapsed. If runtime limits or a genuinely unavoidable blocker stop progress, leave an accurate checkpoint and the smallest next action.
