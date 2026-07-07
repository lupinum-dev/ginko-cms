# Executive Summary

**Review date:** 2026-07-07. **Scope:** full greenfield review of `ginko-content` (@lupinum/ginko-content 0.1.7) and `ginko-cms` (@lupinum/ginko-cms 0.1.3, @lupinum/ginko-cms-convex 0.1.2, @lupinum/ginko-cms-contract 0.1.1). Method: six parallel deep-dive reviews (ginko-content public API, ginko-content internals/tests/release, ginko-cms Convex backend, ginko-cms Nuxt module/CLI/MCP, Studio UI/UX, cross-repo boundary audit), synthesized here. All file/line references were read from actual source.

## Ratings

| Dimension | Rating | One-line justification |
|---|---|---|
| Overall architecture | **Good** | Layering is real (zero import cycles in ginko-content; single-owner invariants in the Convex component), ADR discipline is far above typical 0.1.x, boundaries agreed by ADRs on both sides — decayed by five hand-synced duplications at the seam. |
| Ginko Content | **Good** | Disciplined internals and an excellent unified query API; the public surface is 13 subpaths wide with three enforcement blind spots and one production performance defect. |
| Ginko CMS | **Good, blocked** | Principled Convex component (centralized authz, token-gated destructive ops, transactional publish) with one Critical auth-bootstrap hole and a backup feature that is a false safety net. |
| API design | **Good** | The ADR-0016 query API and the field DSL are genuinely pleasant; the provider wire contract still speaks a retired vocabulary, and the root entry leaks the entire internal type universe. |
| Data model | **Good** | Canonical vs derived is explicitly modeled and mostly right; two High gaps: projections are not fully rebuildable, and "full backup" cannot be restored. |
| UI/UX (Studio) | **Good** | The destructive-operation spine (server preview → blockers → confirm → expiring token) is exemplary and applied consistently; an i18n split-brain and a publish flow that can silently bounce to a save undercut it. |
| Maintainability | **Good** | Strong test culture (700+ tests in ginko-cms, behavior-first contract suites in ginko-content), enforced boundaries — but three monolith hotspots (asset browser 2,317 lines, `nuxt-provider.mjs` 1,095 lines untyped, ~11.5k lines of stale planning docs at the ginko-cms root). |
| Release readiness | **Mixed** | Release *engineering* is above average on both sides (packed-consumer e2e, publish guards, compatibility matrices); release *state* is not: Critical security finding open, ginko-content v0.1.7 shipped with no changelog/tag, both compatibility.json files stale. |

## Are you on track? (The creator's question)

**Yes — this is worth continuing, and the confidence is earned, not hoped for.** The hard architectural decisions are correct and, unusually, actually implemented as decided: code-defined collections with a read-only contract in the CMS, published-only website-shaped projections, one operation layer shared by Studio and MCP (MCP does *not* bypass it — verified), authorization centralized in the Convex component with a lint guarding it, canonical-vs-derived state explicitly designed. The Trellis exit (ADR 0016) was executed as a real hard cutover — only a dead marker check remains ([convex.ts:154](packages/cms/src/module/convex.ts)). Most 0.1.x projects fail this review on structure; this one passes on structure and fails on specific, fixable defects.

**The blind spots are exactly where solo-built systems have them:**

1. **Adversarial thinking.** The one Critical finding — any authenticated user can claim first-owner by passing the configured owner email as a client argument (`packages/convex/src/members.ts:247-249`) — plus the hardcoded `BETTER_AUTH_SECRET` fallback, are "attacker's first five minutes" issues that internal testing never exercises.
2. **Disaster paths.** Backups export but cannot be restored (restore is single-asset only); asset purge gates on backup artifacts that are not actually a recovery path. The happy path is polished; the recovery path is theater.
3. **The seam between the repos.** The ADRs agree, but the seam is held together by five hand-synchronized copies (field types ×4, schema artifact + FNV checksum, vendored path/slug/MDC helpers, cache-tag scheme, provider result marker) and two parsers at different comark versions. Nothing enforces conformance: ginko-content ships a provider contract test suite that the CMS provider *cannot pass* and doesn't run.
4. **Scale of the write path.** Public reads are excellently indexed; the publish path scans the whole site per publish, and a slug change on a deep tree rebuilds all descendants in one mutation. This will hit Convex limits before "hundreds to low thousands of entries" (your own stated target) on tree-heavy sites.

## The 5 most important things to fix

1. **Close the bootstrap owner-claim bypass** — `packages/convex/src/members.ts:247-249`: validate the *verified* identity email only, never `args.email`. (Critical, ~1 line.)
2. **Remove the hardcoded auth-secret fallback** — `packages/convex/src/convex.auth.ts:74`: fail closed in production when `BETTER_AUTH_SECRET` is unset. (High, ~5 lines.)
3. **Make backup honest or restorable** — `packages/convex/src/backup.ts`: today "full" export omits auth/config tables, inlines all blobs in memory, and restore rejects every scope except single-asset. Rename/scope it as asset backup until content restore exists, and stop letting purge treat it as a safety net.
4. **Make projections rebuildable and the publish path bounded** — add a revisions-driven full rebuild (`projectionMaintenance.ts` has an uncalled repair that rebuilds from the wrong source), replace the O(site) route-claim scan (`diagnostics.ts:93-137`) with indexed point lookups, and batch descendant route rebuilds through the existing job machinery.
5. **Collapse the cross-repo duplications** — field-type union (re-export from `/cms-contract`), schema artifact + checksum (import/vendor, and actually read `CMS_CONTRACT_VERSION`), comark version alignment, cache-tag scheme (import in `nuxt-provider`), and run a capability-parameterized provider conformance suite from ginko-content in ginko-cms CI.

---

# Repository Overview

## ginko-content (`/Users/matthias/Git/workspace/ginko-content`)

Single publishable package `@lupinum/ginko-content` (v0.1.7 on npm) under `packages/content` — ~25,500 LOC of TypeScript across 232 files, plus ~17,950 LOC of tests, a docs site (57 pages), 7 playgrounds, and 18 ADRs. It is a filesystem-first content engine for Nuxt 4: content files are canonical, parsed through `parse → transform → validate` (`src/integrations/nitro/ingest.ts`), folded into an in-memory `ContentGraph` (`src/core/content/graph.ts`) with `byId/byCanonical/byRoute/byRef` indexes, and queried through the ADR-0016 unified query API (eight verbs, one option grammar, identical client/server). i18n is first-class (locale-agnostic canonical identity, translated slugs, locale fallback chains — ADRs 0006–0008). CMS integration happens through three deliberate subpaths: `./cms-contract` (build the collection contract from `content.config.ts`), `./cms-import` (parse filesystem content for CMS import), `./cms-exchange` (export/exchange format — currently unused by the CMS, see boundary review), plus a provider registry so a CMS can replace the filesystem as the content source.

Layer map (verified, zero circular dependencies): `core/` (3,323 LOC, pure domain), `features/` (1,974), `storage/` (1,202), `runtime/` (7,784 — the largest, and no longer "thin" as its docs claim), `module/` (2,557 + a 232-line exemplary `module.ts` orchestrator), `types/` (2,512), `cms-*` (1,959), `cli/` (1,073), `testing/` (1,073), `integrations/` (675).

## ginko-cms (`/Users/matthias/Git/workspace/ginko-cms`)

Three-package pnpm workspace (~81,000 LOC of TS/Vue excluding `_generated`), per ADR 0001:

- **`@lupinum/ginko-cms-contract`** (0.1.1) — framework-neutral domain types, Convex validators, field definitions, readiness codes, cache-tag scheme.
- **`@lupinum/ginko-cms-convex`** (0.1.2) — the Convex component: ~20 tables covering entries/drafts/revisions, public projections, assets, members, MCP credentials, destructive confirmations, outbox/revalidation, backups. Better Auth runs in a sibling component.
- **`@lupinum/ginko-cms`** (0.1.3) — Nuxt module, `ginko-cms` CLI (`init`/`doctor`/`push`/`deploy`/`migrate`), the Studio (a standalone Vite SPA under `packages/cms/studio-app`, ~12 routes), the ginko-content provider implementation (`src/nuxt-provider.mjs`), MCP tools (opt-in), auth pages, and host-owned Convex setup templates (`templates/convex/*`, 24 generated files).

Data flow: the host app defines collections in `content.config.ts` → `ginko-cms push` builds the contract via ginko-content's `buildCmsContract` and installs it in Convex as read-only operational truth (ADR 0004/0006) → Studio/MCP edit drafts and publish through a preview/confirm/execute operation layer → publishing writes website-shaped `publicEntries`/`publicRoutes` projections (ADR 0005) → the Nuxt site reads them through the ginko-content provider with cache tags for invalidation (ADR 0015).

The repo root also carries ~11,500 lines of planning/migration documents (`cms2-comparison.md`, `ginko-cms-complete-migration-plan.md`, `move-off-trellis.md`, `migration-decision-questions.md`, `update.md`, `mcp-ai-permission-migration-plan.md`, `journal.md`, `UI-REVISION.md`) describing work that is now largely complete — see Things To Delete.

## How they relate

`@lupinum/ginko-cms` declares `@lupinum/ginko-content: ^0.1.6` as a peer dependency (`packages/cms/package.json:136`); the dependency direction is strictly CMS → content (verified: zero reverse imports). In development the repos form one cross-repo workspace (`ginko-cms/pnpm-workspace.yaml:2` includes `../ginko-content/packages/*`) and ginko-cms's vitest aliases the cms-contract/cms-import subpaths straight to sibling *source* (`vitest.config.ts:54-61`) — convenient, but it means green local tests do not prove compatibility with the published version consumers get; `release:verify:registry` and packed-tarball e2e partially compensate.

# Ginko Content Deep Review

**Verdict up front:** ginko-content is the right lower-level foundation. Its internals are unusually disciplined for a 0.1.x package — the documented layering actually holds (zero circular dependencies across 232 files; `core`/`features`/`storage` never import runtime or framework APIs), the module orchestrator is exemplary glue with no domain logic, and the ADR-0016 unified query API removed the competing query paths it promised to remove. The issues are concentrated in three places: the *edges* of the public surface (where classification enforcement has blind spots), production caching strategy, and release hygiene.

All paths below are relative to `ginko-content/packages/content` unless prefixed.

## GC-1 · HIGH · Performance/Architecture — the content graph is rebuilt on every production request

- **Where:** `src/storage/graph.ts:8-17`, `src/integrations/nitro/context.ts:60-99`, `src/storage/contents.ts:48-96`, `src/core/references/resolve.ts:234`
- **What:** `buildContentGraph` is memoized on `event.context.__contentRuntime.memo`, which dies with the request. Production content is explicitly immutable (`contents.ts:48-50` short-circuits to the parsed cache with no freshness check), yet every SSR request enumerates all cache keys, loads every parsed artifact in chunks of 10, rebuilds the graph, and re-derives `referenceTargets` — two O(n) passes per request over data that cannot change until the next deploy.
- **Why it matters:** This dominates request latency by ~1k documents and grows linearly. It is the single biggest production performance defect in either repo.
- **Fix:** In production, memoize contents+graph at process scope keyed on `buildIntegrity` (already exists, `src/module.ts:120`); keep request scope in dev. Tradeoff: the corpus stays in RAM — but each request already materializes it transiently, so peak memory barely changes. Providers that are genuinely mutable can opt out via the provider contract.
- **Verification:** add a test that two sequential requests in prod mode hit the same graph instance; benchmark a 1k-doc fixture before/after.

## GC-2 · HIGH · Data — the production document *set* has a second source of truth and can silently lose documents

- **Where:** `src/integrations/nitro/storage.ts:86-92`, `src/storage/contents.ts:48-50`, `src/module/static-output.ts:47-53`
- **What:** In production, `getContentsIds` reads keys from the bundled parsed cache (falling back to source only if *empty*). The prod corpus is therefore whatever the build-time warm route happened to write. A document not warmed is silently absent, and no build step asserts parsed-cache keys ≡ source keys.
- **Why it matters:** "Works in dev, page missing in prod" with zero signal. This violates the repo's own derived-state philosophy in the one place it matters most.
- **Fix:** At build end (the existing `prerender:init → compiled` hook in `static-output.ts:47-53`), diff source ids against parsed-cache keys and **fail the build** on mismatch. Cheap, closes the class.
- **Verification:** fixture build with an artificially skipped document must fail.

