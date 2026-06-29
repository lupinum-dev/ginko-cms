# Trellis to better-convex-nuxt Hard Cutover Plan

Source repo: `/Users/matthias/Git/workspace/ginko-cms`

Target foundation repo: `/Users/matthias/Git/convex/better-convex-nuxt`

Old dependency/reference repo: `/Users/matthias/Git/workspace/trellis`

This plan is for a hard migration. The first migration pass is allowed to make the repo temporarily broken. Before that pass, run small throwaway spikes to answer the risky foundation questions. The rule is: learn in isolated spikes first, then remove Trellis hard, then bring the repo back in small verified slices.

## Executive Summary

Difficulty: high.

The migration is not a package rename. Trellis currently owns generated API aliases, operation descriptors, operation handle codegen, MCP operation wiring, component bridge glue, caller builders, forwarded caller handling, package-boundary tests, eslint config, and the Studio host auth bridge. `better-convex-nuxt` provides Nuxt + Convex + Better Auth integration primitives, not those product/runtime concepts.

Recommended strategy:

- Do Phase 0 spikes first to validate the intended foundation shape without starting the production migration.
- Keep spikes isolated, disposable, and focused on one architectural question each.
- Record spike results before any Trellis removal starts.
- Then do a full hard migration pass.
- Remove all Trellis package dependencies, module dependencies, imports, generated handles, scripts, docs, and tests that assume Trellis.
- Accept that TypeScript/Nuxt/Convex may be broken immediately after this pass.
- Add only minimal Ginko-owned skeletons needed to name the new product concepts.
- Stabilize in small slices: type resolution, Convex component, auth/member model, Studio, operations, bridge/installer, MCP, then final validation.

Main risks:

- Convex function registration depends heavily on Trellis caller builders in `packages/convex/src/functions.ts`.
- Operation descriptors and generated operation handles are spread across Convex, Studio, MCP, and tests.
- `@lupinum/trellis-bridge` is used both as build/install glue and runtime component bridge glue.
- Studio currently uses `#trellis/api` and the private `__trellis_auth_engine__`.
- Package-boundary tests currently enforce Trellis, so they must be rewritten rather than preserved.
- Member/auth source of truth is a real architecture decision, not a mechanical migration.
- `better-convex-nuxt` may need small general helpers before Ginko can cut over cleanly.

First diagnostic command after the hard cutover:

```bash
pnpm exec nuxi prepare packages/cms
```

If that command is not suitable after package layout changes, use the nearest Nuxt prepare command for the CMS package. Do not run it during Phase 1.

## Non-Negotiables

- [ ] Remove `@lupinum/trellis` completely.
- [ ] Remove `@lupinum/trellis-bridge` completely.
- [ ] Remove `@lupinum/trellis-eslint` completely.
- [ ] Remove `#trellis` aliases completely.
- [ ] Do not add a compatibility wrapper for Trellis imports.
- [ ] Do not keep old and new paths side by side.
- [ ] Do not add feature flags for Trellis/new runtime selection.
- [ ] Do not preserve generated Trellis operation handles.
- [ ] Keep one source of truth for each concept.
- [ ] Keep `better-convex-nuxt` general.
- [ ] Make Ginko own CMS product semantics.

`better-convex-nuxt` must not become Trellis 2. Do not add these to `better-convex-nuxt` core:

- `defineTrellis`
- Trellis operation DSL
- Trellis bridge manifests
- CMS-specific operation handling
- CMS destructive confirmation runtime
- MCP operation framework
- generic product permission engine
- generic tenant tables

## Current Inventory

### Package Dependencies To Remove Or Replace

Root files:

- `/Users/matthias/Git/workspace/ginko-cms/package.json`
  - Remove dev dependency `@lupinum/trellis`.
  - Remove dev dependency `@lupinum/trellis-bridge`.
  - Remove dev dependency `@lupinum/trellis-eslint`.
  - Remove scripts that call `trellis operations generate`.
  - Remove `trellis:build` and any `--filter @lupinum/trellis-eslint build` dependency chain.
  - Add or keep dependency path to `better-convex-nuxt` only where the workspace needs to consume it directly.
- `/Users/matthias/Git/workspace/ginko-cms/pnpm-workspace.yaml`
  - Remove workspace packages `../trellis` and `../trellis/packages/*`.
  - Remove `releaseAgeExclude` entries for Trellis packages.
  - Revisit comments about transitive dependencies through Trellis.

Package files:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/package.json`
  - Remove `@lupinum/trellis`.
  - Remove `@lupinum/trellis-bridge`.
  - Add direct dependency on `better-convex-nuxt` if CMS module consumes it.
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/package.json`
  - Remove `@lupinum/trellis`.
  - Remove `@lupinum/trellis-bridge`.
  - Remove or replace export `./operation-handles/mcp` that points at generated Trellis operation handles.
  - Add no replacement export unless a real Ginko-owned consumer needs it.

### Nuxt Module Dependencies To Replace

Primary file:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module.ts`
  - Current module dependency injects `@lupinum/trellis`.
  - Replace with `better-convex-nuxt`.
  - Map existing module options into general `convex` module config only where required.
  - Do not recreate Trellis module options under a new name.

Related files:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/convex.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/bridge-manifest.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/cli/bridge.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/cli/forwarding.ts`

These currently depend on Trellis bridge concepts. They must either be deleted, rewritten as Ginko-owned glue, or simplified into direct templates.

### Import Groups To Migrate

Direct Trellis package imports:

- `@lupinum/trellis`
- `@lupinum/trellis/backend`
- `@lupinum/trellis/composables`
- `@lupinum/trellis/mcp`
- `@lupinum/trellis/workspace`
- `@lupinum/trellis/auth`
- `@lupinum/trellis-bridge`
- `@lupinum/trellis-bridge/component`

Virtual imports:

- `#trellis/api` becomes `#convex/api`.
- `#trellis/mcp` has no direct equivalent and must become Ginko-owned MCP runtime imports.
- `#trellis/mcp/advanced` has no direct equivalent and must become Ginko-owned operation preview/execute helpers.
- `#trellis/*` should not be re-aliased.

