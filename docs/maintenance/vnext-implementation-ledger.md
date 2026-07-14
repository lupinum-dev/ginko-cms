# vNext Implementation Ledger

This file is chronological implementation evidence for the coordinated Ginko
Content 0.4 and Ginko CMS 0.2 work. Architecture and acceptance requirements
remain authoritative in:

- `ginko-content/VNEXT-0.4.md` at
  `2402ff7aafd5cb22e2d856b96ee026a424c11218`;
- `ginko-cms/ginko-cms-complete-migration-plan.md` at
  `b05c7555b8f5383fa753cbe29ccac9cd25f5a787`.

Historical release evidence is not current certification.

## 2026-07-13 — Accepted starting state

### Repositories

| Repository                     | Branch                     | Accepted HEAD                              | Working tree                                                                    |
| ------------------------------ | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Ginko Content                  | `codex/docs-vnext-exports` | `8a264ee5bb277c484b089f8edd21ae7a9aebd335` | clean                                                                           |
| Ginko CMS                      | `trellis-off`              | `b05c7555b8f5383fa753cbe29ccac9cd25f5a787` | clean before this ledger                                                        |
| Better Convex Nuxt (read-only) | `codex/security-hardening` | `467aa0eeb24d26b3695482420807c892959fc683` | dirty: 98 porcelain entries; 44 index changes and 73 worktree/untracked entries |

The accepted clean Ginko Content 0.3 release baseline is tag `0.3.0` at
`72a022b`. The five commits after the 0.4 specification commit are focused 0.3
runtime, localized-route, agent-contract, packed-import, and documentation
changes; they do not implement the 0.4 resolved contract, data source, or
portability surface.

Ginko CMS starts from the implementation baseline `125828d0` plus the
coordinated plan and historical-evidence documentation at `b05c7555`. Its
acceptance matrix is entirely `open` at this starting commit.

The Better Convex Nuxt tree contains pre-existing, user-owned authentication
hardening, documentation, dependency/lockfile, playground, and test work in
both the index and worktree. It is evidence input only. This goal will not edit,
stage, commit, reset, hide, or otherwise modify it.

### Toolchain

- Node: `v24.18.0`
- pnpm through Corepack: `10.33.0`
- Date/time zone: `2026-07-13`, `Europe/Vienna`

### Current phase and work package

- Coordinated phase: Work Package 1 — secure identity and auth topology.
- Active objective: make first-owner bootstrap, credential-kind resolution,
  auth-secret handling, Studio auth topology, and callable guards fail closed.
- Acceptance is not inferred from existing source. Every matrix row remains
  open until its named executable evidence passes.

### Known pre-existing changes

- Ginko Content: none uncommitted.
- Ginko CMS: none uncommitted before creation of this ledger.
- Better Convex Nuxt: the 98-entry dirty state summarized above. Its relevant
  lifecycle/auth behavior may be inspected and tested, but its changes are not
  owned by this goal.

### Deferred and prohibited scope

The following remain outside this implementation: generic transactional
source/target portability ports; working or draft export; Studio bulk
portability UI; MCP bulk portability authority; production Cloudflare, SQL, or
remote-CMS adapters; managed PDF portability; automatic remote-asset
downloading; archive wrappers; compatibility shims or simultaneous old/new
paths. No npm publication, tag, push, release, or production deployment is
authorized. Better Convex Nuxt is read-only.

### Initial audit commands

- `git branch --show-current`, `git rev-parse HEAD`, and `git status --short`
  in all three repositories: completed; results recorded above.
- `node --version`: passed (`v24.18.0`).
- `corepack pnpm --version`: passed (`10.33.0`).
- Specification object checks with `git cat-file -t`: both authoritative
  commits exist and resolve to commit objects.
- Post-0.3 Content log and diff audit: completed; no 0.4 implementation work
  was found.

## 2026-07-13 — WP1 secure identity and auth topology

### Objective and acceptance criteria

Make first-owner bootstrap, browser/API-key identity, auth-secret handling,
Studio route protection, and every MCP-reachable protected callable fail
closed. Acceptance required the six WP1 rows in the coordinated matrix to have
direct executable evidence.

### Repository ownership

- Ginko CMS: implementation, tests, documentation, generated component types,
  and acceptance-matrix updates.
- Better Convex Nuxt: read-only execution of its existing route-protection e2e.
- Ginko Content: unchanged.

### Files and hard cutovers

- Removed caller-controlled bootstrap email from the public and component
  schemas and from Studio submission. The host continues to supply only the
  deployment-owned configured email; the component persists and authorizes the
  verified JWT email.
- Added the private `auth/credentialKind.ts` issuer hook. Better Auth API-key
  validation marks its synthetic session before the Convex JWT is issued;
  browser JWTs receive `user-session` and API-key JWTs receive `mcp-api-key`.
  Deleted `sessionId` inference and the fallback-to-browser behavior from caller
  resolution.
- Deleted the `ginko-cms-dev-secret` runtime fallback. Runtime and doctor now
  require `BETTER_AUTH_SECRET`.
- Deleted the supported `convex.auth: false` path and the unauthenticated Studio
  bridge/script branch. The generated Studio host route now carries
  `convexAuth: true`; auth pages remain unprotected.
- Added permission-bearing `manageBackups` and `managePortability` guards.
  Backup operations use `manageBackups`, diagnostics use `manageSettings`, and
  MCP entry backup uses `deleteEntries` plus an exact entry-scope check. The
  global `can()` boundary now denies every unscoped guard for MCP identities.
- Recorded API-key expiry in CMS credential settings and deny expired,
  revoked, missing, mismatched, or unreadable credential state on the next
  direct Convex call.
- Regenerated Convex bindings with `pnpm run prepare:component`; only the
  relevant bootstrap, permission, and credential-expiry type deltas remain.

No compatibility path, dual identity resolver, public auth helper, new table,
cache, job, or portability operation was added.

### Test-first evidence

The initial focused run failed 15 new assertions, reproducing all five source
defects: caller email authority, `sessionId` inference, missing credential-kind
helpers, fallback secret, auth-disabled topology, missing route metadata, and
scope-blind guards. Implementation followed only after that red run.

Added or extended evidence covers:

- hostile/missing/mismatched/concurrent first-owner claims;
- real Better Auth browser and Bearer API-key Convex-token issuance;
- missing, unknown, revoked, expired, wrong-owner, and failed-lookup credential
  state;
- role x origin x every permission scope;
- direct backup, download, restore, artifact-delete, and diagnostic wrapper
  denial;
- MCP backup entry-scope restriction;
- missing-secret runtime helper and doctor output;
- module rejection of `convex.auth: false` and protected Studio route metadata.

