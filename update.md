# Ginko CMS Trellis 0.3.1 Migration Plan

## Goal

Move `ginko-cms` onto the new local Trellis security foundation first, then move
to the latest local Ginko Content package only after the Trellis migration is
working and verified.

Validated local stack:

- `@lupinum/trellis`: local `0.3.1` tarball from `/Users/matthias/Git/workspace/trellis`
- `@lupinum/trellis-bridge`: local `0.3.1` tarball from `/Users/matthias/Git/workspace/trellis`
- `@lupinum/ginko-content`: local `0.1.6` tarball from `/Users/matthias/Git/workspace/ginko-content`

Assumptions:

- `ginko-cms` is greenfield enough for hard cutovers.
- `ginko-cms` is the first and only real Trellis consumer for this migration.
- Trellis `0.3.1` is committed locally on `hardening` but not published yet.
- If `ginko-cms` exposes a real Trellis foundation issue, fix Trellis directly,
  rebuild the local tarball, and continue. Do not add CMS compatibility shims for
  broken Trellis foundation behavior.

Current Trellis source baseline:

- Branch: `hardening`
- Commit: `eca631c docs: record final release verification`
- Version metadata: `@lupinum/trellis@0.3.1` and
  `@lupinum/trellis-bridge@0.3.1`
- Trellis `release:verify` and `release:pack` now pass serially for this
  baseline.
- Local tarballs must be regenerated whenever Trellis changes. Stale `0.3.0`
  tarballs in `/Users/matthias/Git/workspace/trellis/.pack` are not valid inputs
  for this migration.

Current execution checkpoint:

- Latest Trellis checkpoint on `hardening`:
  `eca631c docs: record final release verification`.
- Trellis `0.3.1` release validation passed serially at this checkpoint:
  - `pnpm run release:verify`
  - `pnpm run release:pack`
- Current local Trellis tarballs:
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-0.3.1.tgz`
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-bridge-0.3.1.tgz`
- `ginko-cms` package e2e also copied the current Trellis tarballs into the CMS
  package proof directory:
  - `/Users/matthias/Git/workspace/ginko-cms/.pack/lupinum-trellis-0.3.1.tgz`
  - `/Users/matthias/Git/workspace/ginko-cms/.pack/lupinum-trellis-bridge-0.3.1.tgz`
- Ginko Content `0.1.6` release validation passed serially:
  - `pnpm run release:verify`
  - release pack wrote
    `/Users/matthias/Git/workspace/ginko-content/.pack/lupinum-ginko-content-0.1.6.tgz`
- `ginko-cms` Trellis phase now resolves local packages during development via
  sibling workspace links, while package e2e installs local tarballs. We are not
  validating against the npm registry for Trellis, Trellis Bridge, CMS, or Ginko
  Content during this migration.
- CMS validation passed after the final Trellis/Ginko Content cutover:
  - `pnpm run check`: 90 test files passed, 713 tests passed, 1 skipped.
  - `pnpm run package:e2e`: package imports passed; `trellis doctor` reported
    33 passed checks, 1 expected missing Convex URL env warning, and 0 failures.
- Package e2e installed local tarballs for:
  - `@lupinum/ginko-cms@0.1.3`
  - `@lupinum/ginko-cms-contract@0.1.1`
  - `@lupinum/ginko-cms-convex@0.1.2`
  - `@lupinum/ginko-content@0.1.6`
  - `@lupinum/trellis@0.3.1`
  - `@lupinum/trellis-bridge@0.3.1`
- Packaged `i18n-cms` consumer build exposed one additional Trellis `0.3`
  hard-cut issue: the CMS server MCP bundle still imported removed
  `stampMcpToolSafety`/`TrellisMcpToolSafety` exports.
- CMS MCP write fix is now applied:
  - Direct MCP mutations are rejected by `projectTool(...)`.
  - `create-entry`, `save-entry-draft`, `unarchive-entry`, and `move-asset`
    are now backed by exported Convex operation descriptors with
    `safety: "bounded-write"`.
  - Destructive MCP tools still use backend previews and confirmations.
  - Static MCP tests now assert there is no `stampMcpToolSafety`,
    `TrellisMcpToolSafety`, `rawMcpRuntime.tool.mutation`, or tool-local
    direct-source `safety:` metadata.
- Re-run after the MCP fix:
  - `pnpm run check` passed: 90 files passed, 713 tests passed, 1 skipped.
  - `pnpm run package:e2e` passed with regenerated local tarballs for CMS,
    CMS Convex, CMS Contract, Ginko Content `0.1.6`, Trellis `0.3.1`, and
    Trellis Bridge `0.3.1`.
- Ginko Content phase is now green in `ginko-cms`:
  - CMS declares `@lupinum/ginko-content` as `^0.1.6`.
  - CMS compatibility matrix release stack records `@lupinum/ginko-content@0.1.6`.
  - `pnpm-lock.yaml` resolves Ginko Content to the local sibling package during
    development: `link:../../../ginko-content/packages/content`.
  - CMS contract vendor was synced from Ginko Content `0.1.6`.
  - Focused content/provider tests passed: content contract, workflow paths,
    golden fixtures, provider contract, Nuxt provider, and package conformance.
  - `pnpm run check` passed.
  - `pnpm run package:e2e` passed with local Ginko Content `0.1.6`, local Trellis
    `0.3.1`, local Trellis Bridge `0.3.1`, and packed CMS tarballs.