## GC-3 · HIGH · Release — v0.1.7 was published with no changelog entry and no git tag

- **Where:** `CHANGELOG.md:3` (empty `## Unreleased` → `## v0.1.6`), git tags stop at `v0.1.6`, `packages/content/package.json:3` says 0.1.7 and it is on npm with real changes (cms-exchange, provider author API). `scripts/release-edge.sh` publishes with `--no-git-checks`, bypassing the deliberately disabled `release:publish` guard (root `package.json:44`). No provenance/OIDC.
- **Why it matters:** The repo's own runbook (`MAINTAINING.md`, `docs/release-checklist.md`) was not followed for the most recent release. For a package the CMS pins against, the release trail is the compatibility record.
- **Fix:** Backfill the v0.1.7 changelog + annotated tag now; add a publish preflight asserting tag+changelog exist for the version; adopt npm trusted publishing. No tradeoff.

## GC-4 · HIGH · API — the root entry wildcard-exports the entire internal type universe

- **Where:** `src/module.ts:43` (`export type * from './types'`) → `src/types/index.ts:1-6` → e.g. `src/types/query-parts/transport.ts:90-156`
- **What:** ADR-0018 + `meta/public-surface.json` enumerate symbol-level exports for the client/server facades, and a contract test enforces exactly those two files — but the main entry type-exports everything, including the retired pre-ADR-0016 fluent builder types (`ContentQueryBuilder`, `CollectionQueryOperator` with `'='`/`'IN'`/`'CONTAINS_ANY'`), internal meta, module and runtime types. None of it is classified; IDE auto-import will happily commit users to it.
- **Why it matters:** It silently re-commits the entire pre-redesign API as semver-relevant surface and makes deleting dead types a breaking change you never intended to sell.
- **Fix:** Replace with a curated type list (`ModuleOptions`, `ContentCollectionHandle`, a handful of content types), add the root entry to the symbol-level contract test, and delete the dead fluent-builder interfaces. Acceptable breakage at 0.1.x; impossible at 1.0.

## GC-5 · HIGH · API — the provider contract speaks the retired query vocabulary

- **Where:** `src/public/provider.ts:84` (`query: (event, query: ContentQueryBuilderParams)`), `src/types/query-parts/transport.ts:36-57`
- **What:** The public read API is the clean `by`/`where`/`locale` grammar; the contract a provider must *implement* is the old builder-params shape — open-ended by construction (`[key: string]: unknown` on both params and where clauses, `where` as array-or-object, `first` + `limit` co-representable). Meanwhile a well-designed `ContentQueryPlan` AST already exists (`src/core/query/plan.ts:18-65`, documented as "the stable boundary") but is not the provider boundary.
- **Why it matters:** This is the wire contract ginko-cms and any third party build against. The index signatures make it unshrinkable once real providers exist; every internal experiment becomes observable wire surface. Capability validation (`src/runtime/server/providers/index.ts:55-180`) is genuinely good but guards a mushy payload.
- **Fix:** Before 1.0, re-key provider `query` to a closed, versioned plan type (the existing `FilterExpr`/`SortClause`/`Projection` shapes are close); drop index signatures. Tradeoff: migration cost for the ~one existing provider — that cost only grows.

## GC-6 · MEDIUM-HIGH · Boundary — CMS editor policy leaked into ginko-content's config types, including a magic collection-name heuristic

- **Where:** `src/types/config.ts:29-103` and `src/cms-contract/build.ts:223-231`
- **What:** `ContentCmsFieldType` enumerates ~30 editor *widget* types (`'color'`, `'divider'`, `'section'`, `'icon'`, `'radio'`, `'toggle'`); `ContentCmsFieldConfig` carries pure editor-layout policy (`width: 'full' | 'half'`, `order`, `hidden`, `condition`). Worse, `deriveCollectionType` hard-codes `if (slug === 'docs' || …) return 'tree'` — any user collection literally named `docs` is silently contracted as a tree.
- **Why it matters:** Every new CMS widget now requires a ginko-content release; the `docs` heuristic is a correctness trap. Note the tension: single-file authoring in `content.config.ts` is a *good* product decision, so some CMS vocabulary in the config type is an accepted tradeoff — but it must then be the **only** master (see Cross-Repo review), and product heuristics like the slug check must go.
- **Fix:** Delete the `slug === 'docs'` branch (require explicit `cms.type`); narrow `ContentCmsFieldConfig` to semantic facts and let ginko-cms type presentation extensions via a declared extension record.

## GC-7 · MEDIUM · API — `cms-exchange` is the least-baked surface yet a committed public subpath (and its only consumer is its own tests)

- **Where:** `src/cms-exchange/index.ts` (717 lines)
- **What:** `renderCmsExchangeManifest` pairs rendered files to documents *by array index* (`index.ts:676`) — order mismatch silently attributes wrong `stableId`/`locale`/`path` to manifest entries, no error. Dead alias export (`createCmsFilesystemImportPlan = createCmsExchangeImportPlan`, `index.ts:463`). Explicitly "MVP" semantics (`index.ts:328,337`), FNV-1a-32 presented as an integrity `checksum`, asset refs found by regexing markdown instead of walking the MDC AST the package already owns. And per the boundary audit: **ginko-cms does not import it at all** — it kept its own 1,044-line migration planner (`ginko-cms/packages/cms/src/migration/index.ts`).
- **Fix:** Decide: either ginko-cms migrates onto `/cms-exchange` (then fix the index-pairing bug and delete the alias) or **delete the subpath** (preferred by your own delete-first philosophy — 717 lines with zero external consumers, in a data-loss-sensitive domain). `cms-import` by contrast is small, clean, actually consumed — keep.

## GC-8 · MEDIUM · API — `/server` facade bloat and three dual export paths

- **Where:** `src/public/server.ts:22-69,113-136`, `package.json` exports
- **What:** 31 agent-markdown/agent-site value exports (including global mutable registries like `registerAgentMarkdownSerializer`) share the facade with `one`/`many`; provider types are exported from both `./provider` and `./server`; `./toc` duplicates `./client`'s TOC exports; `defineCollection` is on both `.` and `./config`. ADR-0018 itself rejected dual paths — and then shipped three.
- **Fix:** Move agent helpers to a dedicated `./agent` subpath; make `./provider` the only home of provider types; give `./toc` a removal milestone. 0.1.x is the cheapest window.

## GC-9 · MEDIUM · Types — two holes in the "i18n requires locale" guarantee

- **Where:** `src/types/query-parts/public.ts:244-253` (`TreeOptions` declares `locale?: string` instead of composing `LocaleOption<H>`), `src/runtime/query/unified.ts:98` (`many(docs)` with zero options compiles for i18n handles via `options: O = {} as O`)
- **What:** ADR-0016 claims "the i18n-requires-locale rule has no hole" (`0016:234-236`); `tree(docs, {})` and `many(docs)` both compile on i18n collections. The type-test fixture covers `many(docs, { where: {} })` but not the zero-arg form or tree.
- **Fix:** Compose `LocaleOption<H>` into `TreeOptions`; remove the defaulted parameter for i18n handles; add both negative type tests. If tree fallback-by-default is intentional, amend the ADR instead of leaving the claim false.

## GC-10 · MEDIUM · Architecture — the layer docs no longer describe the tree, and `runtime/` is not thin

