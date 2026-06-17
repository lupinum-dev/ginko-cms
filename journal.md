# Ginko CMS Migration Journal

## 2026-06-17

### Start

Objective: migrate `ginko-cms` to the new local Trellis and Ginko Content
versions, finish the full `update.md` plan, keep real-consumer verification in
`/Users/matthias/Git/workspace/i18n-cms`, commit in coherent steps, and finish
with automated and browser-based UX verification.

### Initial Evidence

- `ginko-cms` current branch: `main`.
- `ginko-cms` latest commit: `be49ab5 feat: add Ginko CMS Trellis 0.3.1 migration plan documentation`.
- `ginko-cms` package metadata still targets:
  - `@lupinum/trellis`: `^0.2.0`
  - `@lupinum/trellis-bridge`: `^0.2.0`
  - `@lupinum/ginko-content`: `^0.1.2`
- Trellis source baseline:
  - branch: `hardening`
  - commit: `edfbdc0 fix: harden identity forwarding and replay`
  - package versions: `@lupinum/trellis@0.3.1`,
    `@lupinum/trellis-bridge@0.3.1`
- Trellis `.pack` still contains stale `0.3.0` tarballs, so CMS must not consume
  the current `.pack` contents until Trellis `release:pack` regenerates them.
- Ginko Content source baseline:
  - latest commit: `d3c0de4 chore fix release audit dependency`
  - package version: `@lupinum/ginko-content@0.1.6`
  - local tarball exists: `ginko-content/.pack/lupinum-ginko-content-0.1.6.tgz`
- `i18n-cms` current package metadata still targets the old stack:
  - `@lupinum/ginko-cms`: `^0.1.3`
  - `@lupinum/ginko-content`: `^0.1.2`
  - `@lupinum/trellis`: `^0.2.0`
  - `@lupinum/trellis-bridge`: `^0.2.0`

### Decisions

- Use local tarballs/sibling package paths only during migration. Do not rely on
  npm registry versions for Trellis, Trellis Bridge, Ginko CMS, or Ginko Content.
- Migrate Trellis first, then Ginko Content.
- Treat `i18n-cms` as the real consumer gate, not an optional smoke app.
- If CMS exposes a real Trellis foundation issue, fix Trellis and regenerate the
  local tarball instead of adding CMS compatibility shims.

### Next Steps

1. Regenerate Trellis `0.3.1` local tarballs.
2. Start the Trellis dependency cutover in `ginko-cms`.
3. Let typecheck/test failures drive the lane/forwarding/MCP migration.

### Trellis Local Pack

- Ran `pnpm run release:pack` in `/Users/matthias/Git/workspace/trellis`.
- Produced local tarballs:
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-0.3.1.tgz`
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-bridge-0.3.1.tgz`
- Confirmed stale `0.3.0` tarballs are no longer present in Trellis `.pack`.
- Trellis worktree is clean after packing.

### CMS Trellis Dependency Cutover

- Updated `ginko-cms` manifests and compatibility matrix to Trellis `0.3.1`.
- Left `@lupinum/ginko-content` on `0.1.2` for the Trellis-first phase.
- Added `link-workspace-packages=true` to `.npmrc` so publishable `^0.3.1`
  ranges resolve to the local sibling Trellis workspace during development.
- Ran `pnpm install`; lockfile now resolves:
  - `@lupinum/trellis` to `link:../trellis` / `link:../../../trellis`
  - `@lupinum/trellis-bridge` to local `../trellis/packages/trellis-bridge`
- Passed metadata checks:
  - `pnpm run check:compatibility-matrix`
  - `pnpm run check:publish-specifiers`
  - `pnpm run check:packs:no-workspace-refs`

### Trellis 0.3.1 Typecheck Fixes

- `pnpm run typecheck` initially failed on Trellis 0.3.1 handler typing.
- CMS changes:
  - changed `members.getAccessContext` from `protected` to explicit `public`, preserving the
    existing anonymous `null` access-context behavior.
  - kept rollback execution handlers on `protected` and restated `guard: canEditEntries`
    after operation spreads so the execution lane has an own guard.
- Trellis foundation change:
  - exported `OperationShape` through the public `functions` and `backend` barrels so
    exported operation constants can emit portable declarations.
  - rebuilt Trellis with `pnpm run build:module`.
- `pnpm run typecheck` now passes.

### Explicit Lanes And Trusted Replay

- Replaced old public-read handlers from `protected({ guard: allowPublic })` to explicit
  `public(...)` lane handlers.