- Final `i18n-cms` consumer validation passed with only local `file:` tarballs:
  - `pnpm install --force`
  - `pnpm run typecheck`
  - `pnpm run build`
  - built-server smoke against `http://127.0.0.1:9999`:
    `CMS_SMOKE_BASE_URL=http://127.0.0.1:9999 GINKO_CMS_TEST_EMAIL=matthias@me.com GINKO_CMS_TEST_PASSWORD=oms345pb pnpm run smoke:cms`
  - direct probes confirmed CMS search and sitemap output:
    - `/api/_content/search?q=security&locale=en` returned
      `/changelog/security` and `Security Enhancements`.
    - `/sitemap_index.xml` listed `__sitemap__/en-US.xml` and
      `__sitemap__/de-DE.xml`.
    - English sitemap included `/docs/code-blocks`, `/blog`, and
      `/changelog/security`.
    - German sitemap included `/de/dokumentation/codebloecke`, `/de/blog`, and
      `/de/aenderungen/security`.
  - in-app browser verification confirmed:
    - `/docs/code-blocks` rendered `Code Blocks` with `lang="en-US"`.
    - `/de/dokumentation/codebloecke` rendered `Codebloecke` with
      `lang="de-DE"`.
    - the visible language switcher moved from the English docs route to the
      German translated route.
    - the search dialog returned the localized security result.
    - `/studio/settings` loaded for `Matthias <matthias@me.com>` and showed
      settings, members, and MCP keys.
    - Studio loaded from a content-hashed base path like
      `/_ginko-cms-studio/f2af70255ebe/assets/main.js`, with no query-string
      versioning and no current browser console errors.
- CMS Studio asset loading finding:
  - Query-string versioning on `main.js?v=...` was rejected because Vite lazy
    chunks import `./main.js` without the query, splitting module identity and
    causing runtime failures.
  - The final fix is a content-hashed Studio asset base path, relative Vite
    production asset URLs, and no separate `assetVersion` runtime field.
  - The Studio mount-root wrapper is required. Without it, the clean consumer
    smoke timed out waiting for `Storage hygiene`.
- Current Trellis judgement:
  - No open Trellis-core design blocker is known after the current consumer
    proof.
  - Remaining risks are CMS/consumer hygiene items, not Trellis foundation
    blockers: keep the remaining protected-handler inventory intentional, keep
    `unsafeRaw` allowlisted, and keep package/browser proof fresh whenever
    Trellis changes.

## Non-Goals

- Do not migrate Ginko Content in the same pass as Trellis until the Trellis
  phase is green.
- Do not keep Trellis `0.2` and `0.3` paths side by side.
- Do not re-export removed Trellis unsafe APIs to make old CMS code compile.
- Do not add feature flags, adapters, or compatibility wrappers for unreleased
  CMS internals.
- Do not move CMS product policy into Trellis or Ginko Content.

## Migration Rule

Prefer this order when something breaks:

1. Delete the old path.
2. Rewrite the call site to the new Trellis model.
3. Fix Trellis if the new model is wrong or incomplete for a real consumer.
4. Add CMS-local structure only if the acceptance criterion proves it is needed.

## Hotspot Audit Findings

These are the concrete hotspots found before the migration starts. Re-check them
while executing the phases instead of treating them as theoretical risks.

### Backend Lane Inventory

Current post-cutover scan:

```bash
rg -n "caller(Query|Mutation|Action)\\.protected\\(" packages/convex/src -g '!**/_generated/**' | wc -l
```

Result: `85` protected handlers.

The obvious public-read migration is complete, but this is still enough surface
to keep inventory pressure on future changes. Classify remaining `protected`
usage by intent instead of treating it as the default lane:

- Public content/provider reads in
  `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/public.ts` and
  public asset URL reads in
  `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/assets.ts` now use
  the `public` lane rather than `protected({ guard: allowPublic })`.
- Bootstrap-only signed-in flows, especially
  `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/members.ts`, may
  belong on `authenticated` or stay `protected` only if the bootstrap predicate
  is truly custom.
- CMS role/permission flows across editor, assets, members, site data,
  diagnostics, revalidation, imports, and backup should move toward
  permission-backed lanes. Prefer `workspace({ permission })` if Trellis supports
  CMS's singleton workspace shape cleanly; otherwise fix Trellis or make the
  remaining `protected({ guard })` usage explicit and tested.
- Operation preview/execute handlers need special review. Keep the operation
  metadata and destructive confirmation binding intact while changing lanes.

Keep or add inventory tests so new `protected` usage is intentional. The test
should fail on `guard: open`/`allowPublic` inside `protected`, and should require
a short allowlist or rationale for any remaining `protected({ guard })` handler.

### Removed Trellis Export Hits

Resolved removed/unsafe API hits:

- Test identity forwarding now uses the verifier-produced envelope args path.
- CMS no longer imports or mocks `stampMcpToolSafety` or
  `TrellisMcpToolSafety`.
- CMS does not re-export or shim removed Trellis MCP safety APIs.
- Direct MCP writes were hard-cut to operation-backed writes. The only direct
  MCP tools left are read-only queries.

Keep these as hard failures during the rest of the migration. Do not add
replacement CMS wrappers for removed Trellis APIs. Either switch to the new
Trellis proof/operation API or fix Trellis if the new API is missing a real
consumer capability.

### Unsafe Raw Inventory