Convex caller imports:

- `defineTrellis`
- `defineCaller`
- `getForwardedCaller`
- `unsafe`
- `ActingFor`
- `OperationHandle`

These have no `better-convex-nuxt` equivalent. Replace with explicit Ginko-owned Convex helpers only where the CMS needs them.

Operation imports:

- `defineOperation`
- `operationPreview`
- `operationPreviewValidator`
- `defineOperationForFunction`
- generated `operationHandles`
- generated `operationRefs`

These become Ginko-owned operation descriptors and explicit preview/execute mappings.

MCP imports:

- `defineMcpApp`
- Trellis MCP runtime types
- generated operation handles passed to MCP tools

These become Ginko-owned MCP transport code that calls the CMS operation policy. MCP must not bypass product rules.

Auth imports:

- Trellis composables from `@lupinum/trellis/composables`.
- `__trellis_auth_engine__` in Studio host.

These become `better-convex-nuxt` public composables, especially `useConvexAuth`, plus Better Auth client helpers.

### Generated Files To Delete Or Replace

Delete Trellis-generated files:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/generated/operationHandles/mcp.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/generated/operationHandles/testing.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/generated/operationRefs.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/generated/operationRefs.ts`

Remove scripts that generate them:

- `operations:generate`
- `operations:generate:mcp`
- `operations:generate:testing`
- any direct `trellis operations generate` usage

Replacement direction:

- Do not build a new generic operation codegen system in Phase 1.
- Add a minimal Ginko-owned operation registry only if needed to compile named operation lookups.
- Prefer explicit imports and explicit maps over generated handles until there is evidence codegen is required.

### Tests, Docs, And Scripts That Mention Trellis

Rewrite or delete tests that enforce Trellis package boundaries:

- `/Users/matthias/Git/workspace/ginko-cms/test/module/package-boundaries.test.ts`
- `/Users/matthias/Git/workspace/ginko-cms/test/module/package-exports.test.ts`
- `/Users/matthias/Git/workspace/ginko-cms/test/module/module-tailwind.test.ts`
- `/Users/matthias/Git/workspace/ginko-cms/test/module/e2e-with-fixture.test.ts`
- `/Users/matthias/Git/workspace/ginko-cms/test/module/e2e-real-starter.test.ts`
- `/Users/matthias/Git/workspace/ginko-cms/test/helpers.ts`
- `/Users/matthias/Git/workspace/ginko-cms/vitest.config.ts`
- `/Users/matthias/Git/workspace/ginko-cms/eslint.config.mjs`

Update docs and examples:

- Any docs that instruct users to install or import Trellis.
- Any example that uses `#trellis/api`.
- Any starter or fixture that configures `@lupinum/trellis`.
- Any package export docs that reference operation handles from Trellis.

### Runtime Concepts With No better-convex-nuxt Equivalent

These must be owned by Ginko or deleted:

- Trellis operation DSL.
- Destructive preview/confirmation/execute runtime.
- Generated operation handle files.
- Trellis MCP app framework.
- Trellis component bridge manifest.
- `createComponentBridge`.
- Forwarded caller runtime.
- Public/protected caller builders.
- Trusted replay helper.
- Trellis eslint rules.
- Studio private auth engine bridge.

## Target Architecture

### Comes From better-convex-nuxt

`better-convex-nuxt` should provide only general Nuxt + Convex + Better Auth integration:

- `#convex/api`
- `#convex/server`
- Convex client injection
- `useConvex`
- `useConvexQuery`
- `useConvexMutation`
- `useConvexAction`
- `useConvexPaginatedQuery`
- upload and storage helpers
- `useConvexAuth`
- Better Auth client creation
- server Convex callers
- docs and starters that demonstrate general app usage

If Ginko needs one missing primitive, add it only if it is general. Examples:

- acceptable: a documented public way to access auth state/token for Convex client sync
- acceptable: general server caller ergonomics
- acceptable: starter docs for component-like package usage
- not acceptable: CMS operation descriptors
- not acceptable: destructive confirmation runtime
- not acceptable: Trellis bridge replacement

### Moves Into Ginko-Owned Code

Ginko owns CMS product semantics:

- CMS operation descriptors.
- Destructive preview, confirmation, and execute policy.
- Component bridge shape if still needed.
- Studio host workflow.
- MCP tool policy.
- CMS product authorization.
- CMS audit/activity logs.
- entries, assets, collections, drafts, publishing, migrations, backups.
- Any caller helpers that encode CMS role/project/site rules.

Recommended Ginko-owned areas:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/operations/`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/authz/`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/callers/`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/runtime/operations/`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/server/mcp/`

Keep these boring and explicit. Do not create a generic framework unless repeated concrete code proves it is needed.

### Should Be Deleted

- Trellis workspace references.
- Trellis package dependencies.
- Trellis module dependency installation.
- Trellis bridge package usage.
- Trellis generated operation handles.
- Trellis operation codegen scripts.
- `#trellis` aliases.
- Tests whose only purpose is preserving Trellis integration.
- Docs that teach Trellis.

### Better Auth Should Own

Use Better Auth for auth-domain heavy lifting where it fits:

- users
- sessions
- organizations
- members
- roles
- invitations
- API keys or service tokens if suitable for MCP/service access

Better Auth should not own CMS product invariants. Convex/Ginko still enforce:

- who can publish an entry
- who can delete an asset
- who can restore backups
- which project/site/collection an action applies to
- destructive confirmation requirements
- audit/activity writes
- MCP write policy

### Product-Domain Convex Code Remains In Ginko

The following stay in Convex/Ginko:

- schema for CMS content and product state
- validators for CMS objects
- query/mutation/action functions for CMS workflows
- operation preview and execute code
- confirmation storage if destructive confirmations remain
- audit/activity tables
- product authorization checks
- backup/migration/revalidation logic

## Phase 0: Foundation Spikes Before The Hard Cutover

Goal: answer the risky architecture questions before agents begin deleting Trellis from production Ginko code.

