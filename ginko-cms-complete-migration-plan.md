# Ginko CMS Complete Migration Plan

Status: top-level implementation plan.

Date: 2026-07-04.

Audience: maintainers and implementers who need one end-to-end plan for the
final Ginko CMS system.

## Scope

This is the complete migration plan. It is not only the MCP permission plan.

The MCP/AI permission work is one important lane inside the full CMS migration,
but the final product also needs:

- Trellis removal;
- direct `better-convex-nuxt` integration;
- Better Auth ownership of identity;
- a simpler CMS role model;
- canonical content lifecycle;
- Studio workflow updates;
- public delivery through Ginko Content;
- asset, import, backup, and restore boundaries;
- release/package hardening;
- docs and verification gates.

Supporting documents:

- `move-off-trellis.md`: Trellis removal and direct Convex cutover plan.
- `cms2-comparison.md`: current CMS vs CMS2 comparison and sweet spot.
- `migration-decision-questions.md`: decision guide with context.
- `mcp-ai-permission-migration-plan.md`: detailed MCP/AI permission lane.

This document is the program-level plan that ties those documents together.

Research inputs checked for this pass:

- current `ginko-cms` repo;
- `ginko-cms2`;
- `better-convex-nuxt` starters:
  - `mcp-agent`;
  - `team`;
  - `agentic-saas`;
- Better Auth API-key plugin docs:
  `https://better-auth.com/docs/plugins/api-key`;
- Better Auth API-key advanced docs:
  `https://better-auth.com/docs/plugins/api-key/advanced`;
- Nuxt MCP Toolkit docs:
  `https://mcp-toolkit.nuxt.dev/`;
- Nuxt MCP Toolkit package/repo surface:
  `https://github.com/nuxt-modules/mcp-toolkit`.

## Final Product Shape

Ginko CMS should become a focused self-hosted website CMS for Nuxt and Convex.

It should be:

- simple to install;
- direct to debug;
- reliable around publishing and public reads;
- AI-native through MCP;
- strict about permissions;
- not a generic SaaS platform;
- not a page builder;
- not a database admin;
- not a second auth/team framework.

The simplest final architecture:

```text
Host Nuxt app
  installs Ginko CMS module
  uses better-convex-nuxt for Convex, Better Auth, and SSR wiring

Better Auth
  owns users, sessions, accounts, API keys, and optional teams later

Ginko CMS Convex component
  owns CMS product data and invariants:
  collections, entries, drafts, revisions, public projections,
  members, roles, assets, imports, backups, restore, audit,
  MCP credentials, agent runs, review requests

Ginko CMS Studio
  owns editor workflows:
  draft editing, publish preview, review, assets, imports,
  settings, MCP token UX, agent workspace

Nuxt MCP Toolkit
  owns MCP route/tool transport

Ginko Content
  owns public website content-query/provider semantics
```

## Current State

### Already Good

The current repo is a strong release base:

- package split already exists;
- setup CLI and doctor exist;
- standalone Studio SPA exists;
- direct Convex setup is already partly in place;
- Trellis package dependencies are mostly removed from package metadata;
- content lifecycle is mature;
- publishing has stale-draft and projection invariants;
- managed assets exist;
- imports have preview/apply safety;
- backups have artifact and purge safety concepts;
- public provider surface exists;
- release verification and package E2E already exist;
- docs already explain direct Convex and Better Auth setup.

These parts should mostly be simplified and preserved, not rewritten.

### Still Missing Or Incomplete

The final product is not complete while these remain true:

- `better-convex-nuxt` is still referenced through local `file:` dependencies.
- MCP still depends on CMS-owned `mcpKeys` and `CONVEX_DEPLOY_KEY` for normal
  tool execution.
- MCP still has `projectTool` ceremony and generic tool runtime concepts.
- MCP tokens are not Better Auth API keys with CMS-owned scopes.
- AI work is not modeled as first-class `agentRuns`.
- Review requests are not the default path for agent public/destructive work.
- Some Trellis naming and bridge cleanup checks remain because old generated
  host files must still be detected.
- `CmsCaller` still acts like a compatibility-era abstraction.
- package/release gates do not yet prove that packed artifacts are free of
  `workspace:`, `file:`, and `link:` dependency specifiers.
- restore is not yet operator-grade until dry-run/apply exists.
- Studio does not yet expose the final AI/MCP workspace and review UX.

## Decisions Already Made

Treat these as fixed unless a maintainer explicitly reopens them.

