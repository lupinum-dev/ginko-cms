# Move Ginko CMS Off Trellis

## Decision

Ginko CMS should move from Trellis to direct Convex + Nuxt + Better Auth wiring
using `better-convex-nuxt`.

This is a hard cutover. Do not keep Trellis and non-Trellis paths side by side.
Do not create a local replacement framework that preserves the same bridge,
operation registry, forwarding, manifest, or generated wrapper model under new
names.

The target is simpler:

- `better-convex-nuxt` owns Nuxt runtime wiring for Convex, Better Auth token
  sync, `#convex/api`, `#convex/server`, and client/server composables.
- `@lupinum/ginko-cms` owns the Nuxt module, Studio host, CLI, public routes,
  MCP routes, docs, and install experience.
- `@lupinum/ginko-cms-convex` owns CMS domain policy, Convex functions,
  authorization, destructive confirmations, publishing, assets, backups,
  migrations, and projections.
- `@lupinum/ginko-cms-contract` owns framework-neutral validators, types, and
  content contracts.
- Host apps own normal Convex files and use normal Convex generated API refs.

## Hard Rules

- Delete before replacing.
- Do not add compatibility shims for generated Trellis bridges.
- Do not keep `_trellisForwarding`.
- Do not keep generated operation descriptors or operation handles.
- Do not add tenants, workspaces, organizations, or generic authz tables.
- Do not move backend authorization into Nuxt, Better Auth permissions, Studio
  orchestration, MCP tool visibility, or client-side capability checks.
- Do not make `better-convex-nuxt` a CMS policy layer.
- Keep public content reads anonymous and deterministic.
- Keep destructive preview/confirmation/execute as a CMS-owned Convex invariant.
- Keep deploy-key/admin authority separate from member/editor/publisher
  authority.

## Target Public Setup

A new Ginko CMS app should install and configure:

- `@lupinum/ginko-cms`
- `@lupinum/ginko-cms-convex`
- `@lupinum/ginko-cms-contract`
- `better-convex-nuxt`
- `convex`
- `@convex-dev/better-auth`
- `better-auth`

A new Ginko CMS app should not install or generate anything from:

- `@lupinum/trellis`
- `@lupinum/trellis-bridge`
- `@lupinum/trellis-eslint`
- `#trellis/api`
- `#trellis/mcp`
- `convex/ginkoCms/**`
- `convex/ginkoCmsMcp.ts`
- generated operation refs or handles

## Removed Public Surfaces

Treat this as a breaking release unless a maintainer explicitly chooses a
deprecation release. The recommended path is semver-major with a clear migration
note.

| Package                     | Removed surface                      | Replacement                                                                         |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `@lupinum/ginko-cms`        | `./bridge`                           | Direct Convex setup and generated `#convex/api` refs                                |
| `@lupinum/ginko-cms`        | `./convex/manifest`                  | No manifest; `ginko-cms init` validates direct setup                                |
| `@lupinum/ginko-cms-convex` | `./component-bridge`                 | Direct component API refs from generated Convex API                                 |
| `@lupinum/ginko-cms-convex` | `./operation-handles/mcp`            | Explicit preview/execute refs in hand-written MCP tools                             |
| CLI                         | `ginko-cms bridge *`                 | `ginko-cms init`, `doctor`, `deploy`, `push`, and `migrate` use direct Convex paths |
| Env                         | `CONVEX_IDENTITY_FORWARDING_KEY`     | Deleted                                                                             |
| Env                         | `GINKO_CMS_COMPONENT_FORWARDING_KEY` | Deleted                                                                             |

## Work Order

Use this order. It keeps the blast radius visible and prevents late discovery
that the direct Convex API shape does not support the Studio or MCP flows.

1. Freeze cutover decisions and acceptance criteria.
2. Prove one vertical slice with `better-convex-nuxt` and `#convex/api`.
3. Remove package/script/release Trellis dependencies.
4. Replace Nuxt module setup.
5. Delete generated bridge generation and installer bridge paths.
6. Replace Convex function builders and identity resolution.
7. Rebuild destructive operation helpers as CMS-owned code.
8. Cut over Studio runtime.
9. Cut over server routes and public content API.
10. Cut over MCP.
11. Cut over CLI.
12. Update tests, fixtures, docs, ADRs, package E2E, and release gates.
13. Run final no-zombie and behavior verification.

## Phase 0: Freeze The Cutover

Objective: make the migration constraints explicit before code changes start.

Todos:

- [ ] Confirm this ships as a breaking release.
- [ ] Confirm no Trellis compatibility shim will be added.
- [ ] Confirm old generated bridge files are cleanup blockers, not migration
      inputs.
- [ ] Confirm stale host apps get a manual cleanup checklist through `doctor`.
- [ ] Confirm removed public exports listed above are intentional.
- [ ] Confirm `trustedReplay` is deleted unless a concrete non-Trellis caller
      remains after CLI and MCP are cut over.
- [ ] Confirm the migration source of truth is this file.

Verification:

```bash
git diff -- move-off-trellis.md
```

Exit criteria:

- Every removed surface has a replacement or an explicit "deleted without
  replacement" note.
- No phase depends on keeping Trellis and direct Convex paths alive together.

## Phase 1: Prove The Direct Convex Slice

Objective: verify the actual generated Convex API shape before deleting large
systems.

Todos:

- [x] Add `better-convex-nuxt` to the playground Nuxt setup.
- [x] Generate a fresh playground Convex API with the Ginko CMS component
      mounted and without adding new bridge files.
- [x] Record the actual generated refs needed by Studio, public reads, MCP, and
      CLI/admin setup.
- [x] Change one Studio host path to import `api` from `#convex/api`.
- [x] Point one low-risk Studio read, preferably collection listing, at the
      direct generated API ref.