Status: completed on 2026-06-29. Evidence is recorded in `/Users/matthias/Git/workspace/ginko-cms/docs/plans/trellis-cutover-spike-results.md`; working notes are recorded in `/Users/matthias/Git/workspace/ginko-cms/docs/plans/journal.md`.

Phase 0 is not a cautious migration. It is also not the start of the Ginko cutover. It is a small set of isolated, disposable experiments that prove the new foundation shape is viable.

Rules for Phase 0:

- Do not migrate production Ginko code.
- Do not add Trellis compatibility.
- Do not add a second runtime path to Ginko.
- Do not keep spike code unless it becomes a documented starter or a small general `better-convex-nuxt` improvement.
- Each spike must answer one question.
- Each spike must end with a written result.
- If a spike discovers a missing `better-convex-nuxt` primitive, the proposed fix must be general and not CMS-specific.

Record results in:

- `/Users/matthias/Git/workspace/ginko-cms/docs/plans/trellis-cutover-spike-results.md`

Required result format per spike:

```md
## Spike Name

Question:

Result: yes | no | partial

Verified:

- ...

Decision:

- ...

Impact On Migration Plan:

- ...

Required better-convex-nuxt Change:

- none | ...
```

### Spike 0A: Nuxt + Convex + Better Auth Foundation

Status: completed. Result: yes, with browser signed-in server-route smoke deferred to later validation.

Question: can a Nuxt app use `better-convex-nuxt` as the full foundation for client and server Convex access with Better Auth session sync?

Recommended location:

- temporary playground inside `/Users/matthias/Git/convex/better-convex-nuxt`
- or a disposable worktree outside Ginko production packages

Build the smallest app that proves:

- [ ] `better-convex-nuxt` installs as a Nuxt module.
- [ ] `#convex/api` resolves.
- [ ] `useConvexAuth` exposes ready/authenticated/pending/error states.
- [ ] A client query works.
- [ ] A client mutation works.
- [ ] A Nuxt server route can call a Convex query as the current authenticated user.
- [ ] A Nuxt server route can call a Convex mutation as the current authenticated user.
- [ ] Unauthenticated server calls fail clearly.
- [ ] Missing env/codegen failure modes are understandable.

What to avoid:

- no CMS schema
- no operation runtime
- no bridge manifest
- no Trellis aliases

Acceptance criteria:

- [ ] Result is recorded in `trellis-cutover-spike-results.md`.
- [ ] Any required `better-convex-nuxt` helper is described as a general API.
- [ ] If no helper is needed, Phase 2 can rely on existing `better-convex-nuxt` surface.

Likely `better-convex-nuxt` improvements if the spike exposes gaps:

- request-scoped server Convex caller helper
- clearer missing config diagnostics
- clearer public auth-ready contract
- example docs for server routes calling Convex with Better Auth session context

### Spike 0B: Better Auth Organization And Member Fit

Status: completed. Result: partial. Better Auth Organization is proven for generic org/member/team workflows; first Ginko cutover should keep CMS membership canonical unless Phase 4 proves a full hard replacement.

Question: should Ginko use Better Auth Organization as canonical membership, or keep CMS-owned membership canonical?

Build the smallest auth-domain scenario:

- [ ] create user
- [ ] create organization
- [ ] invite member
- [ ] accept invitation
- [ ] assign role
- [ ] check role/permission from Nuxt server code
- [ ] pass enough identity context to Convex for product authorization

Evaluate against Ginko requirements:

- project/site scoping
- collection-specific permissions
- publishing/destructive permissions
- audit requirements
- historical activity requirements
- invitation/member lifecycle
- Studio member management UX

Decision criteria:

- Use Better Auth Organization if membership is mostly organization/member/role/invitation lifecycle.
- Keep Ginko membership canonical if membership is deeply CMS/project/site/collection-specific.
- Do not mirror both as canonical sources.

Acceptance criteria:

- [ ] Decision A or Decision B from Phase 4 is chosen or narrowed.
- [ ] Source-of-truth tradeoff is recorded.
- [ ] Required migration impact on `packages/convex/src/members.ts` is documented.

### Spike 0C: Better Auth API Keys For MCP / Service Access

Status: completed. Result: partial. Better Auth API keys are viable auth-domain credentials, but Ginko MCP product authorization should remain Ginko-owned.

Question: can Better Auth API keys own MCP/service authentication while Ginko keeps product authorization?

Build the smallest service access scenario:

- [ ] create API key or service credential
- [ ] authenticate a server request with that key
- [ ] associate key with user/org/project context if supported
- [ ] call a Convex query through Nuxt server code
- [ ] call a Convex mutation through Nuxt server code
- [ ] reject unauthorized product write in Convex/Ginko policy

Evaluate:

- revocation
- key naming/metadata
- organization/project scoping
- rate limit support if needed
- audit identity
- whether MCP can use the same path as other service callers

Acceptance criteria:

- [ ] Decide whether Better Auth API keys are sufficient for MCP/service auth.
- [ ] If sufficient, document the service identity shape Ginko receives.
- [ ] If insufficient, document the minimal Ginko-owned service credential model.
- [ ] No product write is allowed based on API-key authentication alone.

### Spike 0D: Convex Component / Starter Shape

Status: completed. Result: yes. Direct starters/templates are viable; no generic bridge replacement is needed.

Question: can Ginko avoid a Trellis-style bridge framework by using direct templates or a simple component package shape?

Build the smallest component-like setup:

- [ ] a Nuxt app using `better-convex-nuxt`
- [ ] a Convex package/component with one query and one mutation
- [ ] generated API import through `#convex/api`
- [ ] no `@lupinum/trellis-bridge`
- [ ] no bridge manifest
- [ ] no generated operation handles
- [ ] no forwarded caller framework

Evaluate:

- how app code discovers component functions
- how install/setup files are copied or referenced
- whether direct templates are enough
- whether any generation is truly required
- which docs/starter would make this easy for future apps

Acceptance criteria:

- [ ] Choose direct templates or Ginko-owned generated glue for Phase 7.
- [ ] If generated glue is required, record the concrete install requirement proving it.
- [ ] If direct templates are enough, record the intended starter/template shape.