Current `unsafeRaw` allowlist:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/collections/sync.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/mcpKeys.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/migrations.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/settings.ts`

Re-justify each one under Trellis `0.3`:

- Collection sync is installer/contract installation.
- Migration import is admin/bootstrap tooling.
- Bootstrap settings is installer/bootstrap state.
- MCP token lookup happens before a request has a CMS app identity. Keep it only
  if the bridge caller path cannot produce a verifier-backed proof earlier.

If any `unsafeRaw` use becomes a normal Studio or MCP write path, delete it and
route through the operation/lane model instead.

### Public Read Tables

Trellis `0.3` public handlers get constrained DB access. The public content
queries read CMS public projection tables and related public-safe metadata.
Before moving handlers to the public lane, inventory exact tables used by:

- `public.page`
- `public.routeMeta`
- `public.list`
- `public.nav`
- `public.surround`
- `public.search`
- `public.sitemap`
- `public.singleton`
- `public.siteData`
- `assets.getAssetUrl`

Add `defineTrellis(..., { public: { readTables } })` only for the tables proven
by this inventory. Do not include draft, member, token, audit, confirmation, or
internal migration tables in public reads.

### MCP Runtime Model

`project-tool-runtime.ts` now has two valid paths:

- destructive tools use `rawMcpRuntime.tool.operation(...)`
- bounded-write tools use `rawMcpRuntime.tool.operation(...)` with exported
  Convex operation descriptors
- read-only tools use direct query registration

Under Trellis `0.3`, direct MCP writes must not survive as the default. A new
write tool must first get a backend operation descriptor with the real guard,
args, return validator, operation id, and MCP safety classification.

The acceptance criterion for this hotspot is simple: no
`stampMcpToolSafety`, no tool-local write safety metadata, and no raw MCP write
helper remains in CMS.

## Phase 0: Baseline And Inputs

Record the current baseline before edits.

Commands:

```bash
pnpm run check
pnpm run package:e2e
```

Expected result:

- The current `0.2` stack is either green or has known unrelated failures.
- Any known failures are written down before changing dependencies.

Local tarball inputs:

```bash
pnpm --dir /Users/matthias/Git/workspace/trellis run release:pack
```

Acceptance:

- Local `0.3.1` Trellis tarballs exist under
  `/Users/matthias/Git/workspace/trellis/.pack`.
- No stale `0.3.0` Trellis or Trellis Bridge tarball is used by CMS package e2e.
- `ginko-cms` is ready to consume sibling Trellis through its existing
  `package:e2e` flow.

## Phase 1: Trellis Dependency Cutover

Update only Trellis-related package metadata first.

Files:

- `/Users/matthias/Git/workspace/ginko-cms/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/compatibility.json`
- `/Users/matthias/Git/workspace/ginko-cms/pnpm-lock.yaml`

Changes:

- Move `@lupinum/trellis` from `^0.2.0` to the local `0.3.1` target range.
- Move `@lupinum/trellis-bridge` from `^0.2.0` to the local `0.3.1` target range.
- Keep `@lupinum/ginko-content` unchanged for this phase.
- Update tests that assert package ranges so they assert the new Trellis stack.

Commands:

```bash
pnpm install
pnpm run check:compatibility-matrix
pnpm run check:publish-specifiers
```

Acceptance:

- Package metadata and compatibility matrix agree on one Trellis version.
- No workspace-only dependency leaks into packed package metadata.
- Ginko Content remains unchanged.

## Phase 2: Backend Authority Lane Cutover

Cut CMS backend functions to explicit Trellis `0.3` lanes.

Primary file:

- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/functions.ts`

Audit all CMS Convex handlers that currently rely on old `protected` or
guard-first authoring.

Lane policy:

- `public`: unauthenticated public reads only.
- `authenticated`: signed-in access without CMS role/permission semantics.
- `workspace`: CMS permission-backed handlers using real `definePermission(...)`
  objects.
- `protected`: only for custom predicates that are not expressible as
  authenticated or workspace permission lanes.
- `unsafe`: installer/bootstrap/internal escape hatches only, with explicit
  permit use.

Expected edits:

- Replace old `callerQuery.protected({ guard: canRead })` style calls with the
  correct explicit lane where possible.
- Keep CMS permission definitions in CMS.
- Do not add transport-layer business policy.
- Remove old helper exports if they only exist to preserve the previous model.

Commands:

```bash
pnpm --filter @lupinum/ginko-cms-convex typecheck
pnpm run check:component-auth-boundaries
pnpm run check:convex-surface
```

Acceptance:

- Every backend handler has one obvious authority lane.
- There is no `protected` handler with `guard: open`.
- There is no workspace-like handler without a real permission definition.
- Unsafe functions remain rare and allowlisted.

## Phase 3: Forwarding And Trusted Transport

Replace old direct identity forwarding usage with Trellis `0.3` proof-based
transport.

Known high-risk current imports:

- `/Users/matthias/Git/workspace/ginko-cms/test/helpers.ts`
- `/Users/matthias/Git/workspace/ginko-cms/test/refactor/workflow-vertical-slice.test.ts`

Rules:

- Do not restore `createIdentityForwardingEnvelope` as a public Trellis backend
  export.
- Do not add `auth: "trusted"` style literals.
- Server, MCP, and trusted component calls must use verifier-produced proof.
- Tests should exercise the same public/verifier path as production where
  practical.

If Trellis does not expose a sufficient testing helper:

- Add the smallest Trellis testing/server API that represents the real model.
- Cover it in Trellis tests.
- Rebuild the Trellis local tarball.
- Continue the CMS migration.

Commands:

```bash
pnpm run typecheck
pnpm vitest run test/helpers.ts test/refactor/workflow-vertical-slice.test.ts
```

Acceptance:

- No CMS source or test imports removed Trellis forwarding helpers from
  `@lupinum/trellis/backend`.
- Trusted calls are proof-backed.
- Tests do not encode a bypass that production cannot use.

## Phase 4: MCP Operation Safety

Verify CMS MCP tools against Trellis `0.3` operation-backed writes.

Files:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/server/mcp`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/server/middleware/mcp-auth.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/mcpKeys.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/bridge/mcp.ts`

Rules:

- MCP read tools may stay read-only tools.
- MCP write/destructive tools must bind to backend operations.
- Destructive actions must use preview/confirmation/execute.
- Token creation, token consumption, and revocation must not become raw writes
  from the MCP server layer.

Commands:

```bash
pnpm vitest run test/runtime/mcp-runtime.test.ts test/runtime/mcp-project-tool.test.ts test/shared/mcp-tools.test.ts
pnpm run check:live-mcp-tokens
pnpm run check:installer-bridge-boundary
```

Acceptance:

- No tool-local safety stamping.
- No raw MCP write helper path.
- MCP identity is bound to the backend caller model.
- Destructive replay/idempotency behavior is covered.

## Phase 5: Bridge And Generated Host Files

Regenerate and validate bridge output against Trellis Bridge `0.3`.