- [x] Keep the slice small. Do not add aliases to preserve the old
      `api.ginkoCms.*` bridge shape if the generated API differs.

Phase 1 evidence:

- `better-convex-nuxt` now registers in the Ginko CMS module dependency list
  and the playground dependency set.
- `nuxi prepare --cwd playground` succeeds and generates `#convex/api`.
- `convex dev --once --typecheck disable --tail-logs disable` succeeds in the
  playground.
- The Studio host imports `api` and `components` from `#convex/api`.
- The Studio host reads auth through an explicit
  `better-convex-nuxt/composables` import instead of the Trellis auth engine.
- The generated direct component path for collection listing is
  `components.ginkoCms.collections.listCollections`.
- The existing bridge path remains `api.ginkoCms.collections.listCollections`.

Important finding:

- The direct component collection ref exists, but it is generated as an
  internal component function and still accepts Trellis forwarding arguments
  while the backend uses `defineTrellis`. That means browser Studio reads
  cannot fully move to component refs until the backend builder cutover creates
  public/protected CMS-owned Convex functions without Trellis forwarding. This
  is not a reason to keep the bridge; it confirms Phase 5 must happen before
  broad Studio call-site deletion.

Verification:

```bash
pnpm --dir playground exec nuxi prepare
pnpm --dir playground exec convex dev --once --typecheck disable --tail-logs disable
pnpm run typecheck
vitest run test/runtime test/shared/studio-workflow.test.ts
```

Exit criteria:

- A Studio read works through `#convex/api`.
- The direct API path is known and documented in implementation notes.
- No new bridge or manifest abstraction was created to make the slice work.

Failure mitigations:

- If generated refs do not match expectations, update callers to real refs.
- If Studio host typing becomes awkward, create a tiny boundary type for the
  host context only. Do not create a function manifest.

## Phase 2: Package, Workspace, And Script Cutover

Objective: remove Trellis from the dependency graph and release tooling.

Todos:

- [x] Remove `@lupinum/trellis`, `@lupinum/trellis-bridge`, and
      `@lupinum/trellis-eslint` from root package metadata.
- [x] Remove Trellis dependencies from `packages/cms/package.json`.
- [x] Remove Trellis dependencies from `packages/convex/package.json`.
- [x] Add or require `better-convex-nuxt` in the Nuxt integration layer.
- [x] Delete `operations:generate:*` and `operations:check`.
- [x] Remove Trellis from `pnpm-workspace.yaml`, package extensions, CI setup,
      and release/foundation scripts.
- [x] Replace `pnpm --filter @lupinum/trellis-eslint build` in `lint`.
- [x] Update compatibility metadata to track `better-convex-nuxt` instead of
      Trellis.
- [x] Update `pnpm-lock.yaml`.

Verification:

```bash
pnpm install
rg "@lupinum/trellis|@lupinum/trellis-bridge|@lupinum/trellis-eslint|trellis operations" package.json pnpm-lock.yaml pnpm-workspace.yaml scripts packages
pnpm run format:check
pnpm run lint
```

Expected grep result:

- Only implementation files scheduled for later phases may still match.
- Package metadata, workspace metadata, and scripts must not keep Trellis as a
  live dependency.

Exit criteria:

- The workspace can install without Trellis packages.
- No release or CI script requires a Trellis checkout.
- `pnpm run check` no longer includes operation generation.

Implementation evidence:

- Root `package.json` no longer declares `@lupinum/trellis`,
  `@lupinum/trellis-bridge`, or `@lupinum/trellis-eslint`.
- Root `package.json` no longer exposes `operations:generate:*` or
  `operations:check`, and `check` no longer calls operation generation.
- Root `lint` no longer builds `@lupinum/trellis-eslint`; `eslint.config.mjs`
  no longer imports the Trellis ESLint package.
- `packages/cms/package.json` and `packages/convex/package.json` no longer
  declare Trellis runtime dependencies.
- `pnpm-workspace.yaml` no longer includes the sibling Trellis workspace or
  Trellis minimum-release-age exclusions.
- `packages/cms/compatibility.json` tracks `better-convex-nuxt` and removes
  Trellis/Trellis Bridge from the release stack.
- `scripts/package-e2e.mjs` no longer packs, installs, or runs Trellis; the
  package consumer fixture installs `better-convex-nuxt`.
- `scripts/foundation-verify.mjs` no longer installs/builds a Trellis checkout
  or pins Trellis tarballs into the consumer app.
- `vitest.config.ts` no longer depends on `@lupinum/trellis/testing`.

Verification evidence:

```bash
CI=true /Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm install --no-frozen-lockfile
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm why @lupinum/trellis --depth 0
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm why @lupinum/trellis-bridge --depth 0
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm why @lupinum/trellis-eslint --depth 0
rg "@lupinum/trellis|@lupinum/trellis-bridge|@lupinum/trellis-eslint|trellis operations" package.json pnpm-lock.yaml pnpm-workspace.yaml scripts eslint.config.mjs vitest.config.ts packages/cms/package.json packages/convex/package.json packages/cms/compatibility.json
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run format:check
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run lint
```

Results:

- `pnpm install --no-frozen-lockfile` passed and updated `pnpm-lock.yaml`.
- The three `pnpm why` commands produced no owners for Trellis packages.
- The targeted metadata/script `rg` produced no matches.
- `format:check` passed.
- `lint` passed.

Known follow-up:

- Live implementation imports remain in the bridge, MCP, Studio composables,
  generated operation handles, and Convex component. Those are
  intentionally left to Phases 3 through 7; Phase 2 removed the package graph
  and release-tooling dependency so those later phases cannot silently rely on
  Trellis.