Recommended outcome:

- Promote a general `better-convex-nuxt` starter if the spike is useful beyond Ginko.
- Keep CMS install semantics in Ginko.

### Spike 0E: Ginko-Owned Operation Runtime Shape

Status: completed. Result: yes. Use explicit Ginko operation ids plus preview/confirmation/execute/audit maps; do not recreate generated Trellis handles.

Question: can Ginko replace Trellis operations with an explicit product operation registry without recreating a framework?

Build the smallest fake operation runtime, outside production Ginko migration code:

- [ ] one read-only operation
- [ ] one destructive operation
- [ ] preview function
- [ ] confirmation token or confirmation record
- [ ] execute function
- [ ] audit/activity write
- [ ] fake Studio caller
- [ ] fake MCP caller

Verify:

- Studio and MCP call the same operation policy.
- Destructive execute cannot bypass preview/confirmation.
- Product authorization is checked in the Convex/Ginko path.
- Operation ids are explicit strings, not generated Trellis handles.
- The registry remains small enough to read.

Acceptance criteria:

- [ ] Decide the minimal operation descriptor type for Phase 6.
- [ ] Decide whether codegen is unnecessary for the initial migration.
- [ ] Record any operation families that should stay disabled after Phase 1.

### Phase 0 better-convex-nuxt Work Policy

Allowed changes to `/Users/matthias/Git/convex/better-convex-nuxt`:

- [ ] General server caller helpers.
- [ ] Better Auth organization/API-key recipes.
- [ ] Component starter.
- [ ] Better diagnostics for missing env/codegen/auth state.
- [ ] Public auth state contract documentation.

Not allowed:

- CMS operation runtime.
- Trellis-compatible APIs.
- Bridge manifests.
- MCP product framework.
- Ginko permission engine.
- Generic tenant tables.

Phase 0 exit criteria:

- [x] `trellis-cutover-spike-results.md` exists.
- [x] Each spike has a yes/no/partial result.
- [x] Required `better-convex-nuxt` changes are either implemented and validated or explicitly deferred as non-blocking.
- [x] The membership source-of-truth decision is made or narrowed to a concrete Phase 4 decision.
- [x] The component/bridge direction is chosen for Phase 7.
- [x] The operation runtime shape is clear enough for Phase 6.
- [x] No production Ginko migration code has been started.

### Phase 0 Learnings Applied

These are now defaults for the implementation phases:

- `better-convex-nuxt` is sufficient for the foundation cutover. Use it directly for Nuxt module setup, `#convex/api`, `#convex/server`, client composables, `useConvexAuth`, and server callers.
- No blocking `better-convex-nuxt` core API is missing for Phase 1. Do not delay the hard cutover for more foundation work.
- Keep the first Ginko migration focused on removing Trellis. Do not combine it with a Better Auth Organization membership replacement.
- Default Phase 4 path is Decision B: keep Ginko `members` canonical during the Trellis cutover. Better Auth Organization can become a later hard replacement only if CMS member semantics map cleanly and the old source is deleted.
- Better Auth API keys are not the default MCP/service credential model for this cutover. They are useful auth-domain credentials, but product routes must still re-check CMS state and authorization.
- Default Phase 8 path is Ginko-owned service actors/credentials or the existing CMS equivalent, with MCP as transport only.
- Default Phase 7 path is direct templates. Add Ginko-owned generated glue only if direct templates cannot express installation.
- Default Phase 6 path is an explicit Ginko operation registry with string operation ids, preview, confirmation, execute, and audit. Start without codegen.
- Starter validation needs `nuxi prepare` before tests when a starter extends `.nuxt/tsconfig.json`.

## Phase 1: Hard Migration Pass, No Validation

Goal: remove Trellis completely and replace obvious references with direct better-convex-nuxt/Ginko-owned concepts using the decisions from Phase 0. The repo may not build at the end of this phase.

Status: completed on 2026-06-29. The hard cutover removed package dependencies, generated handles, old virtual imports, bridge/MCP package usage, and old tests/scripts that depended on the removed foundation. Disabled surfaces are tracked in `/Users/matthias/Git/workspace/ginko-cms/docs/plans/trellis-cutover-disabled-surfaces.md`.

Rules for Phase 1:

- Do not start until Phase 0 spike results are recorded.
- Do not run tests.
- Do not start dev servers.
- Do not chase every type error.
- Do not preserve Trellis behind wrappers.
- Do not add dual paths.
- Prefer deleting blocked advanced surfaces over keeping Trellis.
- If code is too coupled to migrate quickly, comment it out with a `TODO(trellis-cutover)` marker and list it in the disabled-surface tracker.

### Package And Workspace Changes

- [x] Remove Trellis packages from root `package.json`.
- [x] Remove Trellis packages from `packages/cms/package.json`.
- [x] Remove Trellis packages from `packages/convex/package.json`.
- [x] Remove Trellis workspace paths from `pnpm-workspace.yaml`.
- [x] Add/confirm `better-convex-nuxt` dependency where CMS consumes the module, using the package shape proven in Phase 0.
- [x] Remove operation generation scripts that call `trellis operations generate`.
- [x] Remove `trellis:build`.
- [x] Remove `@lupinum/trellis-eslint` from eslint config.

### Module Cutover

- [x] In `packages/cms/src/module.ts`, replace Nuxt module dependency from `@lupinum/trellis` to `better-convex-nuxt`.
- [x] Convert config mapping to `convex` module options only, based on the Phase 0 foundation spike.
- [x] Delete Trellis-specific module setup instead of adapting it.
- [x] Ensure aliases point to `#convex/api`, not `#trellis/api`.

### Import Cutover

- [x] Replace `#trellis/api` imports with `#convex/api`.
- [x] Replace Trellis composables with `better-convex-nuxt` composables.
- [x] Replace Studio host auth usage with public `useConvexAuth`, following the Phase 0 auth contract.
- [x] Remove all direct `@lupinum/trellis/backend` imports.
- [x] Remove all direct `@lupinum/trellis-bridge` imports.
- [x] Remove all `#trellis/mcp` and `#trellis/mcp/advanced` imports.