### Commands and results

- Focused red run: 15 expected failures, 47 existing passes.
- Focused final CMS run: 9 files, 81 tests passed.
- `pnpm run prepare:component`: passed after rebuilding the canonical Contract
  package first. The first attempt correctly stopped during module analysis
  because codegen saw stale built Contract output; no deployment state changed.
- `pnpm run typecheck`: passed.
- `pnpm run test`: 110 files passed, 1 skipped; 872 tests passed, 1 skipped.
- `pnpm run check`: passed, including formatting, lint/boundary checks,
  typecheck/build, publish-specifier checks, and the full test suite.
- Better Convex Nuxt read-only
  `pnpm vitest run test/e2e/route-protection.e2e.test.ts`: 1 file and 3 tests
  passed, proving signed-out redirect, unprotected auth pages, and no protected
  mount while auth is pending. The porcelain status hash was identical before
  and after (`90c0588d43a56b52c3df27a87e735bc929e766ac5bb158ff6404bdd4da20c0cb`).

### Artifacts and runtime scenarios

No tarball was produced for WP1; exact development and candidate tarballs are
owned by the later coordinated integration and artifact work packages. The
route-protection runtime scenario used the current read-only Better Convex Nuxt
tree and is work-package evidence, not candidate certification.

### Commit and acceptance matrix

- Ginko CMS implementation commit:
  `4a373ab8` (`fix!: make CMS identity and authentication fail closed`).
- Ginko Content commit: none.
- Updated to `implemented`: First-owner identity, JWT credential kind, Required
  auth secret, Studio route protection, Unsupported auth-disabled topology,
  Permission-complete call guards.

### Open findings and next phase

- No WP1 blocker remains.
- Better Convex Nuxt remains dirty and read-only; its existing user-owned work
  was not modified.
- Next work package: WP2 canonical Content policy, beginning upstream in Ginko
  Content with the one resolved contract and canonical hash.

## 2026-07-13 — WP2 canonical Ginko Content policy

### Objective and acceptance criteria

Make one closed, resolved Ginko Content artifact the only CMS collection,
field, route, locale, fallback, reference, media, and portable-component policy.
Acceptance required exact drift reporting, one transactional policy/collection
install, consistent derived runtime reads, and a generation-safe reindex that
cannot finish a mixed generation.

### Repository ownership and hard cutovers

- Ginko Content added the exact `ResolvedContentContractV1` builder, canonical
  JSON SHA-256, strict trust-boundary validator, and the canonical contract plus
  hash on the resolved Content module context.
- Ginko CMS now installs the lossless contract and hash in `cmsPolicies` and
  derives locale settings and Studio collection rows in the same Convex
  mutation. A failed collection compatibility check rolls the entire mutation
  back.
- Deleted CMS-owned collection installation/check callables, inline
  `ginkoCms.collections`, `collectionsDir` module configuration, mutable Studio
  locale policy, `content: false`, `contentTranslatedSlugs`, and the public
  `@lupinum/ginko-cms/config` helper export. The filesystem migration command's
  input-directory option remains separate migration tooling, not runtime
  policy.
- Nuxt i18n is compatibility validation only. Private Content runtime policy
  wins over public Content runtime fallback; neither is merged with public CMS
  runtime configuration.
- Collection-local defaults now drive projection hrefs, diagnostics, public
  routes, image fallback, and public reads. Exact Content fallback arrays are
  read from the installed policy rather than reconstructed from the lossy
  single-fallback Studio projection.
- Reindex jobs carry requested and applied contract generations. Replacement
  resets phase and cursor; stale pages restart. Published projections are
  rebuilt from immutable revisions, old and new paths are revalidated, and the
  terminal job is deleted only after the requested generation is verified.

No compatibility shim, second policy parser, independently hashed sub-policy,
frontend orchestration path, cache, or parallel read model was added.

### Test-first and invariant evidence

Focused red runs first reproduced missing strict validation, missing canonical
module exposure, stale policy drift, transactional partial-write risk, and the
mixed-generation reindex defect. The final suites cover:

- exact closed artifact validation, malformed values, and cyclic fallbacks;
- canonical hashing and concrete field/array drift paths;
- mismatched-hash and malformed-policy rejection before any write;
- exact policy, locale, and collection installation in one mutation;
- rollback to the old exact policy when collection drift requires migration;
- private-versus-public Content runtime precedence and Nuxt i18n disagreement;
- removed CMS policy options failing clearly instead of being ignored;
- collection-local default hrefs, exact fallback chains, diagnostics, provider
  rows/routes, and policy-generation revalidation;
- page-one pause, generation replacement, complete replay of 51 rows under the
  replacement generation, verification, and one clean terminal state.

### Commands and results

- Ginko Content unit/contracts suite: 46 files and 424 tests passed.
- Ginko Content source typecheck and build: passed.
- Ginko Content `dev:pack`: passed from clean commit `ae5b9ecf5195`; an isolated
  fresh consumer verified the SHA-256, installed the tarball through a short
  local filename, runtime-imported the builder, validator, and hasher, and
  reproduced the canonical empty-contract hash.
- Ginko CMS focused policy/runtime/diagnostics/fallback suite: 4 files and 34
  tests passed.
- Ginko CMS `pnpm run prepare:component`: passed and regenerated bindings.
- Ginko CMS integrated focused regression suite: 5 files and 53 tests passed.
- Ginko CMS `pnpm run check`: passed, including format, lint and boundary
  checks, Contract build, Convex and module typechecks, Studio build/typecheck,
  integrated playground prepare, publish-specifier checks, and 112 passed test
  files plus 1 skipped; 885 tests passed plus 1 skipped.
- Better Convex Nuxt remained at
  `467aa0eeb24d26b3695482420807c892959fc683`; its pre-existing dirty tree was
  inspected only and not modified.

### Immutable development artifact