| Area | Decision |
| --- | --- |
| Trellis | Move off Trellis with a hard cutover. Do not keep dual paths. |
| Nuxt integration | Use `better-convex-nuxt` for Nuxt, Convex, Better Auth, and SSR wiring. |
| Auth | Better Auth owns users, sessions, accounts, API keys, and optional teams. |
| CMS roles | Ginko CMS owns only product roles: owner, publisher, editor, viewer. |
| Tenants | No CMS tenants/workspaces now. Use Better Auth teams only if there is a real host-team requirement. |
| MCP | Exposed MCP is first-class. External clients should connect to the CMS. |
| MCP transport | Use Nuxt MCP Toolkit. |
| MCP tokens | Prefer Better Auth API keys for connection tokens; CMS owns scopes and workflow limits. |
| Agent work | Add `agentRuns` as first-class task/work-session records. |
| Agent destructive actions | Default to review requests. Trusted direct execution comes later only if proven safe. |
| AI authority | AI can eventually do anything a normal user can do, but only through delegated scopes and current role checks. |
| Publishing | Keep canonical draft, revision, publish, projection, and preview invariants. |
| Public reads | Public site reads go through published projections and Ginko Content provider semantics. |
| Assets | Keep managed asset invariants. Clarify public metadata and content exchange language. |
| Imports | Keep strict preview/apply and no-partial-write behavior. |
| Backups | Keep backups separate from content exchange. Do not overclaim restore until restore dry-run/apply exists. |
| Studio | Keep standalone Studio SPA, but add CMS2-inspired agent/review/readiness primitives. |
| Release | Block local dependency specifiers in packed packages. |

## Non-Goals

Do not implement these during this migration:

- CMS tenants;
- generic organizations/workspaces owned by CMS;
- schema/member/admin MCP tools;
- raw table MCP tools;
- generic operation registries;
- Trellis-compatible bridge exports;
- generated wrapper directories;
- second session/user/team system;
- feature flags to keep old and new internal paths alive;
- public draft reads through the site provider;
- direct AI delete/purge as a v1 default.

## Source Of Truth Rules

Each important concept needs exactly one owner.

| Concept | Owner | Notes |
| --- | --- | --- |
| User identity | Better Auth | Use stable Better Auth `user.id`. |
| Session | Better Auth | Studio/browser concern. |
| API key lifecycle | Better Auth | Creation, expiry, verification, revocation. |
| CMS member role | Ginko CMS Convex | Product role only. |
| MCP CMS scopes | Ginko CMS Convex | Collection and capability limits. |
| Agent task/session | Ginko CMS Convex | `agentRuns`. |
| Draft | Ginko CMS Convex | Canonical editable state. |
| Revision | Ginko CMS Convex | Immutable content snapshot. |
| Public projection | Ginko CMS Convex | Derived and rebuildable from published state. |
| Public website query | Ginko Content | Reads published projection data. |
| MCP route transport | Nuxt MCP Toolkit | No product authority in transport. |
| Studio workflow | Ginko CMS Studio | UI orchestration only. |
| Destructive invariant | Ginko CMS Convex | Never frontend-only. |
| Package release proof | Ginko CMS repo scripts | Packed consumer must pass. |

## Research Findings For Safe V1

These findings change how the migration should be approached.

### Better Auth API Keys Are Promising But Must Be Proven

Better Auth's API-key plugin supports API-key creation, verification, expiry,
metadata, prefixes, rate limiting, multiple key configurations, and
user-owned/organization-owned keys. That makes it a good candidate for MCP
connection tokens.

Important risk:

- the API-key plugin now lives in `@better-auth/api-key`, not only
  `better-auth/plugins`;
- using API keys to mock user sessions is explicitly security-sensitive;
- validating an API key and separately fetching a session can double-increment
  rate limits;
- the default API-key header is `x-api-key`, while MCP clients commonly use
  `Authorization: Bearer ...`;
- `@better-auth/api-key` version alignment must be checked with the installed
  `better-auth` version.

V1 implication:

- do not assume API keys automatically become safe user sessions;
- prefer verifying the key once at the Nuxt boundary and forwarding only the
  resolved user/key identity into Convex;
- if Bearer tokens are required for MCP clients, prove a custom key getter or
  adapter path before changing the real MCP runtime;
- keep CMS scopes outside Better Auth permissions unless a proof shows Better
  Auth permissions can express CMS collection and workflow constraints cleanly.

### Nuxt MCP Toolkit Is Transport, Not Product Authority

Nuxt MCP Toolkit gives the right transport shape:

- file/discovery-based tools, resources, prompts;
- Zod validation;
- middleware;
- dynamic definitions/visibility;
- sessions;
- multiple handlers;
- MCP SDK compatibility.

V1 implication:

- use it to expose the MCP endpoint and tool schemas;
- do not put CMS authority in toolkit visibility guards;
- do not treat MCP sessions as CMS authorization;
- Convex must still enforce every sensitive permission.

### Local Starters Confirm The Safer Agent Pattern

The `mcp-agent` starter confirms:

- explicit tools are easier to audit than generic tool wrappers;
- preview/request-approval/execute is the right destructive shape;
- source guards and redaction tests are worth keeping;
- MCP route middleware is the correct place for request context, not product
  authorization.

The `agentic-saas` starter confirms:

- `agentRuns` should be bounded records with capabilities, expiry, status, and
  audit;
- agent execution should re-check the delegating user's current permission;
- terminal run states matter;
- revocation and current permission checks are not optional.

V1 implication:

- copy the pattern, not the domain model;
- Ginko CMS should use CMS roles and collection scopes, not organizations or
  project permissions;
- agent writes should require current role and current token scope every time.

### CMS2 Confirms The Product Workflow But Not The Token Final Form