### Generated Operation Files

- [x] Delete generated operation handle files.
- [x] Delete generated operation ref files.
- [x] Remove package exports that expose generated operation handles.
- [x] Remove generated imports from MCP, tests, and runtime code.

### Minimal Ginko-Owned Skeletons

Add only minimal skeletons required to name the new ownership boundary:

- [x] `packages/convex/src/operations/registry.ts`
  - explicit operation id list
  - explicit preview/execute function map
  - no generic DSL
- [x] `packages/convex/src/operations/types.ts`
  - minimal operation descriptor types
  - no compatibility with Trellis types
- [x] `packages/convex/src/callers.ts` or `packages/convex/src/callers/index.ts`
  - explicit public/protected/admin wrappers only if needed
  - no `defineCaller` clone
- [x] `packages/cms/src/server/mcp/_shared/operation-runtime.ts`
  - Ginko MCP transport adapter to operation registry
  - no Trellis handle imports

If these skeletons become large during Phase 1, stop and comment out the caller instead. The hard pass should delete more than it adds.

### Advanced Surfaces Allowed To Be Temporarily Disabled

These may be commented out after Trellis removal if they block the first pass:

- MCP destructive preview tools.
- Advanced MCP write tools.
- Bridge manifest generation.
- Component bridge runtime.
- Generated operation handle package exports.
- Trusted replay flows.
- Operation-specific tests.

Every disabled surface must be tracked in:

- `/Users/matthias/Git/workspace/ginko-cms/docs/plans/trellis-cutover-disabled-surfaces.md`

Required tracker columns:

- surface
- file path
- why disabled
- owner phase
- restore acceptance criterion

### Phase 1 Acceptance Criteria

- [x] `rg "@lupinum/trellis|@lupinum/trellis-bridge|@lupinum/trellis-eslint|#trellis|defineTrellis|defineCaller|defineOperation|operationPreview|operationPreviewValidator|defineMcpApp|OperationHandle|trellis operations generate|__trellis_auth_engine__" /Users/matthias/Git/workspace/ginko-cms` returns no live source references except this plan and explicit disabled-surface notes.
- [x] Broad stale-name audit outside plan docs and explicit `TODO(trellis-cutover)` markers returns no matches.
- [x] Package metadata no longer depends on Trellis.
- [x] No Trellis generated operation handles remain.
- [x] Any commented surfaces have `TODO(trellis-cutover)` and are listed in the disabled-surface tracker.
- [x] The repo may still fail typecheck/build.
- [x] Phase 0 decisions are referenced in comments or tracker notes where they affect disabled surfaces.

## Phase 2: First Bootable Repo Slice

Goal: Nuxt prepare or basic type resolution starts again without Trellis.

Allowed:

- Temporarily disabled advanced surfaces.
- Placeholder Ginko-owned operation registry entries that throw clear "not restored" errors.
- Narrow type stubs for Ginko-owned code only.

Not allowed:

- Reintroducing Trellis.
- Adding `#trellis` aliases.
- Adding compatibility packages.
- Recreating the Trellis operation DSL.

Likely files to touch:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/convex.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/runtime/pages/studio-host.vue`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/vitest.config.ts`
- `/Users/matthias/Git/workspace/ginko-cms/eslint.config.mjs`

Acceptance criteria:

- [ ] Nuxt type alias resolution recognizes `#convex/api`.
- [ ] `better-convex-nuxt` module is installed by CMS module setup.
- [ ] No Nuxt module setup path references Trellis.
- [ ] Disabled advanced surfaces are isolated and do not block Nuxt prepare.
- [ ] First diagnostic command has a clear next error if it still fails.

Suggested diagnostic command for this phase:

```bash
pnpm exec nuxi prepare packages/cms
```

## Phase 3: Convex Component Slice

Goal: Convex component code compiles/discovers without Trellis.

Current hotspots:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/functions.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/componentBridge.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/members.ts`
- operation definitions inside assets, backup, entries, members, revalidation, and site data modules

Tasks:

- [ ] Replace Trellis `defineTrellis` usage with plain Convex exports and explicit helper composition.
- [ ] Replace `defineCaller` usage with direct Convex `query`, `mutation`, and `action` builders or Ginko-owned thin wrappers.
- [ ] Replace forwarded caller handling with explicit args/context passed through Ginko code.
- [ ] Delete `unsafe` and `ActingFor` concepts unless a product-specific equivalent is required and documented.
- [ ] Replace public/protected/admin builders with explicit helpers that enforce Ginko product invariants.
- [ ] Move destructive confirmation table access into Ginko-owned operation runtime.
- [ ] Delete `createComponentBridge` usage or replace it with a minimal Ginko-owned component bridge if the package still needs a component install surface.

Builder guidance:

- Good: `publicQuery`, `memberMutation`, `adminMutation` as small Ginko helpers if they enforce a real product invariant.
- Bad: `defineCaller` clone with generic caller manifests.
- Bad: generic tenant/permission framework in `better-convex-nuxt`.

Acceptance criteria:

- [ ] Convex source has no Trellis imports.
- [ ] Convex source exports are discoverable by Convex codegen/dev.
- [ ] Function access rules are explicit in Ginko-owned code.
- [ ] Product authorization is enforced in Convex, not only in Studio or MCP.
- [ ] Any disabled Convex functions are listed in the disabled-surface tracker.

Suggested diagnostics for this phase:

```bash
pnpm --filter @lupinum/ginko-convex exec convex codegen
pnpm --filter @lupinum/ginko-convex exec convex dev --once
```

Use the actual package filter/name if it changes during Phase 1.

## Phase 4: Better Auth / CMS Member Model Decision

Goal: choose one source of truth for membership and roles.

Current hotspot:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/members.ts`

Decision A: replace Ginko `members` table with Better Auth Organization.

Use this if CMS membership is mostly:

- user belongs to organization/project
- role membership
- invitations
- member lifecycle
- session-aware access control

