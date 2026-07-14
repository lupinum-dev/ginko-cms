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
- Portable draft import now has one CMS-owned operational envelope shared by
  the CLI and Convex boundary: 100,000 entries, 100 locales, 1,000,000 nested
  field values, 1,000,000 exact relation/parent edges, 256 KiB per staged
  document, ten staged/applied items per request, and a two-hour total run
  deadline. Content's bounded directory reader remains the archive authority.
- The unreleased per-item apply callable was deleted. Each validated document
  is stored once in its expiring immutable plan, bound through its canonical
  document hash, and assigned one dependency-safe apply order. A bounded
  server action advances that order through the existing item receipts, so an
  interrupted action resumes from the committed count without client-owned
  document streaming or a second run ledger.
- Hostile fixtures now reject the 100,001st entry, the 101st locale, and a
  document above 256 KiB. Component evidence records locale/field/relation
  totals, applies a 251-item plan in bounded ten-item batches, and runtime
  orchestration retries after a simulated lost batch-two response.
- Work-package commit `7cc827c4` (`feat!: bound and resume portable imports`)
  passed the focused 27-test planning/component/retry slice, then the complete
  clean-repository `pnpm check` gate (format, policy guards, lint, package and
  Studio builds/typechecks, publish-specifier checks, and the full test suite)
  from a detached exact-commit worktree.
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

## 2026-07-14 — Phase F Operator Content Portability CLI

### Objective and acceptance criteria

Expose the direct CMS portability operations through one owner-operated CLI
workflow without adding a browser flow, MCP authority, deploy-key product
identity, filesystem access in Convex, or a second portability protocol.
Acceptance required real temporary-directory export/verify/plan/apply coverage,
an immutable review boundary before draft effects, current Better Auth authority,
secret-safe failures, retry after interrupted/lost responses, and a fresh strict
peer consumer using exact local package tarballs.

### Repository ownership and design

- `ginko-cms content export --out <directory>` captures published revisions
  through the existing restart-only export operation and writes/verifies the
  directory with Ginko Content. Optional `--collections` is validated against
  the one local resolved Content contract; the CLI reports the exact scope.
- `ginko-cms content verify <directory>` is local and bounded. It requires no
  deployment credentials and uses Ginko Content's canonical verifier and
  manifest hash.
- `ginko-cms content import <directory> --plan <file>` verifies the source,
  inspects current draft/asset facts, seals the existing immutable server plan,
  and creates a new mode-`0600` plan file with exclusive creation. It reports
  scope, create/update/skip, asset upload/reuse, and blocker counts without
  changing drafts.
- `ginko-cms content import --apply <plan-file>` is the explicit confirmation
  boundary. Before network effects it rehashes the payload, row roots, each row,
  and every embedded document. The existing operation layer remains the only
  writer and publishing is still a separate Studio action.
- One Better Auth session cookie is exchanged through Better Convex Nuxt for a
  fresh Convex token before every JSON query, mutation, or action. The same
  session reaches only the exact CMS host origin for byte transfer. Deploy keys,
  Studio, and MCP do not gain portability authority. CLI error redaction now
  treats cookie-valued environment variables as secrets.
- Retry remains a direct replay of the same sealed plan. No CLI checkpoint table,
  resume file, adapter, or client-side state machine was added; server receipts
  decide whether an upload, item, verification transition, or finalize call is
  new or replayed.
- The existing package-E2E harness now accepts the already content-addressed
  development Content artifact through its candidate artifact variables, copies
  long source paths to a short hash-named consumer artifact, enforces strict peer
  dependencies, and invokes the packed CLI on a real generated portable
  directory. Its disposable non-live host gets only a fixture Better Auth
  secret so the fail-closed doctor gate can run.

### Test-first and adversarial evidence

The initial CLI integration test failed with `Unknown command "content"` before
the route existed. The green test creates a real Ginko Content portable
directory and exercises export, verify, plan, and explicit apply through a fake
operator transport. It proves a fresh token exchange before calls, plan
tampering rejection before network access, and authentication failure without
cookie disclosure.

The orchestration retry test commits an item and loses its response, loses the
successful transition immediately before finalize, commits finalize and loses
that response, then reruns the same prepared plan to a replayed terminal receipt.
The Phase-E2 host tests remain the command path's asset-upload interruption and
attached-stage replay evidence; no alternate asset path was introduced.

The first packed attempts exposed harness defects rather than product defects:
direct source packing retained Content's released `0.3.0` manifest and produced
a peer warning, the disposable doctor lacked its required auth secret, a long
artifact pathname exceeded pnpm's store filename limit, and the configured
development expected-version override was not honored by the installed-version
assertion. The accepted harness consumes the verified `0.4.0-rc.1` tarball,
uses a short hash-addressed copy, fails on peer mismatches, and validates the
configured development stack without changing the released compatibility
matrix early.

### Commands and results

- Focused CLI/export/asset route and transport slice: 5 files and 43 tests
  passed. The final CLI plus replay slice passed 2 files and 4 tests.
- `pnpm run test`: exit `0`; 119 files passed, 1 environment-gated file was
  skipped, 921 tests passed, and 1 was skipped.
- `pnpm run format:check`: passed across 912 files.
- `pnpm run lint`: passed, including auth-boundary, Convex-surface, live-token,
  vendor parity, docs, compatibility, current-model, stale-surface, and ESLint
  gates.