`ginko-cms2` has the better product workflow:

- MCP is first-class;
- agent runs exist;
- publish/archive requests are review requests;
- Studio has review and agent concepts;
- MCP instructions explicitly warn agents not to invent authority fields.

But CMS2's token shape is not necessarily the final shape because it issues its
own route token. For final Ginko CMS, the token lifecycle should first be tested
with Better Auth API keys.

V1 implication:

- use CMS2's workflow shape;
- do not blindly copy its token table;
- adapt token lifecycle to Better Auth if the proof passes.

### Current Repo Has Four Concrete Risk Clusters

The current repo still has:

- local `file:` dependencies for `better-convex-nuxt`;
- CMS-owned `mcpKeys`;
- `projectTool` and generic MCP runtime ceremony;
- normal MCP dependence on `CONVEX_DEPLOY_KEY`;
- `CmsCaller` compatibility-style identity plumbing.

V1 implication:

- these are not all one refactor;
- package/release baseline must be fixed before heavy product work;
- MCP auth must be proven before deleting old `mcpKeys`;
- `projectTool` should be replaced only after explicit tools exist;
- deploy key removal from normal MCP must happen with a working token path.

## V1 Safety Strategy

The safest v1 is supervised AI, not full autonomous publishing.

V1 should include:

- external MCP connection;
- scoped connection tokens;
- role-intersected MCP permissions;
- agent runs;
- draft create/update;
- publish preview;
- publish/archive review requests;
- Studio review approval/rejection;
- audit for every agent write and human approval;
- package-level release proof.

V1 should not include by default:

- direct agent publish;
- direct agent archive;
- direct agent delete;
- purge;
- schema mutation through MCP;
- member/settings management through MCP;
- CMS tenants/workspaces;
- public draft reads;
- unproven restore claims.

Direct publish can be added later only if the trusted-mode proof passes. If that
proof is ambiguous, shipping without direct publish is the better v1.

## Big Refactor Entry Gates

Do not start broad MCP/AI or Trellis-cleanup refactors until these gates pass.

### Gate 1: Package Reality Gate

Purpose:

- prove local workspace success is not hiding release failure.

Must pass before:

- any large runtime refactor.

Checks:

- no release artifact depends on `workspace:`, `file:`, or `link:`;
- `better-convex-nuxt` dependency is publishable;
- package E2E installs packed artifacts in a clean consumer;
- package E2E does not rely on sibling checkouts except through packed tarballs.

Failure means:

- stop product work and fix packaging first.

### Gate 2: Better Auth API-Key Gate

Purpose:

- prove the final MCP connection-token owner.

Must pass before:

- deleting `mcpKeys`;
- changing Studio MCP settings UI;
- removing deploy-key-backed MCP calls.

Checks:

- `@better-auth/api-key` works with the installed Better Auth version;
- key can be created by an authenticated Studio user;
- key can be verified from the Nuxt MCP route;
- Bearer token usage is supported or cleanly adapted;
- verification returns stable Better Auth user id and key id;
- revoked, expired, malformed, and wrong-config keys fail;
- rate limit behavior is known and does not double-count per request;
- raw key is never stored in CMS rows or logs.

Failure means:

- use a tiny CMS-owned MCP token table as the explicit fallback;
- keep the same CMS scopes and role intersection;
- do not block agent runs/review requests on Better Auth token lifecycle.

### Gate 3: Current Role Intersection Gate

Purpose:

- prove tokens never outlive the user's current CMS authority.

Must pass before:

- enabling MCP write tools outside a local proof.

Checks:

- editor token can write drafts;
- editor token cannot publish;
- downgraded editor token loses draft write immediately;
- removed member token loses protected access immediately;
- owner token is still limited by token scope;
- all denials are audited.

Failure means:

- no MCP writes in v1.

### Gate 4: Agent Run Gate

Purpose:

- prove AI writes are traceable and bounded.

Must pass before:

- exposing draft-write MCP tools to real users.

Checks:

- first write creates or requires an `agentRun`;
- run has status, capability list, collection restrictions, expiry, and actor
  identity;
- completed/revoked/failed/expired runs cannot write;
- run permission check re-reads the delegating user's current CMS role;
- audit links token, user, run, tool, entry, and operation.

Failure means:

- only read-only MCP should ship.

### Gate 5: Review Request Gate

Purpose:

- prove agents can prepare public changes without changing public state.

Must pass before:

- enabling agent publish/archive workflows.

Checks:

- agent can update draft;
- agent can preview publish;
- agent can create review request;
- public projection is unchanged before approval;
- publisher/owner approval re-checks role and stale draft state;
- editor cannot approve;
- reject has no public effect;
- audit records requester, agent run, reviewer, and final operation.

Failure means:

- v1 may allow draft assistance only, not publish/archive preparation.

### Gate 6: Explicit MCP Surface Gate

Purpose:

- prevent MCP from becoming a second admin API.

Must pass before:

- deleting `projectTool`;
- claiming the new MCP is production-ready.

Checks:

- tool list is explicit and small;
- no raw table tools;
- no schema/member/settings tools;
- no tool accepts authority fields;
- no tool returns secrets or raw internal documents;
- source guard tests catch forbidden imports and old runtimes;
- at least one real MCP client or SDK smoke can list tools and call read/draft
  tools.

Failure means:

- keep MCP internal/experimental and do not document it as first-class.

### Gate 7: Studio Operator Gate

Purpose:

- prove humans can supervise agent work.

Must pass before:

- presenting v1 as AI-native.

Checks:

- user can create and revoke MCP connection;
- user can choose expiry and scope;
- editor can see own agent runs and draft changes;
- publisher/owner can review pending requests;
- stale requests are obvious;
- approval/rejection uses canonical backend operations;
- UI copy does not claim autonomous publish if trusted mode is disabled.

Failure means:

- keep MCP as advanced/experimental and delay broad positioning.

### Gate 8: Release Gate

Purpose:

- prove final state as a package.

Must pass before:

- release candidate.

Checks:

- `pnpm run check`;
- `pnpm run release:verify`;
- package E2E;
- no-zombie searches for Trellis, `projectTool`, old `mcpKeys`, and normal MCP
  `CONVEX_DEPLOY_KEY` dependency;
- docs describe exactly the shipped behavior.

Failure means:

- no release candidate.

## Baseline Experiments

Run these before larger rewrites. They are designed to prove the risky parts
with minimal code.

### Experiment 1: Packed Dependency Baseline

Question:

- Can a packed consumer install Ginko CMS without local dependency specifiers?

Steps:

- Replace local `file:` dependency specs for `better-convex-nuxt` with a
  publishable version/range for release verification.
- Add or tighten a packed manifest check that fails on `workspace:`, `file:`,
  and `link:`.
- Run package E2E against packed artifacts.

Acceptance criteria:

- packed `@lupinum/ginko-cms` manifest contains no local dependency specifiers;
- packed consumer installs without local workspace assumptions;
- package E2E passes;
- failure output names the exact offending package and field.

Go/no-go:

- Do not call the package releasable until this passes.

### Experiment 2: Better Auth API Key As MCP Credential

Question:

- Can Better Auth API keys be used as external MCP bearer tokens in the Nuxt MCP
  route?

Steps:

- Add and enable `@better-auth/api-key` in a small proof.
- Create an API key from a Studio/server flow.
- Verify it at the MCP route boundary.
- Resolve Better Auth `user.id`.
- Forward only the resolved identity/key id to Convex.

Acceptance criteria:

- token is shown once;
- raw token is never stored in CMS rows;
- expired token fails;
- revoked token fails;
- malformed token fails;
- verified token resolves a stable Better Auth user id;
- rate-limit behavior is measured and does not double-count a single MCP
  request;
- Bearer-token usage is proven or replaced with a documented supported header;
- MCP bearer auth works with a real MCP client or SDK smoke.

Fallback:

- If Better Auth API keys do not fit the Nuxt/Convex runtime, use a tiny
  CMS-owned token table only for MCP token lifecycle. Keep the same CMS scopes
  and current-role intersection model.

### Experiment 3: Effective Permission Intersection

Question:

- Does an existing MCP token immediately lose authority when the user role
  changes?

Steps:

- Create an editor user.
- Create an MCP token with draft-write scope.
- Confirm draft write works.
- Downgrade user to viewer.
- Reuse same token.

Acceptance criteria:

- token verification still succeeds;
- draft write is denied after downgrade;
- removal from CMS members blocks protected MCP tools;
- denied attempt is audited;
- no MCP input can override `authUserId`, `memberId`, role, or organization.

### Experiment 4: Agent Run And Review Request Slice

Question:

- Can an agent update a draft and request publish review without changing the
  public website?

Steps:

- Create `agentRuns`.
- Create `reviewRequests`.
- Add MCP tools for read, save draft, preview publish, request publish.
- Approve review in Studio as publisher/owner.

Acceptance criteria:

- agent draft write is linked to one run;
- review request stores observed draft/revision details;
- public projection is unchanged before approval;
- approval re-checks current permissions and stale draft state;
- canonical publish function performs the actual publish;
- audit records delegating user, agent run, reviewer, and publish action.

### Experiment 5: Studio Agent Workspace UX

Question:

- Can a normal editor understand what an agent did and what needs review?

Steps:

- Add a minimal Studio agent workspace.
- Show active/recent agent runs.
- Show draft changes and review requests.
- Show approve/reject controls only to roles that can approve.

Acceptance criteria:

- editor can see their own agent runs;
- publisher/owner can see pending review requests;
- viewer cannot approve or mutate;
- stale review requests are visibly stale;
- approving from Studio uses the same canonical backend operation.

### Experiment 6: Trusted Direct Publish Proof

Question:

- Can direct agent publish be made safe enough for explicitly delegated trusted
  automation?

Run this only after Experiments 2-5 pass.

Acceptance criteria:

- disabled by default;
- requires explicit trusted scope;
- requires current publisher/owner role;
- editor token cannot direct publish;
- role downgrade blocks an existing trusted token;
- publish preview or equivalent stale-state guard is enforced;
- audit clearly marks trusted agent direct execution.