- Path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.ae5b9ecf5195.452b9ebcf1aca8ed76d4e9c58a3022b5d78a6e759c459425332b31f4f628314a.tgz`
- SHA-256:
  `452b9ebcf1aca8ed76d4e9c58a3022b5d78a6e759c459425332b31f4f628314a`
- The adjacent evidence JSON records the clean source commit. This is a
  development artifact only; it is not compatibility or release
  certification.

### Commits and acceptance matrix

- Ginko Content:
  - `c1f89d0` — `feat!: resolve the portable content contract`
  - `1db9aa3` — `build: add immutable development artifacts`
  - `11b070c` — `feat: validate resolved content artifacts at trust boundaries`
  - `ae5b9ec` — `feat: expose the canonical contract from Content setup`
- Ginko CMS:
  - `5134f4ba` — `fix!: make Ginko Content policy canonical in CMS`
- Updated to `implemented`: Canonical Content policy, Atomic policy and
  collection sync, Generation-safe reindex.

### Open findings and next phase

- No WP2 blocker remains. Package candidate versions, standalone-workspace
  installation, and compatibility recording remain owned by WP8 and were not
  pulled forward.
- Next work package: WP2A versioned contract upgrade, resumable migration
  ledger, validation, activation, and recovery drill.

## WP2A — Versioned Upgrade And Recovery

### Implemented evidence

- Content migrations now persist source/contract-bound runs, per-entry
  input/output receipts, transactional cursors, target-validation receipts,
  and expiring single-use transition approvals.
- Finalization validates the stored drafts against the exact proposed Content
  contract. Activation rechecks every validated draft version and applies an
  explicit `preserve`, `rebuild`, or `unpublish` public-output strategy without
  leaving mixed contract generations.
- Focused migration tests prove changed-source rejection, committed receipt
  skipping, retry conflicts, exact approval consumption, and edit-after-
  validation invalidation.
- Commit `2d4827e0` is the coordinated v0.1.3 credential bridge: it retains only
  the legacy table needed for a bounded one-shot delete, records aggregate audit
  counts, exposes no legacy authentication function, and proves retry safety.
  Commit `dfd11ef1` removes the empty table, cutover function, and temporary host
  wrapper while retaining the audit receipt table.
- Permanent entry deletion and forced referenced-asset purge were deleted.
  Asset restore is limited to missing assets with no current content references.
- The deploy-key backup CLI was deleted. Custom `snapshot` exports are documented
  as bounded comparison artifacts; official Convex deployment snapshots are the
  disaster-recovery source, and downgrade to v0.1.3 is unsupported.
- Backup archive v2 strictly checks schema/package/contract metadata, table
  allowlists, row and byte counts, payload checksums, row limits, and asset-byte
  limits. Filesystem migration uses `lstat`, rejects symlinks and non-files,
  tracks real directories, and caps depth, file count, and bytes before parsing.
- Focused verification passed 74 tests across migrations, backup, credential,
  tree, filesystem, CLI, and generated-bridge suites. Workspace typecheck,
  component generation, module build, Studio build/typecheck, and playground
  prepare passed.

### Remaining WP2A release evidence

- Run the exact packed v0.1.3 bridge and final candidate against a sanitized
  deployment snapshot, including a forced batch-two interruption/retry.
- Complete the official Convex snapshot restore drill and retain its operator
  evidence. Until that drill passes, `Recoverable destructive actions` remains
  open in the acceptance matrix.
- Add total import-run duration plus entry/locale/field/relation-edge limits and
  resumable server-side import batches. Until those bounds pass hostile fixtures,
  `Bounded import and archive parsing` remains open.

## 2026-07-13 — WP3 provider, render, and asset safety boundary

### Objective and acceptance criteria

Replace the untyped CMS provider boundary with exact Content-owned wire
decoders, enforce the one public Markdown render policy before publication and
rendering, resolve assets only as bounded document-scoped facts, and derive all
stored image identity from verified bytes. Acceptance required adversarial
decoders, secret-safe errors, no arbitrary asset-string replacement, no generic
anonymous asset lookup, MIME/signature mismatch rejection, and bounded cleanup
recovery when invalid storage deletion fails.

### Repository ownership and hard cutovers

- Ginko Content added strict decoders for all seven CMS public operations,
  authoritative request/response fact checks, one render-policy validator used
  by browser and agent output, incremental PNG/JPEG/GIF/WebP verification, and
  the exact structured public asset-fact envelope.
- Ginko CMS converted the provider source from JavaScript plus handwritten
  declarations to TypeScript built declarations. Transport uses a recursively
  allowlisted error envelope and one request-cached caller.
- Publication and projection rebuild validate stored AST through the exact
  Content render policy. Managed body-image identifiers are validated against
  active verified assets before the canonical URL rule is evaluated.
- Asset registration is now an action that reads the Convex storage blob,
  verifies bytes through Content, and performs one internal insert containing
  immutable SHA-256, byte count, media type, dimensions, and frame count.
  Caller MIME, size, and dimensions were deleted.
- Deleted the public `getAssetUrl` query and generated host wrappers. Public
  queries now return at most 100 exact asset facts while the published entry,
  locale, and field path are known. The provider rewrites only a matching exact
  path and identity; unrelated asset-looking strings remain unchanged.
- Public reference extraction is schema-aware for image fields and parsed body
  image nodes. Invalid-upload deletion retries use one operational cleanup task
  with five bounded attempts and an operator-visible terminal state.
- Removed AVIF, PDF, and document upload policy from the initial verified image
  profile. No compatibility shim, dual resolver, asset metadata projection, or
  provider-side asset query remains.

### Test-first and invariant evidence

Expected red runs first reproduced malformed public result acceptance, request
fact substitution, unsafe Markdown nodes/props/protocols, arbitrary asset-string
replacement, caller-provided upload metadata, MIME/signature mismatch, missing
verified facts, and the anonymous global-asset resolver.

Final focused evidence covers exact decoder failures for every public
operation; collection/locale substitution; recursive navigation typing;
script/style/iframe/SVG/event/protocol render probes; PNG checksums and exact
terminals; JPEG/GIF/WebP container bounds; upload cleanup; structured nested
field resolution; unchanged arbitrary asset-like strings; one caller with no
asset lookup; and public projection reference identity.

### Commands and results

- Ginko Content `pnpm run typecheck`: passed, including source typecheck,
  package build, and the Nuxt type consumer.
- Ginko Content focused provider/render/asset suites: 3 files and 32 tests
  passed in the final integrated run; the broader render plus agent suite also
  passed 46 tests during implementation.
- Ginko CMS `pnpm run prepare:component`: passed and regenerated component
  bindings after the schema/action hard cutover.
- Ginko CMS focused provider, asset, and public suites: 4 files and 84 tests
  passed.
- Ginko CMS `pnpm run test`: passed; the no-zombie-path architecture gate and
  workflow vertical-slice asset-reference test pass.
- Ginko CMS `pnpm run check`: passed, including format, lint/boundary/stale
  surface checks, typecheck/build, publish-specifier validation, and all tests.
- Better Convex Nuxt remained read-only at
  `467aa0eeb24d26b3695482420807c892959fc683`; no file was modified.

### Immutable development artifact

- Path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.ac9691d39b5b.3bc97044a3ca00bd7cc90306dd553d5474d2313a9a8a14d52ceeda02920f6811.tgz`
- SHA-256:
  `3bc97044a3ca00bd7cc90306dd553d5474d2313a9a8a14d52ceeda02920f6811`