- Contract and Convex package type checks passed. The CMS module, CLI extras,
  and Studio production builds passed; `studio:typecheck` passed.
- `pnpm run check:publish-specifiers`: passed.
- `pnpm run audit:prod`: passed with no known vulnerabilities.
- Exact development `package:e2e` passed from a fresh consumer with strict peer
  checking. It installed Content `0.4.0-rc.1`, CMS, CMS Contract, CMS Convex,
  and a locally packed Better Convex Nuxt; initialized and checked a host;
  generated offline Convex/Nuxt types; passed Nuxt typecheck and package import
  probes; created a real portable directory; and printed
  `Portable content verified: documents=1, assets=0` through the packed CLI.
- The aggregate CMS typecheck again passed Contract/Convex typechecks, package
  and Studio builds, and playground Nuxt preparation, then stopped only at the
  recorded external host fixture boundary: stale
  `playground/convex/_generated/api.d.ts` lacks `components`. No secret,
  deployment, or generated declaration was altered to hide that limitation.
- `git diff --check` and `node --check scripts/package-e2e.mjs` passed before
  commit.

### Immutable artifacts and commit

- Content:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.07462b628e39.285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401.tgz`
  — SHA-256
  `285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401`.
- Packed CMS: SHA-256
  `d0eea2cf36866b28ffd7ab9d2701d072b89f978529c0d074ece2ae30a539d29b`.
- Packed CMS Convex: SHA-256
  `1c6c75ed8b974afb541a8b661502fec0fde000c676464f1a835f90f1af5c8e1f`.
- Packed CMS Contract: SHA-256
  `827114b844be476f3fa2f42e7d08efa17aa149f1413bae570ed348f29f497901`.
- Packed Better Convex Nuxt: SHA-256
  `596dbc6bae0067a26db1761b91ae4ee72fc66e0a7e3e18712220a9eb20e6b729`.
  Its read-only repository was clean when observed at
  `0cc056f9a4134af7c775870ed3c75144ffa95d93`; this differs from the earlier
  recorded observation because that external repository advanced, not because
  this goal edited it.
- Ginko Content remained clean at `07462b6`.
- Ginko CMS: `25dfa7a9` —
  `feat!: add operator content portability CLI`.

### Acceptance matrix and next phase

`Bounded consistent export` is corrected to `implemented` with the Phase-E3
lease/roster/pagination evidence. `Bidirectional semantic round trip` and
`Portable codecs and directory` remain open: the Phase-F transport integration
proves operator wiring and recovery, but does not substitute for the specified
real Node/Worker purity and semantic round-trip probes. Phase G adds those
runtime proofs next.

## 2026-07-14 — Phase G Pure Runtime Compatibility

### Objective and acceptance criteria

Certify the already packed Ginko Content pure data-source and portability
entries in Node and a real Worker-compatible V8 runtime. Acceptance required
the exact content-addressed tarball, incremental canonical hashing in both
runtimes, a codec semantic round trip, byte-equal results, and an inspected
bundle graph with no Node, Nuxt, H3, Nitro, Convex, or vendor SDK dependency.
This proof does not claim that a production D1/R2 adapter exists.

### Test-first implementation and corrections

The red run was `pnpm run test:pure-runtimes`, which failed because the packed
runtime certification command did not exist. The implementation adds one shared
probe used by Node and Worker, rather than maintaining two expected-result
paths. It covers three frozen canonical JSON vectors, feeds their bytes into
the incremental SHA-256 implementation in three-byte chunks, reparses a
serialized portability contract fixture, and checks the public data-source
limit.

The packed harness extracts the exact tarball, imports only its built public
data-source, portability, and portability-contract fixture entries in Node,
then bundles that same extracted graph for a Blob-backed Web Worker. Chromium
proves `WorkerGlobalScope` is present and `document` is absent. Esbuild's
metafile is rejected if a pure graph contains Node built-ins, Nuxt, H3, Nitro,
Convex, or Cloudflare SDK inputs/imports. The first Worker attempt exposed that
esbuild does not resolve generated `file:` URL specifiers; the harness was
corrected to generate absolute filesystem specifiers before acceptance.

No published package source changed. `pnpm dev:pack` rebuilt bytes identical to
the existing development artifact and correctly refused to overwrite its
content-addressed path. The new certification remains external release evidence
and is attached immediately after `release:pack` in `release:verify`.

### Commands and results

- Exact packed Node/Worker probe: exit `0`; SHA-256
  `285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401`,
  3 canonical vectors, and codec fixture `docs.introduction` passed with
  byte-equal Node and Worker results.
- `pnpm run lint`: passed, including repository policies, compatibility matrix,
  test selection, and ESLint.
- The one authoritative `pnpm verify` run for this work package exited `0`.
  Its standard suite passed 100 files and 834 tests; its e2e suite passed 6
  files and 15 tests. Documentation build/smoke, all 13 example builds, source
  and packed type checks, quickstart, package checks, and the remaining verify
  stages passed in the same run.
- `node --check` passed for both new scripts, and `git diff --check` passed.
- The exact hash-pinned packed runtime probe was repeated after commit and
  passed unchanged.

### Immutable artifact, commit, and acceptance matrix

- Content artifact:
  `/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.07462b628e39.285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401.tgz`
  — SHA-256
  `285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401`.
- Ginko Content: `c33dae1` —
  `test: certify packed pure runtime compatibility`.

`Portable codecs and directory` is now `implemented`: the exact packed pure
entries pass Node and real Chromium Worker import, hash, codec, and graph-purity
probes. `Bidirectional semantic round trip` remains open because a codec fixture
round trip is not the required filesystem -> CMS -> filesystem and CMS ->
filesystem -> CMS proof. That coordinated semantic proof is the next work
package; no acceptance claim is borrowed from this narrower runtime gate.

## 2026-07-14 — Coordinated Bidirectional Semantic Round Trip

### Objective and acceptance criteria

Prove the two real product directions through Ginko Content directories and the
CMS operation layer: filesystem -> CMS draft -> explicit publish -> immutable
filesystem export, then exported filesystem -> a fresh CMS. Acceptance required
semantic equality for plain Markdown, registered MDC, YAML, and JSON
collections, including nested objects, arrays, nulls, dates represented in JSON,
and Unicode. A second import of the exported directory had to resolve every CMS
draft as an exact `skip`, proving the CMS-side canonical hashes survived the
reverse direction.

### Test-first defect and direct correction

The first test fixture was corrected to obey the existing data-collection
topology (`slug: ""`). The component harness then needed a test-only reference
mapper because package orchestration addresses the host bridge while
`convex-test` loads the component functions directly. Once those harness facts
were correct, the test failed in `portablePublishedDocument` with
`DOCUMENT_INVALID`.

The product defect was that published revision snapshots intentionally include
shared values in each locale snapshot, but portability export passed every
present locale value to the localized projection. Shared fields therefore
appeared in both `shared` and `localized`. The same conversion also constructed
an MDC body for YAML/JSON data documents, whose canonical body must be `null`.

The fix keeps the installed Content contract as the only classification source:
shared and localized output each filter the collection fields by the canonical
`localized` flag, and one small body helper returns `null` unless the collection
portable format is MDC. The same helper is used for current-draft hashing and
published export so guarded import comparisons and export cannot drift. A
brief attempt to model data collections as an entry `nodeKind` was rejected and
removed: the existing entry model uses routing/collection policy for data-only
semantics, and its node-kind vocabulary is deliberately page/tree oriented.

No adapter, format, storage table, bridge export, compatibility path, or second
semantic model was added. Import remains draft-only and the test invokes the
existing confirmed publish operation explicitly.

### Executable evidence

- Expected product red: real published export failed with
  `DOCUMENT_INVALID` after importing and publishing the four-format directory.
- Green coordinated test: a real temporary Content directory containing plain
  Markdown, registered MDC, YAML, and JSON passed filesystem -> CMS ->
  filesystem semantic comparison. Import into a fresh CMS produced four
  `create` effects; preparing the identical directory again produced four
  `skip` effects from current CMS draft hashes.
- Focused portability slice: 5 files and 29 tests passed.
- `pnpm run prepare:component`: passed; the public component surface did not
  change, so regenerated bindings remained byte-identical.
- Focused Oxfmt, ESLint, and Convex typecheck passed.
- `pnpm run check` passed formatting over 913 files, all lint/policy guards,
  Contract typecheck/build, Convex typecheck/build, CMS package build, and Studio
  production build. It then stopped only at the previously recorded external
  playground fixture: stale `playground/convex/_generated/api.d.ts` has no
  `components` export. No generated host declaration was edited to conceal it.
- The gates after that external boundary were run directly:
  `check:publish-specifiers` and `studio:typecheck` passed; the full test suite
  passed 120 files with 1 environment-gated skip and 922 tests with 1 skip.
- `git diff --check` passed before commit.

### Artifact, commit, and acceptance matrix

The test consumed the immutable accepted Ginko Content artifact already pinned
by CMS:
`/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.07462b628e39.285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401.tgz`
— SHA-256
`285a7a4a61d974feb9148632a48f3fd8667e656a2b338cc93c0e59d72eb2f401`.

- Ginko CMS: `d7a40081` —
  `fix!: preserve semantic portability round trips`.

`Bidirectional semantic round trip` is now `implemented`. The evidence crosses
the actual Node directory codec, CMS import planning/apply, confirmed publish,
immutable published export, and a fresh CMS import. Packed-candidate and browser
rendering parity remain later release gates and are not claimed by this row.

## 2026-07-14 — Remove Superseded Content CMS Import Boundary

### Objective and hard cutover

Remove the unreleased `@lupinum/ginko-content/cms-import` compatibility surface
after the CMS consumer moved to the canonical portability codec and Node
directory entries. Acceptance required one mapping authority: no package
export, build entry, public-surface declaration, generated `dist` directory, or
positive packed-consumer import could remain. No shim, alias, feature flag, or
dual implementation was permitted.

The contract test was changed first and failed because `./cms-import` was still
exported. The implementation then deleted the 101-line source boundary and its
190-line unit suite, removed the manifest/build/public-surface entries, and
updated the architecture and migration documentation to point directly to
`./portability` and `./portability/node`. The packed consumer now proves the
removed path fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` while all replacement
subpaths continue to import and build.