## Phase 3: Nuxt Module Cutover

Objective: make the Ginko Nuxt module depend on direct Convex/Nuxt wiring.

Todos:

- [x] Remove `trellis?: Record<string, unknown>` from module option extension
      types.
- [x] Stop writing `moduleOptions.trellis`.
- [x] Replace Nuxt module dependency `@lupinum/trellis` with
      `better-convex-nuxt`.
- [x] Configure Studio route protection through the direct Better Auth/Convex
      path.
- [x] Keep permission configuration as UI hints only, if still useful.
- [x] Update module tests that currently assert Trellis permission wiring.
- [x] Update generated Nuxt aliases from `#trellis/*` to `#convex/*` usage.

Verification:

```bash
pnpm --filter @lupinum/ginko-cms typecheck
vitest run test/module
rg "@lupinum/trellis|#trellis|moduleOptions\\.trellis|trellis:" packages/cms/src/module.ts packages/cms/src/module test/module playground/nuxt.config.ts
```

Exit criteria:

- Ginko's Nuxt module no longer adds `@lupinum/trellis`.
- Studio auth still redirects anonymous users to the configured sign-in path.
- Backend authorization is not configured through Nuxt module options.

Implementation evidence:

- `packages/cms/src/module.ts` no longer exposes `trellis` in its local Nuxt
  option extension, no longer writes `moduleOptions.trellis`, and no longer
  returns `@lupinum/trellis` from `moduleDependencies`.
- `packages/cms/src/module.ts` registers `better-convex-nuxt` defaults with
  auth enabled, route protection redirecting to
  `<studioRoute>/auth/signin`, and backend permissions disabled.
- `playground/nuxt.config.ts` now uses `convex.url` instead of `trellis.url`
  and does not configure a Nuxt-layer permissions query.
- Module tests that asserted Trellis permission wiring now assert the direct
  Convex module route-protection defaults or absence of `nuxt.options.trellis`.
- Package boundary tests no longer expect CMS/Convex manifests to declare
  Trellis dependencies.

Verification evidence:

```bash
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run format:check
rg "@lupinum/trellis|#trellis|moduleOptions\\.trellis|nuxtOptions\\.trellis|trellis:" packages/cms/src/module.ts playground/nuxt.config.ts
rg "better-convex-nuxt|convex:" packages/cms/src/module.ts playground/nuxt.config.ts test/module/module-tailwind.test.ts test/module/e2e-boot.test.ts
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run lint
```

Results:

- `format:check` passed.
- The targeted module/config Trellis search produced no matches.
- The direct Convex wiring search showed `better-convex-nuxt` in the module
  dependency defaults and `convex:` in the playground config.
- `lint` passed.

Blocked broader checks:

- `pnpm --filter @lupinum/ginko-cms typecheck` still fails because the Convex
  component and generated operation handles import `@lupinum/trellis/*`.
  That is Phase 5 and Phase 6 work.
- `vitest run test/module/...` tests that import `test/module/bridge-helpers.ts`
  still fail because the bridge helper imports `@lupinum/trellis-bridge`.
  That is Phase 4 work.

## Phase 4: Delete Generated Bridge System

Objective: remove bridge generation, bridge manifests, and generated host
wrappers.

Delete or retire:

- [x] `packages/cms/src/bridge/**`
- [x] `packages/cms/src/module/bridge-manifest.ts`
- [x] bridge rendering/drift logic in `packages/cms/src/module/convex.ts`
- [x] `packages/cms/convex/manifest.js`
- [x] `packages/cms/convex/manifest.d.ts`
- [x] public package export `./bridge`
- [x] public package export `./convex/manifest`
- [x] `ginko-cms bridge *`
- [x] generated bridge fixtures under `test/fixtures/basic/convex/ginkoCms*`
- [x] generated bridge files under `playground/convex/ginkoCms*`

Replace with direct setup validation:

- [x] `convex/convex.config.ts` mounts Better Auth and the Ginko CMS Convex
      component.
- [x] `convex/auth.ts` follows the direct `@convex-dev/better-auth` pattern.
- [x] `convex/auth.config.ts` configures Convex auth provider state.
- [x] `convex/http.ts` registers Better Auth routes.
- [x] `convex/schema.ts` remains app-owned.
- [x] `ginko-cms init` creates only normal Convex files.
- [x] `ginko-cms doctor` detects stale bridge files and prints cleanup steps.
- [x] `doctor` does not repair or regenerate old bridge files.

Verification:

```bash
rg "@lupinum/ginko-cms/bridge|trellis-bridge|convex/ginkoCms|ginkoCmsMcp|@trellis-bridge|bridge check" packages test playground README.md docs scripts
pnpm run check:publish-specifiers
pnpm run test:package-consumer
```

Exit criteria:

- New installs create no `convex/ginkoCms/**` or `convex/ginkoCmsMcp.ts`.
- Package exports and package files contain no bridge manifest.
- Stale bridge files are blockers with manual cleanup instructions.

Failure mitigations:

- If a consumer really depends on `./bridge`, document the breaking change. Do
  not add a temporary generated bridge path unless maintainers explicitly
  reverse the hard-cutover decision.

Implementation evidence:

- `packages/cms/src/bridge/**`, `packages/cms/src/module/bridge-manifest.ts`,
  `packages/cms/convex/manifest.*`, the bridge manifest build script, and the
  generated fixture/playground `convex/ginkoCms*` files were deleted.
- `packages/cms/src/module/convex.ts` now validates direct Convex setup files
  and reports stale generated bridge paths or markers with manual cleanup
  instructions. It does not render, diff, repair, or regenerate wrappers.
