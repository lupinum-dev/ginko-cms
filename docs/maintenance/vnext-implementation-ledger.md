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