### Executable and artifact evidence

- Focused package-export and architecture-boundary slice: 2 files and 38 tests
  passed.
- `pnpm lint && pnpm test`: passed; the post-deletion standard baseline is 99
  files and 831 tests.
- A fresh consumer installed the exact tarball, passed prepare, typecheck, and
  build, retained the canonical subpath imports, and rejected `./cms-import`.
- The exact-tarball Node/Chromium Worker probe passed 3 canonical hash vectors
  and the `docs.introduction` portability codec fixture.
- The first full `pnpm verify` attempt was rejected after 12 of 15 e2e tests
  passed: three search fixtures observed shared `dist` files disappear during
  their builds (`pagefind.js`, then the module entry). The isolated search
  matrix immediately passed 4 of 4 tests, and a complete focused e2e rerun
  passed 6 files and 15 tests. No product or harness code was changed for this
  environmental build race.
- The clean authoritative `pnpm verify` retry exited `0`. Repository policy,
  lint, compatibility, documentation build/smoke, all 13 example builds,
  typechecks, quickstart, 99 standard files / 831 tests, and 6 e2e files / 15
  tests passed in that uninterrupted run.
- `git diff --check`, `node --check scripts/test-packed-consumer.mjs`, and the
  final absence check for `packages/content/dist/cms-import` passed.