- Added a single `public.readTables` allowlist for public content and asset URL reads:
  `assets`, `cmsSettings`, `collections`, `contentAssetRefs`, `entries`,
  `publicEntries`, `publicRoutes`, and `siteData`.
- Added `trustedReplay` table/config for trusted forwarded writes and regenerated the
  Convex component.
- Updated test forwarding helpers to use `createIdentityForwardingEnvelopeArgs` instead of
  the removed raw `createIdentityForwardingEnvelope` export.
- Added replay metadata to forwarded test writes:
  - normal mutations: `jti-redemption`
  - destructive operation execute: `operation-confirmation`
  - actions: `domain-idempotency`
- Passed focused gates:
  - `pnpm exec vitest run test/component/auth/access-context.test.ts test/component/auth/members.test.ts`
  - `pnpm exec vitest run test/refactor/workflow-vertical-slice.test.ts test/shared/mcp-tools.test.ts`
  - `pnpm run test:public-content`

### Trellis Phase Full CMS Check

- Synced vendored CMS contract helpers after the Trellis install surfaced drift in
  `packages/convex/src/lib/cmsContract/path.ts`.
- Kept the stale-surface guard active for code/package surfaces and ignored only
  planning artifacts (`journal.md`, `update.md`) so migration notes can name the private
  `i18n-cms` consumer without relaxing package checks.
- Updated package-boundary expectations to Trellis `^0.3.1`.
- `pnpm run check` passes:
  - format check
  - lint and custom surface guards
  - workspace typecheck/build
  - publish-specifier check
  - Vitest: 90 files passed, 711 tests passed, 1 skipped

### MCP Operation-Backed Write Fix

- `i18n-cms` packaged build surfaced a real Trellis `0.3` hard-cut issue:
  `@lupinum/ginko-cms/dist/server/mcp/_shared/project-tool-runtime.js` still
  imported removed `stampMcpToolSafety` from Trellis MCP.
- Removed the direct MCP mutation lane from `projectTool(...)`; direct writes
  now fail unless backed by an explicit operation.
- Promoted the remaining bounded-write MCP tools to exported Convex operations:
  - `createEntryOperation`
  - `saveEntryDraftOperation`
  - `unarchiveEntryOperation`
  - `moveAssetOperation`
- Kept the existing backend mutation names stable by registering each mutation
  from its operation descriptor.
- Added MCP regression coverage:
  - direct writes are rejected unless operation-backed
  - bounded writes route through `tool.operation(...)` execute refs
  - CMS sources do not contain `stampMcpToolSafety`, `TrellisMcpToolSafety`,
    `rawMcpRuntime.tool.mutation`, or direct-source tool-local `safety:`
    metadata
- Validation after the fix:
  - `pnpm --filter @lupinum/ginko-cms-convex typecheck`
  - `pnpm exec vitest run test/runtime/mcp-project-tool.test.ts test/shared/mcp-tools.test.ts`
  - `pnpm run check` (90 files passed, 713 tests passed, 1 skipped)
  - `pnpm run package:e2e` (local six-tarball fixture install, doctor 32
    passed/1 expected Convex URL warning/0 failures, imports passed)
- `pnpm run package:e2e` passes:
  - packed local tarballs for CMS, Ginko Content, Trellis, and Trellis Bridge
  - workspace-reference scan passed for all six tarballs
  - fixture installed `@lupinum/ginko-content@0.1.6` and `@lupinum/trellis@0.3.1`
  - fixture doctor: 32 passed, 1 Convex URL env warning, 0 failures
  - package imports passed

### Trellis 0.3.1 Repack After Consumer Fix

- Trellis publish-surface initially resolved through `ginko-cms/node_modules` because its
  local `node_modules` symlinks were stale from the consumer workspace. Removed and
  reinstalled Trellis `node_modules` so validation used Trellis' own lockfile.
- Trellis checks passed:
  - `pnpm run check:publish-surface`
  - `pnpm run test:security` (26 files passed, 277 tests passed)
- Committed Trellis consumer fix:
  - `894b6b2 fix: export operation shape from runtime barrels`
- Regenerated local Trellis tarballs with `pnpm run release:pack`:
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-0.3.1.tgz`
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-bridge-0.3.1.tgz`

### Trellis Phase Package E2E

- Ran `pnpm run package:e2e` in `ginko-cms`.
- The package fixture installed local tarballs, not registry packages:
  - `@lupinum/ginko-cms@0.1.3`
  - `@lupinum/ginko-cms-contract@0.1.1`
  - `@lupinum/ginko-cms-convex@0.1.2`
  - `@lupinum/ginko-content@0.1.6`
  - `@lupinum/trellis@0.3.1`
  - `@lupinum/trellis-bridge@0.3.1`