Files:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/bridge`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/convex.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/convex/manifest.js`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/convex/manifest.d.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/componentBridge.ts`

Commands:

```bash
pnpm run prepare:component
pnpm --filter @lupinum/ginko-cms build
pnpm vitest run test/module/bridge-api-parity.test.ts test/module/package-boundaries.test.ts test/module/e2e-boot.test.ts
```

Acceptance:

- Bridge APIs come from `@lupinum/trellis-bridge`.
- No stale `@lupinum/trellis/bridge` or `@lupinum/trellis/functions` bridge imports.
- Generated host files install and drift-check cleanly.

## Phase 6: Trellis Phase Verification

Run the full CMS gates with local Trellis tarballs.

Commands:

```bash
pnpm run check
pnpm run package:e2e
```

If package e2e fails because of a real Trellis packaging or runtime issue:

1. Fix Trellis.
2. Run Trellis focused tests.
3. Rebuild Trellis local tarballs.
4. Re-run CMS package e2e.

Do not patch CMS around a broken Trellis package contract unless the issue is
clearly CMS-specific.

Acceptance:

- `pnpm run check` passes.
- `pnpm run package:e2e` installs packed CMS, packed CMS Convex, packed CMS
  Contract, and local packed Trellis/Trellis Bridge into a temp consumer.
- `trellis doctor`, Convex codegen, Nuxt prepare, and Nuxt typecheck pass in the
  package e2e consumer.

## Phase 7: Browser Smoke For Trellis Phase

Use the in-app browser after the app boots successfully.

Start the playground:

```bash
pnpm run dev
```

Browser scenarios:

- Studio loads.
- First owner bootstrap works.
- Sign-in/sign-out state is correct.
- Access context and role-gated navigation behave correctly.
- Create an entry draft.
- Publish the entry.
- Confirm the public route/API/provider output.
- Unpublish or archive through destructive preview/confirmation.
- Create and revoke an MCP key.
- Exercise one MCP read path and one operation-backed write path if the local
  MCP route is enabled.

Acceptance:

- Auth state and CMS access state agree.
- Draft writes do not mutate public output.
- Publish writes public projection exactly once.
- Destructive operations require confirmation.
- MCP calls use the same backend authority model as Studio calls.

## Phase 8: Real Consumer Verification: i18n-cms

`/Users/matthias/Git/workspace/i18n-cms` is the required real-consumer app for
this migration. The playground is useful for CMS package development, but this
app is the acceptance target for real content, sitemap, search, i18n switching,
CMS provider mode, and login.

Consumer app facts:

- App root: `/Users/matthias/Git/workspace/i18n-cms`
- Dev URL: `http://localhost:9999`
- Dev command: `pnpm run dev`
- Build command: `pnpm run build`
- Typecheck command: `pnpm run typecheck`
- Existing browser smoke script: `pnpm run smoke:cms`
- Nuxt modules include `@lupinum/ginko-content`, `@lupinum/ginko-cms`,
  `@nuxtjs/i18n`, and `@nuxtjs/sitemap`.
- Ginko Content uses `provider: "cms"`, CMS search, sitemap, translated slugs,
  English and German locales, and `prefix_except_default` routing.

Test login:

```bash
EMAIL=matthias@me.com
PASSWORD=oms345pb
```

Commands:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
pnpm install
pnpm run typecheck
pnpm run build
GINKO_CMS_TEST_EMAIL=matthias@me.com GINKO_CMS_TEST_PASSWORD=******** pnpm run smoke:cms
```

Use `browser:control-in-app-browser` for the manual browser verification pass.
Keep the browser in the background unless the user explicitly asks to watch.

Start the app:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
pnpm run dev
```

Browser scenarios to confirm:

- Visit `http://localhost:9999` and confirm the English home page renders from
  CMS content.
- Switch to German and confirm the URL and visible text switch correctly.
- Visit `/pricing` and `/de/preise`.
- Visit `/docs` and `/de/dokumentation`; open at least one nested docs page.
- Visit `/blog` and `/de/blog`; open localized blog posts.
- Visit `/authors/...` and `/de/autoren/...` to verify translated route
  prefixes and relation-backed author data.
- Visit `/changelog` and `/de/aenderungen`.
- Run a visible search flow and confirm results are CMS-backed and localized.
- Fetch or visit sitemap output and confirm English and German routes appear,
  including translated route paths.
- Log in through Studio with the test credentials.
- Confirm `/studio/settings` loads after login.
- Confirm access context, member role, and Studio navigation are correct.
- Create or edit a low-risk draft entry, then verify draft changes do not affect
  public output until publish.
- Publish a test change only if the test content is intentionally disposable.
  Otherwise use preview/read-only Studio checks.
- Confirm logout/login still works after the migration.

Acceptance:

- `i18n-cms` typecheck passes.
- `i18n-cms` build passes.
- `smoke:cms` passes with the configured login.
- Browser verification confirms content, search, sitemap, i18n route switching,
  Studio login, and CMS provider reads.
- Any failure in `i18n-cms` is treated as a release blocker unless it is clearly
  unrelated to Trellis/Ginko CMS/Ginko Content.

## Phase 9: Ginko Content Cutover

Only start after Trellis phase is green in `ginko-cms` and
`/Users/matthias/Git/workspace/i18n-cms`.

Target:

- `@lupinum/ginko-content`: local `0.1.6` tarball from
  `/Users/matthias/Git/workspace/ginko-content`

Current Ginko Content source baseline:

- Package: `@lupinum/ginko-content@0.1.6`
- Local tarball currently exists at
  `/Users/matthias/Git/workspace/ginko-content/.pack/lupinum-ginko-content-0.1.6.tgz`
- Public package exports are intentionally narrow: `.`, `./config`, `./server`,
  `./client`, `./toc`, `./cms-contract`, `./cms-import`,
  `./testing/provider-fixture`, `./testing/provider-contract`, and
  `./transformers`.
- `./cms-contract` is the pure/V8-safe surface for CMS contract derivation,
  path generation, schema introspection, and MDC parsing.
- `./cms-import` is Node-side migration/import support and must not leak into
  Convex component runtime.

Important changes since the current CMS peer `^0.1.2`:

- `0.1.3`: removed old named collection declaration overload. Collection map
  keys are the only collection identity source.
- `0.1.3`: expanded verified provider-shape behavior for docs, blog, authors,
  navigation, search, route metadata, i18n paths, and sitemap assertions.
- `0.1.4`: normalized agent markdown output to `/raw/*.md`.
- `0.1.5`: fixed markdown `$` refs, runtime config links, no-i18n route links,
  and requested-locale fallback URLs.
- `0.1.6`: removed runtime imports of raw content config, serialized
  function-backed agent pages into runtime-safe markdown, and preserved derived
  collection reference metadata for runtime validation without live schemas.

Files:

- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/package.json`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/compatibility.json`
- `/Users/matthias/Git/workspace/ginko-cms/pnpm-lock.yaml`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/module/content-contract.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/migration/index.ts`
- `/Users/matthias/Git/workspace/ginko-cms/packages/cms/src/nuxt-provider.mjs`
- `/Users/matthias/Git/workspace/ginko-cms/packages/convex/src/lib/cmsContract`
- `/Users/matthias/Git/workspace/ginko-cms/scripts/sync-cms-contract-vendor.mjs`
- `/Users/matthias/Git/workspace/ginko-cms/vitest.config.ts`
- `/Users/matthias/Git/workspace/i18n-cms/package.json`
- `/Users/matthias/Git/workspace/i18n-cms/pnpm-lock.yaml`

Dependency rule:

- Do not rely on the registry during this phase.
- `ginko-cms` package metadata may declare the real peer range, but all
  verification must consume the local tarball or sibling package path.
- `ginko-cms/scripts/package-e2e.mjs` already discovers
  `/Users/matthias/Git/workspace/ginko-content/packages/content`, builds it,
  packs it, and installs it as a `file:` dependency unless `--registry-deps` is
  used.
- `i18n-cms` must use local `file:` overrides for Ginko Content and the packed
  CMS packages while validating this migration. Do not let it silently resolve
  `@lupinum/ginko-content` from npm.

Source-of-truth decisions to make before editing:

- `@lupinum/ginko-content/cms-contract` must remain the canonical source for
  path semantics, MDC parsing, CMS schema/field contract derivation, and
  Convex-safe content shapes.
- CMS currently vendors a Convex-safe subset from Ginko Content through
  `/Users/matthias/Git/workspace/ginko-cms/scripts/sync-cms-contract-vendor.mjs`.
  The vendor script reads:
  - `core/content/slug.ts`
  - `core/content/path.ts`
  - `core/markdown/tree.ts`
  - `cms-contract/mdc.ts`
  - selected runtime content types
- CMS's generated vendored index currently exports
  `projectContentPathToLocale` and `pathHasLocalePrefix` from the vendored
  subset, but the public `@lupinum/ginko-content/cms-contract` index does not
  export those helpers. Resolve this deliberately:
  - Preferred: promote these pure helpers into Ginko Content's public
    `cms-contract` surface, add/adjust Ginko Content export tests, then sync the
    CMS vendor.
  - Alternative: delete the extra vendored CMS exports and adjust CMS call
    sites/tests to only use the public `cms-contract` surface.
- Do not keep a CMS-only path helper surface that claims to be generated from
  `cms-contract` while exporting helpers unavailable from that public contract.

CMS implementation checkpoints:

- Update `@lupinum/ginko-content` peer/range and
  `/Users/matthias/Git/workspace/ginko-cms/packages/cms/compatibility.json`.
- Re-run `pnpm install` in `ginko-cms` after metadata changes.
- Run `pnpm run sync:cms-contract-vendor` after deciding the contract surface.
- Keep `cms-import` imports isolated to migration/CLI code. It imports parser,
  graph, YAML/JSON, and content internals, so it is not Convex-safe.
- Verify `packages/cms/src/module/content-contract.ts` still derives CMS
  collections from `content.config.ts` with collection-map identity, translated
  slugs, field metadata, relation metadata, and singleton route settings.
- Verify `packages/cms/src/nuxt-provider.mjs` still satisfies Ginko Content's
  provider contract for page, list, route meta, navigation, surround, search,
  sitemap, site data, and cache tags.
- Keep package-resolution tests in the loop because Vitest aliases
  `@lupinum/ginko-content/cms-contract` and `cms-import` directly to sibling
  source. Source aliases are useful for development, but the packed package
  export map is the release contract.

Commands:

```bash
pnpm --dir /Users/matthias/Git/workspace/ginko-content run release:pack
pnpm --dir /Users/matthias/Git/workspace/ginko-content run pack:check
pnpm --dir /Users/matthias/Git/workspace/ginko-content run test:package-consumer
pnpm install
pnpm run sync:cms-contract-vendor
pnpm run check:cms-contract-vendor
pnpm vitest run test/module/content-contract.test.ts test/refactor/workflow-path.test.ts test/refactor/golden-fixtures.test.ts test/refactor/provider-contract.test.ts test/shared/nuxt-provider.test.ts test/shared/nuxt-provider-package-conformance.test.ts
pnpm run check
pnpm run package:e2e
```

Run the real consumer again after the Ginko Content cutover:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
pnpm install
pnpm run typecheck
pnpm run build
GINKO_CMS_TEST_EMAIL=matthias@me.com GINKO_CMS_TEST_PASSWORD=oms345pb pnpm run smoke:cms
pnpm run dev
```

Use `browser:control-in-app-browser` again against `http://localhost:9999`.
Repeat the Phase 8 browser scenarios with extra attention to:

- translated slug route identity
- localized search results
- sitemap alternates and translated paths
- author relation population
- docs navigation tree ordering
- route-page previous/next semantics from `useContentPage(..., { surround })`
- CMS-backed search rather than static section-data search
- `/raw/*.md` agent markdown route shape if the app exposes or links agent
  markdown

Acceptance:

- Ginko Content is consumed from the local `0.1.6` tarball or sibling package,
  not npm.
- Ginko Content contract is the single canonical source.
- CMS vendored Convex-safe contract is generated and parity-tested.
- `cms-import` remains Node/migration-only and does not leak into Convex runtime.
- Provider, navigation, search, sitemap, and public route behavior remain covered.
- `ginko-cms` package e2e proves the packed package export map, not only source
  aliases.
- `i18n-cms` still passes typecheck, build, `smoke:cms`, and browser checks for
  content, search, sitemap, and i18n switching.

Before publishing Ginko Content, also run its full release gate:

```bash
pnpm --dir /Users/matthias/Git/workspace/ginko-content run release:verify
```

Ginko Content release-gate follow-up from 2026-06-17:

- The earlier missing `dist/core/markdown/tree.js` failure was reproduced only
  in the parallel broad-gate run. A serial Ginko Content gate passed beyond that
  point, including package build, docs build/prerender, examples build, main
  tests, e2e tests, package-consumer, browser e2e, search matrix, and static
  sitemap checks.