Immutable development artifact:
`/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.c33dae1f4e45.3aa695d0df36164b9ed12201d033001c1fb5d176464223369a8cdd3f4c638d67.tgz`
— SHA-256
`3aa695d0df36164b9ed12201d033001c1fb5d176464223369a8cdd3f4c638d67`.
The development filename records the pre-commit source revision; the bytes are
content-addressed and were verified before commit.

- Ginko Content: `5dcc0e9` —
  `refactor!: remove superseded cms-import boundary`.

This work package does not claim a new acceptance-matrix row. It closes the
one-source-of-truth cleanup required before candidate packing: portability is
the sole public mapping and directory boundary, and the superseded path is
absent rather than deprecated in parallel.

## 2026-07-14 — Phase H Adapter Documentation And Generated API

### Objective and source-of-truth design

Publish the missing data-source adapter-author guidance without creating a
second API authority. The package manifest remains the subpath authority and
`packages/content/src/public/data-source.ts` remains the declaration authority.
One deterministic script derives the public API page from those inputs and a
lint-time `--check` mode supplies the rebuild invariant. The handwritten guide
owns only integration guidance, the complete minimal adapter, Level 1 versus
Level 2 evidence, packed testing, and the production checklist.

The documentation contract was written first and failed for the absent guide,
old public-surface ownership, missing typechecked example, and absent generated
API page. The implementation points the data-source and its conformance export
to the new guide, compiles the exact guide example in the Nuxt type fixture,
and copies that canonical source into the fresh packed consumer so installed
declarations must compile it.

### Corrections and executable evidence

- The first docs build exposed that an HTML “generated file” comment becomes a
  public Markdown AST node rejected by the existing render policy. The visible
  generated notice already carried the fact, so the redundant comment was
  deleted; the renderer policy was not widened. A live request then returned
  HTTP 200 and the production docs build prerendered 191 routes.
- The first packed-consumer attempt placed the example in `server/plugins`,
  causing Nitro to require a default plugin export. The consumer copy now lives
  at `server/data-source-adapter.ts`, matching its provider-factory role. The
  fresh exact-tarball pnpm consumer then passed imports, prepare, typecheck,
  production build, portability probes, and the negative `cms-import` probe.
- Focused documentation contract: 1 file and 3 tests passed. The exact adapter
  example passed the real Nuxt type fixture.
- Generated API check, docs-drift's 14 checks, focused ESLint, script syntax,
  documentation build/smoke, and `git diff --check` passed.
- `pnpm lint && pnpm test` passed with 100 files and 834 tests.
- The one authoritative Phase H `pnpm verify` run exited `0`: policy/lint,
  generated API drift, 191-route docs build/smoke, all 13 examples, 100 files /
  834 standard tests, 6 files / 15 e2e tests, typechecks, and quickstart passed.

The exact unchanged package bytes used by the fresh consumer were:
`/Users/matthias/Git/workspace/ginko-content/.pack/dev/ginko-content-0.4.0-rc.1-dev.c33dae1f4e45.3aa695d0df36164b9ed12201d033001c1fb5d176464223369a8cdd3f4c638d67.tgz`
— SHA-256
`3aa695d0df36164b9ed12201d033001c1fb5d176464223369a8cdd3f4c638d67`.
This documentation work package did not change packed package files.

- Ginko Content: `5012657` —
  `docs: publish data source adapter guidance`.

Phase H documentation is implemented. No adapter is described as operationally
certified: the guide explicitly separates protocol conformance from
artifact-hash-pinned, adapter-owned operational evidence. Candidate generation
and coordinated release certification remain the next work package.

## 2026-07-14 — Preparatory Exact Artifact Infrastructure

### Objective and scope

Establish the deterministic local candidate machinery needed by the later WP8
and WP9 gates without treating an intermediate candidate as final release
certification. This work was infrastructure preparation only: the authoritative
implementation order remains at WP4, and every artifact acceptance row remains
open until all behavior-changing work packages are committed and the candidates
are regenerated from clean final sources.

### Changes and architectural decisions