- Source commit: `ac9691d39b5b`; the adjacent JSON is development evidence,
  not candidate certification.

### Commits and acceptance matrix

- Ginko Content:
  - `733be76` — `feat: decode CMS provider wire results`
  - `5959ec6` — `fix: reject substituted CMS provider facts`
  - `6551217` — `fix: type recursive CMS navigation results`
  - `7766394` — `feat!: enforce one public Markdown render policy`
  - `9193bdd` — `feat: verify public image bytes and identity`
  - `ac9691d` — `feat: validate structured CMS asset facts`
- Ginko CMS:
  - `0a2568a5` — `feat!: enforce CMS provider safety boundary`
- Updated to `implemented`: Structured asset resolution, Asset publication
  state, Upload byte verification.

### Open findings and next phase

- Packed decoder/render exploit probes and binder disposal evidence remain for
  WP3A/final candidate certification; those matrix rows remain open.
- The cleanup task is operational derived state only and can be removed after
  successful deletion; verified asset facts remain canonical on the asset row.
- Next work package: WP3A Content data-source contract and binder, followed by
  portability codecs and Node directory operations.

## 2026-07-14 — WP3A Runtime Data Source And Stable Routes

### Objective and acceptance criteria

Replace direct provider construction with the fixed, bounded Content data
source and one H3 binder; keep one immutable context and one anonymous Convex
caller per request; make provider invalidation solely cache-adapter-owned; and
page public routes in stable canonical-identity order under one projection
generation. Acceptance required pre-dispatch request bounds, post-dispatch
result and cache bounds, disposal abort, secret-safe errors, cursor progress,
one caller under concurrency, a 250-row route page ceiling, and cursor
invalidation after any public projection mutation.

### Repository ownership and hard cutovers

- Ginko Content added the pure `ContentDataSource<Context>` entry, its Level-1
  observable contract runner, and the H3 `bindContentProvider()` adapter.
  Caller-selected result generics, provider invalidation, and generic asset
  lookup are absent from the source contract.
- Query lowering now materializes the mandatory core bounds: all-mode defaults
  to 100, first-mode is exactly one, and count-mode carries no limit.
- The binder validates exact cache hints, NFC and credential-free cache keys,
  ETags, JSON site data and timestamps, query/navigation/search result counts,
  route snapshots, cursor progress, and the 100,000-route aggregate ceiling.
  Disposal aborts the operation and late backend results cannot publish cache
  or projected data.
- Ginko CMS deleted the eventless `ConvexHttpClient` branch and direct provider
  implementation. The only exported provider is the binder result over one
  `GinkoCmsDataSourceContext` containing the H3 event and anonymous caller.
- Public route paging moved from order-key pagination to the existing indexed
  `(collection, locale, canonicalKey)` order with the public projection row ID
  as the cursor tie identity. The opaque cursor binds source, collection,
  locale, generation, canonical key, and projection ID.
- Added one rebuildable `publicProjectionState` row. Public projection writers
  and index repair bump its generation; a mutation between pages fails with
  `INVALID_CURSOR` instead of skipping or duplicating routes.
- Route wire responses now require a non-empty bounded snapshot. The CMS
  source carries that snapshot across collection/locale scopes and Content
  rejects any mid-enumeration change.
- The Studio bridge operation-kind source of truth now includes Convex actions,
  fixing the generated type for byte-verifying asset registration. No shim,
  dual provider, provider cache, or alternate route roster was retained.

### Test-first and invariant evidence

Expected red runs reproduced two caller creations under concurrent operations,
unbounded returned arrays, invalid site-data acceptance, credential-bearing
cache hints, repeating cursors, missing route snapshots, order-key route
cursors surviving publication changes, and the stale Studio bridge action
type. Final tests cover each failure plus exact scope/source cursor binding,
projection-ID replay validation, canonical-key uniqueness, and locale-policy
precedence.

### Commands and results

- Ginko Content focused provider/data-source suite: 5 files and 22 tests
  passed; source typecheck and lint passed.
- Ginko Content `pack:check`: passed before the final bounded-result commit;
  the final clean `dev:pack` below rebuilt and packed the same public entries.
- Ginko CMS `pnpm run prepare:component`: passed and regenerated component
  bindings for `publicProjectionState`.
- Ginko CMS focused provider and public route suites: 2 files and 59 tests
  passed; the final public API suite passed 30 tests after cursor-ID validation.
- Ginko CMS repository format, lint, boundary checks, Contract/Convex/module
  typechecks, module and Studio builds, playground preparation, and publish
  specifier checks passed.
- Ginko CMS full tests passed: 113 files passed, 1 skipped; 896 tests passed,
  1 skipped. The first full gate exposed and then removed the obsolete
  eventless provider transport test; the final full suite is green.
- Better Convex Nuxt remained read-only at
  `467aa0eeb24d26b3695482420807c892959fc683`; its pre-existing dirty state was
  unchanged.

### Immutable development artifact