Hard cutover plan:

- [ ] Map existing CMS member fields to Better Auth organization/member/role/invitation concepts.
- [ ] Delete the Ginko-owned duplicate member source of truth.
- [ ] Replace member queries/mutations with Better Auth-backed reads and product-specific Convex checks.
- [ ] Keep CMS-specific role-to-capability mapping in Ginko.
- [ ] Migrate existing fixture/demo data in one direction only.
- [ ] Remove tests that assert the old member table is canonical.
- [ ] Add invariant tests that product writes verify membership through the new canonical source.

Tradeoff:

- Less custom member lifecycle code.
- Stronger alignment with auth/session state.
- Requires careful mapping for project/site-specific authorization.

Decision B: keep Ginko `members` as canonical product membership.

Use this if membership is deeply CMS-specific:

- membership is scoped below organization level
- roles depend on project/site/collection state
- audit or publishing workflows require historical membership snapshots
- Better Auth organization shape is too generic for CMS invariants

Hard cutover plan:

- [ ] Keep Ginko `members` table as the only product membership source of truth.
- [ ] Use Better Auth for users and sessions only.
- [ ] Store Better Auth user/session ids as references.
- [ ] Delete any duplicate Better Auth organization/member mirroring.
- [ ] Add invariant tests proving product writes use Ginko membership checks.

Tradeoff:

- More Ginko-owned lifecycle code.
- Product rules remain explicit and local.
- Better Auth still handles authentication but not CMS membership semantics.

Recommendation:

Start with Decision B for the Trellis hard cutover. Keep Ginko `members` canonical while Trellis is removed, because Phase 0 proved Better Auth Organization is viable for generic org/member/team workflows but did not prove a full mapping for Ginko's CMS/project/site/collection semantics.

Only choose Decision A if the Phase 4 agent can prove all current CMS member behavior maps cleanly to Better Auth Organization and is ready to delete the Ginko member source in the same hard cutover. Do not half-mirror Better Auth org members and Ginko members. That creates two sources of truth and will be harder to debug than either clean choice.

Acceptance criteria:

- [ ] One canonical membership source is documented.
- [ ] Product authorization reads from that source only.
- [ ] Better Auth is not mirrored into a second canonical member table.
- [ ] Convex still enforces CMS product invariants.
- [ ] If Better Auth Organization is deferred, the deferral is explicit and does not block the Trellis cutover.

## Phase 5: Studio Slice

Goal: Studio host works through `better-convex-nuxt` and direct Convex APIs.

Current hotspot:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/runtime/pages/studio-host.vue`

Tasks:

- [ ] Replace `import { api } from '#trellis/api'` with `import { api } from '#convex/api'`.
- [ ] Replace private `__trellis_auth_engine__` usage with public `useConvexAuth`.
- [ ] Use `useConvex`, `useConvexQuery`, `useConvexMutation`, and `useConvexAction` where appropriate.
- [ ] Keep Studio auth bridge logic in Ginko if it is CMS-specific.
- [ ] Do not add auth bridge internals to `better-convex-nuxt`.
- [ ] Ensure Studio SPA can query/mutate through the host Convex client.
- [ ] Keep product authorization in Convex functions, not in Studio-only guards.

Acceptance criteria:

- [ ] Studio host imports `#convex/api`.
- [ ] Studio host uses public `better-convex-nuxt` auth/composable surface.
- [ ] Studio can read the current auth state.
- [ ] Studio can perform at least one read-only CMS query through the host.
- [ ] Temporarily disabled Studio actions are listed in the disabled-surface tracker.

Suggested smoke:

```bash
pnpm --filter @lupinum/ginko-cms dev
```

Then verify in browser mode after the dev server starts. Do not perform this smoke until later validation phases.

## Phase 6: Operation / Destructive Confirmation Slice

Goal: restore CMS operations without Trellis generated handles.

Current operation families:

- site data: delete site data block
- backup: delete backup artifact
- members: remove member
- revalidation: retry revalidation job
- assets: move asset, delete asset, purge asset
- entries: publish, unpublish, archive, unarchive, rollback
- drafts: save draft, revert draft to published
- tree: create entry, delete entry

Tasks:

- [ ] Define Ginko-owned operation ids.
- [ ] Define explicit operation descriptor shape.
- [ ] Define explicit preview and execute maps.
- [ ] Move destructive preview logic into operation descriptors or per-domain functions.
- [ ] Move confirmation storage into Ginko-owned Convex code.
- [ ] Preserve audit/activity writes in product code.
- [ ] Replace generated operation handles with direct operation ids and typed args.
- [ ] Keep MCP and Studio as callers of the same operation policy.
- [ ] Delete codegen unless repeated manual maintenance becomes a real problem.

Suggested minimal shape:

```ts
type CmsOperationId =
  | "assets.delete"
  | "entries.publish"
  | "members.remove";

type CmsOperationDescriptor<Args, Preview> = {
  id: CmsOperationId;
  destructive: boolean;
  preview: (ctx: CmsOperationContext, args: Args) => Promise<Preview>;
  execute: (ctx: CmsOperationContext, args: Args) => Promise<unknown>;
};
```

This is a product registry, not a reusable framework. Keep it inside Ginko.

Acceptance criteria:

- [ ] No Trellis generated handles are used.
- [ ] Operation preview and execute use one Ginko-owned policy path.
- [ ] Destructive operations require confirmation where required.
- [ ] Studio and MCP call the same operation runtime.
- [ ] Audit/activity writes are preserved.
- [ ] Disabled operation families are tracked explicitly.

## Phase 7: Bridge / Installer Slice

Goal: remove `@lupinum/trellis-bridge` and decide whether bridge rendering still needs generated glue.