- Added exact coordinated Content, Better Convex Nuxt, Contract, Convex, and CMS
  artifact inputs with SHA-256 verification and no registry, workspace, link, or
  sibling-source fallback.
- Made generated component API augmentation type-only so a packed host can
  typecheck without importing deployment-owned generated runtime code.
- Added isolated fresh pnpm and npm consumers with strict peer handling,
  generated host setup, typecheck, production Nuxt/Nitro build, boot, package
  imports, and portability verification.
- Kept offline boot independent from MCP startup and aligned the complete
  candidate tuple on Convex `1.42.1` after npm's stricter peer resolver exposed
  the stale `1.38` tuple. No compatibility shim or dual dependency path was
  retained.

### Executable evidence and intermediate artifacts

At clean CMS commit `837fb478`, `release:verify:candidate` passed the repository
gate (121 test files plus one gated skip; 925 tests plus one skip), both exact
pnpm and npm package consumers, Nitro boot, portability verification, and the
production audit. The exact intermediate artifacts were:

- Content: `12253bbddb77a65ef84af86dbd94b253102d615b93596b8422b6323644800cc4`.
- Better Convex Nuxt: `2fa872366fd3b1f372d82a87b91074f7119fb06ba7c9ae3054c76b747272b82f`.
- CMS Contract: `6a81d799e275d207c39bd636f5e48f6ceb65892ee20eadc2bb5dce6f55ac0078`.
- CMS Convex: `e87672e0df5bd7264c28990a30eed711ebb3f927e56618b858f9f30e219bd731`.
- CMS: `f7d5dc49e4cb19325f42c55df6cc543e2834311ae7c9443e4f685b40cfc57dd9`.

The coordinating commits are `29c4f387`, `610a600e`, `e4e7c3c8`, `e0d5bc0e`,
`0884b58d`, and `837fb478`. Their evidence is intentionally classified as
intermediate: subsequent WP4-WP8A source changes invalidate the CMS artifact
and require a new clean two-pack candidate before any matrix row is closed.

## 2026-07-14 — WP4 Identity-Safe Studio State

### Objective and acceptance criteria

Retire all private Studio state when the authenticated identity, arguments,
pagination generation, or Vue scope changes; prevent stale async work from
transforming or committing; deduplicate same-cursor page requests; and preserve
the exact generated component arguments and returns through the Studio host
allowlist. Acceptance required A-to-B and sign-out transitions, same-identity
token rotation, callbacks queued by retired clients, post-unmount refresh/reset,
mutation/action/upload settlement after disposal, cursor concurrency, local
compile-time equality, and a fresh packed host consumer.

### Repository ownership, files, and hard cutovers

- Ginko CMS owns all implementation and tests. Ginko Content was consumed only
  through its exact clean candidate. Better Convex Nuxt was built and packed as
  read-only evidence and remains clean at `dda45f9`.
- `useCmsAuthState`, the query and paginated-query composables, and
  `useStudioConvex` now guard state and callbacks with identity, operation, and
  disposal generations. Pagination also owns one in-flight cursor.
- Deleted the fake immediately-resolving `PromiseLike` query surface and the
  `hadReadyStudioAccess` state that could retain outgoing private UI.
- Added one private one-shot operation-scope helper for mutations, actions, and
  uploads. It was not generalized into a framework or exported from the
  package. Asset registration and deletion now use these guarded helpers rather
  than bypassing them through the raw client.
- The runtime Studio allowlist remains the single descriptor, but its mapped
  type now derives exact arguments and returns from the generated component API.
  Descriptor metadata names internal execute functions for confirmed public
  wrappers without adding a second surface authority.
- Exact typing exposed real erased-type mistakes in editor, asset, settings,
  search, and page consumers. Those call sites now use the actual bridge
  contracts. Studio search was simplified to the real collection-scoped public
  search API; the nonexistent optional `collections` argument was deleted.
- Added `test/runtime/studio-operation-scope.test.ts`; expanded the Studio query
  lifecycle suite and compile-time surface assertions. No generated Convex file
  was edited.

### Test-first evidence and corrections

The new focused cases were red before implementation: retired callbacks still
transformed values, disposed helpers could reacquire or commit, query objects
were promise-like without a settlement contract, duplicate cursor loads
dispatched twice, and async mutation/action/upload completions updated retired
state. Replacing broad bridge references with exact generated types then
produced 32 compile errors, revealing the previously hidden argument and return
assumptions; the call sites were corrected rather than weakening the types.

Focused green evidence:

- Studio lifecycle, operation-scope, host-bridge, browser-guard, workflow, and
  module boot slice: 8 files and 99 tests passed.
- The narrow query/operation adversarial slice: 2 files and 13 tests passed.
- CMS package typecheck, including generated consumer API equality, Studio
  typecheck, and both production builds passed.
- `pnpm check` passed formatting, every architecture/lint guard, all package and
  Studio typechecks/builds, publish-specifier checks, and 122 test files with one
  gated skip / 934 tests with one skip.

The first repository-gate attempts found only integration cleanup in the new
work: a public test title used an internal identity term, one removed
pagination constraint left an unused import, and that deletion needed Oxfmt.
After those direct corrections, the uninterrupted full gate above passed.

### Packed runtime evidence and artifacts