- Path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.68883f4159aa.9078435e6aea9051448f0e3dbec3a54cc1f4e96844e834ced19576714da0597e.tgz`
- SHA-256:
  `9078435e6aea9051448f0e3dbec3a54cc1f4e96844e834ced19576714da0597e`
- Source commit: `68883f4159aa`; the adjacent JSON is development evidence,
  not candidate certification.

### Commits and acceptance matrix

- Ginko Content:
  - `7783fb2` — `feat!: introduce the bounded content data source`
  - `b1f201d` — `feat!: bind request-scoped content data sources`
  - `68883f4` — `fix: enforce bounded data source results`
- Ginko CMS:
  - `c706f261` — `fix: validate migrations against resolved contracts`
  - `0115ffdb` — `feat!: bind CMS to the bounded content source`
- Updated to `implemented`: Backend-neutral runtime data source, One request
  adapter context.

### Open findings and next phase

- The development artifact is not yet a fresh isolated Nitro consumer or
  Worker-runtime purity proof; Provider runtime decoders and Real packed
  provider consumer remain open until those executable probes run.
- `publicProjectionState` is derived operational state. It contains no content,
  is recreated by the first projection mutation, and exists only to invalidate
  route enumeration across canonical public-state changes.
- Next work package: freeze the normative portability fixtures, then implement
  the pure Content codec before any CMS portability persistence.

## 2026-07-14 — WP3A Phases A-C Pure Portability Contract

### Objective and acceptance criteria

Freeze reviewed filesystem-owned portability vectors before implementation,
then add the framework-free document/MDC/manifest codec and its observable
Level-1 runner. Acceptance required materialized canonical identity, exact
shared/localized placement, closed topology, strict JSON/YAML parsing,
reversible NFC-safe paths, semantic MDC rejection, canonical manifests,
structural references/assets, and no Node/Nuxt/H3/Convex imports in the pure
entry graph.

### Repository ownership and hard cutovers

- Ginko Content added the sole `PortableDocumentV1`, manifest, reference,
  asset, error, semantic-model, and MDC model under `src/portability/` and
  exposed it only through `./portability`.
- The resolved-contract validator now rejects reserved portable field names,
  invalid page/data body policies, and duplicate nested field keys. The codec
  classifies fields exclusively through that resolved contract; it does not
  carry a second schema.
- Canonical JSON parsing rejects duplicate keys before values are constructed.
  Canonical YAML rejects duplicates, aliases, anchors, tags, merge keys,
  non-string keys, implementation scalars, and control bytes.
- Markdown serialization is asynchronous because the pinned Comark parser is
  asynchronous; every parse and write validates the semantic MDC projection.
- Asset traversal visits typed contract fields and declared MDC media props
  only. Two references to the same verified PNG produce one blob identity; no
  arbitrary string scanning or replacement was added.
- Package public-surface metadata was brought in sync with the already shipped
  data-source/binder entries and the new portability/testing entries. The old
  `/cms-import` entry remains only until the CMS consumer is migrated in Phase
  E, as required by the coordinated hard-cutover order.

### Frozen fixtures and test-first evidence

Fixtures under `packages/content/test/fixtures/portability/` cover a
multilingual tree, a localized flat page, a data collection, translated slugs,
parent rank, scalar/array relations, a registered MDC component, authored
visibility, every supported field type, and duplicate references to one asset
byte identity. The expected red run failed because `src/portability` did not
exist. Later red runs exposed the missing public-surface classifications and
the asynchronous MDC serialization boundary.

Final focused tests cover canonical document round trips, moved-file identity,
NFC/percent path vectors, missing references, topology, unknown/misplaced
fields, active MDC rejection, all field mappings, shared asset deduplication,
manifest byte rebuilding, hash/size mismatch, duplicate YAML/JSON keys, and
credential-bearing external URLs. The published testing entry runs nine
observable codec/hash/path/MDC/manifest checks without claiming persistence or
authorization certification.

### Commands and results

- Ginko Content `pnpm run lint`: passed, including repository policy,
  compatibility, test-selection, and ESLint checks.
- Ginko Content `pnpm run typecheck`: passed, including source typecheck,
  package build/declarations, and the Nuxt type consumer.
- Portability contract suite: 9 tests passed.
- Public export and asset suites: 2 files and 38 tests passed.
- Direct built Node ESM imports of `./portability` and
  `./testing/portability-contract` passed; the runner reported 9 checks.
- Pure source/dist import scans found no Node, Nuxt, H3, Convex, or Cloudflare
  imports. `git diff --check` passed.
- Better Convex Nuxt remained read-only at
  `467aa0eeb24d26b3695482420807c892959fc683`; no file was modified.

### Immutable development artifact

- Path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.03ddc52721d4.94af24d74c526c9a977aee2bd65637da1abefe912d869425b35a7499a56d17c2.tgz`
- SHA-256:
  `94af24d74c526c9a977aee2bd65637da1abefe912d869425b35a7499a56d17c2`
- Source commit: `03ddc52721d4`; the adjacent JSON is development evidence,
  not candidate certification.

### Commit, acceptance matrix, and next phase

- Ginko Content `03ddc52` — `feat!: add the portable document codecs`.
- No portability matrix row is marked implemented yet: the pure codec evidence
  is complete, but the required Node directory suite and isolated packed
  runtime/type consumers belong to Phase D.
- Next work package: safe deterministic Node directory read/write/rebuild,
  followed by an accepted Content tarball for the CMS Phase-E consumer.

## 2026-07-14 — WP3A Phase D Safe Node Directory

### Objective and acceptance criteria

Add the only Node-specific portability boundary after the pure codec was
accepted. The directory adapter had to read, verify, rebuild, and write the
normative layout deterministically; reject traversal, collisions, links,
unexpected entries, changed bytes, and existing destinations; stage writes
beside the target; verify the complete staging tree; and expose declarations
and packed runtime behavior through `./portability/node`.

### Repository ownership and design

- Ginko Content added `src/portability-node/` with direct read, verify,
  manifest-rebuild, and new-destination write commands. It is deliberately not
  a generic storage port, transaction service, or archive layer.
- Directory scanning uses NFC relative POSIX paths, a 512-byte path ceiling,
  32-segment depth ceiling, Unicode case-fold collision checks, Windows device
  rejection, sorted enumeration, `lstat`, no-follow open, before/after file
  identity checks, and hard-link/symlink rejection.
- The fixed document/file/byte limits from the Content specification are
  enforced before parsing. Only canonical contract/manifest files, supported
  content extensions, and hash-addressed PNG/JPEG/GIF/WebP blobs are admitted;
  empty directories and every extra entry fail.
- Writes use a newly created sibling staging directory, exclusive file
  creation, canonical identity paths, full manifest rebuild and verification,
  a second destination-existence check, and one final rename. Failed staging
  trees and manifest temporaries are removed with bounded retries. Existing
  destinations are never merged or overwritten.
- The testing entry gained a shared three-check directory runner. The packed
  consumer imports every new public entry, checks declarations, runs the
  nine-check pure suite and three-check directory suite, and performs real
  installed-package writes and reads in a fresh temporary directory.

### Test-first and adversarial evidence

The expected red run failed on the absent `src/portability-node` entry. Final
tests prove deterministic dual writes, delete-and-rebuild byte equality,
semantic reads, non-overwrite behavior, traversal/device/case collisions,
unindexed files, stale manifest bytes, symlinks, hard-link aliases, safe moved
files, and canonical-path restoration.

The first full repository run exposed 11 stale tests from earlier vNext hard
cuts: two still expected the deleted unbounded `limit: 0`, and nine constructed
runtime config without the now-required canonical contract. No fallback was
added. Commit `360ca63` updated those tests to the accepted bounded/single-
contract behavior; the rerun passed all 100 files and 829 tests.

The first packed pnpm build reproduced a prerender rejection for an undeclared
custom MDC component in the old consumer fixture. That rejection is correct
under the public render policy. Commit `3aff1b6` removed the invalid component
instead of weakening policy, added server-error diagnostics, and stopped
passing a pnpm-only environment option to npm. Exact pnpm and npm packed
prepare/typecheck/build consumers then passed. npm emitted dependency
deprecation/allow-script notices but no peer warning; pnpm emitted no peer
warning.