Current hotspots:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/componentBridge.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/bridge-manifest.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/cli/bridge.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/cli/forwarding.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/convex/manifest.*`

Decision A: simplified direct templates.

Use if the bridge only installs a known CMS component shape.

Tasks:

- [ ] Delete generic bridge manifest layer.
- [ ] Generate or copy direct Convex/CMS template files.
- [ ] Keep the template explicit and Ginko-owned.
- [ ] Remove bridge package exports.

Decision B: Ginko-owned generated glue.

Use only if dynamic project installation really requires generation.

Tasks:

- [ ] Keep generation local to Ginko.
- [ ] Generate only CMS-specific glue.
- [ ] Do not publish a generic bridge package.
- [ ] Add tests that prove generated glue matches the installed component contract.

Recommendation:

Start with Decision A. Phase 0 proved direct starters/templates can work without bridge manifests, generated operation handles, forwarded caller frameworks, or Trellis concepts. Bridge frameworks are expensive and easy to turn into a second platform. Use generated glue only when direct templates cannot express the install path.

Acceptance criteria:

- [ ] `@lupinum/trellis-bridge` is absent from package metadata and source.
- [ ] Installed component shape is documented in Ginko.
- [ ] No generic bridge package exists unless justified by a concrete install requirement.
- [ ] Installer path uses `better-convex-nuxt` only for general Convex/Nuxt integration.
- [ ] If generated glue remains, the plan names the exact install requirement that direct templates cannot satisfy.

## Phase 8: MCP Slice

Goal: restore MCP as transport only.

Current hotspots:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/server/mcp/_shared/project-tool-runtime.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/server/mcp/**`

Tasks:

- [ ] Delete `defineMcpApp` usage.
- [ ] Delete Trellis MCP operation handle imports.
- [ ] Replace MCP runtime with Ginko-owned server utilities.
- [ ] Route all product writes through the CMS operation runtime.
- [ ] Restore destructive tool previews through operation preview.
- [ ] Restore confirmed execution through operation execute.
- [ ] Ensure MCP cannot bypass confirmation and audit rules.
- [ ] Decide service/API-key auth direction.

Auth direction:

- For this Trellis cutover, prefer Ginko-owned service actors/credentials or the existing CMS equivalent over Better Auth API keys for MCP writes.
- Treat Better Auth API keys as a future auth-domain option, not the default migration path.
- Keep service authorization separate from product authorization.
- Convex/Ginko still checks whether the authenticated service/user may perform the product action.
- Product routes must re-check CMS organization/project/site existence and authorization even if a Better Auth API key verifies successfully.

Acceptance criteria:

- [ ] MCP imports no Trellis package and no `#trellis` alias.
- [ ] MCP write tools call Ginko operation runtime.
- [ ] Destructive MCP tools return preview before execute.
- [ ] Confirmation and audit behavior matches Studio path.
- [ ] Service/API-key auth source is documented.
- [ ] API-key verification, if used, is not treated as product authorization.
- [ ] Disabled MCP tools are tracked and have restore criteria.

## Phase 9: Final Validation

Run final validation only after the stabilization slices are restored.

Required checks:

- [ ] Format.
- [ ] Lint.
- [ ] Typecheck.
- [ ] Convex codegen/dev once.
- [ ] Nuxt prepare.
- [ ] Nuxt build or package build.
- [ ] Package e2e.
- [ ] Browser verification.
- [ ] Studio workflow smoke.
- [ ] MCP smoke if MCP is enabled.

Suggested command sequence:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm --filter @lupinum/ginko-convex exec convex codegen
pnpm --filter @lupinum/ginko-convex exec convex dev --once
pnpm exec nuxi prepare packages/cms
pnpm build
pnpm test
```

Adjust package filters to the final package names after Phase 1. Do not run e2e or browser checks until a dev server slice is intentionally being verified.

Starter/package validation note from Phase 0:

- If a package or starter extends `.nuxt/tsconfig.json`, run `nuxi prepare` before tests/typecheck.
- A missing `.nuxt/tsconfig.json` can look like unrelated product test failures. Treat it as a setup-order issue first.
- Keep local auth-site warnings separate from failures. Warnings about missing `convex.siteUrl` are expected in non-dev-server local checks unless the check needs signed-in browser auth.

Browser verification checklist:

- [ ] Studio host loads.
- [ ] Auth state resolves.
- [ ] A read-only CMS query returns data.
- [ ] A non-destructive mutation succeeds.
- [ ] A destructive operation shows preview.
- [ ] Confirmed destructive operation writes audit/activity.
- [ ] Disabled surfaces are either restored or documented as intentionally out of scope.

MCP smoke checklist:

- [ ] MCP server starts.
- [ ] Read-only tool works.
- [ ] Destructive preview tool works.
- [ ] Confirmed execute path works.
- [ ] Unauthorized write is rejected by product policy.

## Agent Work Breakdown

### Agent 0: Foundation Spike Agent

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/docs/plans/trellis-cutover-spike-results.md`
- temporary playground or worktree used for Phase 0 spikes
- any small general `better-convex-nuxt` change proven necessary by the spikes

Tasks:

- Run Spike 0A through Spike 0E.
- Keep spike code isolated from production Ginko migration code.
- Record yes/no/partial results.
- Recommend any general `better-convex-nuxt` improvements.
- Decide or narrow membership, service auth, component/bridge, and operation runtime direction.

Depends on: none.

Must not edit:

- production Ginko migration code
- Trellis compatibility paths
- generated operation handle replacements in production code

### Agent 1: Hard Cutover

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/pnpm-workspace.yaml`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/package.json`
- generated operation handle/ref files
- root scripts and eslint/vitest references

Tasks:

- Remove all Trellis dependencies and scripts.
- Delete generated operation files.
- Remove Trellis workspace paths.
- Leave disabled-surface tracker.

Depends on: Agent 0 spike results.

Must not edit: detailed operation implementations unless required to remove imports.

### Agent 2: Nuxt Module And Alias Slice

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/convex.ts`
- CMS module tests that only assert module dependencies/aliases

Tasks:

- Install/configure `better-convex-nuxt`.
- Replace `#trellis/api` expectations with `#convex/api`.
- Remove Trellis module setup.

Depends on: Agent 1 package changes.