`package:e2e:dev` built the dirty WP4 sources, packed every package, installed
them into a fresh strict pnpm consumer, generated the host setup, and passed
doctor, typecheck, Nuxt/Nitro production build, runtime package imports, and
portable content verification. Exact bytes:

- Content candidate:
  `/Users/matthias/Git/workspace/ginko-content/.pack/lupinum-ginko-content-0.4.0-rc.1.tgz`
  — `12253bbddb77a65ef84af86dbd94b253102d615b93596b8422b6323644800cc4`.
- CMS Contract: `6a81d799e275d207c39bd636f5e48f6ceb65892ee20eadc2bb5dce6f55ac0078`.
- CMS Convex: `e87672e0df5bd7264c28990a30eed711ebb3f927e56618b858f9f30e219bd731`.
- CMS: `3f58182b5549f632c51786feb88359588d16c3341075b498f631dcc36ca7ef8f`.
- Better Convex Nuxt development pack:
  `46043aef29efc6087e4aa3fe90d88862fb6d57ac9fb96677adeff5672c4676fb`.

Ginko Content's independent `release:verify` also passed from clean commit
`fe24e4a`: 101 standard files / 835 tests, 6 e2e files / 15 tests, browser and
static generation, production audit, deterministic release pack, pure Node and
Chromium Worker probes, and fresh pnpm/npm consumers.

### Commit, findings, and acceptance matrix

- Ginko CMS: `a5ef63d1` — the WP4 Studio lifecycle and scope-safety implementation.
- Ginko Content: unchanged at `fe24e4a`.
- Better Convex Nuxt: unchanged and clean at `dda45f9`.
- No blocker or framework defect remains. The development CMS artifact is not a
  final candidate; final WP8/WP9 clean two-pack evidence is still required.
- Updated the Studio caller-retirement row to `implemented`,
  `Disposed-scope settlement`, `Pagination concurrency`, and
  `Exact Studio API types`.

## 2026-07-14 — WP5 Supervised MCP Authority

### Objective and hard cutover

Make the callable MCP product match its documented review-gated authority. MCP
may inspect CMS state and assets, create entries, save drafts, preview publish
impact, request human publish review, and inspect its own runs and review
status. It cannot publish, archive, restore, export backups, or move asset
ownership.

The old direct tools, component functions, and generated host bridge wrappers
for those excluded writes were deleted. Human publish and archive guards now
reject MCP callers even if a legacy credential row contains those scopes. The
accepted MCP credential-scope validator and runtime capability snapshot expose
only read, create-entry, and edit-entry authority. No compatibility path or
hidden callable wrapper remains.

### Audit truth, review ownership, and retry safety

- Agent runs are credential-owned and now persist an immutable effective-scope snapshot at start. Studio
  and MCP serialization reads that snapshot rather than joining current
  credential settings and presenting them as history. Every protected call
  still rechecks current credential status, expiry, member role, and scopes.
- MCP run listing is credential-scoped. Review-status lookup proves ownership
  through the originating run and remains available after the run closes.
- MCP entry creation alone requires a caller-provided `requestId`. A single
  CMS-owned receipt table records caller, request id, stable argument hash,
  created entry, and expiry. Exact and concurrent retries return the original
  entry; changed arguments and another credential using the run fail. Expired
  receipts are removed through the expiry index in bounded batches.
- The existing recursive response redactor remains the one output boundary for
  success and error text and structured values. Tool-contract tests also prove
  every active tool declares a capability and accepts no user, role, key, token
  hash, or capability override input.

### Test-first and executable evidence

The initial contract tests were red because 22 tools still included direct
publish, archive, restore, backup export, and asset movement; publish preview
issued destructive confirmation data; create had no request key; and run
serialization joined current credential scopes. The implementation deleted
those paths and corrected the host templates rather than weakening the tests.

Focused MCP, component, review, redaction, and runtime evidence passed 8 files
and 70 tests before the broader gate. Additional adversarial coverage proves
concurrent duplicate creation, argument-hash conflict, cross-credential run
denial, immutable scope history, expired credential rejection, closed-run
review lookup, and direct publish/archive denial with unchanged public rows.

`pnpm check` passed formatting, architecture and generated-surface guards,
lint, all package/Studio typechecks and builds, publish-specifier checks, and
the complete test suite. `package:e2e:dev` then installed the exact tuple into a
fresh strict pnpm consumer and passed generated host setup, doctor, typecheck,
Nuxt/Nitro production build, package imports, and portable content verification.

Exact development artifact bytes:

- Content at immutable commit `fe24e4a`:
  `12253bbddb77a65ef84af86dbd94b253102d615b93596b8422b6323644800cc4`.
- Better Convex Nuxt at clean commit `dda45f9`:
  `46043aef29efc6087e4aa3fe90d88862fb6d57ac9fb96677adeff5672c4676fb`.
- CMS Contract:
  `6a81d799e275d207c39bd636f5e48f6ceb65892ee20eadc2bb5dce6f55ac0078`.
- CMS Convex:
  `456d7ed2c2b8dcc28a7fdd41e52ed9dfb4e61b7131fe554fe63667397b8d6054`.
- CMS:
  `72bd4caba2db221daad97b463b193a1623039af491908f69326d7c7e6287e0df`.