- `ginko-cms init` writes only normal Convex setup files from
  `packages/cms/templates/convex/**`, including `convex/convex.config.ts`.
- `ginko-cms doctor` reports direct setup status and treats stale bridge files
  as blockers. `ginko-cms bridge *` now exits with a removal message.
- CMS and Convex package exports/files no longer publish `./bridge`,
  `./convex/manifest`, or `./component-bridge`.
- Package consumer and boundary tests were updated to assert direct setup files
  and the absence of generated bridge outputs.
- CLI deploy-key forwarding no longer imports Trellis bridge helpers. It keeps
  the existing signed `_trellisForwarding` wire shape locally until Phase 5 and
  Phase 9 delete the remaining forwarding path.

Verification evidence:

```bash
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run format:check
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run check:publish-specifiers
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run lint
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm exec vitest run test/module/ginko-cli.test.ts test/module/module-bridge.test.ts
rg "@lupinum/ginko-cms/bridge|trellis-bridge|convex/ginkoCms|ginkoCmsMcp|@trellis-bridge|bridge check|bridge inspect|bridge install|bridge generate|convex/manifest|bridge-manifest|ginkoCmsBridgeManifest|ComponentBridgeManifest|component-bridge" packages test playground README.md docs scripts --glob '!packages/convex/src/_generated/**'
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm run test:package-consumer
```

Results:

- `format:check` passed.
- `check:publish-specifiers` passed.
- `lint` passed after deleting the obsolete installer bridge boundary guard.
- `vitest run test/module/ginko-cli.test.ts test/module/module-bridge.test.ts`
  passed.
- The bridge search now reports only `internal.ginkoCmsMcp.*` runtime MCP
  references and tests. Those are not generated bridge files; they remain for
  Phase 9 MCP cutover.

Blocked broader checks:

- `test:package-consumer` still fails while packing `@lupinum/ginko-cms-convex`
  because the Convex component still imports `@lupinum/trellis/auth`,
  `@lupinum/trellis/backend`, and `@lupinum/trellis/mcp`. That is Phase 5,
  Phase 6, and Phase 9 work.

## Phase 5: Convex Builder And Identity Cutover

Objective: replace Trellis backend builders with small CMS-owned Convex helpers.

Create or simplify helpers:

- [x] `publicQuery`
- [x] `protectedQuery`
- [x] `protectedMutation`
- [x] `protectedAction`
- [x] direct internal query/mutation/action variants where needed
- [x] `resolveCmsCaller(ctx)`
- [x] `resolveCmsAppIdentity(ctx, caller)`
- [x] `requireCms(identity, guard, message?)`
- [x] plain guard functions for member roles and capabilities

Remove:

- [x] `defineTrellis`
- [x] `defineCaller`
- [x] forwarded callers
- [x] `_trellisForwarding`
- [x] `CONVEX_IDENTITY_FORWARDING_KEY`
- [x] `GINKO_CMS_COMPONENT_FORWARDING_KEY`
- [x] `getCmsComponentForwardingKey`
- [x] generic Trellis guards and access-context objects
- [x] `unsafeRaw` and `unsafePermit`, unless replaced by narrower internal
      functions with tests

Update Convex call sites:

- [x] `auth/checks.ts`
- [x] `members.ts`
- [x] `assets.ts`
- [x] `backup.ts`
- [x] `entries/**`
- [x] `siteData.ts`
- [x] `revalidation.ts`
- [x] `migrations.ts`
- [x] any function using Trellis caller or guard helpers

Verification:

```bash
rg "@lupinum/trellis/(auth|backend|workspace)|defineTrellis|defineCaller|getForwardedCaller|_trellisForwarding|unsafeRaw|unsafePermit" packages/convex/src
pnpm --filter @lupinum/ginko-cms-convex typecheck
vitest run test/component test/shared/contracts.test.ts
```

Exit criteria:

- No Convex source imports Trellis.
- Anonymous, non-member, owner, editor, publisher, viewer, and bootstrap paths
  are still covered by tests.
- Permission maps are computed from the same authorization rules used by
  protected Convex writes.

Implementation evidence:

- `packages/convex/src/functions.ts` now owns the direct Convex builders,
  caller resolution, app identity resolution, guard enforcement, and narrow
  internal query/mutation helpers.
- `packages/convex/src/auth/checks.ts` now owns plain CMS guard functions and
  capability checks.
- `packages/convex/src/auth/recordAccess.ts` now computes entry record access
  through the same CMS guards used by protected writes.
- Convex call sites in assets, backup, entries, site data, revalidation,
  settings, migrations, collections sync, and MCP keys now use CMS-owned
  builders and operation helpers.
- `packages/convex/src/convex.auth.ts` now uses direct
  `@convex-dev/better-auth` and `better-auth` wiring; `better-auth` is declared
  as a Convex package peer dependency.
- Component tests now run on `convex-test` without Trellis caller forwarding.
- Site data writes explicitly reject non-JSON values before persistence.

Verification evidence:

```bash
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm exec oxfmt . --ignore-path .oxfmtignore
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm --filter @lupinum/ginko-cms-convex typecheck
/Users/matthias/Library/pnpm/.tools/pnpm/10.33.0_tmp_48378/bin/pnpm exec vitest run test/component test/shared/contracts.test.ts
rg -n "@lupinum/trellis/(auth|backend|workspace)|defineTrellis|defineCaller|getForwardedCaller|_trellisForwarding|unsafeRaw|unsafePermit|CONVEX_IDENTITY_FORWARDING_KEY|GINKO_CMS_COMPONENT_FORWARDING_KEY|getCmsComponentForwardingKey" packages/convex/src test/helpers.ts --glob '!packages/convex/src/_generated/**'
rg -n "@lupinum/trellis" packages/convex/src packages/convex/generated --glob '!packages/convex/src/_generated/**'
```