- The serial gate then failed only at `pnpm audit --prod --audit-level low`.
  The audit paths were production dependency graph issues, not CMS adapter
  issues.
- The direct Ginko Content production dependencies were moved to patched
  releases where possible:
  - `js-yaml` to `^4.2.0`
  - `ws` to `^8.21.0`
- Patched transitive production dependencies were pinned through
  `/Users/matthias/Git/workspace/ginko-content/pnpm-workspace.yaml` overrides:
  `@babel/core@7.29.6`, `esbuild@0.28.1`, `launch-editor@2.14.1`,
  `tar@7.5.16`, and `vite@7.3.5`.
- The pnpm package extension for `vue-docgen-web-types@0.1.8` was moved from
  root `package.json` into `pnpm-workspace.yaml`, because pnpm 10 ignores the
  root `pnpm.packageExtensions` field in this workspace.
- Focused post-fix checks passed:

```bash
pnpm --dir /Users/matthias/Git/workspace/ginko-content run build:packages
pnpm --dir /Users/matthias/Git/workspace/ginko-content run test:package-consumer
pnpm --dir /Users/matthias/Git/workspace/ginko-content run test:e2e:browser
pnpm --dir /Users/matthias/Git/workspace/ginko-content run audit:prod
```

Completed serial release gate for Ginko Content after the audit fix:

```bash
pnpm --dir /Users/matthias/Git/workspace/ginko-content run release:verify
```

Result:

- Passed `dev:prepare`, lint, package build, docs build/prerender, examples
  build, main tests, e2e tests, typecheck, quickstart typecheck/build,
  package-consumer, browser e2e, search matrix, static sitemap, and production
  audit.
- `release:pack` completed inside the gate and wrote:
  `/Users/matthias/Git/workspace/ginko-content/.pack/lupinum-ginko-content-0.1.6.tgz`

## Final Release Verification

After both phases are green:

```bash
pnpm run release:verify
```

Before publishing Trellis `0.3.1`, keep the serial Trellis gate green:

```bash
pnpm --dir /Users/matthias/Git/workspace/trellis run release:verify
```

Optional registry check only after Trellis and Ginko Content are actually
published:

```bash
pnpm run release:verify:registry
```

Do not run publish commands from an agent session.

## Done Criteria

- `ginko-cms` uses one Trellis authority model: explicit backend lanes.
- No old Trellis `0.2` auth, forwarding, bridge, or MCP write path remains.
- Local packed Trellis/Trellis Bridge `0.3.1` work in `ginko-cms` package e2e.
- Trellis `0.3.1` has a clean `release:verify` before any publish.
- Browser smoke confirms real Studio, auth, publish, destructive operation, and
  MCP flows.
- `/Users/matthias/Git/workspace/i18n-cms` passes typecheck, build, `smoke:cms`,
  and browser verification for login, content, search, sitemap, and i18n route
  switching.
- Ginko Content is updated only after the Trellis track is green, then verified
  through CMS package e2e and `i18n-cms`.
- Ginko Content has a clean `release:verify` before any publish.
- No second source of truth was introduced.
- No compatibility shim was left behind for unreleased internals.

## Execution Notes: Local Stack Cutover

Date: 2026-06-17

Local package rule:

- Do not consume npm registry builds for Lupinum packages during this migration.
- `i18n-cms` must point direct dependencies at local tarballs from
  `/Users/matthias/Git/workspace/ginko-cms/.pack`.
- `i18n-cms/pnpm-workspace.yaml` must also override the same packages so
  transitive dependencies cannot silently resolve from npm:
  - `@lupinum/ginko-cms`
  - `@lupinum/ginko-cms-contract`
  - `@lupinum/ginko-cms-convex`
  - `@lupinum/ginko-content`
  - `@lupinum/trellis`
  - `@lupinum/trellis-bridge`
- Validate with:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
pnpm why @lupinum/trellis --depth 6
pnpm why @lupinum/ginko-content --depth 6
rg "@lupinum\\+trellis@0\\.|@lupinum\\+ginko-content@0\\." node_modules/.pnpm pnpm-lock.yaml
```

Expected:

- `pnpm why @lupinum/trellis --depth 6` reports one version,
  `@lupinum/trellis@0.3.1`.
- `pnpm why @lupinum/ginko-content --depth 6` reports the local
  `@lupinum/ginko-content@0.1.6` tarball.
- No installed registry fallback for the Lupinum migration packages.
- Note: source paths embedded in bundled stack traces can still show stale
  package names from generated/sourcemap context. Treat the lockfile and
  `pnpm why` result as the package-resolution source of truth.

### Phase 2: Ginko Content Cutover After Trellis Is Green

Once the Trellis phase is green in CMS, do the same hard-cut process for
Ginko Content. This phase should not introduce an adapter layer between
Ginko Content and CMS. The CMS provider boundary is the right place for
small input normalization when Nuxt sends a real provider shape that differs
from CMS tests.

Required source checks:

- Diff Ginko Content `0.1.6` public/provider surfaces against the CMS usage:

```bash
cd /Users/matthias/Git/workspace/ginko-content
rg "export .*cms-contract|export .*cms-import|interface .*Provider|type .*Provider|search\\(" packages/content/src packages/content/dist
```

- Diff CMS usage of Ginko Content:

```bash
cd /Users/matthias/Git/workspace/ginko-cms
rg "@lupinum/ginko-content|cms-contract|cms-import|contentProvider\\.search|useContentSearch" packages test
```

Expected decisions:

- Keep Ginko Content as the canonical content contract source.
- Keep CMS vendored contract output Convex-safe and parity-tested.
- Keep `cms-import` out of Convex runtime; it is migration/import tooling.
- Delete stale CMS assumptions when Ginko Content supports a broader provider
  shape.

Concrete issue found during consumer verification:

- `i18n-cms` config uses CMS-backed search across `docs`, `posts`, and
  `versions`.
- Nuxt Content's public search endpoint accepts `q`; provider-level callers can
  send either `term` or `query` depending on which layer invokes the provider.
- CMS provider tests only covered the older internal `term` shape.
- CMS provider search must normalize `request.query || request.term || ""` and
  run every requested collection instead of rejecting multi-collection search.
- This is not a shim: it is the public provider boundary accepting the shape
  Nuxt actually sends.

Acceptance for Phase 2:

- `pnpm run check` passes in `/Users/matthias/Git/workspace/ginko-cms`.
- `pnpm run package:e2e` passes in `/Users/matthias/Git/workspace/ginko-cms`
  and regenerates local tarballs.
- `i18n-cms` reinstalls after the tarball regeneration:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
pnpm install --force
pnpm run typecheck
pnpm run build
```