During final packaging, the shared Ginko Content checkout was switched by a
concurrent task to `codex/release-0.3.0-rc.1` and contained unrelated uncommitted
work. No file in that checkout was changed or reset. The already-reviewed
`fe24e4a` commit was packed from an isolated detached worktree and reproduced
the previously certified SHA-256 exactly.

The Ginko Content product owner confirmed that the release branch intentionally
supersedes `fe24e4a`, but is not yet an immutable dependency candidate. The
publish target is Content `0.3.0-rc.1`, following the public `0.2.1` baseline;
the unpublished “0.4” work and CMS portability work are being combined into
that single semver step. CMS continues to use the certified `fe24e4a` bytes only
as temporary integration evidence. Final coordinated verification must replace
them with the clean `0.3.0-rc.1` commit and reproducible tarball supplied after
Content's complete gate. `0add0822` is explicitly not the dependency commit.

### Acceptance matrix

Updated to `implemented`: `Supervised MCP surface`,
`MCP credential fail-closed`, `Idempotent MCP entry creation`, and
`Agent-run audit truth`. Final clean candidate regeneration remains WP8/WP9
work; these development artifacts are not release candidates.

## 2026-07-14 — WP6 Public Delivery And Projection Performance

### Objective and ownership cutover

Make Ginko Content the single website-facing query, prerender, and sitemap
owner while retaining CMS Convex public functions as its published-only
provider backend. Delete the CMS Nuxt public HTTP facade, its generated website
API types, and CMS-owned prerender configuration instead of maintaining two
public delivery products.

The CMS module now rejects the removed `publicContent` option. Ginko Content
owns the consumer contract; CMS owns publication, projections, and durable
revalidation delivery. No compatibility shim, parallel facade, replacement
adapter, or second public read model was added.

### Bounded public reads and rebuildable projection facts

- Route enumeration reads paths already present on `publicEntries`; it no
  longer issues a route lookup per row.
- Translation-dependent list, navigation, surround, search, and sitemap reads
  use one bounded collection projection query and group translations in memory.
  The query-count fixture proves the same one-query budget for one and 1,000
  inputs; it does not replace the N+1 with unbounded concurrent queries.
- Published asset facts are derived once during publish or projection rebuild
  and stored on `publicEntries`. Public reads fail with
  `PUBLIC_PROJECTION_REBUILD_REQUIRED` for an old row without those facts,
  rather than silently falling back to the removed per-row asset-reference
  query path. The schema field is temporarily optional only so the schema can
  deploy before the required projection rebuild.

### Delivery, recovery, and cursor invariants

- Revalidation targets reject URL credentials and a second enabled target in
  the same environment. Delivery disables redirects, never reads or persists a
  remote response body, and reports only a local category plus HTTP status.
- Delivery remains explicitly at least once. Retries carry the stable event
  idempotency key, and the receiver contract requires durable deduplication by
  that key.
- Expired processing locks use the `by_status_lock_expiry` index in batches of 25. Reading one sentinel row beyond the batch determines whether to schedule
  another recovery pass.
- Activity pagination uses an opaque cursor over `(createdAt, _creationTime)`
  and indexed continuation queries. Native Convex component pagination is not
  available, and Convex cannot range an index on `_id`; `_creationTime` is the
  platform-supported immutable tie-breaker in the custom index. Equal
  `createdAt` fixtures prove no loss or duplication.

### Test-first evidence and corrections

Focused red tests first exposed the second public delivery surface, route and
translation N+1 behavior, per-row asset queries, redirect/body leakage risk,
ambiguous multi-target configuration, unbounded recovery, and timestamp-only
cursor loss. The first native-pagination implementation was removed when the
architecture guard correctly identified that Convex components do not support
it. The indexed opaque tuple cursor is the direct supported implementation.

The broad gate also found WP5 residue in Studio scope choices and legacy MCP
permission rows. The scope keys now have one contract-owned source of truth,
Studio offers only read/create/edit, and backend guards reject every removed
MCP write permission even when an old settings row contains it. Direct publish
tests now prove rejection and unchanged public state.

### Commands and exact development evidence

- `pnpm run prepare:component`: passed and regenerated the component API from
  the updated schema and functions.
- `pnpm run check`: passed formatting, architecture and generated-surface
  guards, lint, every package and Studio typecheck/build,
  publish-specifier checks, and the complete suite: 123 files passed plus one
  gated skip; 932 tests passed plus one skip.
- `package:e2e:dev`: packed the dirty WP6 source, installed the exact tuple in a
  fresh strict pnpm consumer, and passed host initialization, doctor,
  typecheck, Nuxt/Nitro production build, package imports, and portable-content
  verification.

Exact development artifact bytes:

- Certified temporary Content artifact from `fe24e4a`:
  `12253bbddb77a65ef84af86dbd94b253102d615b93596b8422b6323644800cc4`.
- Better Convex Nuxt from clean `dda45f9`:
  `46043aef29efc6087e4aa3fe90d88862fb6d57ac9fb96677adeff5672c4676fb`.
- CMS Contract:
  `23a32a0bba33c142539b923f2b8a3f573a224392a55de9e23511a320c04e4560`.
- CMS Convex:
  `e92554f6f2a3db5ead0799b3bcb8da857646d4b78252b5b97dab4c1048325800`.
- CMS:
  `c29c0200a05063f55cb1a41de63bc744ad642ecf0397f6a3069afdc73e5e5c5b`.

