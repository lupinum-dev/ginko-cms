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