- Built-server smoke uses the configured credentials:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
zsh -c 'set -a; source .env.local; PORT=9999 node .output/server/index.mjs'
CMS_SMOKE_BASE_URL=http://localhost:9999 \
  GINKO_CMS_TEST_EMAIL=matthias@me.com \
  GINKO_CMS_TEST_PASSWORD=oms345pb \
  pnpm run smoke:cms
```

### `i18n-cms` Browser And Runtime Verification

Use `browser:control-in-app-browser` against the built server on
`http://localhost:9999`. The built server is preferred for final validation
because the dev server can hit a Node 26 Nuxt IPC socket issue in this
environment.

Scenarios to confirm:

- Login:
  - `/studio/auth/signin?redirect=/studio/settings`
  - Sign in with the configured smoke credentials.
  - Confirm `/studio/settings` renders settings content such as storage hygiene.
- Content:
  - `/docs/code-blocks` renders `Code Blocks`.
  - `/blog/asian-cuisine` renders `Exploring the Culinary Wonders of Asia`.
  - `/authors/alexia` renders `Alexia Wong` and related content.
  - `/changelog/security` renders `Security Enhancements`.
- I18n switching:
  - `/docs/code-blocks` switches to `/de/dokumentation/codebloecke`.
  - `/blog/asian-cuisine` has German alternate
    `/de/blog/asiatische-kueche`.
  - `/changelog/security` has German alternate
    `/de/aenderungen/security`.
- Search:
  - Public endpoint:

```bash
curl -s 'http://localhost:9999/api/_content/search?q=security&locale=en' \
  | rg 'Security Enhancements|/changelog/security'
```

- Palette search opened from the visible search button returns
  `Security Enhancements` for `security`.
- Sitemap:

```bash
curl -s http://localhost:9999/__sitemap__/en-US.xml \
  | rg '/docs/code-blocks|/blog/asian-cuisine|/changelog/security'
curl -s http://localhost:9999/__sitemap__/de-DE.xml \
  | rg '/de/dokumentation/codebloecke|/de/blog/asiatische-kueche|/de/aenderungen/security'
```

Browser note:

- Direct browser navigation to XML/API URLs can be blocked by the in-app
  browser's client-side protections. Verify XML/API surfaces with `curl` and
  use the browser for rendered UI behavior.

### Verification Results: 2026-06-17

CMS package verification:

- `pnpm exec vitest run test/shared/nuxt-provider.test.ts
test/refactor/provider-contract.test.ts` passed.
- `pnpm run check` passed.
- `pnpm run package:e2e` passed and regenerated local tarballs in `.pack`.
- Package e2e doctor reported 32 passed, 1 warning, 0 failures. The warning was
  the expected missing Convex URL in the temporary app.

`i18n-cms` consumer verification:

- `pnpm install --force` completed against local `file:` tarballs.
- `pnpm run typecheck` passed.
- `pnpm run build` passed and prerendered 211 routes.
- Built-server smoke passed:

```bash
CMS_SMOKE_BASE_URL=http://localhost:9999 \
  GINKO_CMS_TEST_EMAIL=matthias@me.com \
  GINKO_CMS_TEST_PASSWORD=oms345pb \
  pnpm run smoke:cms
```

- A plain `pnpm run smoke:cms` without `CMS_SMOKE_BASE_URL` starts the Nuxt dev
  server and can fail in this Node 26 environment with a Nuxt Vite IPC socket
  error while probing `/studio/auth/signin`. Treat that as an environment/dev
  harness issue unless it reproduces against the built server. Final validation
  uses `CMS_SMOKE_BASE_URL=http://127.0.0.1:9999` against the built server with
  `.env.local` loaded.
- Search endpoint passed:

```bash
curl -s 'http://localhost:9999/api/_content/search?q=security&locale=en' \
  | rg 'Security Enhancements|/changelog/security|"collection":"versions"'
```

- EN and DE sitemap probes passed for docs, blog, and changelog routes.
- In-app browser verification passed:
  - rendered content pages for docs, blog, author, and changelog
  - EN/DE canonical and alternate links
  - palette search for `security` returning `Security Enhancements`
  - Studio login with the smoke credentials and `/studio/settings` storage
    hygiene content
  - final visual screenshots confirmed desktop home/docs, German docs,
    localized search results, Studio settings, Studio blog-post listing, and a
    mobile German docs viewport without browser console errors

Remaining non-blocking warnings:

- Nuxt site config warns that `http://localhost:9999` is a localhost URL.
- Build still emits existing large-chunk warnings.
- Final validation uses the built server because the dev server can hit a
  Node 26 Nuxt IPC socket issue in this environment.

### Release Gate Follow-Up: 2026-06-17

The migration stack is functionally green through CMS package e2e and the
`i18n-cms` consumer. The release gates below were rerun serially after the audit
and dependency-isolation fixes.

Do not run the Trellis, Ginko Content, and CMS release gates in parallel. CMS
`package:e2e` rebuilds and packs sibling Trellis/Ginko Content packages, so a
parallel release run can mutate `dist` while another repository is building.

Final release-gate evidence:

- `ginko-content pnpm run release:verify` passes serially after the audit fix.
  It also ran `release:pack` and wrote the local
  `/Users/matthias/Git/workspace/ginko-content/.pack/lupinum-ginko-content-0.1.6.tgz`
  tarball.
- `trellis pnpm run release:verify` passes serially after isolating Trellis'
  local install from the CMS workspace symlink state.