Go/no-go:

- If this is hard to explain or hard to test, keep trusted direct publish out of
  v1 and ship review requests only.

## Migration Phases

### Phase 0: Freeze Baseline And Ownership

Objective:

- Lock the migration baseline before implementation expands.

Todos:

- [ ] Confirm this document is the top-level source of truth.
- [ ] Keep `move-off-trellis.md` as the Trellis lane.
- [ ] Keep `mcp-ai-permission-migration-plan.md` as the detailed MCP lane.
- [ ] Mark all reopened decisions in `migration-decision-questions.md`.
- [ ] Confirm no CMS tenants/workspaces are being added.
- [ ] Confirm Better Auth owns API-key lifecycle if Experiment 2 passes.
- [ ] Confirm default AI mode is supervised/review-gated.

Acceptance criteria:

- implementer can start from this file and find every related plan;
- no phase requires old and new internal paths to run side by side;
- every new table has a named owner and acceptance criterion.

Verification:

```bash
git diff --check -- *.md
rg -n "workspace|tenant|organization|Trellis|mcpKeys|projectTool|CONVEX_DEPLOY_KEY" \
  ginko-cms-complete-migration-plan.md migration-decision-questions.md \
  mcp-ai-permission-migration-plan.md move-off-trellis.md
```

### Phase 1: Release And Package Baseline

Objective:

- Make the current direct-Convex package base releasable before deep feature
  work.

Todos:

- [ ] Remove release-blocking local `file:` dependency specs.
- [ ] Add packed manifest checks for `workspace:`, `file:`, and `link:`.
- [ ] Ensure package E2E installs packed artifacts in a clean consumer.
- [ ] Keep Trellis package dependencies absent.
- [ ] Keep `better-convex-nuxt` as the only Nuxt/Convex/Better Auth integration
      dependency.
- [ ] Update quickstart and package READMEs to match the publishable install
      story.

Acceptance criteria:

- `pnpm install` works from a clean checkout;
- package metadata has no Trellis dependency;
- packed artifacts have no local dependency specifiers;
- package consumer test passes;
- docs install command uses publishable package specs.

Verification:

```bash
pnpm install
pnpm run check:publish-specifiers
pnpm run package:e2e
pnpm run release:verify
```

### Phase 2: Remove Remaining Trellis Ceremony

Objective:

- Delete leftover Trellis-era structures that make the system harder to reason
  about.

Todos:

- [ ] Remove stale Trellis bridge marker language from active generated output.
- [ ] Keep only doctor detection for old host files that users must delete.
- [ ] Remove `_trellisForwarding` assumptions.
- [ ] Remove generated operation descriptor/handle concepts.
- [ ] Replace `CmsCaller` with direct identity resolution where possible.
- [ ] Keep deploy-key/admin transport only for setup, doctor, sync, and narrow
      admin operations.

Acceptance criteria:

- no active runtime import depends on Trellis packages or `#trellis`;
- no active CMS code requires generated Trellis bridge files;
- tests still catch stale host Trellis files;
- identity resolution is simpler than the Trellis-era caller abstraction.

Verification:

```bash
rg -n "@lupinum/trellis|#trellis|_trellisForwarding|defineTrellis|Trellis" \
  packages docs test README.md
pnpm run typecheck
pnpm run lint
```

Expected result:

- matches are limited to migration docs, tests for stale cleanup, and explicit
  historical wording.

### Phase 3: Better Auth And CMS Roles

Objective:

- Make identity and CMS role authority unambiguous.

Todos:

- [ ] Use Better Auth stable `user.id` as canonical `authUserId`.
- [ ] Keep CMS members as product-role rows only.
- [ ] Keep role matrix small: owner, publisher, editor, viewer.
- [ ] Move team/org concerns to Better Auth only if a real product requirement
      appears.
- [ ] Add invariant tests for role downgrade/removal.
- [ ] Ensure Studio capability visibility is derived from backend permission
      checks, not its own source of truth.

Acceptance criteria:

- member role change affects Studio permissions immediately;
- member removal blocks protected CMS operations;
- frontend capability display cannot grant backend authority;
- no CMS tenant/workspace table is introduced.

Verification:

```bash
pnpm exec vitest run test/component/auth test/component/members-crud.test.ts
pnpm exec vitest run test/runtime/cms-studio-query.test.ts
```

### Phase 4: Canonical Content Lifecycle Hardening

Objective:

- Preserve the current mature content lifecycle while simplifying wrappers.

Todos:

- [ ] Keep draft save as the only canonical editable content path.
- [ ] Keep immutable revisions.
- [ ] Keep publish preview and stale draft guards.
- [ ] Keep public projections derived from published state.
- [ ] Collapse derived route/public tables only if a measured query reason does
      not justify keeping them.
- [ ] Add rebuild/health checks for every derived public row.
- [ ] Confirm rollback/archive/restore semantics are explicit and reversible
      where possible.

Acceptance criteria:

- draft save never rewrites public projection;
- publish creates immutable revision;
- stale publish is rejected;
- public projections can be rebuilt or validated;
- public provider never reads drafts.