Results:

- `oxfmt` passed.
- Convex package typecheck passed.
- Component and shared contract tests passed: 30 files, 225 tests.
- Both Trellis searches produced no matches.

Failure mitigations:

- If setup/admin paths need elevated access, create narrow internal functions.
  Do not let deploy-key/admin calls impersonate a CMS member.
- If identity subject mapping changes, fix the auth mapping. Do not fall back
  to email as the member key.

## Phase 6: CMS-Owned Destructive Operations

Objective: keep destructive safety without Trellis operation metadata.

Keep initially:

- [ ] `destructiveConfirmations`
- [ ] `destructiveAuditLog`

Delete:

- [ ] generated operation descriptor files
- [ ] generated operation refs
- [ ] generated operation handles
- [ ] Trellis `defineOperation`
- [ ] Trellis `previewOf`
- [ ] Trellis `operationPreview`
- [ ] Trellis `operationIssue`
- [ ] Trellis `operationEffect`
- [ ] Trellis `operationPreviewValidator`
- [ ] `trustedReplay`, unless a non-Trellis use is proven necessary

Implement a small CMS-only helper:

- [ ] preview result constructors
- [ ] `blockedOperationPreview`
- [ ] `operationIssue`
- [ ] `operationEffect`
- [ ] `previewDestructiveOperation`
- [ ] `executeDestructiveOperation`
- [ ] confirmation token hashing
- [ ] args hash binding
- [ ] caller/scope binding
- [ ] optional version hash binding
- [ ] expiry checks
- [ ] one-time redemption
- [ ] audit write

Update operation users:

- [ ] assets
- [ ] backup
- [ ] entries/draft
- [ ] entries/publish
- [ ] entries/tree
- [ ] members
- [ ] revalidation
- [ ] site data
- [ ] MCP destructive tools
- [ ] Studio destructive actions

Verification:

```bash
rg "defineOperation|previewOf|operationPreview|operationRefs|operationHandles|trustedReplay|@lupinum/trellis/(backend|mcp)" packages/convex packages/cms test scripts
vitest run test/component test/shared/mcp-tools.test.ts test/shared/studio-workflow.test.ts
```

Required invariant tests:

- [ ] guard-blocked preview writes no confirmation
- [ ] missing token fails
- [ ] wrong token fails
- [ ] wrong caller fails
- [ ] wrong args fail
- [ ] wrong operation fails
- [ ] expired token fails
- [ ] redeemed token fails
- [ ] stale version hash fails
- [ ] successful execute redeems once
- [ ] successful execute writes audit

Exit criteria:

- Destructive operations still require preview before execute.
- No operation registry or generated operation metadata remains.
- Studio and MCP use the same confirmation contract.

## Phase 7: Studio Runtime Cutover

Objective: move Studio from Trellis host bridge to direct Convex host context.

Todos:

- [ ] Change `packages/cms/src/runtime/pages/studio-host.vue` from
      `#trellis/api` to `#convex/api`.
- [ ] Replace `__trellis_auth_engine__` with direct `useConvexAuth()` state.
- [ ] Pass `api`, `$convex`, auth refs, and CMS runtime config through
      `window.__GINKO_CMS__`.
- [ ] Rename Trellis comments and types to Convex/CMS host vocabulary.
- [ ] Update `packages/cms/studio-app/src/boundary/api.ts`.
- [ ] Update `useCmsAuthState.ts`.
- [ ] Update `useCmsStudioQuery.ts`.
- [ ] Update `useCmsStudioPaginatedQuery.ts`.
- [ ] Update `useStudioConvex.ts`.
- [ ] Keep small Studio wrappers only when they add CMS-specific gating or error
      normalization.
- [ ] Do not wrap every Convex primitive if a direct call is clearer.

Verification:

```bash
rg "#trellis|__trellis_auth_engine__|@lupinum/trellis/composables|Trellis" packages/cms/src/runtime packages/cms/studio-app/src test/runtime
pnpm --filter @lupinum/ginko-cms typecheck
vitest run test/runtime test/shared/studio-workflow.test.ts test/runtime/studio-workflow-components.test.ts
```

Manual smoke before release:

- [ ] sign in
- [ ] list collections
- [ ] create or edit a draft
- [ ] preview publish
- [ ] publish
- [ ] run one destructive preview/execute action

Exit criteria:

- Studio has no live Trellis imports.
- Studio writes still fail closed for non-members and insufficient roles.
- Studio public-preview behavior is unchanged.

## Phase 8: Server Routes And Public API Cutover

Objective: remove `#trellis/api` from Nuxt server routes and preserve anonymous
public reads.

Todos:

- [ ] Replace `#trellis/api` with `#convex/api`.
- [ ] Use `serverConvexQuery`, `serverConvexMutation`, or
      `serverConvexAction` from `#convex/server` for protected server routes.
- [ ] Use `auth: 'required'` for protected server routes.
- [ ] Use `auth: 'none'` or unauthenticated `ConvexHttpClient` for public
      content reads.
- [ ] Ensure public Convex functions do not read member/app identity.
- [ ] Keep `publicEntries`, `publicRoutes`, and `contentAssetRefs`; they are
      rebuildable CMS read models, not tenant state.

Verification:

```bash
rg "#trellis/api|serverConvex.*auth: 'auto'|serverConvex.*auth: \"auto\"" packages/cms/src/server packages/cms/src/runtime
vitest run test/shared/contracts.test.ts test/component/diagnostics.test.ts test/component/import.test.ts
```

Required behavior tests:

- [ ] public page/list/nav/search/sitemap reads work with no cookie
- [ ] public reads return the same published data for anonymous and owner users
- [ ] protected routes fail without a valid Better Auth session
- [ ] broken token exchange fails closed for protected routes

Exit criteria:

- Public content API never depends on Better Auth cookies.
- Protected server paths never silently degrade to anonymous behavior.

## Phase 9: MCP Cutover

Objective: keep MCP product-specific and remove Trellis MCP runtime.

Todos:

- [ ] Replace Trellis MCP imports with direct Nuxt MCP Toolkit APIs.
- [ ] Delete generated MCP operation handles.
- [ ] Rewrite `project-tool-runtime.ts` as a small CMS helper or delete it.
- [ ] Make tools name exact Convex refs and exact preview/execute refs.
- [ ] Keep MCP bearer token auth and failure-budget logic.
- [ ] Add `createMcpConvexCaller(event, mcpKeyId)` or equivalent direct helper.
- [ ] Preserve explicit MCP actor identity. Do not act as deploy/admin.
- [ ] Update MCP prompts/resources to say "confirmation token" or "CMS
      operation preview", not "Trellis operation preview".
- [ ] Ensure unauthorized `tools/call` fails inside Convex even if a tool is
      visible or manually invoked.

Verification:

```bash
rg "#trellis/mcp|@lupinum/trellis/mcp|@lupinum/trellis/args|operation-handles|OperationHandle|defineMcpApp" packages/cms/src/server/mcp packages/convex/src test
vitest run test/shared/mcp-tools.test.ts
```

Required behavior tests:

- [ ] valid MCP key works
- [ ] revoked MCP key fails
- [ ] missing acting identity fails
- [ ] wrong issuer fails
- [ ] prefixed or malformed subject fails
- [ ] unauthorized tool call fails in Convex
- [ ] destructive tool execute requires matching preview token

Exit criteria:

- MCP tools are hand-written and product-specific.
- MCP authorization is enforced by Convex, not by tool visibility.
- MCP cannot perform deploy/admin-only actions.

## Phase 10: CLI Cutover

Objective: make setup, sync, deploy, and migration commands use direct Convex
admin/internal paths.

Todos:

- [ ] `init` writes minimal direct Convex/Better Auth/Ginko component files.
- [ ] `init` does not write generated bridge files.
- [ ] `doctor` validates direct setup and detects stale Trellis artifacts.
- [ ] `doctor` prints cleanup instructions for stale bridge files and
      forwarding env vars.
- [ ] `deploy` runs Convex deploy, then direct contract sync.
- [ ] `push` uses direct internal contract sync.
- [ ] `migrate` uses direct internal migration functions.
- [ ] Delete forwarding envelope signing.
- [ ] Delete bridge command group.
- [ ] Keep `CONVEX_DEPLOY_KEY` as setup/admin transport authority only.
- [ ] Ensure deploy-key paths call narrow internal functions, not protected
      member functions.

Verification:

```bash
rg "forwarding|_trellisForwarding|CONVEX_IDENTITY_FORWARDING_KEY|GINKO_CMS_COMPONENT_FORWARDING_KEY|bridge check|ginko-cms bridge" packages/cms/src/cli packages/contract/src test scripts README.md docs
vitest run test/cli test/module
```

Required behavior tests:

- [ ] fresh init creates direct Convex files only
- [ ] stale `convex/ginkoCms/**` is detected as a blocker
- [ ] stale forwarding env vars are reported as cleanup
- [ ] deploy-key contract sync succeeds through internal functions
- [ ] deploy-key cannot perform member/editor/publisher actions

Exit criteria:

- No CLI path signs or validates Trellis forwarding envelopes.
- `doctor` validates the new setup without repairing old bridge files.

## Phase 11: Tests, Fixtures, And Generated Files

Objective: make the test suite prove the new architecture instead of testing
less.

Todos:

- [ ] Replace bridge fixtures with direct Convex setup fixtures.
- [ ] Update package consumer fixture to install `better-convex-nuxt`.
- [ ] Update package E2E to assert no `convex/ginkoCms*` files are created.
- [ ] Update package E2E to verify `#convex/api` and `#convex/server`.
- [ ] Remove bridge factory smoke imports from package E2E.
- [ ] Remove `trellis doctor` from package E2E.
- [ ] Remove Trellis tarball packing from package E2E.
- [ ] Add package export checks for removed surfaces.
- [ ] Run `pnpm run prepare:component` after backend source changes.
- [ ] Regenerate playground Convex output.
- [ ] Scan generated output for stale Trellis vocabulary.

Verification:

```bash
pnpm run prepare:component
pnpm --dir playground exec convex dev --once --typecheck disable --tail-logs disable
pnpm run test
pnpm run test:package-consumer
pnpm run package:e2e
rg "ginkoCmsMcp|component-bridge|operationHandles|operationRefs|_trellisForwarding|__trellis" packages/convex/src/_generated playground/convex/_generated packages test
```

Exit criteria:

- Fixtures fail if old generated bridge files reappear.
- Package E2E proves the new install story.
- Generated files contain no stale Trellis or bridge operation surfaces.

## Phase 12: Docs, ADRs, And Release Metadata

Objective: make the public story match the new architecture.

Docs to update:

- [ ] `README.md`
- [ ] `docs/getting-started/quickstart.md`
- [ ] `docs/getting-started/environment.md`
- [ ] `docs/reference/public-content-api.md`
- [ ] `docs/reference/nuxt-content-provider.md`
- [ ] `docs/maintenance/release-candidate.md`
- [ ] package READMEs
- [ ] compatibility metadata
- [ ] changelog or migration notes

ADRs:

- [ ] Supersede `adr/0003-ginko-owns-install-experience-trellis-is-internal.md`.
- [ ] State that Ginko CMS now uses direct Convex + Better Auth +
      `better-convex-nuxt`.
