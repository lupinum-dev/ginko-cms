# Move Ginko CMS Off Trellis

## Goal

Remove Trellis from Ginko CMS and make the product use the direct Convex + Nuxt +
Better Auth shape proven by `/Users/matthias/Git/convex/better-convex-nuxt`.

This is a simplification refactor, not a feature expansion. The end state should
have fewer generated files, fewer package dependencies, fewer secrets, fewer
release moving parts, and one obvious path for every CMS operation.

## Recommendation

Do a hard cutover. Do not keep Trellis and non-Trellis paths side by side.

The simpler target is:

- `better-convex-nuxt` owns Nuxt runtime wiring for Convex client injection,
  SSR query/mutation/action calls, Better Auth token sync, auth components, and
  client composables.
- Ginko CMS owns CMS domain policy, Studio routes, public content routes,
  collection contract sync, MCP product tools, assets, publishing, backups, and
  destructive confirmation semantics.
- The host app owns normal Convex files: `convex/convex.config.ts`,
  `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`, `convex/schema.ts`,
  and generated `convex/_generated/api`.
- Studio and server code call real Convex function references from `#convex/api`.
- Public website reads call the Ginko CMS Convex component directly through the
  generated Convex API or `ConvexHttpClient`.
- MCP remains hand-written and authorization is enforced by Convex functions,
  not by tool visibility or generated wrappers.

Do not build a replacement Trellis inside Ginko. That would keep the cost while
changing the names.

## Research Summary

### Current Trellis Coupling

The current code depends on Trellis in these main areas:

- Root scripts generate operation descriptors with `trellis operations generate`.
- `packages/cms/package.json` and `packages/convex/package.json` depend on
  `@lupinum/trellis` and `@lupinum/trellis-bridge`.
- `packages/cms/src/module.ts` injects `@lupinum/trellis` as a Nuxt module
  dependency and configures Trellis auth/permissions.
- `packages/cms/src/module/convex.ts` and
  `packages/cms/src/module/bridge-manifest.ts` use `@lupinum/trellis-bridge`
  to render and validate generated host bridge files.
- `packages/cms/src/bridge/*` defines bridge registries/factories for generated
  host wrappers.
- `packages/convex/src/functions.ts` uses `defineTrellis`,
  `defineCaller`, forwarded callers, destructive operation tables, and trusted
  replay.
- `packages/convex/src/componentBridge.ts` creates the component bridge and
  identity forwarding behavior.
- `packages/convex/src/auth/checks.ts`, `members.ts`, `assets.ts`, `backup.ts`,
  `entries/*`, `siteData.ts`, `revalidation.ts`, and related files use Trellis
  guard and operation helpers.
- Studio host code imports `#trellis/api` and reads Trellis auth engine state.
- Studio SPA helpers type against Trellis composables and expect a host-provided
  Trellis API object.
- Server public API, MCP middleware, MCP handlers, resources, prompts, and tools
  import `#trellis/api` and `#trellis/mcp`.
- CLI setup, push, migrate, and deploy paths sign `_trellisForwarding` envelopes.
- Tests assert Trellis package ranges, generated bridge files, forwarding args,
  Trellis permission wiring, operation handle generation, and Trellis-owned
  safety behavior.
- Docs and release scripts include Trellis as part of the public setup and
  release tuple.

### What better-convex-nuxt Provides

`better-convex-nuxt` is not a Trellis replacement. It provides the pieces Ginko
actually needs at the Nuxt boundary:

- Nuxt module setup and aliases, including `#convex/api` and `#convex/server`.
- Client composables: `useConvexQuery`, `useConvexMutation`,
  `useConvexAction`, pagination, file upload, storage URL helpers, connection
  state, and auth state.
- Server helpers: `serverConvexQuery`, `serverConvexMutation`,
  `serverConvexAction`, with Better Auth session-cookie token exchange.
- Better Auth proxy and Convex JWT sync through `/api/auth/convex/token`.
- `useConvexAuth`, `useConvexUser`, auth components, and
  `createBetterConvexAuthClient`.
- Optional UI permission composable factory. Its own source says this is a UX
  helper; backend authorization must remain in Convex functions.

Its own planning notes explicitly say not to put these in core:

- generic permission DSLs,
- MCP tools,
- generated wrappers for every Convex function,
- tenant frameworks,
- SaaS/organization abstractions,
- product authorization outside Convex.

That matches the Ginko CMS simplification direction.

### Non-Goals

- Do not introduce tenants, workspaces, organizations, or dynamic roles.
- Do not move CMS authorization into Better Auth, Nuxt middleware, MCP tool
  visibility, or Studio orchestration.
- Do not keep `_trellisForwarding` compatibility.
- Do not keep generated operation descriptor files.
- Do not keep `@lupinum/ginko-cms/bridge` as a public bridge factory API unless
  a released consumer truly depends on it and a maintainer explicitly chooses a
  deprecation window.
- Do not add a new generic adapter/service layer between Ginko and Convex.

## Target Architecture

### Packages

Keep the three-package boundary:

- `@lupinum/ginko-cms`: Nuxt module, Studio host, CLI, server routes, MCP
  routes, public content provider integration, docs.
- `@lupinum/ginko-cms-convex`: Convex component implementation and CMS domain
  functions.
- `@lupinum/ginko-cms-contract`: framework-neutral validators, schemas, types,
  and content contracts.

Add or require `better-convex-nuxt` at the Nuxt app integration layer.