### Agent 3: Convex Runtime Slice

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/functions.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/componentBridge.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/**`

Tasks:

- Replace Trellis caller builders.
- Add Ginko-owned explicit helpers.
- Remove forwarded caller/runtime dependencies.
- Restore Convex codegen/dev.

Depends on: Agent 1.

Avoid overlap with Agent 6 operation internals by agreeing on `packages/convex/src/operations/*` ownership first.

### Agent 4: Auth And Membership Decision

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/members.ts`
- Better Auth integration docs/tests
- membership-related Studio/server code

Tasks:

- Choose canonical member source.
- Remove duplicate source.
- Wire Better Auth only where it is auth-domain state.

Depends on: Agent 3 basic Convex helpers.

### Agent 5: Studio Slice

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/runtime/pages/studio-host.vue`
- Studio runtime composables that import Trellis
- public auth components that import Trellis composables

Tasks:

- Replace `#trellis/api` with `#convex/api`.
- Replace private auth engine usage with `useConvexAuth`.
- Restore host-to-SPA query/mutation path.

Depends on: Agent 2 and enough of Agent 3 for a read query.

### Agent 6: Operations Slice

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/operations/**`
- operation definitions currently embedded in assets/backup/entries/members/revalidation/siteData modules
- operation tests

Tasks:

- Replace `defineOperation`.
- Replace preview/execute descriptors.
- Restore destructive confirmations and audit/activity.

Depends on: Agent 3.

### Agent 7: Bridge / Installer Slice

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/bridge-manifest.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/cli/bridge.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/cli/forwarding.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/convex/manifest.*`
- bridge-related installer tests

Tasks:

- Remove `@lupinum/trellis-bridge`.
- Choose direct templates or Ginko-owned generated glue.
- Keep bridge concepts CMS-specific.

Depends on: Agent 2 package/module direction.

### Agent 8: MCP Slice

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/server/mcp/**`

Tasks:

- Remove Trellis MCP framework.
- Restore MCP as transport.
- Route writes through operation runtime.
- Restore destructive preview and confirmation.

Depends on: Agent 6 operation runtime and Agent 4 auth direction.

### Agent 9: Tests, Docs, And Final Validation

Owns:

- `/Users/matthias/Git/workspace/ginko-cms/test/**`
- `/Users/matthias/Git/workspace/ginko-cms/docs/**`
- examples/starters/fixtures

Tasks:

- Rewrite tests to enforce no Trellis.
- Update docs and examples.
- Run final validation.
- Remove or close disabled-surface tracker items.

Depends on: all implementation slices.

## Risk Register

| Risk | Impact | Mitigation | First Diagnostic |
| --- | --- | --- | --- |
| Phase 0 is skipped | Hard cutover discovers foundation gaps too late | Require spike results before Agent 1 starts | check `docs/plans/trellis-cutover-spike-results.md` |
| Phase 0 turns into early migration | Ginko gets old/new paths before hard cutover | Keep spikes outside production migration code and delete/promote deliberately | `git diff -- packages/` |
| Spike results identify missing foundation APIs | Migration blocks on `better-convex-nuxt` uncertainty | Add only small general helpers or explicitly defer as non-blocking | review target repo diff |
| `functions.ts` depends on Trellis caller builders | Convex codegen fails broadly | Replace with explicit Ginko helpers before restoring operation details | `pnpm --filter @lupinum/ginko-convex exec convex codegen` |
| Operation codegen removal breaks MCP and tests | MCP write tools cannot resolve handles | Create explicit Ginko operation registry and route Studio/MCP through it | `rg "operationHandles|operationRefs|OperationHandle" packages test` |
| Studio host depends on private Trellis auth engine | Studio cannot authenticate Convex client | Use public `useConvexAuth` from `better-convex-nuxt` | Browser auth-state smoke |
| Better Auth membership decision is delayed | Duplicate member state appears | Decide one canonical source in Phase 4 before restoring member writes | review `members.ts` and Better Auth config |
| Bridge replacement grows into framework | New Trellis-like package emerges | Prefer direct templates; require concrete acceptance criterion before adding generation | inspect `bridge-manifest.ts` replacement size |
| MCP bypasses product policy | Unauthorized writes or missing destructive confirmation | MCP must call Ginko operation runtime only | MCP destructive preview/execute smoke |
| Tests preserve Trellis assumptions | CI blocks correct migration | Rewrite package-boundary tests to assert no Trellis | `rg "trellis|#trellis" test vitest.config.ts eslint.config.mjs` |
| better-convex-nuxt receives CMS semantics | Foundation becomes Trellis 2 | Only add general Nuxt/Convex/Auth primitives to foundation | code review target repo diffs |

## Completion Checklist

- [x] Phase 0 spike results are recorded.
- [x] Any required `better-convex-nuxt` foundation changes are implemented or explicitly deferred.
- [x] Better Auth membership direction is decided.
- [x] Better Auth API-key/service auth direction is decided.
- [x] Component/bridge direction is decided.
- [x] Ginko operation runtime shape is decided.
- [x] No `@lupinum/trellis` imports.
- [x] No `@lupinum/trellis-bridge` imports.
- [x] No `@lupinum/trellis-eslint` imports.
- [x] No Trellis package dependencies.
- [x] No Trellis workspace paths.
- [x] No `#trellis` imports or aliases.
- [x] No `defineTrellis`.
- [x] No `defineCaller`.
- [x] No `defineOperation`.
- [x] No `defineMcpApp`.
- [x] No `OperationHandle`.
- [x] No `trellis operations generate` scripts.
- [x] No `__trellis_auth_engine__`.
- [x] No Trellis generated operation handles.
- [x] No old bridge package dependency.
- [x] `better-convex-nuxt` is used directly for Nuxt/Convex/Auth integration.
- [x] `#convex/api` is the generated API import path.
- [x] Ginko-owned operation runtime is documented.
- [ ] Membership source of truth is documented.
- [ ] MCP is transport only and routes writes through product policy.
- [ ] Destructive confirmation path works without Trellis.
- [ ] Audit/activity path works without Trellis.
- [ ] All temporarily commented surfaces are restored or explicitly tracked.
- [ ] Final validation has run and results are recorded.