- [ ] State that CMS invariants remain in the Convex component.
- [ ] State that generated Trellis bridges and forwarding keys are removed.

Docs must say:

- [ ] Ginko CMS uses Convex, Better Auth, and `better-convex-nuxt`.
- [ ] `CONVEX_DEPLOY_KEY` is setup/admin transport authority, not CMS member
      authority.
- [ ] `GINKO_FIRST_OWNER_EMAIL` remains for first-owner bootstrap.
- [ ] Forwarding keys are deleted.
- [ ] Old `convex/ginkoCms*` files should be removed during migration.
- [ ] No new setup step mentions Trellis.

Verification:

```bash
pnpm run check:docs:install-story
pnpm run check:compatibility-matrix
rg "Trellis|trellis|#trellis|@lupinum/trellis|trellis-bridge|_trellisForwarding|CONVEX_IDENTITY_FORWARDING_KEY|GINKO_CMS_COMPONENT_FORWARDING_KEY|convex/ginkoCms|ginkoCmsMcp" README.md docs adr packages test scripts playground
```

Expected grep result:

- Only historical migration notes, old changelog entries, and this migration
  plan may mention Trellis.
- Current install, setup, release, and reference docs must not mention Trellis
  as a live requirement.

Exit criteria:

- Docs, package metadata, compatibility metadata, and package E2E describe the
  same dependency set.
- The migration guide explains stale-file cleanup without providing a dual path.

## Phase 13: Final Verification

Objective: prove Trellis is gone and the CMS still works.

No-zombie checks:

```bash
rg "@lupinum/trellis|@lupinum/trellis-bridge|#trellis|_trellisForwarding|CONVEX_IDENTITY_FORWARDING_KEY|GINKO_CMS_COMPONENT_FORWARDING_KEY" packages test scripts playground README.md docs adr
rg "trellis operations|operationHandles|operationRefs|component-bridge|convex/ginkoCms|ginkoCmsMcp|@lupinum/ginko-cms/bridge" package.json packages scripts test playground README.md docs adr
rg "defineTrellis|defineCaller|getForwardedCaller|trustedReplay|__trellis|@trellis-bridge" packages test scripts playground
```

Expected result:

- No live source, generated setup, fixture, package export, or docs install path
  references Trellis.
- Any remaining hits are historical release notes, ADR supersession text, or
  this migration file.

Focused behavior gates:

- [ ] Studio anonymous user cannot write.
- [ ] Studio non-member cannot write.
- [ ] Owner can manage members and settings.
- [ ] Editor can edit drafts but cannot publish if role rules say so.
- [ ] Publisher can publish according to current CMS policy.
- [ ] Viewer cannot mutate content.
- [ ] First-owner bootstrap works only when no member exists.
- [ ] Bootstrap cannot reopen after any member exists.
- [ ] Public reads work without auth cookies.
- [ ] Public reads return published-only data.
- [ ] Owner-authenticated public reads match anonymous public reads.
- [ ] MCP valid key works.
- [ ] MCP revoked key fails.
- [ ] MCP unauthorized tool calls fail in Convex.
- [ ] CLI deploy-key sync works through internal functions.
- [ ] Deploy key cannot perform member/editor/publisher actions.
- [ ] Destructive actions reject missing, wrong, stale, expired, redeemed, or
      mismatched confirmation tokens.
- [ ] Destructive actions redeem once and write audit.
- [ ] Package consumer installs without Trellis.
- [ ] Package tarballs contain no bridge manifest or operation-handle output.