Remove:

- `@lupinum/trellis`
- `@lupinum/trellis-bridge`
- `@lupinum/trellis-eslint`
- generated operation descriptor artifacts under `packages/convex/generated`
  and `packages/convex/src/generated`
- bridge manifest output under `packages/cms/convex/manifest.*`
- public `./bridge` package export if no explicit compatibility exception is
  approved

### Host App Files

After migration, `ginko-cms init` should create or validate only normal,
app-owned Convex setup:

- `convex/convex.config.ts` mounts `@convex-dev/better-auth` and
  `@lupinum/ginko-cms-convex`.
- `convex/auth.config.ts` configures Convex auth provider state.
- `convex/auth.ts` follows the direct `@convex-dev/better-auth` pattern.
- `convex/http.ts` registers Better Auth routes.
- `convex/schema.ts` is app-owned and may include app tables.

Delete generated CMS bridge modules from new installs:

- `convex/ginkoCms/*`
- `convex/ginkoCmsMcp.ts`
- `convex/ginkoCms/_caller.ts`

The host should run Convex codegen and use the normal generated API:

```ts
import { api, components, internal } from '#convex/api'
```

### Studio Runtime

Replace the Trellis host bridge with a smaller host context:

- host page imports `api` from `#convex/api`;
- host page reads auth state from `useConvexAuth`;
- host page passes `api`, `$convex`, auth refs, and CMS runtime config into
  `window.__GINKO_CMS__`;
- Studio SPA helpers use the existing host context and call
  `ConvexClient.onUpdate`, `mutation`, and `action` directly.

Specific cleanup:

- Change `packages/cms/src/runtime/pages/studio-host.vue` from `#trellis/api`
  to `#convex/api`.
- Replace `__trellis_auth_engine__` access with `useConvexAuth()` output.
- Rename comments and types that say Trellis API/auth engine.
- In Studio composables, replace Trellis-only imported types with local minimal
  types or types from `better-convex-nuxt` if exported.
- Keep `useCmsStudioQuery` and `useStudioConvex` only if they add CMS-specific
  gating/error normalization. Do not wrap every Convex primitive if the direct
  `better-convex-nuxt` composable is enough.

### Backend Function Builders

Replace `defineTrellis` with local, boring builders around Convex's generated
`query`, `mutation`, and `action`.

The local builder should do only CMS-required work:

- resolve the caller from `ctx.auth.getUserIdentity()`;
- resolve CMS app identity from members/MCP keys;
- run a direct guard function;
- provide `ctx.appIdentity()` to handlers;
- expose public/protected/internal functions with explicit reads where needed.

The guard model should be plain functions:

```ts
type CmsGuard = (identity: CmsAppIdentity) => boolean

export function requireCms(identity: CmsAppIdentity, guard: CmsGuard, message?: string) {
  if (!guard(identity)) {
    throwCmsError('FORBIDDEN', message ?? 'Not allowed.')
  }
}
```

Delete generic Trellis guard objects, `defineGuard`, `open`, `can`,
`definePermission`, `defineAccessContext`, and `defineRecordAccess`.

Keep CMS permission keys as contract data because Studio and MCP need a stable
capability vocabulary. Generate the permission map directly in
`members.getAccessContext`.

### Caller And Identity

Simplify to one source of identity:

- Browser/user calls use Convex auth identity from Better Auth JWT.
- MCP calls use an explicit service actor path.
- CLI setup/sync uses Convex admin auth and explicit internal functions.
- Anonymous public reads stay anonymous.

Delete `_trellisForwarding`, bridge forwarding secrets, and forwarding envelope
validation. That removes:

- `CONVEX_IDENTITY_FORWARDING_KEY`
- `GINKO_CMS_COMPONENT_FORWARDING_KEY`
- `getCmsComponentForwardingKey`
- `cmsDeployCaller` if it only existed for forwarding/audit through bridge
  wrappers

For MCP, do not masquerade as a Better Auth user. Keep service actor identity
explicit. If Convex admin calls need an acting identity, keep the current
`setAdminAuth(deployKey, actingAsIdentity)` shape but route it through
CMS-owned internal functions that verify MCP key state and membership.

### Destructive Operations

Destructive preview/confirmation is a real CMS invariant and should survive.
But it should be CMS-owned Convex code, not generated Trellis operation metadata.

Keep these tables initially:

- `destructiveConfirmations`
- `destructiveAuditLog`

Remove:

- `trustedReplay`, unless a non-Trellis use remains after CLI/MCP cutover;
- operation descriptor generation;
- generated operation handles;
- Trellis `defineOperation`, `previewOf`, `operationPreview`,
  `operationIssue`, `operationEffect`, and `operationPreviewValidator` imports.

Add a small `packages/convex/src/lib/operations.ts` with only the CMS needs:

- preview result types and validators;
- `createOperationPreview`;
- `blockedOperationPreview`;
- `operationIssue`;
- `operationEffect`;
- `previewDestructiveOperation`;
- `executeDestructiveOperation`.

The execute path should require `_confirmationToken` for destructive actions,
hash args, compare preview hash/version hash, redeem once, and write audit.

Do not make this generic across projects. It is the Ginko CMS destructive action
contract.

### MCP

Keep MCP opt-in and product-specific.

Replace Trellis MCP helpers with direct Nuxt MCP Toolkit definitions:

- `defineMcpHandler` from `@nuxtjs/mcp-toolkit/server` or the toolkit's current
  direct API.