- `trellis pnpm run release:pack` passes and regenerated:
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-0.3.1.tgz`
  - `/Users/matthias/Git/workspace/trellis/.pack/lupinum-trellis-bridge-0.3.1.tgz`
- `ginko-cms pnpm run release:verify` passes serially:
  - format check: 778 files ok
  - lint and custom guards ok
  - typecheck/build ok
  - tests: 90 files passed, 713 tests passed, 1 skipped
  - package e2e installed local tarballs for CMS, CMS Convex, CMS Contract,
    Ginko Content `0.1.6`, Trellis `0.3.1`, and Trellis Bridge `0.3.1`
  - package e2e doctor: 32 passed, 1 expected missing Convex URL warning,
    0 failures
  - production audit: no known vulnerabilities

Final local consumer verification order:

```bash
cd /Users/matthias/Git/workspace/i18n-cms
pnpm install --force
pnpm run typecheck
pnpm run build
zsh -c 'set -a; source .env.local; PORT=9999 HOST=127.0.0.1 node .output/server/index.mjs'
CMS_SMOKE_BASE_URL=http://127.0.0.1:9999 \
  GINKO_CMS_TEST_EMAIL=matthias@me.com \
  GINKO_CMS_TEST_PASSWORD=oms345pb \
  pnpm run smoke:cms
```

If Trellis or Ginko Content need fixes, apply them in the source repository,
regenerate local tarballs, reinstall `ginko-cms`/`i18n-cms` against those
tarballs, and rerun the CMS plus consumer verification. Do not add CMS
compatibility paths around release-gate failures from the libraries.

Runtime note: starting the built server without `.env.local` causes CMS provider
API routes to fail with missing `NUXT_PUBLIC_CONVEX_URL`. That is a bad preview
command, not a CMS migration failure.

### Current-State Rerun: 2026-06-17

After the final documentation and lockfile state, the current verification pass
was rerun against the worktree:

- `ginko-cms pnpm run release:verify` passed.
- `i18n-cms pnpm install --force` passed against the freshly regenerated local
  tarballs.
- `i18n-cms pnpm run typecheck` passed.
- `i18n-cms pnpm run build` passed and prerendered 211 routes.
- Built-server smoke passed with
  `CMS_SMOKE_BASE_URL=http://127.0.0.1:9999`.
- CMS-backed search endpoint and localized sitemap probes passed.
- In-app browser visual verification passed for public content, locale
  switching, search, Studio settings, Studio content listing, and mobile German
  docs.

### Current-State Rerun: 2026-06-18

The consumer proof was rerun after refreshing the local package tarball
integrities in `/Users/matthias/Git/workspace/i18n-cms/pnpm-lock.yaml`.

Package wiring:

- `i18n-cms/package.json` and `i18n-cms/pnpm-workspace.yaml` resolve
  `@lupinum/ginko-cms`, `@lupinum/ginko-cms-contract`,
  `@lupinum/ginko-cms-convex`, `@lupinum/ginko-content`,
  `@lupinum/trellis`, and `@lupinum/trellis-bridge` from local `file:`
  tarballs under `../ginko-cms/.pack`.
- No npm-registry Trellis/Ginko package was used for this validation.

Command verification:

- `pnpm install --force` passed and refreshed only local tarball lock
  integrities/snapshots.
- `pnpm run typecheck` passed.
- `pnpm run build` passed and prerendered 211 routes, including localized
  content routes, sitemap output, and content payload/API routes.
- `TMPDIR=/tmp GINKO_CMS_TEST_EMAIL=... GINKO_CMS_TEST_PASSWORD=... pnpm run smoke:cms`
  passed. `TMPDIR=/tmp` avoids the Nuxt dev-server
  Vite IPC socket path issue seen under the default macOS temp path.
- Built-server smoke passed:

```bash
zsh -c 'set -a; source .env.local; PORT=9999 HOST=127.0.0.1 node .output/server/index.mjs'
CMS_SMOKE_BASE_URL=http://127.0.0.1:9999 \
  GINKO_CMS_TEST_EMAIL=matthias@me.com \
  GINKO_CMS_TEST_PASSWORD=oms345pb \
  pnpm run smoke:cms
```

In-app browser verification:

- Public content rendered:
  - `/docs/code-blocks` showed `Code Blocks`.
  - `/de/dokumentation/codebloecke` showed `Codebloecke` with
    `lang="de-DE"`.
  - `/blog`, `/de/blog`, `/pricing`, `/de/preise`,
    `/changelog/security`, and `/de/aenderungen/security` rendered localized
    headings and canonical routes.
- Search worked from the visible docs search button:
  - query `markdown` returned `Markdown Syntax`
  - query `security` returned `Security Enhancements`
- Locale switching worked from the header locale selector:
  - `/docs/code-blocks` switched to `/de/dokumentation/codebloecke`
  - the header selected `Deutsch`
  - visible German docs links were prefixed with `/de/`
- Studio auth worked:
  - signed out from the existing session
  - signed in with the configured smoke credentials
  - login landed on `/studio/`, then `/studio/settings` loaded with settings,
    member, storage hygiene, and MCP key sections
- Studio content navigation worked for representative routes:
  - `/studio/content/docs`
  - `/studio/content/posts`
  - `/studio/content/index`
  - `/studio/assets`
  - `/studio/activity`
- A clean built-server in-app browser tab confirmed docs, German docs, search,
  and Studio settings with no new timestamp-filtered browser warnings/errors.

Sitemap verification:

- Direct XML navigation is blocked by the in-app browser with
  `net::ERR_BLOCKED_BY_CLIENT`, so sitemap output was verified via HTTP from
  the running app.
- `/sitemap.xml` returned the expected redirect document to
  `/sitemap_index.xml`.
- `/sitemap_index.xml` referenced both locale sitemaps:
  - `/__sitemap__/en-US.xml`
  - `/__sitemap__/de-DE.xml`
- Locale sitemap probes confirmed representative routes:
  - `/docs/code-blocks`
  - `/de/dokumentation/codebloecke`
  - `/blog`
  - `/de/blog`

Remaining non-blocking follow-up:

- Browser/server logs still report Vue Router warnings for unprefixed translated
  German docs paths such as `/dokumentation/codebloecke`. Rendered links are
  correctly prefixed with `/de/...`, and direct navigation works. Track this as
  a likely derived navigation/i18n resolution warning to clean up in
  Ginko Content or the consumer navigation composition, not as a Trellis
  release blocker.