The package evidence records lockfile SHA-256
`66a0ac04cc2780901575608657ad5ba6e9f330894062818b63474a300b5bb3a0`.
These are development artifacts, not release candidates. CMS remains pinned to
the certified `fe24e4a` bytes for integration evidence until the Ginko Content
product owner supplies the final clean `0.3.0-rc.1` commit, reproducible
tarball, SHA-256, and complete gates. `0add0822` is not accepted as that commit.

### Acceptance matrix and next phase

Source commit: `88d9b93e` —
`refactor!: let Ginko Content own public delivery`.

Updated to `implemented`: `Revalidation boundary`,
`Revalidation target cardinality`, `Bounded outbox recovery`,
`Stable operational cursors`, `Ginko Content public ownership`, and
`Public query budget`. WP7 owns the maintainability and public-surface freeze;
WP8/WP9 still own final clean, exact-tuple release certification.

## 2026-07-14 — WP7 Contract Ownership And Public-Surface Freeze

### Objective and hard cutover

Remove duplicate or imaginary vNext surfaces before freezing package exports.
Ginko Content now directly owns the CMS-neutral MDC/path/slug contract through
`@lupinum/ginko-content/cms-contract`; CMS Convex imports that contract instead
of carrying a 619-line synchronized vendor copy. The vendor tree, sync script,
manifest, and parity test were deleted. No fallback copy, adapter, or dual path
remains.

The same hard-cutover rule removed module options and declarations that did not
have a working product path: `search`, `siteData`, `forms`, the nonexistent
`GINKO_CONTENT_PROVIDER_SITE` environment variable, outbox `siteId`, unused
webhook/publish outbox variants, fake public-read metadata, Studio
`workspaceId`/`plan` access facts, and the unused webhook settings mutation.
Content policy is the single locale source; Studio reads the resulting locale
projection through `getStudioSettings`.

### Frozen package and maintainability boundaries

- Contract field and schema exports are explicit subpaths rather than wildcard
  patterns. The duplicate Convex `./_generated/component.js` export was removed;
  `./component` is the one supported component entrypoint.
- The packed-consumer gate derives every public runtime specifier from package
  manifests, imports each one, resolves each type entry, and proves selected
  private/deleted paths fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- Every package now states the actual Node.js floor, `>=22.0.0`.
- Asset-finder types and pure filtering helpers moved out of the two largest
  Studio modules, and mobile scope/filter controls became focused components.
  The browser is 2,115 lines and the finder composable is 979 lines. These are
  still large review areas, so a handwritten-module size guard holds them below
  their current ceilings while later refactors can reduce them further.

### Verification and exact development evidence

- `pnpm run prepare:component`: passed using the direct Content contract and
  regenerated the checked Convex API files.
- `pnpm run check`: passed formatting, architecture/generated-surface guards,
  lint, every package and Studio typecheck/build, publish-specifier checks, and
  the complete suite: 124 files passed plus one gated skip; 928 tests passed
  plus one skip.
- `package:e2e:dev`: packed the WP7 source, installed only the exact artifacts
  in a fresh strict pnpm consumer, and passed initialization, doctor, Nuxt/Nitro
  production build, every manifest-derived runtime and type import, private
  subpath rejection, and portable-content verification.

Exact development artifact bytes:

- Certified temporary Content artifact from `fe24e4a`:
  `12253bbddb77a65ef84af86dbd94b253102d615b93596b8422b6323644800cc4`.
- Better Convex Nuxt from clean `dda45f9`:
  `46043aef29efc6087e4aa3fe90d88862fb6d57ac9fb96677adeff5672c4676fb`.
- CMS Contract:
  `24d7cdc6ebdcacf6d4c67ee9ff923e2beb93c048d75386404a6ab4276a00e4ad`.
- CMS Convex:
  `c7e67555fa43a5f671504a78bbb4e74a19a23ba391c6933115b476d3c6f8a7b4`.
- CMS:
  `40784b36f6c8aa0b8d8014ef8caacddd8859e90c0ed67257c2c7fa87b516b8d4`.
- Lockfile:
  `b054deb7879e5d2d5fd25e3b71d3b93f199b08487cbf0148ec18e93586b10ecc`.

These are development artifacts, not release candidates. CMS still uses the
certified `fe24e4a` bytes until the Ginko Content product owner supplies the
final clean `0.3.0-rc.1` commit, reproducible tarball, SHA-256, and complete
gate results. `0add0822` is not accepted as the dependency commit.

### Reviewer focus and next phase

Source commit: `7a472cb7` —
`refactor!: remove duplicate vNext contracts and phantom surfaces`.

The strongest part of this slice is the deletion-first ownership cutover: the
MDC/path contract and locale policy now each have one source of truth, and the
packed test derives its assertions from the manifests instead of maintaining a
second export list. Review should concentrate on the intentionally breaking
surface deletions, the generated Convex API delta, and the remaining large
asset browser/finder modules. The new size guard prevents regression but does
not claim those modules are finished abstractions.

Updated to `implemented`: `Direct Content contract` and
`Phantom surface deletion`. WP8/WP9 own final version alignment, exact clean
two-pack reproducibility, documentation/release notes, and candidate
certification against Content `0.3.0-rc.1`.