### Commands and results

- Ginko Content lint and repository policy checks: passed.
- Ginko Content typecheck, package declarations/build, and Nuxt type consumer:
  passed.
- Pure plus Node portability suites: 2 files and 16 tests passed.
- Public export suite: 32 tests passed.
- Full Ginko Content test gate: 100 files and 829 tests passed.
- Fresh exact-tarball pnpm consumer: public imports, portability runners,
  prepare, typecheck, and production build passed.
- Fresh exact-tarball npm consumer: public imports, portability runners,
  prepare, typecheck, and production build passed.
- Better Convex Nuxt remained read-only at
  `467aa0eeb24d26b3695482420807c892959fc683`; no file was modified.

### Immutable development artifact

- Accepted path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.3aff1b68def4.02f6f28517fc9a41844b74f80915731ae60c73c546ab2afee94185f4090a4579.tgz`
- SHA-256:
  `02f6f28517fc9a41844b74f80915731ae60c73c546ab2afee94185f4090a4579`
- The packed bytes are identical to the consumer-tested `64dda68` artifact;
  only the repository-side packed-consumer harness changed in `3aff1b6`.

### Commits and acceptance matrix

- Ginko Content:
  - `360ca63` — `test: align bounded runtime fixtures`
  - `64dda68` — `feat!: add deterministic directory portability`
  - `3aff1b6` — `test: harden packed portability consumer`
- Updated to `implemented`: Portable Content contract, Level-1 portability
  contracts, Deterministic asset portability. The previously completed
  Backend-neutral runtime data source and One request adapter context rows are
  synchronized to `implemented` in the authoritative matrix.
- Portable codecs and directory remains open until the Phase-G real
  Worker-compatible V8 purity probe passes.

### Next phase

Consume the exact accepted Content tarball in Ginko CMS and implement the
direct import-first portability run/receipt vertical slice. No CMS-local codec,
generic transaction port, Studio bulk UI, or MCP portability authority is
authorized.

## 2026-07-14 — Phase E1 Deterministic Asset-Free Draft Import

### Objective and acceptance criteria

Replace the legacy filesystem scanner and summary-only bulk import mutation
with one direct Ginko Content directory-to-CMS draft path. This work package
had to consume the exact accepted Content artifact, bind immutable plans to the
deployment, caller, scope, contract and canonical row hashes, page plan writes
and sealing, guard draft updates with the inspected portable hash, make item
application safe after a lost response, keep run transitions closed, and never
publish. Asset-bearing imports were required to fail before creating a server
plan until the separate staged-transfer work package exists.

### Repository ownership and design

- Ginko CMS now resolves Ginko Content through one exact pnpm override to the
  accepted development tarball. Vitest sibling-source aliases and the Content
  workspace entries were removed, so CMS tests and builds exercise the packed
  public `./portability` and `./portability/node` entries.
- `@lupinum/ginko-cms/portability` is a direct command surface: it verifies a
  Content directory, inspects current draft hashes in pages of 250, creates and
  appends an immutable plan, seals it, then applies documents in structural
  parent/relation order. It does not expose a generic source or target port.
- Convex stores one canonical portability plan/run/receipt model. Plan rows are
  limited to 250 per mutation and 256 KiB each; sealing incrementally hashes
  ordered pages rather than collecting the plan in one transaction. Runs use a
  two-hour deadline and the closed import states `planned`, `applying`,
  `verifying`, `complete`, `aborted`, and `expired`.
- Item application checks the receipt before the effect. The same
  `(runId,itemKey,inputSha256)` replays the committed receipt; changed input
  fails. Create and update write drafts only, skip is explicit, and finalize
  checks derived committed counts before recording its bounded receipt.
- Portable relations are converted structurally to stored canonical IDs and
  reconstructed structurally for later guarded inspection. External asset
  references accept canonical HTTPS values. Local asset blobs are an explicit
  plan blocker in this work package; no substring rewriting or remote download
  path was retained.
- Bulk portability requires a current owner membership and the user origin.
  Publisher, editor, viewer, and MCP credentials are rejected even when an MCP
  credential claims a portability-named scope.
- Generated Convex component and playground bindings were regenerated from the
  new contract and bridge. The large generated component file was not edited by
  hand.

### Hard cutover

Deleted the old `collections/import` mutation, `collectionImportRuns` table and
diagnostics, auto-publish import path, `@lupinum/ginko-cms/migration` scanner and
caller adapter, regex/substr asset rewriting, import validators, Studio import
page/queue/navigation/API, host bridge files, and their legacy component and
shared tests. The package export, build extras, template inventory, generated
bridges, package-boundary assertions, workflow tests, dashboard text, and
operator guide now name only the portability path. No compatibility shim,
feature flag, or dual ledger remains.

### Test-first and adversarial evidence

The new component and host tests cover role and MCP denial, exact Content
directory reading, deterministic plans, create/update/skip decisions, local
asset blocking, lost-successful-response replay, changed-input rejection,
draft-only finalization, stale guarded updates, 251-row multi-page sealing,
structural relation storage and portable re-inspection, and closed abort/expiry
states. The relation re-inspection test first failed because stored canonical
IDs were being passed back to the Content validator as strings; the direct
structural reverse conversion fixed the model without string scanning.

The complete test gate initially found one pre-existing authorization-matrix
assumption that every permission accepts an equivalently scoped MCP key. The
matrix now records the intentional `managePortability` exception instead of
weakening the owner/user-only guard. No compatibility authority was added.

### Commands and results

- Exact packed Node imports of `@lupinum/ginko-content/portability` and
  `@lupinum/ginko-content/portability/node`: passed through the installed CMS
  dependency graph.
- Focused portability and authorization suite: 3 files and 29 tests passed.
- `pnpm run format` and `pnpm run format:check`: passed.
- `pnpm run lint`, including auth-boundary, Convex-surface, vendor parity,
  documentation, compatibility, content-model, stale-surface, template-sync,
  and ESLint checks: passed.
- `pnpm run typecheck`, including contract builds, Convex typecheck, CMS/Nuxt
  build, playground preparation, Vue typecheck, and Studio typecheck: passed.
- `pnpm run test`: passed with exit status 0. The intentionally environment-
  gated module boot scenarios remained skipped.
- `pnpm run prepare:component` and offline playground Convex code generation:
  passed after the portability contract build.
- `git diff --check`: passed before commit.
- Ginko Content remained clean at
  `3aff1b68def4d562585b22964e92d0a40573262c`.
- Better Convex Nuxt remained read-only at
  `467aa0eeb24d26b3695482420807c892959fc683`; its pre-existing dirty worktree
  was not modified.

### Immutable development artifact and commit

- Consumed path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.3aff1b68def4.02f6f28517fc9a41844b74f80915731ae60c73c546ab2afee94185f4090a4579.tgz`
- Verified SHA-256:
  `02f6f28517fc9a41844b74f80915731ae60c73c546ab2afee94185f4090a4579`
