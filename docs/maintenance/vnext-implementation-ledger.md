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