Commands:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:package-consumer
pnpm run package:e2e
pnpm run audit:prod
pnpm run release:verify
```

Do not run live publish commands.

Exit criteria:

- `pnpm run release:verify` passes.
- The final grep checks show no live Trellis path.
- The package consumer fixture proves the new install story.
- The docs describe one setup story.

## Implementation Todos By Area

Use this as the tactical checklist while implementing phases.

Package and scripts:

- [ ] Root `package.json`
- [ ] `pnpm-lock.yaml`
- [ ] `pnpm-workspace.yaml`
- [ ] `packages/cms/package.json`
- [ ] `packages/convex/package.json`
- [ ] `scripts/package-e2e.mjs`
- [ ] `scripts/foundation-verify.mjs`
- [ ] compatibility metadata
- [ ] docs install-story checks
- [ ] publish specifier checks

Nuxt module and runtime:

- [ ] `packages/cms/src/module.ts`
- [ ] `packages/cms/src/module/**`
- [ ] `packages/cms/src/runtime/pages/studio-host.vue`
- [ ] `packages/cms/src/runtime/**`
- [ ] `packages/cms/studio-app/src/boundary/api.ts`
- [ ] Studio composables under `packages/cms/studio-app/src`

Convex component:

- [ ] `packages/convex/src/functions.ts`
- [ ] `packages/convex/src/componentBridge.ts`
- [ ] `packages/convex/src/auth/checks.ts`
- [ ] `packages/convex/src/members.ts`
- [ ] `packages/convex/src/assets.ts`
- [ ] `packages/convex/src/backup.ts`
- [ ] `packages/convex/src/entries/**`
- [ ] `packages/convex/src/siteData.ts`
- [ ] `packages/convex/src/revalidation.ts`
- [ ] `packages/convex/src/migrations.ts`
- [ ] `packages/convex/src/schema.ts`
- [ ] generated Convex output through `pnpm run prepare:component`

Bridge and installer:

- [ ] `packages/cms/src/bridge/**`
- [ ] `packages/cms/src/module/bridge-manifest.ts`
- [ ] `packages/cms/src/module/convex.ts`
- [ ] `packages/cms/convex/manifest.*`
- [ ] CLI bridge command files
- [ ] CLI forwarding helpers
- [ ] direct setup templates
- [ ] `doctor` stale-artifact detection

MCP:

- [ ] `packages/cms/src/server/mcp/**`
- [ ] MCP middleware
- [ ] MCP tool runtime
- [ ] MCP resources
- [ ] MCP prompts
- [ ] MCP tests

CLI:

- [ ] `init`
- [ ] `doctor`
- [ ] `deploy`
- [ ] `push`
- [ ] `migrate`
- [ ] contract sync helpers
- [ ] deploy-key admin caller

Docs and fixtures:

- [ ] README
- [ ] quickstart
- [ ] environment docs
- [ ] public content docs
- [ ] Nuxt content provider docs
- [ ] release-candidate docs
- [ ] ADR superseding Trellis decision
- [ ] playground Convex files
- [ ] test fixtures
- [ ] package consumer fixture

## Data Model Decisions

Keep:

- `members`: real CMS membership and role state.
- `mcpKeys`: real CMS MCP token state. Secrets stay hashed.
- `publicEntries`: derived public read model.
- `publicRoutes`: derived public route read model.
- `contentAssetRefs`: derived and rebuildable asset reference model.
- `destructiveConfirmations`: destructive safety state.
- `destructiveAuditLog`: destructive audit state.

Delete or strongly challenge:

- `trustedReplay`, after forwarding is gone.
- generic permission tables.
- generic operation registry tables.
- tenant/workspace/organization tables.
- generated bridge manifest tables or files.

Invariant:

- Every derived model must be rebuildable from canonical CMS state and covered
  by tests.

## Failure Modes And Mitigations

The migration fails if Trellis package names disappear but the same architecture
survives under Ginko-owned names.

Local builders become a new Trellis:

- Risk: `defineCmsRuntime` grows into caller forwarding, guards, operation
  metadata, replay, unsafe escapes, and generated descriptors.
- Mitigation: keep only direct Convex builders and plain guard functions.
- Acceptance: no generic framework runtime, operation registry, or forwarding
  hook exists.

MCP recreates the framework:

- Risk: a new universal MCP runtime hides operation dispatch and authorization.
- Mitigation: hand-write tools that call exact Convex refs.
- Acceptance: unauthorized tool calls fail inside Convex.

Permission maps become a second ACL:

- Risk: Studio/MCP capabilities drift from Convex write guards.
- Mitigation: compute capability maps from the same CMS guard rules.
- Acceptance: every write path rechecks authorization in Convex.

`better-convex-nuxt` becomes a policy layer:

- Risk: CMS roles, destructive policy, or MCP auth move into Nuxt config.
- Mitigation: use it only for transport, auth token sync, aliases, and
  composables.
- Acceptance: CMS policy stays in `@lupinum/ginko-cms-convex`.

Existing deployments have stale generated files:

- Risk: old `convex/ginkoCms/**` files break builds after exports are removed.
- Mitigation: `doctor` detects and blocks with cleanup instructions.
- Acceptance: no repair path regenerates bridge compatibility.

Better Auth subject mismatch breaks membership:

- Risk: existing owners become non-members or bootstrap reopens.
- Mitigation: prove Better Auth JWT subject matches stored `members.userId`.
- Acceptance: existing owner remains owner and bootstrap cannot reopen.

Protected server helpers silently run anonymous:

- Risk: `auth: 'auto'` hides missing cookies or token exchange failure.
- Mitigation: use `auth: 'required'` for protected routes and `auth: 'none'`
  for public routes.
- Acceptance: protected routes fail closed.

Deploy key becomes product authority:

- Risk: `CONVEX_DEPLOY_KEY` can mutate CMS content or membership.
- Mitigation: deploy key calls narrow internal setup/sync functions only.
- Acceptance: deploy key cannot perform member/editor/publisher actions.

MCP actor identity collapses:

- Risk: MCP calls act as deploy/admin or null identity.
- Mitigation: keep explicit MCP actor identity and verify it in Convex.
- Acceptance: revoked, malformed, wrong issuer, and missing actor cases fail.

Destructive confirmation gets weaker:

- Risk: execute accepts a token without binding caller, args, operation,
  version, expiry, redemption, and audit.
- Mitigation: preserve the full binding model.
- Acceptance: invariant tests cover all mismatch and replay cases.

Public reads depend on session state:

- Risk: published pages behave differently for anonymous and signed-in users.
- Mitigation: public reads use `auth: 'none'` or unauthenticated
  `ConvexHttpClient`.
- Acceptance: anonymous and owner-authenticated public reads match.

Grep passes but behavior regresses:

- Risk: strings are gone but auth, setup, MCP, or destructive behavior is broken.
- Mitigation: require behavior matrices in Phase 13.
- Acceptance: release gate includes both no-zombie checks and behavior tests.

## Done Definition

The migration is done when:

- Ginko CMS installs without Trellis.
- New host apps do not generate `convex/ginkoCms/**` or `convex/ginkoCmsMcp.ts`.
- No live source imports `@lupinum/trellis`, `@lupinum/trellis-bridge`,
  `#trellis/api`, or `#trellis/mcp`.
- No runtime path requires Trellis forwarding secrets.
- Studio uses direct Convex host context.
- Public content reads are anonymous and stable.
- CLI setup/sync/deploy/migrate use direct internal Convex functions.
- MCP tools are hand-written and authorized by Convex.
- Destructive operations preserve preview/confirmation/execute safety.
- Package E2E proves the new install story.
- Docs describe one setup story: Nuxt + Convex + Better Auth +
  `better-convex-nuxt` + Ginko CMS.
- `pnpm run release:verify` passes.