- Ginko CMS: `e4d8a006` — `feat!: add deterministic draft import`

### Acceptance matrix and next phase

No additional row is marked implemented yet. `Portable conflict and retry
safety`, `Bounded import and archive parsing`, and `Bidirectional semantic round
trip` remain open until staged assets, cleanup fault injection, published
export, and the complete round trip pass. The next work package first corrects
the Content MDC structural asset collector/rewriter, packs a new immutable
Content artifact, then implements CMS run-owned asset staging and cleanup. The
current `portableImportPlanAssets` table is reserved for that specified row
shape and is not a second active asset authority.

## 2026-07-14 — Phase E2 Verified Import Asset Staging

### Objective and acceptance criteria

Complete the import-first vertical slice for local PNG, JPEG, GIF, and WebP
assets without exposing storage URLs or byte bodies through Convex. Acceptance
required immutable asset plan rows, one run-owned stage per hash, fenced and
revocable host transfer, structural typed/MDC rewriting, byte verification,
lost-response replay, bounded abort/expiry cleanup, and a proven component-only
orphan reconciler.

### Repository ownership and design

- Ginko Content commit `d29cb6c06f68` supplies the accepted structural
  stored-to-portable and portable-to-storage MDC rewrites. Ginko CMS consumes
  only its exact immutable tarball; no sibling-source alias or CMS-local codec
  was added.
- Asset inspection and plan rows are paged at 250. Sealing recomputes the
  canonical asset root and creates one stage per exact hash. Existing verified
  bytes attach by canonical asset identity; conflicting metadata blocks the
  plan.
- The CMS host owns the only byte path. A CLI-only Nitro endpoint rechecks a
  current owner session on every attempt, stores only a domain-separated HMAC
  of a random bearer, obtains a single-use Convex upload URL server-side, and
  streams at most 25 MiB with exact origin, length, media type, idle, total, and
  response-size bounds. The CLI streams a local file without `arrayBuffer()` or
  base64 and independently recomputes its planned SHA-256.
- Convex verifies the stored image signature, hash, length, media type,
  dimensions, and frame count before atomically registering and attaching the
  managed asset. Typed fields and parsed MDC media nodes are rewritten
  structurally; arbitrary strings and external HTTPS references are unchanged.
- Abort and expiry close stages in explicit indexed pages of 100. Newly staged
  assets are deleted only when the canonical asset, content-reference, stage,
  cleanup-task, backup, and storage inventory proves them unreferenced. One
  hourly component-internal orphan reconciler covers the unavoidable
  storage-commit-before-stage-record window after a ten-minute grace period.
  A root/component namespace test proves it cannot enumerate or delete root
  application storage.
- An already attached stage replays to a fresh process without minting another
  bearer or rereading local bytes. Uploaded/verifying retries reuse the same
  fenced attempt; expired attempts require a new generation.

The stage table and orphan job are required operational derived state for the
external-byte transaction boundary. Canonical content remains drafts plus
verified asset rows; stages are run-owned, rebuild no content, and have bounded
terminal cleanup. No Studio or MCP bulk authority, remote download path,
generic storage adapter, compatibility route, or automatic publish path was
added.

### Test-first and adversarial evidence

The initial host/client red run had five expected failures: the client transfer
did not exist, attached attempts rejected replay, and the route returned a new
token for an already attached stage. Earlier component red runs proved that
uploaded stages survived abort, unreferenced attached assets survived abort,
and stage cleanup stopped after the first 100 rows.

Final tests cover token HMAC sealing and redaction; current-cookie authority;
browser-origin rejection; wrong upload origin; short/long bodies; stream
rehashing; changed local bytes; uploaded/verifying/attached replay; caller,
token, generation, lease, and revocation fences; exact signature verification;
typed and MDC round trips; referenced-asset preservation; abort/expiry cleanup;
101-row continuation; canonical inventory retention; orphan deletion; and root
namespace isolation. The architecture lint then rejected two uses of native
`Query.paginate()`; both were replaced by explicit indexed cursors before
acceptance.

### Commands and results

- Ginko Content authoritative `pnpm verify`: passed with durable exit status
  `0`; full suite passed 100 files and 833 tests.
- Exact Content packed consumer: passed from the immutable tarball below.
- `pnpm run prepare:component`: passed; generated component bindings were
  regenerated rather than edited.
- `pnpm run format:check`: passed across 904 files.
- `pnpm run lint`: passed, including component-boundary, Convex-surface,
  compatibility, stale-surface, template-sync, and ESLint gates.
- `pnpm --filter @lupinum/ginko-cms-convex typecheck`: passed.
- `pnpm --filter @lupinum/ginko-cms build`: passed, including the Contract and
  component builds, module extras, and Studio production build.
- Final focused asset/import/storage suite: 5 files and 38 tests passed; the
  broader integrated portability suite passed 7 files and 51 tests.
- `pnpm run test`: passed; 116 files passed and 1 environment-gated file was
  skipped, with 908 tests passed and 1 skipped.
- `git diff --check`: passed before commit.
- The exact workspace `pnpm run typecheck` passed Contract and component
  typechecks, package builds, Studio build, and playground Nuxt preparation,
  then stopped at the host fixture because
  `playground/convex/_generated/api.d.ts` cannot be regenerated against the
  configured development deployment while that deployment lacks
  `BETTER_AUTH_SECRET`. Two codegen attempts failed during remote analysis
  before push for that same external configuration requirement. No secret was
  created, no deployment was altered, and the generated declaration was not
  hand-edited. This external host-codegen gate remains open.

### Immutable development artifact and commit