- Hand-written tools/resources/prompts.
- Zod or existing schema validation directly in tool definitions.
- Tool execution calls Convex through the local MCP Convex caller.

Replace `projectTool` with a smaller CMS helper only if it removes real
duplication:

- capability gate;
- direct query call;
- destructive preview/execute convention;
- consistent MCP response envelope.

Keep this invariant: unauthorized `tools/call` must fail in Convex even if the
tool is visible.

### Public API And Content Provider

Replace `#trellis/api` with `#convex/api` in server routes.

For public content routes, call:

- `serverConvexQuery(event, api.ginkoCms.public.page, args, { auth: 'none' })`,
  or
- `ConvexHttpClient.query(api.ginkoCms.public.page, args)` if no Nuxt auth/session
  handling is needed.

The public projection model remains valid. Do not delete `publicEntries` or
`publicRoutes`; they are rebuildable public read models with existing tests and
ADRs.

### CLI

Change CLI commands from bridge-driven to direct Convex/admin-driven:

- `init`: write minimal Convex setup files, not bridge wrappers.
- `doctor`: validate `better-convex-nuxt`, `convex`, `@convex-dev/better-auth`,
  `better-auth`, and `@lupinum/ginko-cms-convex` setup.
- `deploy`: run the Convex deploy command, then call contract sync through
  direct internal component functions using `CONVEX_DEPLOY_KEY`.
- `push`: direct internal contract sync; no forwarding key.
- `migrate`: direct internal migration functions; no forwarding key.
- `bridge`: delete the command group unless a maintainer explicitly keeps a
  short deprecation command that only prints the new setup path.

No new setup should mention Trellis or forwarding secrets.

### Docs And Release

Update docs to say:

- Ginko CMS uses Convex, Better Auth, and `better-convex-nuxt`.
- Trellis is no longer part of the install, setup, release tuple, or mental
  model.
- `CONVEX_DEPLOY_KEY` is the only admin/server setup secret Ginko needs for
  setup/sync.
- `GINKO_FIRST_OWNER_EMAIL` remains for first-owner bootstrap.

Update or replace ADR 0003. Its old decision, "Trellis is internal", should
be superseded by "Ginko uses direct Convex/Nuxt integration".

## Migration Phases

### Phase 0: Freeze Acceptance Criteria

Do this before editing:

- Decide whether this is a breaking release. Recommendation: yes.
- Decide whether `@lupinum/ginko-cms/bridge` gets deleted immediately.
  Recommendation: delete for unreleased/internal consumers; add a semver-major
  migration note for any published consumer.
- Approve the full removed-public-surface list, not only the obvious Trellis
  package imports.
- Decide whether existing deployments with generated bridge files must be
  migrated automatically. Recommendation: no automatic migration; provide a
  clean manual cleanup checklist.

Initial removal table:

| Package | Removed surface | Replacement | Release action |
| --- | --- | --- | --- |
| `@lupinum/ginko-cms` | `./bridge` | `#convex/api` refs plus direct CMS setup files | Semver-major, changelog, consumer cleanup |
| `@lupinum/ginko-cms` | `./convex/manifest` | no manifest; `ginko-cms init` validates direct Convex setup | Semver-major, package E2E export check |
| `@lupinum/ginko-cms-convex` | `./component-bridge` | direct component API refs from generated Convex API | Semver-major, package E2E export check |
| `@lupinum/ginko-cms-convex` | `./operation-handles/mcp` | explicit preview/execute refs in hand-written MCP tools | Semver-major, MCP test update |

Acceptance:

- `move-off-trellis.md` is accepted as the migration source of truth.
- No compatibility shim is approved by default.
- Every removed export has a named replacement or an explicit "deleted without
  replacement" note in the changelog.

### Phase 1: Package And Script Cutover

Edit package metadata and scripts first.

Remove:

- Trellis dependencies from root, CMS package, Convex package, compatibility
  matrix, package e2e tests, and lockfile.
- `operations:generate:*` and `operations:check` scripts.
- Trellis package packing from `scripts/package-e2e.mjs`.
- Trellis release checks from `scripts/foundation-verify.mjs`.
- `@lupinum/trellis-eslint` from lint flow.

Add:

- `better-convex-nuxt` as the Nuxt module dependency/peer expected by Ginko CMS
  integration.
- direct checks that `#convex/api` resolves in consumers.

Acceptance:

- `rg "@lupinum/trellis|@lupinum/trellis-bridge|trellis operations" package.json packages scripts`
  only reports intentionally pending source files for later phases.
- `pnpm install` updates the lockfile without Trellis packages.

### Phase 2: Replace Nuxt Module Wiring

Change `packages/cms/src/module.ts`:

- remove `trellis?: Record<string, unknown>` from module option extensions;
- stop writing `moduleOptions.trellis`;
- replace module dependency `@lupinum/trellis` with `better-convex-nuxt`;
- configure `better-convex-nuxt` auth route protection for Studio;
- configure permissions only as UI helper if useful, not as backend policy;
- update tests that assert Trellis permission wiring.

Acceptance:

- Nuxt module setup no longer adds `@lupinum/trellis`.
- Studio auth routes still redirect anonymous users to the configured Studio
  sign-in path.

### Phase 3: Delete Generated Bridge System

Delete or retire:

- `packages/cms/src/bridge/*`
- `packages/cms/src/module/bridge-manifest.ts`
- `packages/cms/src/module/convex.ts` bridge drift logic
- `packages/cms/convex/manifest.*`
- generated bridge fixtures under `test/fixtures/basic/convex/ginkoCms*`
- generated bridge files under `playground/convex/ginkoCms*`
- public package export `./bridge`
- `ginko-cms bridge` CLI commands

Replace setup validation with minimal direct checks:

- `convex/convex.config.ts` mounts Better Auth and Ginko CMS Convex component.
- `convex/auth.ts`, `convex/auth.config.ts`, and `convex/http.ts` exist or can
  be created.
- host app has `better-convex-nuxt`, `convex`, `@convex-dev/better-auth`,
  `better-auth`, and `@lupinum/ginko-cms-convex`.

Acceptance:

- New `ginko-cms init` creates no `convex/ginkoCms/*` files.
- `rg "@lupinum/ginko-cms/bridge|trellis-bridge|_trellisForwarding" packages/cms test playground`
  returns no live code.

### Phase 4: Backend Builder Cutover

Replace `packages/convex/src/functions.ts` and friends.

Create CMS-local helpers:

- `resolveCmsCaller(ctx)` from Convex auth identity;
- `resolveCmsAppIdentity(ctx, caller)`;
- `publicQuery`, `protectedQuery`, `protectedMutation`, `protectedAction`,
  and direct internal variants if needed;
- plain guard helpers.

Update all Convex source files:

- replace `callerQuery.public/protected` with local builders;
- replace `callerMutation.protected` and `callerAction.protected`;
- replace Trellis guards with plain functions;
- replace `ctx.appIdentity()` by the local augmented context helper;
- remove `unsafeRaw` and `unsafePermit`, or keep only a named CMS-local escape
  hatch with tests proving it is not exposed publicly.

Acceptance:

- `rg "@lupinum/trellis/(auth|backend|workspace)|defineTrellis|defineCaller|getForwardedCaller" packages/convex/src`
  returns no live code.
- Auth/access-context tests still prove anonymous, non-member, bootstrap, and
  member behavior.

### Phase 5: CMS-Owned Destructive Operation Helper

Implement a small CMS-only operation helper.

Move from Trellis operations to direct functions:

- preview functions remain explicit Convex mutations/queries as they are today;
- execute functions accept `_confirmationToken`;
- preview writes confirmation state only when the operation is allowed;
- execute redeems one token and writes audit;
- operation result shape stays compatible with Studio and MCP unless there is a
  deliberate UI cleanup.

Update all operation users:

- assets
- backup
- entries/draft
- entries/publish
- entries/tree
- members
- revalidation
- siteData

Acceptance:

- Existing destructive operation tests pass.
- New invariant tests cover token mismatch, args mismatch, one-time redemption,
  expired token, stale version hash, and audit write.
- `trustedReplay` is deleted unless a concrete non-Trellis caller still needs
  it.

### Phase 6: Studio Cutover

Change host and Studio runtime:

- `studio-host.vue` imports `api` from `#convex/api`;
- host auth state comes from `useConvexAuth`;
- remove Trellis auth engine references;
- change host bridge comments/types from Trellis vocabulary to Convex;
- update `boundary/api.ts`, `useCmsAuthState.ts`,
  `useCmsStudioQuery.ts`, `useCmsStudioPaginatedQuery.ts`, and
  `useStudioConvex.ts` imports and types.

Keep direct host-client calls if they are already simpler than adopting
`better-convex-nuxt` composables inside the standalone SPA. The SPA is Vite
mounted inside Nuxt; using the host's `$convex` client directly is acceptable
and avoids forcing the SPA to become a Nuxt app.

Acceptance:

- `rg "#trellis|__trellis_auth_engine__|@lupinum/trellis/composables" packages/cms/src/runtime packages/cms/studio-app/src`
  returns no live code.
- Studio browser guard/runtime tests pass.
- A local Studio smoke can sign in, list collections, save a draft, preview
  publish, and publish.

### Phase 7: Server Routes And Public API

Replace server imports:

- `#trellis/api` -> `#convex/api`
- direct `ConvexHttpClient` calls may remain for public no-auth reads;
- authenticated server routes should use `serverConvex*` from `#convex/server`
  when they need Better Auth session-derived tokens.

Acceptance:

- `packages/cms/src/server/routes/public-api.ts` no longer imports Trellis.
- Public content API tests still pass.

### Phase 8: MCP Cutover

Replace Trellis MCP runtime with direct Nuxt MCP Toolkit integration.

Tasks:

- replace `defineMcpHandler`, `defineMcpTool`, `defineMcpPrompt`,
  `defineMcpResource`, and `defineArgs` imports;
- rewrite `project-tool-runtime.ts` around the existing
  `createAdminConvexCaller` and CMS capability checks;
- replace generated operation handles with explicit preview/execute function
  refs;
- update prompts/resources to say "confirmation token" or "CMS operation
  preview", not "Trellis operation preview";
- keep MCP token auth and failure-budget logic.

Acceptance:

- `rg "#trellis/mcp|@lupinum/trellis/mcp|@lupinum/trellis/args" packages/cms/src/server/mcp`
  returns no live code.
- MCP tests prove unauthorized tool calls fail in Convex.
- Destructive MCP tools still require preview before execute.

### Phase 9: CLI Cutover

Update CLI commands:

- `init`: minimal Convex/Better Auth/Ginko component templates.
- `doctor`: no bridge drift check; validate direct setup.
- `deploy`: Convex deploy then direct contract sync.
- `push`: direct contract sync.
- `migrate`: direct migration functions.
- delete forwarding envelope code.

Acceptance:

- `rg "forwarding|_trellisForwarding|CONVEX_IDENTITY_FORWARDING_KEY|GINKO_CMS_COMPONENT_FORWARDING_KEY" packages/cms/src/cli packages/contract/src`
  returns no live code unless docs mention old cleanup.
- CLI tests no longer assert forwarding envelopes or bridge files.

### Phase 10: Tests, Fixtures, Docs, ADRs

Update tests:

- module setup tests;
- package boundary tests;
- package e2e;
- Convex component tests;
- MCP runtime tests;
- Studio runtime tests;
- docs install-story checks.

Update docs:

- README quick start;
- quickstart;
- environment;
- release-candidate;
- public API reference;
- maintenance notes;
- package READMEs;
- `AGENTS.md` only if release commands or architecture wording changes.

Add an ADR:

- supersede ADR 0003;
- state that Ginko CMS uses direct Convex + Better Auth + better-convex-nuxt;
- Trellis is removed from the install and release model;
- backend invariants remain in the CMS Convex component.

Acceptance:

- `rg "Trellis|trellis|#trellis|@lupinum/trellis|trellis-bridge|_trellisForwarding" README.md docs adr packages test scripts playground`
  returns only historical migration notes and old changelog entries.

## Cleanup Checklist

Delete these if no explicit compatibility exception is made:

- `packages/cms/src/bridge/`
- `packages/cms/src/module/bridge-manifest.ts`
- `packages/cms/src/module/convex.ts`
- `packages/cms/convex/manifest.js`
- `packages/cms/convex/manifest.d.ts`
- `packages/cms/src/cli/bridge.ts`
- `packages/cms/src/cli/forwarding.ts`
- `packages/convex/src/componentBridge.ts`
- `packages/convex/src/generated/`
- `packages/convex/generated/`
- `playground/convex/ginkoCms/`
- `playground/convex/ginkoCmsMcp.ts`
- generated bridge fixtures under `test/fixtures/basic/convex/`
- Trellis-specific release/fixture helpers in `test/module/package-fixture.ts`
- Trellis packing logic in `scripts/package-e2e.mjs`
- Trellis foundation checks in `scripts/foundation-verify.mjs`

## Data Model Notes

Keep:

- `members`: Ginko CMS has a real owner/editor/publisher/viewer membership
  model. It is not a tenant model.
- `mcpKeys`: CMS-owned MCP bearer token state. Keep secrets hashed.
- `publicEntries` and `publicRoutes`: derived public read models, already
  documented and tested.
- `contentAssetRefs`: derived and rebuildable asset usage model.
- `destructiveConfirmations` and `destructiveAuditLog`: real destructive action
  safety contract.

Consider deleting:

- `trustedReplay`, after forwarding and generated bridge calls are gone.

Do not add:

- tenant tables,
- workspace tables,
- organization/team/member mirrors,
- generic authz tables,
- generic operation registry tables.

## Verification Gates