Verification:

```bash
pnpm exec vitest run test/component/entries/read.test.ts test/component/entries/publish.test.ts
pnpm exec vitest run test/runtime/studio-workflow-components.test.ts
```

### Phase 5: MCP Token Proof And Credential Model

Objective:

- Replace custom MCP key authority with a simpler token ownership model.

Todos:

- [ ] Run Experiment 2.
- [ ] Use Better Auth API keys for token lifecycle if the experiment passes.
- [ ] Add CMS-owned MCP credential settings for scopes, collections, and safety
      mode.
- [ ] Remove `mcpKeys` as the default token table if Better Auth API keys work.
- [ ] Keep raw tokens out of CMS rows, audit, logs, and UI after creation.
- [ ] Add current-role intersection checks.

Acceptance criteria:

- token lifecycle is owned by Better Auth or explicitly documented fallback;
- CMS credential row cannot grant more than current member role;
- revoked/expired tokens fail;
- role downgrade/removal affects existing tokens immediately;
- audit identifies token connection without exposing the raw token.

Verification:

```bash
pnpm exec vitest run test/component/mcpKeys.test.ts test/runtime/mcp-auth-middleware.test.ts
pnpm exec vitest run test/runtime/mcp-runtime.test.ts
```

Expected code direction:

- these tests should evolve away from custom `mcpKeys` lifecycle tests if
  Better Auth API keys become the token source.

### Phase 6: Agent Runs And Review Requests

Objective:

- Make AI work a product concept instead of an invisible MCP side effect.

Todos:

- [ ] Add `agentRuns`.
- [ ] Add `reviewRequests`.
- [ ] Link all MCP writes to an agent run.
- [ ] Make public/destructive agent actions create review requests by default.
- [ ] Add Studio review approval/rejection backed by canonical operations.
- [ ] Add stale-state checks to approval.
- [ ] Add audit events for agent, delegating user, reviewer, and operation.

Acceptance criteria:

- read-only MCP can run without a write run if desired;
- every MCP write is tied to one run;
- public state does not change when an agent only requests review;
- approval re-checks role and stale state;
- rejection has no public output effect;
- completed/revoked runs cannot keep writing.

Verification:

```bash
pnpm exec vitest run test/component test/runtime/mcp-runtime.test.ts
pnpm exec vitest run test/runtime/studio-workflow-components.test.ts
```

### Phase 7: Rebuild MCP Surface With Nuxt MCP Toolkit

Objective:

- Make MCP a small product API, not a generic admin/runtime layer.

Todos:

- [ ] Use Nuxt MCP Toolkit for route registration and tool transport.
- [ ] Delete generic `projectTool` once explicit tools replace it.
- [ ] Remove normal MCP dependency on `CONVEX_DEPLOY_KEY`.
- [ ] Remove synthetic MCP Convex identity.
- [ ] Expose explicit product tools only.
- [ ] Keep tool schemas free of authority inputs.
- [ ] Redact secrets and raw internal docs from MCP responses.

Default v1 tool surface:

- list collections;
- get collection schema summary;
- list/search entries;
- get entry;
- create entry draft;
- save draft;
- preview publish;
- request publish;
- list assets;
- get asset;
- resolve public asset URLs;
- list own agent runs;
- get review request status.

Not v1 default:

- direct publish;
- direct archive;
- direct delete;
- purge;
- schema mutations;
- member management;
- settings management;
- raw table reads;
- deploy/admin tools.

Acceptance criteria:

- external MCP client can connect;
- expected tools are listed;
- no tool accepts `authUserId`, `memberId`, `role`, token hash, or raw authority
  fields;
- editor token can draft but cannot publish;
- publisher/owner token can request publish review;
- old direct destructive MCP defaults are gone.

Verification:

```bash
pnpm exec vitest run test/shared/mcp-tools.test.ts test/runtime/mcp-project-tool.test.ts
pnpm exec vitest run test/runtime/mcp-auth-middleware.test.ts
```

Expected code direction:

- `mcp-project-tool.test.ts` should eventually be deleted or rewritten because
  `projectTool` should not remain a core abstraction.

### Phase 8: Studio Final UX

Objective:

- Make the Studio feel like the control center for humans and delegated agents.

Todos:

- [ ] Keep the standalone SPA boundary.
- [ ] Add MCP connection-token management.
- [ ] Add agent workspace.
- [ ] Add review request inbox.
- [ ] Improve publish readiness and projection health visibility.
- [ ] Show agent changes as draft/review artifacts, not mysterious side effects.
- [ ] Keep destructive actions previewed and confirmable.
- [ ] Keep role-based controls derived from backend capabilities.

Acceptance criteria:

- owner can create/revoke MCP connections;
- editor can create a scoped editing MCP connection if allowed;
- editor can see agent-created drafts;
- publisher/owner can approve/reject review requests;
- viewer cannot mutate;
- stale review/publish state is visible;
- settings do not imply MCP needs `CONVEX_DEPLOY_KEY` as normal runtime auth.

Verification:

```bash
pnpm exec vitest run test/runtime/editor-workflows.test.ts
pnpm exec vitest run test/runtime/studio-workflow-components.test.ts
pnpm exec vitest run test/runtime/cms-studio-query.test.ts
```

### Phase 9: Assets, Imports, Backups, Restore

Objective:

- Keep current operational strengths while clarifying boundaries.

Todos:

- [ ] Keep managed asset metadata and public URL gating.
- [ ] Keep content asset refs.
- [ ] Keep import preview/apply and no-partial-write behavior.
- [ ] Separate content exchange from operator backup/restore.
- [ ] Add restore dry-run/apply before claiming operator-grade restore.
- [ ] Keep purge gated and audited.
- [ ] Add smoke for export/import roundtrip if not already covered in this repo.

Acceptance criteria:

- asset public URL exposure follows published/public rules;
- import preview shows changes before writes;
- failed import does not partially write;
- backup artifact model remains separate from content exchange;
- restore dry-run reports impact without writes;
- restore apply is gated, audited, and covered by tests.

Verification:

```bash
pnpm exec vitest run test/component test/runtime/editor/richtext-asset-mapping.test.ts
pnpm exec vitest run test/runtime/editor-workflows.test.ts
```

### Phase 10: Public Delivery And Ginko Content Provider

Objective:

- Keep public site reads simple, deterministic, and published-only.

Todos:

- [ ] Keep public provider surface.
- [ ] Ensure provider reads only public projections.
- [ ] Preserve old site DSL ergonomics through Ginko Content provider semantics,
      not by reviving old CMS API surfaces.
- [ ] Keep route diagnostics honest.
- [ ] Keep revalidation outbox behavior clear.

Acceptance criteria:

- public provider cannot read drafts;
- route/path changes revalidate old and new public paths;
- content query contract is documented;
- Ginko Content owns neutral read semantics;
- CMS owns editorial workflow only.

Verification:

```bash
pnpm exec vitest run test/component/entries/publish.test.ts
pnpm exec vitest run test/module/e2e-package-consumer.test.ts
```

### Phase 11: Trusted Agent Automation

Objective:

- Decide whether trusted direct execution belongs in v1.

Todos:

- [ ] Run Experiment 6 only after supervised/review mode works.
- [ ] Add direct publish only if the model is easy to explain and test.
- [ ] Keep direct archive/delete/purge out unless explicitly designed.
- [ ] Require explicit trusted scope and current publisher/owner role.
- [ ] Add audit and rollback guidance.

Acceptance criteria:

- trusted mode disabled by default;
- trusted token is explicitly scoped;
- current role is always checked at execution time;
- publish stale-state guard still applies;
- owner/publisher downgrade blocks existing trusted token;
- tests prove editor cannot direct publish.

Verification:

```bash
pnpm exec vitest run test/component test/runtime/mcp-runtime.test.ts
pnpm exec vitest run test/shared/mcp-tools.test.ts
```

Decision gate:

- If this phase weakens the mental model, ship v1 without trusted direct
  publish. Review requests are enough for first release.

### Phase 12: Documentation And Migration Guide

Objective:

- Make the final system understandable without prior Trellis/CMS2 context.

Todos:

- [ ] Update README install story.
- [ ] Update quickstart.
- [ ] Update environment docs.
- [ ] Update MCP docs.
- [ ] Update auth/role docs.
- [ ] Update Studio workflow docs.
- [ ] Update backup/import/restore docs.
- [ ] Write breaking migration guide from Trellis-era Ginko CMS.
- [ ] Add cleanup checklist for old host generated files.

Acceptance criteria:

- a new user can install without knowing Trellis existed;
- existing user can identify files to delete;
- docs do not describe custom MCP keys if Better Auth API keys are the final
  path;
- docs do not claim restore capabilities that do not exist;
- docs explain AI authority and review/trusted modes clearly.

Verification:

```bash
pnpm run docs:check
pnpm run check:public-vocabulary
rg -n "Trellis|trellis|mcpKeys|CONVEX_DEPLOY_KEY.*MCP|file:|workspace:|link:" docs README.md packages/cms/README.md
```

### Phase 13: Final Cleanup And Release Gate

Objective:

- Prove the final CMS system as a package, not just a local workspace.

Todos:

- [ ] Delete old MCP key UI/runtime if replaced.
- [ ] Delete `projectTool` after explicit MCP tools exist.
- [ ] Delete unused compatibility wrappers.
- [ ] Remove generated `dist/` churn from commits.
- [ ] Run no-zombie searches.
- [ ] Run full verification.
- [ ] Pack and inspect artifacts.
- [ ] Prepare release notes and migration notes.

Acceptance criteria:

- no active Trellis runtime remains;
- no old and new MCP authority paths remain side by side;
- no second source of truth for identity, role, or token authority exists;
- package consumer works from packed artifacts;
- release notes explain breaking changes and migration steps.

Verification:

```bash
pnpm run check
pnpm run release:verify
pnpm run package:e2e
rg -n "@lupinum/trellis|#trellis|_trellisForwarding|defineTrellis|projectTool|mcpKeys" \
  packages docs test README.md
```