- Packed tarball workspace-reference check passed for all six tarballs.
- Fixture doctor result: 32 passed, 1 warning for missing Convex URL env, 0 failures.
- Fixture package imports passed.
- Result: `package e2e ok`.

### Ginko Content 0.1.6 Cutover

- Updated CMS to consume `@lupinum/ginko-content@^0.1.6`.
- Updated CMS compatibility matrix release stack to `@lupinum/ginko-content@0.1.6`.
- Ran `pnpm install`; lockfile resolves Ginko Content to local sibling package:
  `link:../../../ginko-content/packages/content`.
- Synced CMS contract vendor from Ginko Content and passed:
  - `pnpm run sync:cms-contract-vendor`
  - `pnpm run check:cms-contract-vendor`
- Focused content/provider tests passed:
  - `test/module/content-contract.test.ts`
  - `test/refactor/workflow-path.test.ts`
  - `test/refactor/golden-fixtures.test.ts`
  - `test/refactor/provider-contract.test.ts`
  - `test/shared/nuxt-provider.test.ts`
  - `test/shared/nuxt-provider-package-conformance.test.ts`
- `pnpm run check` passes:
  - format check
  - lint and custom surface guards
  - workspace typecheck/build
  - publish-specifier check
  - Vitest: 90 files passed, 711 tests passed, 1 skipped

### Ginko Content Provider And Consumer Fix

- `i18n-cms` exposed a real provider-boundary issue after the Ginko Content
  cutover:
  - CMS search tests covered the provider's internal `term` shape.
  - Nuxt Content's public search endpoint can pass the requested text as `q`,
    which reaches the CMS provider as `query`.
  - `i18n-cms` also searches across `docs`, `posts`, and `versions`, while the
    CMS provider implementation only exercised one collection.
- Fixed the CMS provider boundary directly:
  - normalized `request.query || request.term || ""`
  - searched every requested collection
  - returned the collection id on each search result
- Focused provider tests passed:
  - `pnpm exec vitest run test/shared/nuxt-provider.test.ts test/refactor/provider-contract.test.ts`
- Full CMS verification passed:
  - `pnpm run check`
  - `pnpm run package:e2e`

### i18n-cms Real Consumer Verification

- Updated `/Users/matthias/Git/workspace/i18n-cms` to consume the local packed
  migration stack through direct `file:` dependencies and matching workspace
  overrides:
  - `@lupinum/ginko-cms@0.1.3`
  - `@lupinum/ginko-cms-contract@0.1.1`
  - `@lupinum/ginko-cms-convex@0.1.2`
  - `@lupinum/ginko-content@0.1.6`
  - `@lupinum/trellis@0.3.1`
  - `@lupinum/trellis-bridge@0.3.1`
- Consumer checks passed:
  - `pnpm install --force`
  - `pnpm run typecheck`
  - `pnpm run build` (211 routes prerendered)
  - built-server `pnpm run smoke:cms` with
    `GINKO_CMS_TEST_EMAIL=matthias@me.com`
- Runtime probes passed against `http://localhost:9999`:
  - CMS search endpoint returned `Security Enhancements`,
    `/changelog/security`, and `"collection":"versions"`.
  - English and German sitemap probes returned docs, blog, and changelog routes.
- In-app browser verification passed:
  - docs, blog, author, and changelog pages render from CMS content
  - English/German route alternates resolve correctly
  - visible search palette returns CMS-backed `security` results
  - Studio login works with the smoke credentials
  - `/studio/settings` renders settings/storage hygiene content after login

### Release Gate Follow-Up

- Attempted broad release gates after the functional migration checks.
- Important correction: do not run these broad gates in parallel. CMS
  `package:e2e` rebuilds and packs sibling Trellis/Ginko Content outputs, which
  can race with release builds in those repositories.
- `ginko-cms pnpm run release:verify` passed through format, lint, typecheck,
  tests, and package e2e. It failed at `pnpm audit --prod --audit-level low`.
  The audit report includes dependency paths through local linked packages and
  currently blocks publish readiness.
- `ginko-content pnpm run release:verify` failed during the parallel run because
  a built `dist` file disappeared while examples were building. Treat this as a
  parallel-run artifact until rerun alone.
- `trellis pnpm run release:verify` failed at publish-surface typechecking while
  resolving mixed Nuxt schema versions from the CMS workspace install. Reinstall
  or isolate Trellis dependencies, then rerun it alone.
- Current status:
  - migration functionality is verified in CMS and `i18n-cms`
  - publish readiness is still blocked on clean serial release gates