- **Where:** `meta/adr/0010-layered-source-architecture.md:29-40`, `packages/content/ARCHITECTURE.md:32-34`
- **What:** The docs describe 8 directories; the tree has 15. `cms-contract/`, `cms-exchange/`, `cms-import/`, `testing/`, `cli/` (~4,100 LOC) sit outside the documented dependency rules (the boundary *test* covers them; the docs don't). `runtime/` is the largest layer at 7,784 LOC and contains genuinely framework-free domain logic: `runtime/query/` (1,315 LOC — the unified query compilation layer) and `runtime/server/agent-markdown.ts` (701 LOC of pure AST→markdown serialization).
- **Fix:** Hard cutover (unreleased internals): move `runtime/query/` → `features/query/`, the agent-markdown serializer core → `features/agent/`; amend ADR-0010/ARCHITECTURE.md to name all 15 dirs with allowed edges. Also make the agent serializer registry per-app instead of a module-global mutable Map (`agent-markdown.ts:74`) that accumulates under dev HMR.

## GC-11 · MEDIUM · DX — cache-hint plumbing is wired but inert by default

- **Where:** `src/runtime/server/cache-adapters.ts:5,20,46`, `src/runtime/server/plugins/cache.ts:6-16`
- **What:** Hints are collected, harvested, merged with safest-freshness semantics, and applied on `render:response` — but both shipped adapters have `apply: () => {}` and `contentCacheHeaders()` is never called by any adapter. A reader of the plugin will believe HTTP caching works out of the box.
- **Fix:** Ship a headers adapter that actually calls `contentCacheHeaders`, or add a loud doc note. Note this is also the cheapest mitigation for GC-1.

## GC-12 · Smaller items (Low/Medium)

- **Parsed cache keyed on mtime+size, not content hash** (`src/storage/contents.ts:53-64`): same-size edits within mtime granularity (git checkout, CI caches, Docker copies) serve stale parses. Content-hash the raw body — it's already read on miss.
- **`pagefind` is a hard dependency** (`package.json:122`) downloading platform binaries for every consumer, used only when `engine: 'pagefind'`. Make it an optional peer with a clear error.
- **`./transformers/*` wildcard** publishes internal files (`utils`, `component-resolver`, `csv/` internals) with no types condition, bypassing classification. Enumerate real entries.
- **`./testing/provider-contract` is unusable by real providers**: `runSaasProviderFixtureContractSuite` (`src/testing/provider-contract.ts:43-58`) hard-requires *every* capability true — the CMS provider legitimately declares `searchSections: false` and therefore cannot pass. Also "Saas" is ginko-cms vocabulary inside the neutral package. Parameterize by declared capabilities; rename.
- **Provider result docs require duplicated legacy meta**: providers must emit `_id/_path/_collection/_locale/_canonicalKey` *plus* the modern `path/locale/localePaths/variants` envelope (see `examples/advanced/cms-cache-contract/server/cms-provider.ts:46-64`), and ADR-0006 calls canonical keys "internal only" while `_canonicalKey` is a required provider output. Fold underscore meta behind one normalization helper.
- **Dead/stale**: `vitest.config.ts:56` includes nonexistent `test/ginko-query.test.ts`; `meta/VISION.md:66` teaches the retired `useContentOne({ by: { route } })`; `meta/ABSTRACTIONS.md:148-157` lists six committed subpaths while package.json exports thirteen — two classification sources disagree; `CmsSchemaArtifactRef`'s doc comment says the artifact is "behind a ref rather than embedded" while the interface embeds `artifact: string` (`src/cms-contract/types.ts:114-127`).

## Answers to the review questions

- **Right foundation?** Yes. The provider contract is genuinely CMS-neutral (opaque cache tags, capability negotiation, no draft/publish concepts; `.draft` paths are a pre-existing filesystem convention, not CMS leakage), and the sharing direction — paths/schema/MDC exported *to* the CMS — is correct.
- **Minimal, cohesive, discoverable?** The core is; the package is not. 13 subpaths, 3 dual paths, one facade where agent machinery outnumbers the query API 4:1. The bloat is known and labeled (ADR-0018) — schedule the segmentation it defers; don't defer past 1.0.
- **Invalid states representable?** In the query API, barely (phantom-typed handles, XOR selectors, 25 negative type tests — genuinely good). In the provider wire types, freely (GC-5). In `cms-exchange`, dangerously (GC-7).
- **Public/internal separation?** Best-in-class *intent* — machine-readable classification + contract tests + a docs-drift gate — with three enforcement holes (root wildcard, transformers wildcard, subpath-only classification of the cms-* barrels). Close those and it's airtight.
- **Docs aligned?** Yes on spot-check (module options, README, docs site all match code; the docs-drift test actively defends this). The drift is in *meta* docs (ADR-0010, ABSTRACTIONS, VISION) and CMS-SPEC.md.
- **Release-ready?** Engineering gate yes; hygiene no (GC-3). Fix the trail, then yes.
# Ginko CMS Deep Review

**Verdict up front:** the CMS correctly owns CMS-specific behavior, and the parts that are usually wrong in young CMSs are right here: authorization is centralized in the Convex component and enforced *before* handlers (`packages/convex/src/functions.ts:139-160`) with a lint (`scripts/enforce-component-auth-boundaries.mjs`) guarding against raw builders; every destructive operation goes through server preview → blockers → confirmation token → execute, and MCP uses the *same* operation layer (verified: `tools/content/publish-entry.ts` requires the preview's confirmation token); schema is code-authoritative and Studio/MCP genuinely cannot mutate it (the previously public install mutation was deliberately deleted — `packages/convex/src/collections/sync.ts:184-189`); publish is a single atomic mutation with `draftVersion` + hash TOCTOU checks. The defects below are specific, not structural.

Paths relative to `ginko-cms/` unless noted.

## CMS-1 · CRITICAL · Security — bootstrap owner-claim can be hijacked by any authenticated user

- **Where:** `packages/convex/src/members.ts:247-249`
- **What:** `validateFirstOwnerEmail(args.email ?? trustedEmail, args.configuredOwnerEmail)` prefers the **client-supplied** `args.email` over the email derived from the verified auth identity. `GINKO_FIRST_OWNER_EMAIL` is the sole gate on first-owner claim, and email/password signup is enabled by default (`packages/convex/src/convex.auth.ts:77-79`). Before the first `members` row exists, any signed-in user can call `bootstrapCmsOwner` with `email: <configured-owner-email>` and become owner under their own userId.
- **Why it matters:** Complete takeover of a fresh deployment; defeats the env-var trust anchor entirely. This is the kind of hole a public 0.2 announcement gets burned by.
- **Fix:** Authorize on `trustedEmail` only; `args.email`/`displayName` may still seed the profile. One line. **Test:** signed-in user with non-matching identity email + matching `args.email` must be rejected.

## CMS-2 · HIGH · Security — hardcoded fallback auth secret

- **Where:** `packages/convex/src/convex.auth.ts:74` — `secret: process.env.BETTER_AUTH_SECRET ?? 'ginko-cms-dev-secret'`
- **What/why:** A self-hosted deployment (the exact target audience) that forgets the env var silently signs sessions with a public, source-visible secret → full session forgery.
- **Fix:** Throw at startup in production when unset; allow the dev fallback only outside production. Add a `doctor` check for the env var. Tradeoff: slightly harsher first-run; correct posture.

## CMS-3 · HIGH · Data — backup/restore is a false safety net

- **Where:** `packages/convex/src/backup.ts:220-250, 362-369, 424, 476-525, 971-1000`; `packages/convex/src/assets.ts:1309`
- **What:** "Full" export includes CMS content tables but **omits** `mcpCredentialSettings`, `revalidationTargets`, `outboxEvents`, `agentRuns`, `reviewRequests`, `backupArtifacts`, and *all Better Auth tables* (separate component). Asset binaries are inlined as JSON `number[]` in memory — OOM well before a real site's size, using whole-table `.collect()` + client-side filtering. And **restore supports only `scope === 'asset'`** — every other scope is a hard `restore-scope-unsupported` blocker; `restoreBackup` re-stores `assets[0]` only. Meanwhile `purgeAsset` gates on these artifacts (`assets.ts:1309`), lending them false authority.
- **Fix:** Short term: rename/scope the feature honestly as *asset* backup and say so in Studio and docs. Medium term: paged, streaming content export + real restore including auth/config tables; only then let purge cite it. **Test:** round-trip restore of a full backup into an empty deployment.

## CMS-4 · HIGH · Data — public projections are not fully rebuildable; routing changes strand published paths

- **Where:** `packages/convex/src/entries/projectionMaintenance.ts:111` (uncalled, and rebuilds from `publicEntries` rather than revisions), `packages/convex/src/collections/sync.ts:117-126, 410-413`, `packages/convex/src/entries/workflow/projectionBuild.ts:164-267`
- **What:** Individual projection rows are rebuildable from revisions, but there is no full-rebuild entry point. Contract sync schedules a reindex on routing/locale change, but the worker only refreshes draft asset refs — it never rewrites `publicEntries`/`publicRoutes`. **Changing `routing.pathPrefix` leaves every published `path`/`href` stale until each entry is individually republished.** `lastPublishedAt` is also non-rebuildable (stamped `now` at projection build).
- **Why it matters:** This is the core ADR-0005 guarantee ("projections are derived") — currently derived-but-not-rebuildable, your own stated red line.
- **Fix:** Add a bounded, scheduler-driven `rebuildPublicProjectionsFromRevisions(collectionId)` regenerating `publicEntries`+`publicRoutes` from the latest publish revision; trigger from routing drift. Delete or wire the orphaned repair function. **Test:** change pathPrefix on a collection with published entries → all public routes reflect the new prefix without republishing.

## CMS-5 · HIGH · Performance — every publish scans the whole site; deep-tree slug changes can exceed mutation limits

- **Where:** `packages/convex/src/diagnostics.ts:93-137` (route claims: `.collect()` on all collections, non-indexed `.filter()` over `publicRoutes` per collection×locale, all redirects — executed on every publish, publish preview, and readiness check); `packages/convex/src/entries/workflow/subtreeRoutes.ts:143-227` + `workflow/commands.ts:566-607` (publishing a parent slug change BFS-walks all published descendants per locale, appending a revision and re-upserting a projection for each — in one mutation, unbatched).
- **Why it matters:** O(site) on the hottest write path; the descendant rebuild will hit Convex per-mutation read/write/time limits on deep published subtrees and fail the entire publish. This bites *within* your stated scale target for tree-heavy docs sites.
- **Fix:** Route-uniqueness via `publicRoutes.by_locale_path` point lookups on the claimed paths; cap inline descendant rebuilds and offload the remainder to `scheduler.runAfter` batches (the reindex-job machinery in `collections/jobs.ts` already exists). Tradeoff: brief window where descendant routes lag the parent — acceptable and honest.

## CMS-6 · HIGH · Data/DX — the schema-migration story is circular for non-empty collections

- **Where:** `packages/convex/src/collections/sync.ts:325-348` (push handler hardcodes `entryCount: 1`), `packages/convex/src/collections/drift.ts:214-222`, `packages/cms/src/cli/migrate.ts:454-456`, `packages/contract/src/readiness.ts:35`
- **What:** Unsafe drift (`field_removed`/`field_changed`/`type_changed`) blocks push whenever entries exist — and the migrate CLI transforms entry *data* while drift is judged from the schema *diff*, so "push once drift is safe" can never become true while entries exist. No rename detection (rename = remove+add). Removed-field keys are never pruned from `entryDrafts`. The `collection_schema_invalid` readiness code has no backend producer, so entry-vs-contract mismatch is silently representable and only surfaces indirectly at publish.
- **Fix:** Record completed migrations in a ledger that unblocks the corresponding push; add an explicit rename path; emit `collection_schema_invalid` from a real check. **Test:** field rename end-to-end: migrate → push → publish.

## CMS-7 · MEDIUM-HIGH · Architecture — `nuxt-provider.mjs` is 1,095 lines of untyped bridge carrying domain logic

- **Where:** `packages/cms/src/nuxt-provider.mjs:19-49, 297, 349-357, 382-389, 391-480`
- **What:** The ginko-content provider implementation is handwritten `.mjs` with no compile-time conformance — it never imports `ContentProvider` or `contentProviderResultMarker` from `@lupinum/ginko-content/provider` (re-inlines the marker string at `:297`), re-implements the cache-tag vocabulary (`:19-49`) which has **already diverged** from `packages/contract/src/contentTags.ts` (contract has `asset()`, the copy doesn't), and guesses which strings are storage IDs by regex (`looksLikeAssetId`, `/^[a-z0-9]{20,40}$/i`) with per-ID N+1 `getAssetUrl` fetches — a false positive rewrites an innocent 20-char slug.
- **Why it matters:** Domain logic in a bridge layer, three hand-inlined wire constants, and zero compiler help on the projection-shaping function (`toContentEntry`, `:391-480`) that defines what the website renders.
- **Fix:** Author in TS (mkdist already builds), import tags from the contract package and the provider types from ginko-content, and move asset URL resolution server-side into the `public.page/list` projection responses so the provider does zero inference. Keep the emitted module path stable (it's registered by string, `packages/cms/src/module.ts:77`).

## CMS-8 · MEDIUM · DX — `init` never updates generated files and `doctor` cannot detect content drift in them

- **Where:** `packages/cms/src/module/convex.ts:168-247`
- **What:** `writeConvexSetupFiles` skips any existing file; doctor checks existence, legacy Trellis markers, and three known-stale imports — a package upgrade that changes a template leaves hosts on the old file with zero signal. The repo polices its own playground with `scripts/check-convex-template-sync.mjs`, so the problem is known; hosts just don't get the tool. Six of 24 files say "do not edit" while `auth.config.ts`/`schema.ts` say "edit this file" — the split is right, the enforcement is missing.
- **Fix:** Stamp a template content-hash comment in do-not-edit files; `doctor` compares against the shipped hash; add `init --update` for unmodified files with an acknowledged-divergence escape hatch.

## CMS-9 · MEDIUM · DX — CLI `push` re-implements the module's option resolution, and they already disagree

- **Where:** `packages/cms/src/cli/push.ts:56-138` vs `packages/cms/src/module.ts:93-125, 204-219`
- **What:** `loadNuxtGinkoOptions` hand-replicates defaults and locale inference. Edge divergence already exists: the module infers locales when `options.locales.length === 0`; push uses `userOptions.locales ?? …` — an explicit `locales: []` produces different contracts at runtime vs at push. Since push installs the contract Convex enforces, module-vs-CLI divergence is invisible to the drift checker (which compares pushed-vs-config, not module-vs-CLI).
- **Fix:** Extract one `resolveGinkoCmsOptions(rawConfig)` used by both. Small, no tradeoff. Also: `push` prints a fake fingerprint (`push.ts:317` — string *length* labeled as a fingerprint); print a real sha256 prefix.

## CMS-10 · MEDIUM · Data — operations-layer weak spots (the design is right; the edges are soft)

- **Where:** `packages/convex/src/operationHelpers.ts:11, 188-195, 271, 298, 313`; `packages/convex/src/functions.ts:74, 134, 194`
- **What:** `scopeKey` is the constant `'ginko-cms'` (binds nothing); `callerKey` falls back to `'anonymous'`; fallback token entropy is `Date.now()+Math.random()` when `randomUUID` is missing; confirmation/guard failures throw plain `Error` strings instead of coded `cmsError`s so clients can't discriminate; the framework permits guard-less `protected*` definitions with no lint. Token single-use relies on Convex OCC (read-then-patch `redeemedAt`) — correct but untested. The core binding (operationId + executePath + argsHash + previewHash re-check) is sound and blocks replay/TOCTOU.
- **Fix:** Assert non-anonymous callers, remove the weak token fallback, use coded errors, lint for guard presence. **Tests to add (currently none):** token expiry, caller mismatch on redeem, cross-operation replay, concurrent double-redemption.

## CMS-11 · MEDIUM · Data — smaller backend correctness items

- **Redirects are specified but never created**: `redirects` table + `source:'publish'` exist (`packages/convex/src/schema.ts:114`), but no `insert('redirects')` exists anywhere — slug changes 404 old URLs (only stableId path-repair in `public.ts:639-650` recovers). Wire publish-time redirect creation or delete the dead surface.
- **Reindex jobs are not resumable and can wedge**: `collections/jobs.ts:245-246` always restarts at phase `draft`/cursor `null` ignoring the persisted cursor; a dead mid-run job blocks `scheduleCollectionReindex` forever (`jobs.ts:51-52`) with no lease/heartbeat — manual row deletion is the only recovery.
- **Outbox events with no enabled target accumulate forever**: `revalidation.ts:476-497` skips them without incrementing attempts; hygiene only removes delivered/failed rows — they sit at the head of every claim batch. Dead-letter after N scans.
- **Storage blobs leak**: unregistered upload blobs are never swept; soft-deleted assets keep blobs until manual purge; `cleanupStorageHygiene` deletes rows, never blobs (`storageMaintenance.ts:14-17`).
- **`dirtyLocales` drifts**: `workflow/drafts.ts:265-277` compares against the current draft row, not the published snapshot — editing a value back to published leaves the locale dirty.
- **Vestigial generated dirs**: `packages/convex/generated/operationHandles/` and `packages/convex/src/generated/operationHandles/` are empty Trellis leftovers, referenced nowhere. Each operation's `executeFunctionRef` string (e.g. `'assets:deleteAssetOperationExecute'`) is hand-written and not CI-verified — a typo silently breaks the token binding. Delete the dirs; add a resolution check.
- **API keys have no rate limiting**: the api-key plugin's rate limit is disabled (`convex.auth.ts:85-87`), no mutation-level throttle elsewhere.

## CMS-12 · MEDIUM · DX — doctor/dependency and setup friction

- **Doctor compares semver range *strings* for equality** (`packages/cms/src/module/convex.ts:213-219`): `"^1.6.11"` fails because only `"1.6.11"` and `">=1.6.9 <1.7.0"` are enumerated — the `vite` entry already lists four spellings of the same range. Check the *installed* version against an allowed range with a real semver comparison. This will be the top spurious-failure generator for real users.
- **Module-before-init throws 24 concatenated errors** (`module.ts:263` → `convex.ts:243-247`); collapse to one line pointing at `ginko-cms init`.
- **`deploy` defaults to a dev deploy** (`cli/deploy.ts:24-26` — `convex dev --once`); a production deploy requires knowing `ginko-cms deploy -- deploy --yes`. Document or detect.
- **Quickstart lists 5 generated files; init writes 24** — a user seeing 20 unexpected files assumes breakage.
- **MCP auth does two identical token round-trips per request** (`packages/cms/src/server/middleware/mcp-auth.ts:79-135`); verify and capture in one call. (The rest of MCP auth is genuinely good: hashed-token + IP failure budgets, secret redaction, capabilities intersected with member role.)
- **Studio asset cache-busting hashes only `main.js`** (`module.ts:183-197`) — a CSS-only change can be stale for the 30-day maxAge. Hash both entries.
- **Auth signin page displays an unvalidated redirect target** (`packages/cms/src/auth/pages/signin.vue:13-19` accepts `//evil.com` as display text; actual navigation is safe via `resolveRedirectTarget`). Reuse the validator for display.

## What is notably right (keep, and don't let refactors regress it)

- One field-definition source *within* ginko-cms: `FieldDefinition`/`FieldType` in `packages/contract/src/types.ts:36-98` flows to the `ginkoFields` DSL, Convex, and Studio (the cross-**repo** duplication is the problem — see boundary review).
- Public reads are unguarded by design and declared against projection tables only (`cmsPublicReadTables`, `functions.ts:94-102`) — ADR-0005 compliant; `getAssetUrl` denies soft-deleted assets and requires a public ref.
- Members: last-owner guard on role change and removal (`members.ts:345-347, 416-418`); MCP scopes clamped to member role (`mcpCredentials.ts:97-111`); a scripted sweep found zero `protected*` functions missing a guard.
- Publish atomicity + concurrency: `draftVersion`, draft-hash, and public-revision-id checks in one mutation (`workflow/commands.ts:399-639`), TOCTOU-tested (`entries/publish.test.ts:568, 640`).
- Release engineering: `release:publish` deliberately disabled forcing the runbook; `release:verify` chains lint/typecheck/custom invariant scripts + packed-consumer e2e; `workspace:^` rewrites verified in `.pack`; supply-chain cooldown (`minimumReleaseAge: 1440`).
- The CLI drift report (`push.ts:206-276`) — per-collection changes, affected-entry counts, migration flags, concrete next command — is better DX than most commercial CMS CLIs.
# Cross-Repository Boundary Review

**Verdict:** ginko-content is the right foundation and the intended split is largely real. The ADRs on both sides agree with each other and with the code (`ginko-content/meta/adr/0013` + `0017` vs `ginko-cms/adr/0011` + `0015` draw the same lines), dependency direction is strictly CMS → content, publication state / assets / permissions live entirely in ginko-cms, and the provider registers through the public `content:providers` hook exactly as specified. **Nothing should move between repos. The problem is duplication, not misplacement** — the seam is held together by five hand-synchronized copies and one abandoned lane, with no conformance test making the contract real.

## Boundary Audit Table

| Responsibility | Should live in | Currently lives in | Problem | Recommendation |
|---|---|---|---|---|
| Provider contract (types, capabilities, cache-hint envelope) | ginko-content | `ginko-content/packages/content/src/public/provider.ts` ✓ | Contract is clean and neutral; the CMS *implementation* never imports it (no compile-time conformance); wire params are the retired open-ended vocabulary (GC-5) | Type `nuxt-provider` against `ContentProvider`; re-key wire params to a closed plan type pre-1.0 |
| Provider conformance testing | ginko-content ships the suite; ginko-cms runs it | Suite exists (`testing/provider-contract.ts`) but hard-requires all capabilities (`:43-58`); ginko-cms hand-rolled its own mocked suites instead | The capability matrix is untested contract theater | Parameterize suite by declared capabilities; run against packed `@lupinum/ginko-cms/nuxt-provider` in ginko-cms CI |
| Field definitions (authoring vocabulary) | ginko-content (single authoring surface in `content.config.ts`) with ginko-cms consuming | **Four unlinked copies** (see Source-of-Truth Audit) | New field type touches ≥6 places across 2 repos with no compiler/test catching a miss; unknown literal fails at runtime *in production sync* | `ginko-cms-contract` re-exports `ContentCmsFieldType` from `/cms-contract` (it is isolate-pure); exhaustiveness test on the Convex validator |
| Editor layout/widget policy | ginko-cms | Partly in `ginko-content/src/types/config.ts:29-103` (widths, order, hidden, condition, widget names) | Couples ginko-content releases to the CMS editor roadmap; `slug === 'docs'` heuristic in `cms-contract/build.ts:223-231` is a correctness trap | Keep the single-file authoring surface but narrow to semantic facts + a CMS-typed extension record; delete the slug heuristic |
| Publication state (draft/published, revisions, projections) | ginko-cms | ginko-cms only ✓ (`EntryStatus` in `packages/contract/src/types.ts:26`; workflow in `packages/convex/src/entries/workflow/`) | None — ginko-content's `.draft`/`_draft` path convention predates the CMS and is not leakage | Keep |
| i18n / slug / path semantics | ginko-content | Canonical in `core/content/{slug,path}.ts`; consumed by CMS via **vendored copies** in `packages/convex/src/lib/cmsContract/*` + `/config` (Studio) + `/cms-contract` (tests) | Vendor script copies internals beyond the public subpath and fabricates types (see below); three different import routes to one function | Widen `/cms-contract` to cover what the vendor copies; standardize Studio on `/cms-contract` (`studio-app/src/lib/slug.ts:1` currently imports from `/config`) |
| Markdown/MDC parsing | ginko-content owns the format; both sides parse | Same code vendored, **different comark majors-in-effect**: content pins `^0.4.0` (`package.json:109`), cms-convex + cms pin `^0.3.2`; both installed | Publish-time AST can differ from site-render AST; 0.x minors are breaking | Align comark; add to both compatibility matrices; keep the golden-fixture parity tests |
| Schema validation artifact (wire format + checksum) | ginko-content produces; ginko-cms consumes | Producer `cms-contract/types.ts:130-148` + `build.ts:625-632`; consumer **re-declares** the node union and re-implements FNV-1a byte-for-byte at `packages/convex/src/entries/workflow/commands.ts:681-699, 859-866` — no header, no sync, no parity test; `CMS_CONTRACT_VERSION` is never read by ginko-cms | Publish validation depends on byte-identical independent copies; a v2 artifact would be silently misread | Add node type + checksum to the vendor sync (or import — both pure); gate interpretation on `contractVersion` |
| Cache invalidation | Split: content owns hints/adapter interface; cms owns tag scheme | Correct split per ADRs ✓ — but the tag scheme lives twice *inside* ginko-cms (`packages/contract/src/contentTags.ts:21-52` vs hand-copy in `nuxt-provider.mjs:19-49`, already diverged) | Invalidation correctness contract duplicated | Import from `@lupinum/ginko-cms-contract` in the provider |
| Filesystem import/migration | Parsing in content (`/cms-import` ✓); orchestration in cms | Orchestration duplicated: `/cms-exchange` (717 lines, **zero external consumers**) vs `packages/cms/src/migration/index.ts` (1,044 lines, the one actually used) | Two planners in a data-loss-sensitive path guarantees drift | Delete `/cms-exchange` or migrate onto it — not both. Deleting is the cheaper, safer call |
| Asset URL resolution | ginko-cms | ginko-cms ✓ (publish-time refs + request-time `getAssetUrl`) | Only the intra-cms sniffing issue (CMS-7) | Resolve server-side in projections |
| Version/stack compatibility record | One generated source | **Two hand-maintained `compatibility.json`s, mutually stale** (content's says content 0.1.6/cms 0.1.2; cms's says cms 0.1.3/convex 0.1.2/content 0.1.6; actual: content 0.1.7, cms 0.1.3) | Neither is authoritative; both wrong today | Generate one from the release script; the other repo reads it |
| Integration spec docs | Each repo documents its side | `ginko-content/CMS-SPEC.md` (2,326 lines) describes a `#content/server` integration that predates the real seam and never mentions `/cms-contract`, `/cms-import`, `/cms-exchange`; ginko-cms documents the same territory separately | Two specs, neither describing the real seam | Delete CMS-SPEC.md (per ginko-content's own ADR-0013 the CMS belongs outside); keep a short neutral provider spec in ginko-content |

## The vendor layer deserves special attention

`ginko-cms/scripts/sync-cms-contract-vendor.mjs` copies `slug.ts`, `path.ts`, `markdownTree.ts`, `mdc.ts` from ginko-content into `packages/convex/src/lib/cmsContract/` with generated headers, a `--check` drift mode, and parity tests (`test/refactor/cms-contract-vendor-parity.test.ts:44-71`) — the *best-maintained* duplication in the system, and still problematic three ways:

1. It applies **hand-maintained regex rewrites of regex literals** (`sync-cms-contract-vendor.mjs:38-52`) — a change to those regexes upstream silently breaks the transform's assumptions.
2. The vendored barrel **exports more than the public `/cms-contract` subpath** — `projectContentPathToLocale`, `pathHasLocalePrefix` (`ginko-content/.../core/content/path.ts:216,236`), and the markdownTree helpers are absent from `cms-contract/index.ts:45-82`. The CMS depends on internals ginko-content never promised to keep stable.
3. `transformTypes()` **fabricates `PublicEntryPayload` and `CmsLocaleCode`** under a header claiming they were generated from ginko-content — those types do not exist there at all. The "vendor" file is a second authoring location wearing a generated-file costume.

**Recommendation:** promote everything the script copies into the real `/cms-contract` subpath (it is already isolate-pure by design — `cms-contract/path.ts:9`), move `PublicEntryPayload` into `@lupinum/ginko-cms-contract` where it belongs, then either import directly (Convex bundles npm deps) or shrink the vendor layer to a plain re-export — at which point the sync script, its regex rewrites, the parity tests, and the drift check all become deletable.

## Versioning and release coupling

Sane direction, soft edges: peer dep `@lupinum/ginko-content: ^0.1.6` (caret on 0.x = `<0.2.0`, correct); internal `workspace:^` ranges rewrite correctly in packed tarballs (verified in `.pack`). But: dev-mode cross-repo workspace + vitest source aliases mean local green ≠ published-version compatibility (mitigated only by the optional `release:verify:registry` path — make it mandatory in the runbook); `.pack` contains `ginko-content-0.1.7.tgz` while `packages/cms/compatibility.json` still pins the release stack at content 0.1.6 — reconcile before the next publish.

---

# API Surface Audit

## @lupinum/ginko-content (13 subpaths)

| Export | Verdict | Why |
|---|---|---|
| `.` (module) | **Narrow** | Keep as Nuxt module entry; replace `export type * from './types'` (`module.ts:43`) with a curated list; add to the symbol-level contract test. Biggest unclassified surface in the package. |
| `./config` | **Keep (+1 export)** | Cohesive authoring surface; add `ContentCollectionHandle` — the return type of `defineCollection` is currently unnameable from any curated facade. |
| `./client` | **Keep** | The best-designed facade in the package. Consider relocating the 3 agent path helpers. |
| `./server` | **Narrow** | Keep queries + cache helpers; move the 31 agent exports to `./agent`; stop re-exporting provider types. |
| `./provider` | **Keep, re-key** | Right idea; make it the *only* home of provider types; replace `ContentQueryBuilderParams` with a closed versioned plan type before 1.0. |
| `./toc` | **Deprecate** | Pure duplicate of `./client` TOC exports; give it a removal milestone. |
| `./cms-contract` | **Keep, narrow + widen** | Narrow: trim editor-widget/layout vocabulary, delete the `docs` heuristic. Widen: absorb the path/tree helpers the CMS currently vendors from internals. Enumerate its symbols in `public-surface.json`. |
| `./cms-import` | **Keep** | Small, clean, actually consumed by ginko-cms migration. |
| `./cms-exchange` | **Delete** (or mark experimental and fix) | 717 lines, zero external consumers, index-based manifest pairing bug, MVP semantics, dead alias export. ginko-cms already chose its own migration planner. |
| `./testing/provider-fixture` | **Keep** | Valuable for provider authors; testing-only. |
| `./testing/provider-contract` | **Rename + parameterize** | "Saas" naming leaks product vocabulary; all-capabilities-required means the only real second provider cannot pass it. Make capability-aware. |
| `./transformers` | **Keep** | Minimal and correct (`defineTransformer` only). |
| `./transformers/*` | **Delete/narrow** | Unclassified wildcard over internal files, no types condition. Enumerate real transformer entries. |

## @lupinum/ginko-cms

| Export | Verdict | Why |
|---|---|---|
| `.` (Nuxt module) | **Keep** | Standard entry. |
| `./config` | **Keep** | Host-facing collection/field DSL — the intended public authoring API. Document that `ginkoFields.boolean` emits type `'toggle'`. |
| `./nuxt-provider` | **Keep (frozen path), harden** | Load-bearing: registered by string (`module.ts:77`) and resolved at runtime. Convert to TS, import wire constants, strip `__setGinkoNuxtProviderClientFactoryForTests` from the published artifact. |
| `./convex/auth` | **Retarget then delete** | One-line re-export of `@lupinum/ginko-cms-convex/convex.auth`; hosts already depend on that package directly — templates should import from there, removing the Nuxt package from the Convex bundle graph. |
| `./convex/auth-config` | **Retarget then delete** | Two-line re-export of already-required direct host deps. Pure indirection. |
| `./migration` | **Narrow / mark experimental** | Large surface (`FilesystemMigrationEntry` etc.) with no stability story; consumed by the CLI. Keep for host import scripts but label unstable, or fold behind the CLI. |
| `./public` | **Keep** | Small and deliberate: contract read types + `hrefFor`/`routeHref`. |
| (unexported `dist/server`, `dist/auth`, `dist/cli`, `dist/module`) | **Keep as-is** | Reached by file path from module setup/bin; correctly absent from the exports map and pinned by `test/module/package-exports.test.ts`. |

`@lupinum/ginko-cms-contract` and `@lupinum/ginko-cms-convex` surfaces are appropriately shaped (contract is framework-neutral; convex exposes component + `convex.auth`); the one change: contract should re-export the field-type union from ginko-content instead of re-declaring it (see Source-of-Truth Audit).
# Data Model and Invariant Audit

## Convex data model (ginko-cms-convex, `packages/convex/src/schema.ts`)

| Table | Purpose | Canonical/Derived | Index posture |
|---|---|---|---|
| `collections` | Synced read-only code-contract snapshot | Canonical (mirror of code) | `by_slug` — fine |
| `entries` | Editorial identity + lifecycle status/placement | **Canonical** | 7 indexes incl. `by_collection_status`, `by_collection_slug`, `by_collection_stableId`, `by_parent` — well covered, slight overlap |
| `entryDrafts` | Mutable draft (shared row + per-locale rows) | **Canonical** | `by_entry`, `by_entry_locale` — fine |
| `entryRevisions` | Append-only publish/unpublish/rollback/archive/checkpoint events with full snapshots | **Canonical (event log)** | `by_entry_createdAt/_revisionNumber/_kind` — fine |
| `publicEntries` | Website-shaped published projection (ADR 0005) | Derived | 12 indexes + search index — excellent for reads |
| `publicRoutes` | Path→entry routing projection | Derived | `by_locale_path`, `by_entry_locale` — fine (underused by publish validation, see CMS-5) |
| `redirects` | Redirect map | Canonical | 4 indexes — **never written** (dead surface) |
| `contentAssetRefs` | Asset-usage cache for purge safety | Derived | fine |
| `assets` | Asset metadata, soft-delete via `deletedAt` | Canonical | fine |
| `siteData`, `cmsSettings` | Global blocks / locales+webhooks singleton | Canonical | fine |
| `outboxEvents`, `revalidationTargets` | Revalidation/webhook outbox + endpoints | Canonical (ephemeral) | fine (accumulation issue, CMS-11) |
| `members` | CMS roles (owner/publisher/editor/viewer) | **Canonical (authz)** | fine |
| `mcpCredentialSettings`, `agentRuns`, `reviewRequests` | MCP scopes, delegation, approvals | Canonical | fine |
| `destructiveConfirmations`, `destructiveAuditLog` | Preview→confirm tokens; executed-op audit | Canonical (ephemeral/append) | fine |
| `activity` | Activity feed | Derived/log | fine |
| `backupArtifacts` | Export records; gates purge | Canonical | fine (authority undermined by CMS-3) |

Better Auth data (users/sessions/accounts/api-keys) lives in a separate component — which is exactly why its omission from backups (CMS-3) matters.

In ginko-content: canonical state is the filesystem; derived state is the parsed-artifact cache, the in-memory `ContentGraph`, the locale manifest, and the search index. All rebuildable in principle; GC-2 (prod corpus completeness never asserted) and GC-1 (the graph rebuilt per request instead of cached) are the two derived-state defects.

## Key invariants: enforcement and gaps

| Invariant | Enforced where | Sufficient? | Missing tests / gap | Owner layer |
|---|---|---|---|---|
| Publish is atomic; `entries.status`/`latestRevisionId`/`publicEntries` consistent | Single mutation `executePublishEntryRun` (`workflow/commands.ts:399-639`) with `draftVersion` + draft-hash + public-revision checks | **Yes** | Covered incl. TOCTOU (`entries/publish.test.ts:568,640`) | Convex component ✓ |
| Projections rebuildable from revisions | Per-row only (`projectionBuild.ts:164-267`); full rebuild missing; repair fn uncalled and reads wrong source | **No** (CMS-4) | Rebuild-after-pathPrefix-change test | Convex component |
| Destructive ops preview+confirm gated | `functions.ts:191-217` + `operationHelpers.ts:171-224`; 15 `kind:'destructive'` ops; MCP uses same layer | **Yes**, with soft edges (CMS-10); `restoreBackup` is the one exception (owner-gated, unaudited) | Token expiry, caller mismatch, cross-op replay, concurrent redemption | Convex component |
| Schema is code-authoritative; Studio/MCP never mutate it | Internal-visibility install path only (`collections.ts:21`); public install mutation deleted | **Yes** (ADR 0006 holds) | — | Convex component ✓ |
| Entries always match contract | Publish-time validation only (`lib/validation.ts:301-330`) | **No** — stale/unknown draft keys silently representable; `collection_schema_invalid` readiness code has no producer (CMS-6) | Entry-vs-contract drift test | Convex component |
| Contract artifact interpreted at the version it was produced | `CMS_CONTRACT_VERSION` exists in ginko-content; **never read in ginko-cms** | **No** | Version-gate test | ginko-cms-convex |
| Route uniqueness per locale | `buildRouteClaims` full scan (`diagnostics.ts:93-137`) | Correct but O(site) (CMS-5) | Perf regression guard | Convex component |
| Purge only after backup | `assertBackupArtifactCoversPurge` (`assets.ts:1309`) | Weakened — the artifact isn't a restore path (CMS-3) | Restore round-trip test | Convex component |
| No orphan storage blobs | Nothing (rows cleaned, blobs never) | **No** (CMS-11) | Orphaned-blob reconciliation test | Convex component |
| Last owner cannot be removed/demoted | `members.ts:345-347, 416-418` | Yes (UI role-change path skips preview/confirm but backend guard holds) | Self-demotion UI confirm | Component ✓ / Studio |
| i18n query requires locale (ginko-content) | Phantom-typed handles + negative type tests | **Two holes** (GC-9: `TreeOptions`, zero-arg `many`) | Negative type tests for both | ginko-content types |
| Prod corpus ≡ source files (ginko-content) | Nothing | **No** (GC-2) | Build-time completeness assertion | ginko-content module |

---

# Source-of-Truth Audit

| Concept | Canonical source | Duplicate/derived sources | Risk | Recommendation |
|---|---|---|---|---|
| Content schema / collection contract | Host `content.config.ts` → `buildCmsContract` (`ginko-content/src/cms-contract/build.ts`) → `collections` table snapshot | CLI `push` re-derives options independently of the module (CMS-9) | **High** — contract Convex enforces can diverge from what the running module believes | One shared `resolveGinkoCmsOptions` |
| Field-type vocabulary | *Intended:* `ContentCmsFieldType` (`ginko-content/src/types/config.ts:29-59`) | ×4: re-typed union `ginko-cms/packages/contract/src/types.ts:36-66`; Convex `fieldTypeValidator` literals (`validators.ts:261-292`); Studio component registry (`studio-app/src/components/studio/fields/index.ts:29+`); plus `normalizeFieldType` mappings the producer doesn't know about | **High** — drift fails at runtime during production contract sync | Re-export from `/cms-contract`; exhaustiveness test on validator |
| Schema validation artifact format + checksum | `ginko-content/src/cms-contract/{types.ts:130-148, build.ts:625-632}` | Hand re-declared union + byte-identical FNV-1a re-implementation (`ginko-cms/packages/convex/src/entries/workflow/commands.ts:681-699, 859-866`) | **High** — publish validation correctness by coincidence | Vendor/import; read `contractVersion` |
| Path/slug/i18n semantics | `ginko-content/src/core/content/{slug,path}.ts` | Vendored copies in `ginko-cms/packages/convex/src/lib/cmsContract/*` (incl. exports beyond the public subpath + fabricated types) | **Medium** (parity-tested) | Widen `/cms-contract`, shrink vendor to re-export |
| MDC AST shape | comark | content on `^0.4.0`, cms on `^0.3.2` — two parser versions of one format | **Medium-High** | Align + pin in compatibility matrices |
| Publication state | `entries.status` + `entryRevisions` (ginko-cms) | `publicEntries`/`publicRoutes` (derived, partially rebuildable — CMS-4); Studio client-side fallback re-derivation (`[collection]/index.vue:253-298`) | **Medium** | Full rebuild path; delete client fallback |
| Access control | `members` table + guards in `functions.ts`/`auth/checks.ts` | Studio consumes a server-provided `can` map (no client rules) ✓ | **Low** — the one hole is bootstrap (CMS-1) | Fix CMS-1 |
| Assets | `assets` table + Convex storage | `contentAssetRefs` (derived, over-inclusive by design); provider-side asset-ID sniffing (CMS-7) | **Medium** | Resolve URLs in projections |
| Generated bridge contracts (host `convex/ginkoCms/*`) | `packages/cms/templates/convex/*` | Host copies frozen at init; no drift detection (CMS-8) | **Medium** | Template hash + doctor check + `init --update` |
| Cache tags | `ginko-cms/packages/contract/src/contentTags.ts` | Diverged hand-copy in `nuxt-provider.mjs:19-49`; ginko-content correctly treats tags as opaque | **Medium** | Import in provider |
| Provider/query contract | `ginko-content/src/public/provider.ts` | Provider impl re-inlines result marker (`nuxt-provider.mjs:297`); no type conformance; unused conformance suite | **Medium** | Type against contract; run the suite |
| Prod content corpus (ginko-content) | `content/` files | Bundled parsed cache consumed with no completeness check (GC-2) | **Medium-High** | Build-time assertion |
| Version/stack compatibility | *None (two stale peers)* | `compatibility.json` in both repos, mutually inconsistent | **Medium** | Generate one, read from the other |
| Studio UI state | Convex subscriptions via `useCmsStudioQuery` | Manual `refresh()` sprinkles, readiness recomputed in 4 components, client field-validation regexes duplicating server rules | **Low-Medium** | Trust subscriptions; compute readiness once; server-message-first validation |
| Studio i18n strings | `packages/cms/src/public/locales/{en,de}.ts` (880 keys each) | ~341 hardcoded template strings + script-side workflow copy; empty `locales/pages/*/en.json` stubs at repo root | **Medium** (product) | One sweep or drop DE; delete stubs |
# UI/UX Review

The Studio (standalone Vite SPA, 12 routes under `/studio`, `packages/cms/studio-app/src/router.ts:22-90`) is a coherent product. Navigation, sidebar, and command palette share one route-policy source with capability gates (`lib/studioNavigation.ts`) — labels and access cannot drift between surfaces. State visibility is strong: a five-state save indicator (saving/saved/dirty/conflict/offline-pending, `useEntryDraft.ts:65-71`), status and locale chips, readiness labels. Permissions are done right — the UI reads a server-provided `can` map (`useCmsStudioAccess.ts:32`) and per-row `_can`, no client-side rules.

**Destructive-action safety is the app's best feature and it is applied consistently** — entry archive/unpublish, rollback, member removal, review approval, and site-data deletion all run server preview → blockers/warnings → styled confirm dialog (promise-based FIFO `useStudioConfirm`, deliberately replacing `window.confirm`) → expiring confirmation token. There is no hard "delete entry" in Studio at all (archive only) — a good simplification. No fire-immediately destructive button was found. Rating: 9/10.

## Main workflow risks

1. **Publish can silently become Save** (`useEntryPublishing.ts:202-209`): if the draft is dirty when the user clicks Confirm (easy with 3s-debounced autosave), the code saves, resets readiness, and returns *without publishing*; the dialog then demands a fresh preview. Make the dialog self-healing: dirty → save → re-preview → re-enable confirm in one "Preparing…" flow.
2. **Save conflict is detected but unresolvable** (`useEntryDraft.ts:392-395`): the red "Save conflict" dot has no path forward — no reload-theirs/keep-mine affordance; browser refresh fights the `beforeunload` guard. Two inline buttons ("Load latest", "Copy my changes") suffice.
3. **i18n split-brain**: 880-key EN+DE dictionaries and a locale switcher exist, yet ~341 template strings plus script-side workflow copy are hardcoded English (worst: `StudioAssetBrowser.vue` ~99, `pages/index.vue` work-queue labels at `:197-277`, top-bar save states `StudioEntryTopBar.vue:148-156`, publish messages in `useEntryPublishing.ts:104-362`). A German editor gets a ransom-note UI. Do the sweep or delete the DE dictionary — the half-measure is the worst option. Also delete the dead `locales/pages/*/en.json` stubs (all empty `{}`).
4. **Member management is developer-shaped**: adding a member means pasting a raw user ID into a monospace input (`StudioSettingsMembersSection.vue:42-46`) — no email invite, no pending state. And **role changes mutate instantly on select change** (`useStudioSettingsAdmin.ts:418-425`) with no preview/confirm — an owner can self-demote in one click (removal, by contrast, is properly token-gated). Route role changes through the existing operation-preview machinery.
5. **Filtered lists silently lose pagination and the tree view**: the entry list swaps to a non-paginated `listEntrySummaries` capped at 150 when a work-state filter is on (`pages/[collection]/index.vue:174-248`) — >150 filtered entries are unreachable, and the tree view disappears unexplained. One endpoint with an optional `workState` arg.
6. **Rail "stats" lie**: `collectionRailStats` (`[collection]/index.vue:299-307`) counts over the loaded 50-row page but presents as collection-level numbers. Use the overview endpoint's real counts.

## Confusing states & duplicate frontend derivation

- Client-side fallback re-derivation of `publicState`/`draftChangedSincePublish`/`missingTranslationLocales` (`[collection]/index.vue:253-298`) duplicates the backend readiness engine — make the server row shape canonical and delete the fallback. Same instinct in `getClientFieldError` (hand-rolled email/URL/color regexes that will drift from server rules; keep client checks to `required`).
- Readiness views recomputed in four components with `publishImpact`/`publishReview`/`readinessDetail` prop-drilled through 4+ layers — compute once in the editor context.
- Editor composables communicate through shared mutable refs (`draft.saving/error/isDirty` written by four composables; the page even mutates `editor.draft.error` directly at `[id].vue:594`; multiple errors joined with `'; '` and split in the template at `:645-651`). One `editorStatus` object owned by the context.
- Redundant `refresh()` calls on top of Convex live subscriptions (`useEntryDraft.ts:377`, `[id].vue:513,614`) — resubscribe churn signaling mistrust of the reactivity model.
- Readiness vocabulary appears in ≥3 phrasings ("Needs work" / "Not ready" / "Preview website changes") across top bar, rail, and dialog — pick one.

## Assets workflow (6/10)

Good scoping model (upload destination: this entry / collection / shared library) and soft-delete with usage counts in the confirm dialog. Gaps: no "replace file, keep usages" operation; no orphan/unused view despite usage tracking; no purge story surfaced for trash; load-more pagination with **no virtualization anywhere in the app** — a multi-thousand-asset library accumulates DOM nodes; fake upload progress (`useStudioConvex.ts:148-162` jumps 0→100 on plain fetch — either XHR for real progress or an indeterminate spinner and delete the lying API). Code-wise, `StudioAssetBrowser.vue` (2,317 lines) + `useStudioAssetFinder.ts` (1,125 lines) is the monolith to split (grid / details panel / picker dialog), and `pages/assets.vue:18` reaching into `browserRef?.uploadInput?.click()` is a leaky boundary — expose `openUpload()`.

## Visual/technical hygiene

- **Tailwind prefix violations produce dead styling**: `styles/index.css:1` sets `prefix(ginko)`, so unprefixed literals compile to nothing — drag-over highlight `bg-primary/5` (`[collection]/index.vue:750`), error-list `list-inside list-disc` (`[id].vue:646`). `meta/studio-design.md:22` still documents unprefixed classes. Add a lint; fix the two sites; update the doc.
- Leave-guard hole while saving: `useEntryDraft.ts:209` skips the confirm when `saving.value` is true — drop the `!saving.value` condition.

## Accessibility gaps

1. **Drag-and-drop reorder has no keyboard path** (`[collection]/index.vue:375-463`); the grip button does nothing on keyboard and is `opacity-0` until hover — violating the project's own rule (`meta/studio-design.md:107`). Add move-up/down to a row menu.
2. **Div-grid "tables"** (`[collection]/index.vue:733-742`): headers not programmatically associated with cells; use a real `<table>` (the design doc itself prefers native tables).
3. Icon-only buttons without accessible names (member remove `X`, `StudioSettingsMembersSection.vue:165-173`); editor toolbar relies on `title` alone.
4. No skip link; thin landmark structure (one `<main>` is good; ~10 `role=` attributes app-wide).
5. Contrast risk: pervasive `text-muted-foreground/60` on 12px mono text likely fails WCAG AA — needs a pass.
6. Positives to preserve: reka-ui dialogs give focus traps; first-invalid-field focus on create (`new.vue:351-357`); validation-after-touch on create (note the edit page shows required errors unconditionally — inconsistent with create's touched model).

---

# Security and Permission Review

**Posture: strong and unusually uniform, with two bootstrap/configuration holes that must be fixed before any public deployment.**

What's right (verified in code, not just ADRs):

- **Single enforcement point**: `protectedQuery/Mutation/Action` require a `CmsGuard` evaluated before the handler (`packages/convex/src/functions.ts:139-160`); roles→permissions in one file (`auth/checks.ts:45-134`); a scripted sweep found **zero `protected*` definitions missing a guard**; a custom lint (`scripts/enforce-component-auth-boundaries.mjs`) bans raw Convex builders in the component.
- **Public reads by construction**: unguarded functions are declared against projection tables only (`cmsPublicReadTables`, `functions.ts:94-102`); `getAssetUrl` denies soft-deleted assets and requires a `public` ref for entry-scoped assets (`assets.ts:430-442`).
- **MCP**: opt-in (`mcp: false` default); API keys hashed with per-key + per-IP failure budgets and storage-outage grace (`server/_shared/request-auth.ts:14-160`); capabilities = intersection of member role and per-key scopes (`auth/checks.ts:31-37`, `appIdentity.ts:113-130`); tools go through the same preview/confirm/execute operation layer as Studio — no bypass found.
- **Escalation guards**: role change/removal require owner permission with last-owner protection (`members.ts:345-347, 416-418`); MCP credential scopes clamped to the member's role (`mcpCredentials.ts:97-111`); a member cannot self-elevate.
- **Destructive ops**: preview-bound confirmation tokens (operationId + executePath + argsHash + previewHash re-check) block replay and TOCTOU; executed ops audited (`destructiveAuditLog`).

The gaps, ranked:

1. **CMS-1 (Critical)** — bootstrap owner-claim trusts client-supplied email (`members.ts:247-249`). Fix before anything else.
2. **CMS-2 (High)** — hardcoded `BETTER_AUTH_SECRET` fallback (`convex.auth.ts:74`). Fail closed in production.
3. **Open registration + env-gated bootstrap interact badly**: email/password signup enabled by default (`convex.auth.ts:77-79`) means CMS-1's precondition (an authenticated attacker) is free on any fresh deployment. After fixing CMS-1, also consider disabling open signup once an owner exists, or requiring verified emails.
4. **Operations-layer soft edges (CMS-10)**: constant `scopeKey`, `'anonymous'` caller fallback, weak fallback token entropy, uncoded errors, no lint requiring guards on new `protected*` definitions.
5. **No rate limiting on API keys or mutations** (`convex.auth.ts:85-87` disables the plugin's limiter). Fine for v1 self-hosted; document it.
6. **`restoreBackup` executes a destructive write outside the token layer and writes no audit log** — owner-gated so contained, but it should be an operation like everything else.
7. Low: signin page displays (not navigates) an insufficiently validated `?redirect` (`auth/pages/signin.vue:13-19`); MCP auth double round-trip (`mcp-auth.ts:79-135`) is latency, not vulnerability; CLI error redaction (`ginko-cms.ts:82-97`) is a good touch.

ginko-content's security surface is minimal by design (no auth, no mutations); its main contribution to system security is `SECURITY.md` and not shipping native code — the pagefind binary dependency (GC-12) is the one supply-chain-ish note.
# Performance and Scalability Review

## What becomes slow first, in order

**ginko-cms (write path degrades before read path):**

1. **Publish-time full-site scans** — `buildRouteClaims` (`packages/convex/src/diagnostics.ts:93-137`) collects all collections, all `publicRoutes` per collection×locale via non-indexed `.filter()`, and all redirects, on every publish, publish preview, *and* readiness check. First hard wall; fix with `by_locale_path` point lookups.
2. **Studio aggregation N+1** — `getStudioOverview` (`entries/read.ts:1006-1090`) iterates every collection, collects all entries, runs per-entry draft/route/readiness queries; `listEntries` (`read.ts:888`) is fully unbounded; `readStudioDraftView` uses a non-indexed `.filter()` on `publicEntries` (`context.ts:178-181`). Dashboards degrade linearly with entry count.
3. **Unbounded descendant route rebuild in one mutation** (`subtreeRoutes.ts:143-227`) — a deep-tree slug change can exceed Convex mutation limits and fail the publish outright (CMS-5).
4. **Backup export** collects whole tables and inlines every asset blob as JSON in memory (`backup.ts:220-250, 511-525`) — OOMs on medium datasets (CMS-3).
5. **Public `nav`/`sitemap` translation N+1** (`public.ts:570-596`) — one `getTranslationsForEntry` query per row, up to ~1000×locales per cold read; mitigated by cache tags but expensive uncached.
6. **Relation normalization collects entire target collections on every draft save** (`entries/draft.ts:56-61`); path-conflict checks scan `entries` unindexed (`draft.ts:263-278`, `tree.ts:181-212`).

Steady-state public reads are the *good* story: `publicEntries` has 12 purposeful indexes plus a search index, tuple-cursor pagination throughout — reads will stay fast well past the stated scale target.

**ginko-content:**

1. **Per-request corpus load + graph rebuild in production** (GC-1) — dominates by ~1k documents; fix is process-scope memoization keyed on `buildIntegrity`.
2. **Non-path filters are full scans** (`core/query/execute.ts:224-230`) — only `byCollection`/`byPath` narrow candidates; `where({ tags: … })` filters and clones every candidate. Acceptable at target scale *once the graph is cached* — do not add indexes prematurely.
3. **Locale-crossed reference resolution** — one full provider query per locale (`runtime/server/provider-query.ts:143-158`), O(locales × n); per-result reference enrichment awaits per ref per doc (`storage/references.ts:37-79`).
4. Not a problem: parsed-artifact caching and single-flight dedup (`storage/cache.ts:14`) are well judged; no premature caching found — the failure mode is the opposite (the most expensive derived artifact is the only uncached one).

**Studio frontend:** no virtualization anywhere; asset grids and entry lists accumulate DOM via load-more. Fine to hundreds of visible rows; add virtualization only when a real library exceeds that (don't pre-optimize).

**Premature-optimization check:** none found worth deleting. The one cache adding risk without value is the *absent* one — cache-hint adapters that no-op by default (GC-11) create the *belief* of caching without the behavior.

---

# Test and Verification Review

## ginko-content (~77 files, ~17,950 LOC)

Contract suites are mostly genuine behavior tests (locale-fallback ordering, 404/400 paths, pagination clamping in `test/contracts/query-contracts.test.ts:96-364`; the Vercel cache-adapter behavior tests in `test/unit/cache-hints.test.ts:59-124` are excellent).

**Delete or rewrite (implementation-coupled / duplicated):**
- `test/unit/architecture-boundaries.test.ts` duplicates `test/contracts/architecture-boundaries.test.ts` (same boundary, two parsers). Keep the AST one + the contracts file's unique naming test.
- `test/contracts/package-exports-contracts.test.ts:50-144` — regex-parses facade source against `meta/public-surface.json`: two hand-maintained lists checked against each other. Keep only the dist import smokes (`:228-317`).
- `test/contracts/module-contracts.test.ts` asserts resolver string literals and positional mock-call shapes (`:149, :256-277, :371-374, :479-517`) — breaks on behavior-preserving refactors.
- `test/unit/generated-artifact-helpers.test.ts` tests the test helpers; fold into consumers.
- `test/unit/docs-drift.test.ts` (651 LOC) is a docs linter misfiled as a unit test, including tests of its own regexes (`:470-503`) — move to a lint step.

**Untested invariants (add these five):**
1. Filter-operator behavior matrix (`$in/$containsAny/$icontains/$exists/$type` have zero execution tests) over a fixed dataset in `core/query`.
2. Sort stability/tie-breaking through `executeQueryPlan`.
3. Unmocked 3-locale fallback chain (query-contracts *mocks* `resolveLocaleChain` to a fixed `['de','en']` at `:83`), incl. missing-intermediate and `_variantPaths`.
4. Prod-corpus completeness: build a fixture, assert parsed-cache keys ≡ source ids (guards GC-2).
5. Content mutation → computed tags/paths → `adapter.invalidate` wiring end-to-end.

Also: browser-e2e, search matrix, and static-sitemap tests run only on the main-gated `release-verify` job (`.github/workflows/ci.yml:38-40`) — regressions land on main before detection; move at least a slim smoke to PR CI.

## ginko-cms (~90 files, 713 tests; 33 convex-test component suites)

Real strengths: permissions matrix, publish/projection consistency incl. TOCTOU, operation-token binding, revalidation claim/retry/lock recovery, backup export/verify/purge, 23-scenario CLI suite with drift formatting and redaction.

**Highest-value additions, grouped:**

- **Invariant tests (Convex):** confirmation-token expiry; redeem-as-different-caller; cross-operation token replay; concurrent double-redemption; projection full-rebuild after `pathPrefix` change (CMS-4); entry-vs-contract drift producing `collection_schema_invalid` (CMS-6); `executeFunctionRef` resolution check for all operations (CMS-11); orphaned-blob reconciliation.
- **Security tests:** bootstrap owner-claim with mismatched identity email (CMS-1 regression); production boot without `BETTER_AUTH_SECRET` fails (CMS-2).
- **API/type tests:** ginko-content negative type tests for `tree(docs, {})` and zero-arg `many(docs)` on i18n handles (GC-9); exhaustiveness test tying `fieldTypeValidator` literals to the field-type union (Source-of-Truth #2).
- **Convex/component ↔ contract:** vendor-parity extended to the schema artifact node union + checksum (currently the only unmonitored copy).
- **Nuxt/module tests:** one shared options-resolution suite covering module vs CLI `push` (CMS-9); template content-hash drift detection (CMS-8); provider conformance — run ginko-content's capability-parameterized suite against the packed `@lupinum/ginko-cms/nuxt-provider` (replaces most of the hand-rolled mock conformance files).
- **UI workflow tests:** publish-with-dirty-draft flows to published without manual re-preview (guards the CMS-Studio bounce); save-conflict resolution path once built.
- **Release verification:** compatibility.json generated-and-consistent check across both repos; changelog+tag preflight in any publish script (GC-3).

**Deletable in ginko-cms:** the hand-rolled `test/shared/nuxt-provider-package-conformance.test.ts` mock-suite once the real conformance suite runs; `test/refactor/` golden/parity suites can shrink to the artifact+checksum parity once the vendor layer becomes re-exports.

---

# Release Readiness Review

## ginko-content — **not clean; two fixes from ready**

- Engineering gate is strong: `release:verify` chains packed-consumer install, browser-e2e, matrices, tarball audit; `prepack` builds; publish deliberately manual.
- **v0.1.7 is on npm with no changelog entry and no git tag** (GC-3). `release-edge.sh` publishes with `--no-git-checks`, bypassing the disabled-publish guard. No provenance.
- `compatibility.json` releaseStack stale (says content 0.1.6 / cms 0.1.2 / convex 0.1.1).
- Semver exposure: everything reachable through `module.ts:43` is accidentally committed surface (GC-4); `cms-contract` ships a self-described "Gate 0 spike" (`build.ts:14-16`) and `cms-exchange` ships MVP semantics as stable subpaths — label experimental or delete before more consumers appear.

## ginko-cms — **ready after the security fixes, with three pre-flight items**

- Above-average discipline: `release:publish` disabled forcing the runbook; `release:verify` = format/lint/typecheck/custom invariant scripts (auth-boundary, convex-surface, publish-specifiers, compat-matrix, vendored-contract parity) + packed-consumer e2e + prod audit; `workspace:^` rewrite verified; supply-chain cooldown (`minimumReleaseAge: 1440`).
- **Blockers:** CMS-1 (Critical) and CMS-2 (High) must land first; CMS-3 at minimum needs honest labeling before anyone trusts backups.
- Pre-flight: (1) reconcile `packages/cms/compatibility.json` releaseStack (currently content 0.1.6) against the actual 0.1.7 tarball in `.pack`; (2) fix the module/CLI options split (CMS-9) — the one defect that can corrupt a pushed contract; (3) make `release:verify:registry` mandatory in the runbook — the cross-repo workspace glob (`pnpm-workspace.yaml:2`) plus vitest source aliases mean local green does not prove published-version compatibility.
- Docs: `journal.md` still describes Trellis tarballs in the release gate; the Trellis migration docs describe completed work — archive/delete (see Things To Delete).
# Recommended Refactor Plan

A pragmatic sequence. Each step is independently shippable; risk noted per step.

**Phase 0 — Security hotfixes (hours, do first)**
- CMS-1: authorize bootstrap on verified identity email only (`members.ts:247-249`). Risk: none. Verify: new component test (mismatched identity email rejected) + existing member suite green.
- CMS-2: fail closed on missing `BETTER_AUTH_SECRET` in production (`convex.auth.ts:74`); add a doctor env check. Risk: breaks misconfigured deploys — intentionally. Verify: boot test.

**Phase 1 — Quick deletes/simplifications (days)**
- Delete `/cms-exchange` subpath + source (717 LOC, zero consumers) or explicitly mark experimental if you intend to converge migration onto it. Risk: low (unused). Verify: ginko-cms build + tests green with the export removed.
- Delete ginko-cms root planning docs that describe completed work (see Things To Delete). Risk: none.
- Delete empty `packages/convex/{generated,src/generated}/operationHandles/`, the dead `vitest.config.ts:56` include, `locales/pages/*` stubs, duplicated architecture-boundary test, `RFC-todo.md`, `qa-evidence/`. Risk: none.
- ginko-content release hygiene: backfill v0.1.7 changelog + tag; add publish preflight; fix both `compatibility.json`s (and generate one from the release script). Risk: none.

**Phase 2 — Boundary fixes (1–2 weeks)**
- One `resolveGinkoCmsOptions` shared by module and CLI push (CMS-9). Verify: shared options-resolution test suite.
- Field-type single source: `ginko-cms-contract` re-exports from `/cms-contract`; exhaustiveness test on `fieldTypeValidator`. Verify: type-level test + sync test.
- Schema artifact: vendor/import the node union + checksum; read `CMS_CONTRACT_VERSION` and reject unknown majors. Verify: parity test extension.
- Align comark to one version across repos; pin in compatibility matrices. Verify: golden MDC fixtures both sides.
- Widen `/cms-contract` to cover what the vendor script copies; move `PublicEntryPayload` into ginko-cms-contract; shrink the vendor layer toward re-exports. Verify: existing vendor-parity tests, then delete them.
- Rewrite `nuxt-provider` in TS importing `ContentProvider`, contract tags, and the result marker; move asset-URL resolution into projections (CMS-7). Risk: medium (touches the read path) — gate with the conformance suite below.
- Parameterize ginko-content's provider-contract suite by capabilities; run it against the packed provider in ginko-cms CI. This is the single change that converts the boundary from "agreed" to "enforced".

**Phase 3 — API cleanup in ginko-content (pre-1.0 window, ~1 week)**
- Curate root type exports (GC-4); enumerate `./transformers/*`; symbol-classify the cms-* barrels.
- Move agent surface to `./agent`; single home for provider types; deprecate `./toc` (GC-8).
- Delete the `slug === 'docs'` heuristic; narrow `ContentCmsFieldConfig` editor policy (GC-6) — coordinate with ginko-cms extension typing.
- Re-key the provider wire contract to a closed plan type (GC-5). Risk: highest of the API items (breaks the one provider) — do together with the TS provider rewrite in Phase 2.

**Phase 4 — Data invariant hardening in ginko-cms (1–2 weeks)**
- Projection full rebuild from revisions + trigger on routing drift (CMS-4).
- Indexed route claims; batched descendant rebuilds (CMS-5).
- Migration ledger unblocking push; rename path; `collection_schema_invalid` producer (CMS-6).
- Operations-layer edge hardening + the four missing token tests (CMS-10). Resumable reindex jobs; outbox dead-lettering; blob sweep (CMS-11).
- Backup honesty pass (CMS-3): rename to asset backup now; schedule real restore.
- ginko-content: process-scope prod graph memoization (GC-1) + build-time corpus completeness assertion (GC-2); shipping headers cache adapter (GC-11).

**Phase 5 — UI workflow improvements (1 week)**
- Self-healing publish dialog; save-conflict resolution buttons; role-change through preview/confirm; i18n sweep (or drop DE); merge the two list endpoints; delete client-side state fallbacks; single editor status channel.

**Phase 6 — Test/release hardening (ongoing)**
- The focused test list from the Test Review; PR-gated slim e2e smoke in ginko-content; mandatory `release:verify:registry`; template-hash doctor check + `init --update` (CMS-8); semver-aware doctor dependency check (CMS-12).

---

# Things To Delete Or Simplify

| Repo | Path | Current purpose | Why it may not need to exist | Action | Risk | Verification |
|---|---|---|---|---|---|---|
| ginko-content | `packages/content/src/cms-exchange/` + `./cms-exchange` export | Filesystem export/exchange format | 717 LOC, zero external consumers, index-pairing bug, MVP semantics; ginko-cms uses its own migration planner | **Delete** (or mark experimental only if converging onto it) | Low | Build + ginko-cms suite green |
| ginko-content | `CMS-SPEC.md` (2,326 lines) | Legacy CMS integration spec | Describes a pre-seam design; never mentions the real subpaths; ADR-0013 puts CMS docs outside this repo | Delete; keep a short neutral provider spec | None | Docs-drift gate |
| ginko-content | `RFC-todo.md`, `meta/skill/SKILL.md`, `qa-evidence/` | Completed task log; stale skill pointing at a foreign path; screenshots of external apps | ADR-0015 mandates removing completed task logs; ownership violations | Delete | None | — |
| ginko-content | Fluent-builder types in `types/query-parts/transport.ts:90-156` | Retired pre-ADR-0016 API | Nothing implements them publicly; leaked only via the root wildcard | Delete with GC-4 curation | Low (0.1.x) | Type tests + exports contract |
| ginko-content | `test/unit/architecture-boundaries.test.ts`, exports-mirror half of `package-exports-contracts.test.ts`, mock-shape assertions in `module-contracts.test.ts`, `generated-artifact-helpers.test.ts`, self-tests in `docs-drift.test.ts` | Test bulk | Duplicated or implementation-coupled | Delete/rewrite per Test Review | None | Suite green |
| ginko-content | `./toc` subpath | TOC compatibility alias | Duplicate of `./client` exports | Deprecate with removal milestone | Low | — |
| ginko-content | `pagefind` as hard dep (`package.json:122`) | Search engine binaries for all consumers | Used only with `engine: 'pagefind'` | Optional peer + clear error | Low | Install matrix |
| ginko-cms | Root planning docs: `cms2-comparison.md` (1,916), `ginko-cms-complete-migration-plan.md` (1,941), `move-off-trellis.md` (1,584), `migration-decision-questions.md` (1,709), `update.md` (1,242), `mcp-ai-permission-migration-plan.md` (862), `UI-REVISION.md` (1,269), `journal.md` (381) | Migration-era planning | ~11k lines describing completed work; `journal.md` contradicts current reality (Trellis in release gate); second sources of truth vs ADRs | Delete or move to an `archive/` dir; keep ADRs as the record | None | grep for inbound links |
| ginko-cms | `packages/convex/{generated,src/generated}/operationHandles/` | Empty Trellis leftovers | Referenced nowhere | Delete | None | Build green |
| ginko-cms | Trellis marker check (`packages/cms/src/module/convex.ts:154-155`) | Detect legacy generated files | Keep short-term for migrating hosts; delete once 0.2 ships | Time-boxed delete | None | Doctor tests |
| ginko-cms | `locales/pages/*/en.json` stubs (repo root + playground) | i18n scaffolding | All empty `{}`; misrepresent i18n coverage | Delete | None | — |
| ginko-cms | Cache-tag copy + result-marker inline in `nuxt-provider.mjs:19-49, 297` | Avoid imports in `.mjs` | Diverged duplicates of contract exports | Replace with imports (Phase 2) | Low | Conformance suite |
| ginko-cms | `FieldType` union + validator literals as independent declarations (`packages/contract/src/types.ts:36-66`, `validators.ts:261-292`) | Field vocabulary | Duplicates ginko-content's union | Re-export + exhaustiveness test | Low | Type tests |
| ginko-cms | Local `SchemaArtifactNode` + FNV-1a copy (`workflow/commands.ts:681-699, 859-866`) | Artifact interpretation | Byte-identical hand copy | Import/vendor | Low | Parity test |
| ginko-cms | Hand-rolled provider conformance mocks (`test/shared/nuxt-provider-package-conformance.test.ts`) | Provider testing | Superseded by the real suite once wired | Delete after Phase 2 | None | Real suite green |
| ginko-cms | `./convex/auth`, `./convex/auth-config` re-export subpaths | Indirection | Hosts already depend on the targets directly | Retarget templates, then delete | Low | Template e2e |
| ginko-cms | Fake upload-progress API (`useStudioConvex.ts:148-162`) | Progress plumbing | Lies (0→100 jump) | Indeterminate state; delete the API | None | — |
| ginko-cms | Client-side workflow-state fallback (`pages/[collection]/index.vue:253-298`) + duplicate list pipeline (`:174-248`) | Resilience to missing server fields | Duplicates backend readiness; loses pagination/tree | Make server rows canonical; one endpoint | Low | UI tests |
| ginko-cms | Long-term: `packages/convex/src/lib/cmsContract/` vendor layer + `scripts/sync-cms-contract-vendor.mjs` + parity tests | Isolate-safe copies | If Convex bundles `/cms-contract` directly, all become deletable | Shrink to re-exports, then delete | Medium | Golden fixtures both sides |

---

# Things Not To Do

- **Do not move CMS policy into ginko-content** — the fix for the field-vocabulary coupling is one master + re-export, not relocating editor policy downward (and not a new shared "fields" package).
- **Do not build a generic provider adapter framework** in ginko-content for hypothetical third-party CMSs. One real provider exists; make the *contract* closed and the conformance suite real instead.
- **Do not add compatibility shims for the retired provider query vocabulary** — hard-cut `ContentQueryBuilderParams` to the plan type while the provider count is one. Same for `/server`-facade reshuffling: alias for one minor, then cut.
- **Do not keep both migration planners** (`/cms-exchange` and `packages/cms/src/migration`) "just in case" — pick one; the other is guaranteed drift in a data-loss-sensitive path.
- **Do not re-introduce a bridge/wrapper framework** (the Trellis shape) to solve the generated-template drift problem — a content-hash stamp + `init --update` is enough; ADR 0016's hard-cutover decision was correct.
- **Do not add new Convex tables for readiness/publish-state caching** to fix Studio N+1 — fix the query patterns (pagination, batched lookups, indexes); the projections you have are already the right read models.
- **Do not let the frontend own backend policy** — resist "fixing" the publish-bounce or validation UX by adding client-side rules; the server preview/readiness engine is the source of truth, the UI should orchestrate it better.
- **Do not expose bridge internals publicly** — keep `dist/server`/`dist/cli` out of the exports map (currently correct, pinned by test); don't export the studio host bridge.
- **Do not add MCP tools that call Convex functions directly** — the operation-layer discipline (preview→token→execute) is the product's best safety property; every new tool goes through it.
- **Do not add caches/projections without a rebuild story** — CMS-4 shows the cost of the one place this slipped; make full-rebuild a requirement for any new derived table.
- **Do not chase very-large-site performance yet** — no query-index work in ginko-content beyond the process-scope graph cache; no Studio virtualization until a real library needs it. Your VISION.md scale target is right; fix the write-path walls that bite *within* it first.

---

# Open Questions

1. **Is `/cms-exchange` the intended future of filesystem migration, or dead?** The answer decides whether to fix its manifest-pairing bug or delete 717 lines. (Evidence says delete: ginko-cms built its own planner.)
2. **Can the Convex isolate bundle `@lupinum/ginko-content/cms-contract` directly?** If yes, the entire vendor layer (script, regex rewrites, parity tests, drift check) is deletable — the single biggest seam simplification available.
3. **What is the supported story when `GINKO_FIRST_OWNER_EMAIL` user never signs up?** Bootstrap currently depends on open email/password registration (`convex.auth.ts:77-79`) — is open signup intended to stay enabled on production deployments once an owner exists?
4. **Is DE localization a launch requirement for Studio?** The 880-key dictionary says yes; 341 hardcoded strings say no. Either answer is fine; the current halfway state is the only wrong one.
5. **Which package version constitutes "the release"?** Two stale `compatibility.json`s and a v0.1.7 npm publish without tag/changelog suggest the release unit (content+cms+convex+contract tuple) isn't operationally defined yet. Decide where the tuple lives and generate the rest.
6. **Are redirects a v1 feature?** The table and diagnostics read them; nothing writes them. Ship publish-time redirect creation or delete the table before v1 users depend on the implied behavior.
7. **What is the multi-editor story?** Draft versioning detects conflicts but the UX dead-ends (Studio finding); if simultaneous editing is out of scope for v1, say so in PRODUCT.md and ship the two-button resolution; if in scope, this needs design.

---

# Top 10 Actions

| # | Action | Priority | Impact | Complexity | Files/areas | Verification |
|---|---|---|---|---|---|---|
| 1 | Fix bootstrap owner-claim to trust only the verified identity email | **P0** | Prevents takeover of every fresh deployment | Trivial | `packages/convex/src/members.ts:247-249` | New component test: mismatched identity email rejected; `pnpm vitest run test/component` |
| 2 | Fail closed on missing `BETTER_AUTH_SECRET` in production; add doctor check | **P0** | Removes silent session-forgery configuration | Trivial | `packages/convex/src/convex.auth.ts:74`, `src/module/convex.ts` (doctor) | Boot test + doctor test |
| 3 | Re-scope backup as asset-only (label + docs + purge gating) until content restore exists | **P0** | Eliminates a false disaster-recovery promise | Small now; restore later | `packages/convex/src/backup.ts`, Studio settings copy, `docs/` | Restore round-trip test (later); honest UI copy (now) |
| 4 | Unify module/CLI option resolution into one `resolveGinkoCmsOptions` | **P1** | Removes the one defect that corrupts pushed contracts | Small | `packages/cms/src/cli/push.ts:56-138`, `src/module.ts:93-125`, new `src/module/options.ts` | Shared options test suite; `push --check` vs runtime parity |
| 5 | Make projections fully rebuildable + bound the publish path (indexed route claims, batched subtree rebuilds) | **P1** | Restores the ADR-0005 guarantee; removes the first scale walls | Medium | `packages/convex/src/entries/projectionMaintenance.ts`, `diagnostics.ts:93-137`, `entries/workflow/subtreeRoutes.ts`, `collections/jobs.ts` | pathPrefix-change rebuild test; publish on 500-descendant fixture |
| 6 | Collapse cross-repo duplications: field-type re-export + validator exhaustiveness; schema artifact + checksum import; comark alignment; contentTags/marker imports in provider | **P1** | Turns five silent-drift risks into compiler/test failures | Medium | `packages/contract/src/{types,validators}.ts`, `packages/convex/src/entries/workflow/commands.ts:681-866`, `nuxt-provider.mjs:19-49,297`, both `package.json` comark pins | Exhaustiveness + parity tests; golden MDC fixtures |
| 7 | Wire real provider conformance: parameterize ginko-content's suite by capabilities; run against packed provider in ginko-cms CI; rewrite `nuxt-provider` in TS against `ContentProvider` | **P1** | The boundary becomes enforced, not agreed; typed read path | Medium | `ginko-content/src/testing/provider-contract.ts:43-58`, `ginko-cms/packages/cms/src/nuxt-provider.mjs`, `test/shared/` | Suite green against packed tarball in CI |
| 8 | ginko-content prod performance + integrity: process-scope graph memoization keyed on `buildIntegrity`; build-time corpus completeness assertion | **P1** | Biggest prod latency win; closes silent-missing-page class | Small-Medium | `src/storage/graph.ts:8-17`, `src/storage/contents.ts:48-96`, `src/module/static-output.ts:47-53` | Same-instance test; failing build on skipped doc; 1k-doc benchmark |
| 9 | ginko-content public-surface hardening: curate root type exports, delete dead builder types, enumerate transformers wildcard, classify cms-* symbols, delete `/cms-exchange`, delete `slug === 'docs'` | **P2** | Cuts accidental semver surface before 1.0 locks it in | Medium | `src/module.ts:43`, `types/query-parts/transport.ts`, `package.json` exports, `src/cms-contract/build.ts:223-231`, `meta/public-surface.json` | Exports contract test extended to root; typecheck fixtures |
| 10 | Studio flow fixes: self-healing publish dialog, save-conflict resolution, role-change via preview/confirm, i18n decision (sweep or drop DE) | **P2** | Removes the three editor-facing trust breakers | Medium | `useEntryPublishing.ts:202-209`, `useEntryDraft.ts:392-395`, `useStudioSettingsAdmin.ts:418-425`, locales | UI workflow tests: dirty-publish completes; conflict resolvable; self-demotion confirmed |

Release hygiene (changelog/tag backfill for content 0.1.7, compatibility.json regeneration, mandatory registry-mode verify) rides along with actions 4–8 as Phase-1 chores — small enough not to occupy a slot, important enough to do this week.