- Consumed Content path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.d29cb6c06f68.837fa55bccd63c0bb2d87c22cbb3e3657ae0f635f218bf8c2a2d908b3a0923e1.tgz`
- Verified SHA-256:
  `837fa55bccd63c0bb2d87c22cbb3e3657ae0f635f218bf8c2a2d908b3a0923e1`
- Ginko Content: `d29cb6c` —
  `feat!: rewrite portable MDC to storage identities`
- Ginko CMS: `692fdba9` —
  `feat!: add verified portability asset staging`

### Acceptance matrix and next phase

Updated to `implemented`: Portable conflict and retry safety. Bidirectional
semantic round trip and Bounded consistent export remain open. The next Phase-E
work package adds restart-only immutable published export with bounded roster
pages, scoped editorial fencing, host byte download, and exact directory
verification before any operator CLI UX is wired.

## 2026-07-14 — Phase E3 Immutable Published Export

### Objective and acceptance criteria

Add the restart-only CMS-to-filesystem path for immutable published revisions.
Acceptance required bounded capture and host serialization, a scoped expiring
editorial fence, immutable revision/document and storage facts, live asset
holds, authenticated server-only byte transfer, deterministic Content directory
verification, idempotent completion, and bounded cleanup after completion,
abort, run expiry, or capture-lease expiry. Working and draft export, Studio,
MCP, generic ports, archives, and resumable partial export remained excluded.

### Repository ownership and design

- Ginko Content commit `2977c40597b6` changed the Node directory writer to
  consume document and asset async iterables and stream each asset directly to
  its staged file. The follow-up `07462b628e39` removed the remaining
  full-directory verification path: `verifyPortableDirectoryBounded()` retains
  only the contract, bounded manifest/reference facts, and one file's bytes at a
  time. CMS consumes only the corrected immutable tarball recorded below.
- CMS uses the existing `portableRuns` authority with a closed discriminated
  export state machine: `capturing -> ready -> complete`, with active states
  also able to become `aborted` or `expired`. No second run ledger, migration
  record, compatibility state, or generic adapter was added.
- Capture pages contain at most 100 public projections in explicit indexed
  `(collection, locale, orderKey, entryId)` order. A monotonic generation and
  opaque lease token fence every page and seal. Each renewal schedules a
  generation-bound 60-second expiry; stale scheduled calls cannot expire a
  renewed lease. Lease expiry releases the logical hold immediately and marks
  the failed capture expired before deleting derived rows in pages of 100.
- The temporary roster binds collection, `canonicalKey`, locale, immutable
  revision ID, canonical portable document, and its SHA-256. The document is a
  derived, rebuildable capture fact limited to 256 KiB and deleted at the run's
  terminal cleanup. Keeping it in the roster avoids a second read from mutable
  asset filenames or parent rows after sealing while canonical content remains
  the published revision.
- Unique asset rows bind exact storage ID, verified hash, byte length, media
  type, filename, and run deadline. Asset trash, purge, and filename mutation
  reject while a live hold protects the blob. The canonical storage inventory
  also retains held objects from the component orphan reconciler.
- Export download uses two same-origin Nitro routes. Every attempt resolves the
  current operator session and `managePortability` guard, stores only a
  domain-separated HMAC of a random bearer, expires after 60 seconds, and permits
  at most three atomic claims. The Convex storage URL remains server-only; the
  host permits only the exact configured storage origin, follows no redirects,
  and streams with byte, idle, total-time, and SHA-256 checks. Responses are
  `no-store` and tokens are absent from Convex arguments and logs.
- The direct portability command captures and seals, pages documents/assets,
  streams them through Ginko Content's staging writer, runs bounded manifest
  verification, then records or replays the bounded export receipt. Any local
  failure aborts the server run; no per-file receipt or resume state exists.
- Generated component bindings and all three host bridge copies were regenerated
  or synchronized from the contract. The generated component file was not
  edited by hand.

### Test-first and adversarial evidence

The first export tests established 101-document `100 + 1` pagination, scoped
projection fencing, immutable published revision selection, exact asset holds,
and the three-claim download fence. Later red tests proved two real gaps:
filename mutation was accepted after sealing, and a failed 60-second capture
retained its partial roster/holds until the two-hour run deadline. Live hold
checks and generation-bound lease-expiry cleanup closed those paths.

Final coverage includes exact operator and origin checks, keyed token-domain
separation, storage-origin and redirect rejection, truncated/changed streams,
client rehashing, token redaction, bounded local writer orchestration, abort on
local failure, canonical roster hashes, post-seal mutable-row independence,
completion hold release, terminal cleanup, monotonic restart generations, and
owner/user-only authorization. Import and storage-maintenance regressions run in
the same focused suite.

### Commands and results

- Ginko Content authoritative `pnpm verify`: exit `0`; 100 files and 834 tests
  passed, followed by 6 files and 15 E2E tests, source/example type checks,
  production example builds, and quickstart validation.
- Exact Content pnpm packed consumer: passed from the immutable tarball below,
  including every public subpath import and generated Nuxt types.
- `pnpm run prepare:component`: passed after the final schema and callable
  changes.
- Focused CMS export/import/host/storage/authorization suites: passed. The final
  export and command slice passed 2 files and 7 tests; the broader focused slice
  passed 6 files and 46 tests before the final roster hardening.
- `pnpm run format:check`: passed across 910 files.
- `pnpm run lint`: passed, including component auth boundaries, Convex surface,
  live-token checks, vendor parity, docs, compatibility, content-model,
  stale-surface, bridge-template sync, and ESLint.
- Contract and Convex package type checks: passed.
- `pnpm run check:publish-specifiers`: passed.
- `pnpm run audit:prod`: passed with no known vulnerabilities.
- `pnpm run test`: exit `0`; 118 files passed, 1 environment-gated file was
  skipped, 919 tests passed, and 1 was skipped.
- The aggregate `pnpm run check` passed format, lint, Contract/Convex typecheck,
  package builds, Studio build, and playground Nuxt preparation, then stopped at
  the already-recorded external host fixture boundary: its stale
  `playground/convex/_generated/api.d.ts` lacks `components` because host Convex
  codegen cannot run against the configured development deployment without
  `BETTER_AUTH_SECRET`. The export bridge-specific type errors were fixed in the
  canonical template; only the common generated-host declarations remain. No
  secret, deployment, or generated declaration was altered to mask the issue.
- `git diff --check`: passed before commit.
- Better Convex Nuxt remained read-only at `59278ea89e7a`; no file was changed.

### Immutable development artifact and commit

- Consumed Content path:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.07462b628e39.285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401.tgz`
- Verified SHA-256:
  `285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401`
- Ginko Content: `2977c405` — `feat: stream portable directory writes`
- Ginko Content: `07462b6` — `fix: bound portable directory verification`
- Ginko CMS: `08b7f5ff` — `feat!: add immutable published export`

### Acceptance matrix and next phase

Updated to `implemented`: Bounded consistent export. The implementation now has
executable lease, roster, pagination, streaming, hold, expiry, and cleanup
evidence. Bidirectional semantic round trip remains open until Phase F wires the
operator CLI and exact packed integration exercises filesystem -> CMS ->
filesystem and CMS -> filesystem -> CMS. The next work package adds only the
specified CLI operator UX using one Better Auth session for Convex token
exchange and the host byte routes; Studio and MCP bulk authority remain absent.