Run focused checks during each phase. Before handoff, run:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run package:e2e
pnpm run audit:prod
```

Then run:

```bash
pnpm run release:verify
```

Do not run live publish commands.

Add these explicit no-zombie checks:

```bash
rg "@lupinum/trellis|@lupinum/trellis-bridge|#trellis|_trellisForwarding|CONVEX_IDENTITY_FORWARDING_KEY|GINKO_CMS_COMPONENT_FORWARDING_KEY" packages test scripts playground README.md docs adr
rg "trellis operations|operationHandles|operationRefs" package.json packages scripts test
rg "ginkoCmsMcp|component-bridge|convex/ginkoCms|@lupinum/ginko-cms/bridge" packages test scripts playground README.md docs adr
```

Expected result: only historical changelog/migration notes remain, and tests
assert that no live source imports Trellis.

Add these behavior gates, because grep checks only catch vocabulary:

- package export diff reviewed for both CMS packages;
- package tarballs contain no bridge manifest or operation-handle output;
- new consumer fixture has normal Convex setup files only;
- no new generated manifest/source-of-truth file replaces the bridge manifest;
- no generic operation registry exists;
- no second permission table/config is introduced;
- unauthorized Studio, MCP, server, and CLI writes fail inside Convex;
- public reads work with no Better Auth cookie and return the same published
  data for anonymous and owner-authenticated requests;
- CLI contract sync uses one direct internal path.

## Why This Migration Might Fail

This section is deliberately skeptical. The migration fails if it removes the
Trellis package names but keeps the same architecture under CMS-owned names.

### Architecture Failure Modes

#### The local builders become `defineTrellis` again

Current `packages/convex/src/functions.ts` centralizes caller resolution,
forwarding, guards, destructive operations, trusted replay, app identity, and
unsafe escape hatches. A replacement that centralizes the same concerns behind
`defineCmsRuntime` or another generic runtime has not simplified the system.

Mitigation:

- Cap the replacement to boring helpers: `publicQuery`, `protectedQuery`,
  `protectedMutation`, `protectedAction`, direct internal variants, and
  `requireCms`.
- Do not add guard objects, operation registries, forwarding hooks, generic
  runtime type parameters, replay systems, or public unsafe escape hatches.
- Any internal escape hatch must name the CMS use case and have a test proving
  it is not exposed publicly.

Acceptance:

- No new file acts as a generic framework runtime.
- No replacement helper accepts arbitrary operation metadata.
- `unsafeRaw` and `unsafePermit` are deleted or replaced by narrower internal
  functions with tests.

#### MCP recreates Trellis fastest

`projectTool` already looks like a mini framework: schemas, capabilities, Convex
caller abstraction, generated operation handles, response mapping, denial
taxonomy, and operation dispatch. If this gets rewritten as a larger CMS MCP
runtime, the migration has failed.

Mitigation:

- Delete `projectTool` unless the replacement is small, CMS-specific, and only
  removes concrete duplication.
- MCP tools should name exact Convex refs and exact preview/execute refs.
- Push back on any new `OperationHandle`, `defineMcpApp`, generated descriptor,
  universal tool runtime, or visibility-as-security mechanism.

Acceptance:

- MCP tools are hand-written.
- Unauthorized `tools/call` fails in Convex even if the tool is visible or
  manually invoked.
- Destructive MCP tools follow the same preview/confirmation/execute contract
  as Studio.

#### Permission maps become a second ACL

Permission keys are useful contract data for Studio and MCP. They become a
problem if they turn into a second authorization system beside the guards used
by Convex mutations.

Mitigation:

- `members.getAccessContext` is the only place that materializes the permission
  map.
- The map is computed directly from the same plain guard functions used by
  protected mutations.
- Better Auth permissions, Nuxt route middleware, Studio UI checks, and MCP
  capability checks are UX filters only, never final enforcement.

Acceptance:

- There is no new permission table or generic authz config.
- Every write path rechecks CMS authorization in Convex.

#### better-convex-nuxt becomes a policy layer

`better-convex-nuxt` should own Nuxt/Convex/Better Auth wiring. It should not
own CMS roles, destructive confirmations, MCP auth, collection policy, tenants,
or product authorization.

Mitigation:

- Add a boundary rule to docs and tests: CMS domain invariants live in
  `@lupinum/ginko-cms-convex`.
- Use `better-convex-nuxt` for transport/runtime integration only.
- Reject Nuxt config options that move CMS authorization or destructive
  operation policy out of Convex.

Acceptance:

- No CMS role, member, MCP, destructive confirmation, or collection policy is
  configured through `better-convex-nuxt`.

### Release And Consumer Failure Modes

#### Published exports break consumers

The obvious export is `@lupinum/ginko-cms/bridge`, but current package surfaces
also include `@lupinum/ginko-cms/convex/manifest`,
`@lupinum/ginko-cms-convex/component-bridge`, and
`@lupinum/ginko-cms-convex/operation-handles/mcp`.

Mitigation:

- Treat `@lupinum/ginko-cms` and `@lupinum/ginko-cms-convex` as breaking
  releases.
- List every removed subpath in changelog and migration docs.
- Add package E2E/tarball checks that prove removed exports are gone and
  retained replacement imports work.

Acceptance:

- Package `exports` and `files` entries contain no bridge manifest,
  component-bridge, or operation-handle surfaces unless a named compatibility
  exception exists.

#### Existing deployments have checked-in generated bridge files

Old host apps may have `convex/ginkoCms/**`, `convex/ginkoCmsMcp.ts`,
Trellis-managed markers, bridge imports, and forwarding env vars checked in.
Deleting package exports will make those apps fail until they clean up.

Mitigation:

- `doctor` detects stale `convex/ginkoCms/**`, `convex/ginkoCmsMcp.ts`,
  `@trellis-managed-*`, bridge imports, and forwarding env vars.
- `doctor` prints a manual cleanup checklist and fails before deploy/build.
- `doctor` must not repair old bridge files or generate compatibility wrappers.

Acceptance:

- New install and repair paths never create `convex/ginkoCms*`.
- Stale bridge files are treated as cleanup blockers, not migration inputs.

#### Package E2E validates the old world

Current package E2E imports bridge factories, runs `ginko-cms bridge check`,
runs `trellis doctor`, and asserts generated bridge files exist. If those checks
remain, the release gate will either keep Trellis alive or become meaningless.

Mitigation:

- Replace package E2E with a fresh consumer install that adds
  `better-convex-nuxt`.
- Run `ginko-cms init`.
- Assert no `convex/ginkoCms*`.
- Verify `#convex/api` and `#convex/server`.
- Run Convex codegen, Nuxt prepare, Nuxt typecheck, and package import smoke.
- Import only retained public subpaths.

Acceptance:

- Package E2E proves the new install story and has no Trellis package inputs.

#### CI, workspace, and audit policy keep Trellis alive invisibly

CI may still check out Trellis. `pnpm-workspace.yaml` may still include
`../trellis`. Audit ignores may still be attributed to Trellis. The lockfile may
keep Trellis packages through stale dependencies.

Mitigation:

- Remove Trellis checkout from CI.
- Remove Trellis from workspace packages and package extension policy.
- Remove Trellis-specific audit ignores.
- Add CI checks that fail if Trellis checkout paths, env vars, lockfile entries,
  or workspace entries remain.

Acceptance:

- No Trellis workspace entry.
- No Trellis audit ignore.
- No Trellis packages in `pnpm-lock.yaml`.
- `pnpm audit --prod` passes without Trellis-specific ignores.

#### Compatibility matrix and docs drift

`compatibility.json` and docs currently describe Trellis, bridge checks,
generated bridge files, and forwarding secrets. If only code changes, consumers
will follow the old setup path and fail.

Mitigation:

- Track `better-convex-nuxt` in compatibility metadata.
- Forbid Trellis in compatibility checks.
- Update `check-docs-install-story` to require `better-convex-nuxt`.
- Forbid `bridge check`, `CONVEX_IDENTITY_FORWARDING_KEY`,
  `GINKO_CMS_COMPONENT_FORWARDING_KEY`, `convex/ginkoCms`, and Trellis outside
  historical changelog/migration notes.

Acceptance:

- Install docs, package metadata, compatibility matrix, and package E2E all
  describe the same dependency set.

### Convex API And Generated Surface Failure Modes

#### The real generated API path does not match the old bridge shape

Current Studio and public code expect `api.ginkoCms.*` from `#trellis/api`.
After deleting bridge files, actual Convex component refs may live under a
different generated path. The plan must not assume the old namespace survives.

Mitigation:

- Before broad cutover, generate a fresh playground API with the Ginko CMS
  component mounted and no bridge files.
- Record the exact `#convex/api` paths for Studio, public reads, MCP, and CLI.
- Update code to those paths instead of preserving the bridge namespace by
  adding aliases.

Acceptance:

- A package test proves the required refs resolve without `convex/ginkoCms*`.

#### Generated source of truth becomes manual source-of-truth drift

After deleting the bridge manifest, a manual type like `GinkoCmsStudioHostApi`
can become the new stale manifest if it lists every function ref by hand.

Mitigation:

- Derive types from generated `#convex/api` where possible.
- If a manual Studio boundary type remains, mark it as a smoke contract only,
  not a canonical function manifest.
- Behavior smoke must exercise real refs, not just type presence.

Acceptance:

- No generated or manual manifest becomes the canonical API list.
- Studio smoke calls real collection, editor, asset, member, and settings refs.

#### Generated files stay stale after source deletion

Convex generated files, playground generated files, and fixtures can preserve
old bridge or operation-handle names even after source files are deleted.

Mitigation:

- Run `pnpm run prepare:component` after backend changes.
- Run playground Convex codegen.
- Scan package generated outputs and playground generated outputs for
  `ginkoCmsMcp`, `component-bridge`, `operationHandles`, `operationRefs`, and
  `_trellisForwarding`.

Acceptance:

- No generated output references deleted bridge or Trellis operation surfaces.

### Identity And Security Failure Modes

#### Better Auth identity does not match CMS member identity

Current member lookup is keyed by the Convex auth identity subject. If Better
Auth emits a different subject after the cutover, existing owners become
non-members. Worse, first-owner bootstrap could reopen if membership lookup
appears empty or unauthenticated.

Mitigation:

- Prove Better Auth JWT `subject` equals stored `members.userId`.
- Test existing owner, authenticated non-member after bootstrap, and first-owner
  bootstrap.
- Do not fall back to email as identity; email may be profile data, not the
  stable member key.

Acceptance:

- Existing owner remains owner after the auth cutover.
- Bootstrap cannot reopen after any member exists.

#### `serverConvex*` silently becomes anonymous

`better-convex-nuxt` server helpers support `auth: 'auto'`, which can return no
token when cookies, site URL, or token exchange are missing. Protected server
routes must not silently run as anonymous.

Mitigation:

- Use `auth: 'required'` for every protected server read/write.
- Use `auth: 'none'` for public content reads.
- Add tests for missing session cookie and broken `convex.siteUrl`.

Acceptance:

- Protected server routes fail closed when auth cannot be resolved.
- Public routes never depend on a Better Auth cookie.

#### Deploy-key/admin calls bypass the wrong thing

`CONVEX_DEPLOY_KEY` gives Convex admin transport authority, not CMS member
authority. A common failure is to make protected functions accept deploy/admin
calls because contract sync and migrations need to work. That would collapse
setup authority into product authority.

Mitigation:

- Create explicit admin-only internal functions for contract sync, migrations,
  and setup jobs.
- These functions should not call `ctx.appIdentity()`.
- They must have narrow validators and be reachable only from deploy-key CLI
  paths.
- `CONVEX_DEPLOY_KEY` must never grant member permissions by itself.

Acceptance:

- CLI/admin sync succeeds through named internal functions.
- The same deploy-key path cannot perform member/editor/publisher actions.

#### MCP actor identity collapses into deploy/null identity

MCP currently depends on admin calls with an acting identity using the MCP key
issuer. If the cutover forgets the acting identity, uses the wrong issuer, or
uses a prefixed subject that `resolveMcpAppIdentity` does not expect, MCP calls
will either become null identity or be "fixed" by weakening guards.

Mitigation:

- Add a dedicated `createMcpConvexCaller(event, mcpKeyId)` helper.
- Preserve the expected MCP issuer/subject contract deliberately.
- Test valid MCP key, revoked key, missing acting identity, wrong issuer, and
  prefixed subject.

Acceptance:

- MCP cannot act as deploy/admin.
- MCP authorization resolves only through CMS key verification in Convex.

#### Convex component internals become public by accident

Removing Trellis and `unsafeRaw` is good only if installer, migration,
MCP-token, cleanup, and bootstrap internals do not become public mutations.

Mitigation:

- Classify every old unsafe/setup function as deleted, public, protected, or
  internal.
- Admin/setup functions should be `internalQuery`, `internalMutation`, or
  `internalAction`.
- Add an `rg`/test gate proving admin/setup functions are not public exports.

Acceptance:

- Public API contains only deliberate public reads and Studio/user functions.
- Installer and migration functions are internal.

### Destructive Operation Failure Modes

#### Confirmation binding gets weaker

Trellis currently binds confirmation rows to token hash, operation id,
execute/preview paths, caller key, scope key, args hash, preview hash, optional
version hash, expiry, redemption, and audit. Reimplementing only "preview
returns token, execute accepts token" would allow stale, mismatched, replayed,
or cross-operation approvals.

Mitigation:

- Preserve the full binding model unless a field is explicitly proven
  unnecessary.
- Preview should not write a confirmation when guard checks fail.
- Execute should verify token hash, operation id, caller key, scope key, args
  hash, preview hash, version hash when present, expiry, and unredeemed state.
- Execute should redeem once and write audit in the same successful path.

Acceptance:

- Tests cover wrong caller, wrong args, wrong operation, expired token, redeemed
  token, stale version hash, guard-blocked preview, and missing audit write.

#### The destructive helper becomes generic operation metadata

Keeping `operationIssue` and `operationEffect` style helpers is acceptable only
if they stay small value constructors. The failure mode is recreating a global
operation registry, generated descriptors, generated handles, or cross-runtime
metadata.

Mitigation:

- Keep the helper private to `packages/convex`.
- Keep operation-specific logic at call sites.
- Do not generate operation metadata.
- Do not export operation descriptors from the package.

Acceptance:

- No `operationRefs`, `operationHandles`, global registry, or descriptor
  generation remains.

### Public Read Failure Modes

#### Public reads start depending on auth/session state

Published website reads should be identical for anonymous users and signed-in
CMS members. Routing them through `auth: 'auto'` can introduce session-specific
behavior or auth failures into public pages.

Mitigation:

- Public API uses unauthenticated `ConvexHttpClient` or
  `serverConvexQuery(..., { auth: 'none' })`.
- Public Convex functions do not read member/app identity.

Acceptance:

- Anonymous and owner-authenticated requests return the same published-only
  page/list/nav/search/sitemap data.

### Host Ownership Failure Modes

#### App-owned files remain managed by the installer

Templates currently use generated/do-not-edit language in places that should
become app-owned. If `init` or `doctor` continues rewriting those files, the
host ownership model stays muddy.

Mitigation:

- Templates are "generated once, then app-owned".
- Remove managed markers and drift repair for normal Convex files.
- `doctor` can validate and print exact snippets, but it should not overwrite
  existing app files without an explicit user command.

Acceptance:

- Existing `convex/auth.ts`, `convex/http.ts`, `convex/schema.ts`, and
  `convex/convex.config.ts` are not silently rewritten.

#### Compatibility cleanup becomes hidden dual-path support

Detecting old files is useful. Repairing them or continuing to accept them is a
dual path.

Mitigation:

- `doctor` reports old Trellis artifacts as blockers with deletion
  instructions.
- `init` creates only the new direct setup.
- No compatibility bridge wrappers are generated.

Acceptance:

- Old bridge files cannot be "repaired" into a working compatibility mode.

### Verification Failure Modes

#### Grep checks pass while behavior regresses

Removing strings catches zombies, not broken behavior. The migration needs
behavioral gates for every surface that Trellis used to mediate.

Mitigation:

- Add a cross-surface destructive operation matrix: Studio, MCP, and CLI/admin
  all require preview, reject mismatched args/version/caller, redeem once, and
  write audit.
- Add auth matrix: anonymous, authenticated non-member, owner, publisher,
  editor, viewer, valid MCP key, revoked MCP key, deploy-key admin.
- Add setup matrix: fresh install, stale bridge install, existing app-owned
  Convex files, package tarball consumer, real upgraded consumer.

Acceptance:

- Each matrix is represented by focused tests or a documented smoke gate before
  `release:verify`.

#### Fixtures drift or lose coverage

Deleting old fixtures without replacement can make tests pass by testing less.

Mitigation:

- Replace bridge fixtures with direct Convex setup fixtures.
- Basic fixture invariant: normal Convex files only, no `ginkoCms*`, no Trellis
  markers, no forwarding envs.
- Package consumer typecheck proves generated `#convex/api` usage.

Acceptance:

- Fixture tests fail if old generated bridge files reappear.

## First Slice To Prove The Direction

Do one vertical slice before broad edits:

1. Add `better-convex-nuxt` to the playground module setup.
2. Change the Studio host to import `api` from `#convex/api`.
3. Point one Studio query, such as collections list, at the direct component API.
4. Replace the generated bridge file for that one area in the playground.
5. Run the focused module/studio tests.

If that works, continue with the hard cut. If it does not, fix the direct Convex
API shape rather than adding a new Ginko bridge framework.

## Done Definition

The migration is done when:

- Ginko CMS installs without Trellis.
- New host apps do not generate `convex/ginkoCms/*` bridge files.
- No live source imports `@lupinum/trellis`, `@lupinum/trellis-bridge`,
  `#trellis/api`, or `#trellis/mcp`.
- No runtime path requires `CONVEX_IDENTITY_FORWARDING_KEY` or
  `GINKO_CMS_COMPONENT_FORWARDING_KEY`.
- Studio, public content API, CLI contract sync, MCP tools, destructive
  previews/executes, backups, assets, and publishing pass focused tests.
- `pnpm run release:verify` passes.
- Docs explain one setup story: Nuxt + Convex + Better Auth +
  better-convex-nuxt + Ginko CMS.