Expected result:

- remaining matches are only intentional docs, historical migration notes, or
  tests that assert old surfaces are gone.

## Cross-Cutting Test Matrix

### Auth And Roles

- user id maps from Better Auth to CMS member;
- owner can manage members/settings;
- publisher can publish/approve;
- editor can draft but not publish;
- viewer can read but not write;
- role downgrade affects Studio and MCP immediately;
- removed member cannot use existing token.

### Content Lifecycle

- draft save does not publish;
- publish creates immutable revision;
- stale publish fails;
- archive/unpublish clears public projection correctly;
- route changes revalidate old and new paths;
- public provider reads published-only state.

### MCP And AI

- token create/verify/revoke/expire;
- token scope intersects current role;
- read-only tools do not mutate;
- write tools require run;
- review request does not publish;
- approval publishes through canonical operation;
- trusted mode disabled by default;
- no MCP tool accepts authority inputs.

### Studio

- settings load for each role;
- MCP token UI respects role;
- agent workspace shows runs;
- review inbox gates approve/reject;
- stale publish/review state is visible;
- destructive actions have preview/confirmation.

### Assets

- managed asset refs update correctly;
- public URL gating follows publish state;
- rich text asset ids resolve correctly;
- delete/purge is gated and audited.

### Imports, Backups, Restore

- import preview is write-free;
- import apply is atomic enough to avoid partial writes;
- content exchange roundtrip works;
- backup artifact metadata is correct;
- restore dry-run is write-free;
- restore apply is gated and audited.

### Package And Release

- no Trellis dependencies;
- no local dependency specs in packed artifacts;
- public exports are intentional;
- generated files are regenerated, not hand-edited;
- package consumer installs and runs;
- release verification passes.

## Implementation Order Recommendation

Recommended order:

1. Release/package baseline.
2. Trellis ceremony cleanup.
3. Better Auth role authority cleanup.
4. Content lifecycle hardening.
5. Better Auth API-key MCP proof.
6. Agent runs and review requests.
7. Nuxt MCP Toolkit explicit tool rebuild.
8. Studio AI/review workspace.
9. Assets/imports/backups/restore completion.
10. Public provider hardening.
11. Trusted automation proof.
12. Docs and release.

Why this order:

- package baseline prevents local-only success;
- Trellis cleanup reduces complexity before adding new concepts;
- role authority must be correct before MCP scopes;
- content invariants must stay stable before agents can mutate drafts;
- supervised MCP/AI must work before trusted automation is considered.

## Failure Modes

### Migration Fails Because We Start With The Big Refactor

Mitigation:

- run the entry gates first;
- build vertical slices;
- delete only after the replacement has passed its gate;
- keep v1 supervised if trusted automation is not proven.

### Migration Fails Because We Keep Old And New Paths

Mitigation:

- hard cut unreleased internals;
- delete old runtime after each phase passes;
- keep compatibility only for released public APIs with a removal target.

### Migration Fails Because MCP Becomes A Second Admin API

Mitigation:

- explicit tools only;
- no raw table tools;
- no member/settings/schema tools by default;
- no authority inputs;
- all sensitive writes through canonical CMS operations.

### Migration Fails Because Better Auth API Keys Do Not Fit

Mitigation:

- run the API-key experiment early;
- keep a tiny CMS token fallback;
- do not redesign agent runs or permissions around the fallback.

### Migration Fails Because AI Can Do Too Much

Mitigation:

- default to review requests;
- use current-role intersection;
- disable trusted mode by default;
- require explicit trusted scope and tests.

### Migration Fails Because Public Projections Drift

Mitigation:

- keep projections derived and rebuildable;
- add invariant tests;
- add diagnostics/health checks;
- never let draft save write public projection.

### Migration Fails Because Release Works Only Locally

Mitigation:

- packed manifest checks;
- packed consumer E2E;
- reject local dependency specifiers;
- run release verification before declaring done.

## Final Definition Of Done

The migration is complete when all of this is true:

- Ginko CMS installs without Trellis.
- Ginko CMS uses `better-convex-nuxt` for Nuxt/Convex/Better Auth integration.
- Better Auth owns users, sessions, and MCP connection-token lifecycle, unless
  the documented fallback is chosen after a failed experiment.
- CMS owns only CMS product roles and scopes.
- No CMS tenant/workspace system exists.
- Drafts, revisions, publish, archive, public projections, and revalidation
  pass invariant tests.
- Public provider reads published projection data only.
- Assets, imports, backups, and restore have honest documented guarantees.
- MCP is first-class and uses Nuxt MCP Toolkit.
- MCP tools are explicit product tools, not a generic admin layer.
- MCP effective permission is token scope intersect current CMS role.
- Every MCP write is tied to an agent run.
- Public/destructive agent work is review-gated by default.
- Trusted direct publish is either absent or proven by tests.
- Studio exposes token management, agent runs, and review requests.
- Old custom MCP authority paths are deleted or explicitly deprecated.
- Packed artifacts have no local dependency specs.
- `pnpm run check`, package E2E, and release verification pass.
