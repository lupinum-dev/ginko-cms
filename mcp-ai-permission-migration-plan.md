# MCP, AI, And Permission Migration Plan

Status: implementation plan.

Date: 2026-07-04.

Goal: migrate Ginko CMS toward a first-class AI/MCP product surface where
external MCP clients can work with CMS content through the same permission model
as human users.

This plan focuses on:

- MCP connection tokens;
- Better Auth ownership;
- CMS roles and scopes;
- agent runs;
- AI permissions;
- review/trusted modes;
- migration phases;
- proof experiments and acceptance criteria.

## Target Outcome

Ginko CMS should let a user connect an external MCP client such as Codex,
Claude Desktop, Cursor, or another agent runner, then safely ask it to work with
CMS content.

Example target workflows:

- "Write a new blog post."
- "Translate this page into German."
- "Improve SEO fields across these product pages."
- "Prepare this entry for publishing."
- "Publish this article."
- "Archive outdated campaign pages."

The important rule:

```text
MCP effective permission = token scope intersect current CMS role
```

An MCP token never gives more authority than the user who created it currently
has.

If an editor creates an MCP token, it can only act as that editor. If the editor
is downgraded or removed, the token immediately loses write authority. If an
owner creates a token, it is still scoped. Owner token does not mean raw admin
API.

## Target Architecture

```text
Better Auth
  owns users, sessions, API key lifecycle

Ginko CMS members
  own CMS roles: owner, publisher, editor, viewer

MCP credential settings
  own CMS-specific scopes, collections, safety mode

Agent runs
  own one AI/MCP task or work session

CMS operations
  own drafts, revisions, publish, archive, assets, audit

Nuxt MCP Toolkit
  owns MCP route/tool transport

Ginko Content provider
  owns public website reads
```

## Core Permission Model

Every protected MCP tool execution must do this:

1. Verify the MCP connection token.
2. Resolve the token owner.
3. Load the owner's current CMS member role.
4. Load token CMS scopes and collection restrictions.
5. Intersect token scopes with current role permissions.
6. Create or require an active `agentRun` for write workflows.
7. Execute the canonical CMS operation.
8. Write audit with actor kind `agent`.

Never trust MCP tool input for authority.

Forbidden MCP authority inputs:

- `authUserId`;
- `memberId`;
- `role`;
- `tokenHash`;
- `organizationId`;
- raw Convex table ids used as authority.

Allowed MCP inputs are product inputs:

- collection slug;
- entry id;
- locale;
- draft values;
- reason;
- request id;
- asset metadata;
- instructions.

## Current Good Baseline

Current `ginko-cms` already has strong pieces worth keeping.

### Package And Release

Good:

- mature package split;
- setup CLI and doctor;
- standalone Studio SPA;
- release verification;
- package E2E;
- stale Trellis/bridge checks;
- content model documentation.

Keep:

- current package/release base;
- direct Convex setup templates;
- standalone Studio boundary;
- release gates.

Fix:

- remove local `file:` dependency on `better-convex-nuxt` before release;
- add packed manifest check for `workspace:`, `file:`, and `link:`.

### Content And Publishing

Good:

- entries, drafts, revisions;
- public projections;
- publish preview;
- destructive confirmation tokens;
- route diagnostics;
- activity/audit;
- revalidation outbox.

Keep:

- canonical draft/revision lifecycle;
- immutable revisions;
- public projection reads;
- preview-before-destructive-action invariant.

Fix:

- separate cryptographic confirmation from agent review workflow;
- move MCP destructive actions to review/trusted modes.

### Assets, Imports, Backups

Good:

- managed assets;
- asset refs;
- public URL gating;
- backup artifact model;
- purge safety gates;
- strict import preview/apply and no-partial-write behavior.

Keep:

- asset invariants;
- import validation;
- backup/purge safety model.

Fix:

- do not claim operator-grade restore until restore dry-run/apply exists;
- separate content exchange from operator backup/restore.

### Existing MCP

Good:

- MCP route is already a product concept;
- prompts/resources exist;
- tool hardening exists;
- token hashing and bearer parsing exist;
- invalid-token handling exists.

Keep:

- useful prompts/resources;
- token hardening ideas;
- explicit authoring/publish-safety guides.

Delete or replace:

- normal MCP dependency on `CONVEX_DEPLOY_KEY`;
- synthetic MCP Convex identity;
- generic `projectTool`;
- direct destructive MCP as default;
- long-lived custom `mcpKeys` as the default model.

## What Is Missing

### 1. Better Auth API-Key Proof

We need to prove that Better Auth API keys work cleanly for MCP connection
tokens in this Nuxt + Convex setup.

Missing:

- Studio API-key creation flow;

Status on 2026-07-04:

- Passed. `defineGinkoAuth` registers the Better Auth API-key plugin, and the
  live MCP middleware verifies Bearer tokens through Better Auth
  `/api/auth/api-key/verify`.
- Passed. MCP route access also requires active CMS `mcpCredentialSettings`.
- Passed. Backend guards intersect credential scopes with the current CMS member
  role, so role downgrade/removal affects existing API keys.
- Remaining. Studio still needs a Better Auth API-key creation/revocation flow.
- Passed. The backend `mcpKeys` table/module was deleted after the live route
  moved to Better Auth API-key verification plus CMS credential settings.
- Cleanup pass. The active Studio settings page no longer exposes legacy
  `mcpKeys` list/create/revoke UI, and the Studio host bridge no longer requires
  `api.ginkoCms.mcpKeys`.

### 2. CMS-Owned MCP Credential Settings

Better Auth can own key lifecycle, but Ginko CMS needs CMS-specific scope data.

Missing table or equivalent:

```text
mcpCredentials:
  betterAuthApiKeyId
  authUserId
  name
  allowedCollections
  scopes
  safetyMode
  createdAt
  createdBy
  revokedAt
  lastUsedAt
```

Critical rule:

- Better Auth key verifies identity;
- CMS credential settings determine maximum CMS permissions;
- current CMS member role still wins.

### 3. Agent Runs

Missing:

- `agentRuns`;
- task/session name;
- source MCP credential id;
- delegated user;
- capabilities;
- collections;
- status;
- touched resources;
- audit linkage.

Suggested status model:

```text
active -> running -> completed
active -> revoked
active/running -> failed
```

### 4. Review Requests And Trusted Mode

Missing:

- review request table for publish/archive/delete-like agent actions;
- stale-review checks;
- approval/rejection UI in Studio;
- optional trusted/autonomous mode for explicitly scoped direct public actions.

Default:

- supervised mode creates review requests.

Later trusted mode:

- direct publish/archive/delete if explicitly delegated, current role allows it,
  and tests prove it is safe.

### 5. Shared Permission Matrix

Missing:

- one backend function that computes effective MCP permission;
- tests that role downgrade/removal affects existing MCP tokens immediately;
- clear mapping of CMS role -> allowed scopes.

Baseline matrix:

| Action                  | Viewer | Editor | Publisher    | Owner              |
| ----------------------- | ------ | ------ | ------------ | ------------------ |
| Read content            | yes    | yes    | yes          | yes                |
| Create/update drafts    | no     | yes    | yes          | yes                |
| Translate drafts        | no     | yes    | yes          | yes                |
| Preview publish         | yes    | yes    | yes          | yes                |
| Request publish         | no     | maybe  | yes          | yes                |
| Direct publish          | no     | no     | trusted only | trusted only       |
| Request archive         | no     | no     | yes          | yes                |
| Direct archive          | no     | no     | trusted only | trusted only       |
| Delete/purge            | no     | no     | no           | trusted owner only |
| Approve reviews         | no     | no     | yes          | yes                |
| Manage members/settings | no     | no     | no           | no by MCP default  |

Open product detail:

- whether editors may request publish;
- whether publishers may archive/restore directly;
- whether owner trusted tokens can purge/delete.

### 6. Nuxt MCP Toolkit Integration

Missing:

- clean route registration through Nuxt MCP Toolkit;
- explicit tool files;
- no generic wrapper runtime;
- shared context helper that resolves token, CMS scopes, current role, and
  agent run.

## Proof Experiments

Do not start the full migration before these experiments pass. Each experiment
should be small, local, and removable if it fails.

### Experiment 1: Better Auth API Key For MCP Token

Question:

- Can Better Auth API keys be used as MCP bearer tokens in the Nuxt MCP route?

Build:

- enable `@better-auth/api-key` in a local proof;
- create an API key from an authenticated Studio/server route;
- verify the key from the MCP route;
- resolve Better Auth `user.id`;
- return sanitized key metadata.

Acceptance criteria:

- token is shown once on creation;
- raw token is never stored in CMS audit;
- revoked token fails;
- expired token fails;
- token owner can be resolved;
- token can be sent as `Authorization: Bearer <token>`;
- failure responses are structured and do not leak token material.

Stop condition:

- Better Auth API-key plugin cannot be reliably used from the Convex/Nuxt
  runtime.

Fallback:

- build a tiny CMS-owned token table with hashing, prefix, expiry, revocation,
  last-used tracking, and tests.

### Experiment 2: Token Scope Intersects Current CMS Role

Question:

- Can an existing MCP token lose permissions immediately when the user role is
  downgraded or removed?

Build:

- create user as editor;
- create MCP token with draft-write scope;
- use token to create a draft;
- downgrade user to viewer;
- use same token again.

Acceptance criteria:

- token still verifies as a credential;
- draft write fails after downgrade;
- read-only tools still work if viewer role allows them;
- removing the member blocks protected CMS tools;
- audit records denied attempts without leaking token material.

### Experiment 3: Agent Run Creation For Write Workflow

Question:

- Can one MCP token create many task-scoped agent runs over time?

Build:

- token authenticates external client;
- first write tool creates or requires an `agentRun`;
- run stores task name, credential id, delegated user, capabilities, collections,
  status;
- draft write links to the run.

Acceptance criteria:

- read-only MCP calls do not require a run;
- create/update/translate draft requires a run;
- one token can create multiple runs;
- revoked/completed run cannot write;
- audit links agent action to run and delegating user.

### Experiment 4: Review Request For Agent Publish

Question:

- Can an agent prepare publish and create a review request without changing
  public output?

Build:

- agent updates draft;
- agent previews publish;
- agent creates review request;
- publisher approves in Studio;
- canonical publish executes.

Acceptance criteria:

- public projection unchanged before approval;
- request stores reviewed draft checksum/path/title/contract checksum;
- approval fails if reviewed content changed;
- editor cannot approve;
- publisher/owner can approve;
- audit records requester, reviewer, and publish action.

### Experiment 5: Trusted Mode Direct Publish

Question:

- Can direct MCP publish be safe enough for explicit trusted mode?

Build only after Experiments 1-4 pass.

Build:

- owner/publisher creates token with direct-publish scope;
- token safety mode is `trusted`;
- agent previews publish;
- agent calls direct publish;
- backend re-checks current role, token scope, collection scope, route
  uniqueness, and confirmation/preview hash.

Acceptance criteria:

- direct publish is disabled for normal tokens;
- editor token cannot direct publish;
- publisher/owner token can direct publish only if scoped;
- downgrade after token creation blocks direct publish;
- every direct publish writes agent audit;
- tests prove public projection correctness.

Decision gate:

- if this proof is too complex or risky, keep direct publish out of v1 and rely
  on review requests.

### Experiment 6: Nuxt MCP Toolkit Route With Real MCP Client

Question:

- Can a real MCP client call the CMS route through Nuxt MCP Toolkit?

Build:

- register `/api/mcp` or `/mcp`;
- expose a small tool set:
  - `cms.list_collections`;
  - `cms.get_entry`;
  - `cms.create_entry_draft`;
  - `cms.request_publish`;
- call it with the official MCP SDK client or a local Codex/Claude config.

Acceptance criteria:

- tools list correctly;
- protected tools require token;
- public/read-only tools behave as designed;
- no tool input accepts authority fields;
- responses do not leak token/hash/server secret/raw docs;
- route works in local Nuxt dev and package consumer smoke.

## Migration Phases

### Phase 0: Freeze The Decision Baseline

Actions:

- accept `migration-decision-questions.md` as the decision baseline;
- keep `cms2-comparison.md` as the research/comparison baseline;
- mark open product details:
  - editors requesting publish;
  - publisher archive/restore;
  - trusted owner delete/purge.

Acceptance criteria:

- maintainers agree MCP is first-class;
- maintainers agree Better Auth API keys are the preferred token proof;
- maintainers agree default destructive agent path is review request;
- maintainers agree trusted/autonomous mode is later/proof-gated.

### Phase 1: Build The Token Proof

Actions:

- create a small Better Auth API-key proof branch or module-local spike;
- add API-key creation/verification;
- add CMS credential settings mapping;
- prove bearer token in MCP route.

Acceptance criteria:

- Experiment 1 passes;
- no raw token stored in CMS tables/audit;
- token creation/list/revoke works from authenticated UI/server route;
- token verification returns owner `authUserId`.

Do not proceed if:

- Better Auth API-key plugin cannot be proven in the target runtime.

### Phase 2: Introduce Effective Permission Checks

Actions:

- add `resolveMcpPrincipal` or equivalent;
- compute:
  - token owner;
  - current CMS member role;
  - token scopes;
  - collection scope;
  - effective permissions.
- remove authority fields from MCP tool input.

Acceptance criteria:

- Experiment 2 passes;
- editor token cannot publish;
- publisher token cannot manage members/settings;
- owner token is still scoped;
- role downgrade takes effect immediately.

### Phase 3: Add Agent Runs

Actions:

- add `agentRuns` schema;
- add start/complete/revoke/fail lifecycle;
- link write tools to runs;
- audit agent actions.

Acceptance criteria:

- Experiment 3 passes;
- create/update/translate draft requires an active run;
- completed/revoked/failed run cannot mutate;
- one token can create multiple runs;
- audit distinguishes user and agent.

### Phase 4: Rebuild MCP Tool Surface

Actions:

- use Nuxt MCP Toolkit;
- replace generic `projectTool` with explicit tool files;
- remove normal MCP use of `CONVEX_DEPLOY_KEY`;
- remove synthetic MCP identity;
- keep useful prompts/resources.

Default tools:

- `cms.list_collections`;
- `cms.get_collection`;
- `cms.list_entries`;
- `cms.get_entry`;
- `cms.create_entry_draft`;
- `cms.update_entry_draft`;
- `cms.propose_refinement`;
- `cms.propose_translation`;
- `cms.preview_publish`;
- `cms.request_publish`;
- `cms.request_archive`;
- `cms.get_public_entry`;
- `cms.search_public`;
- `cms.explain_visibility`;
- `cms.register_asset_metadata`.

Not default:

- raw table access;
- schema mutation;
- member management;
- settings mutation;
- deploy/admin functions;
- backup restore;
- direct delete/purge;
- direct publish/archive outside trusted mode.

Acceptance criteria:

- Experiment 6 passes;
- no MCP tool input accepts authority fields;
- route works in package consumer smoke;
- protected tools require token;
- public reads cannot reveal drafts/members/audit/review/agent state.

### Phase 5: Add Review Requests

Actions:

- add `reviewRequests`;
- implement request publish/archive;
- implement approve/reject in Studio;
- enforce stale-review checks;
- wire MCP tools to request flows.

Acceptance criteria:

- Experiment 4 passes;
- public output unchanged before approval;
- stale review approval fails closed;
- publisher/owner approval works;
- editor approval fails;
- audit records requester, reviewer, and canonical operation.

### Phase 6: Add Studio MCP Token And Agent Workspace

Actions:

- token creation UI;
- token list/revoke UI;
- warning for long expiry/never expiry;
- scopes/collections picker;
- safety mode picker;
- agent run list/detail;
- review request panel.

Acceptance criteria:

- editor can create only editor-allowed token scopes;
- publisher can create publish-request scopes;
- owner can create broader scopes, still explicit;
- token value shown once;
- revoked token fails;
- Studio shows agent activity and touched entries.

### Phase 7: Trusted/Autonomous Mode Proof

Actions:

- implement trusted mode behind config/feature flag;
- allow direct publish only for scoped publisher/owner tokens;
- optionally allow archive/delete only for scoped owner tokens;
- keep preview/confirmation and audit.

Acceptance criteria:

- Experiment 5 passes;
- normal tokens cannot direct publish;
- editor cannot direct publish even if token metadata is tampered with;
- role downgrade blocks trusted direct action;
- route uniqueness and public projection invariants pass;
- audit is complete.

Decision after phase:

- ship trusted mode;
- keep trusted mode disabled;
- or remove direct action and keep review-only.

### Phase 8: Cleanup Old MCP/Auth Runtime

Actions:

- remove old `mcpKeys` table/UI path; (passed)
- remove synthetic MCP Convex identity;
- remove `projectTool`; (passed)
- remove deploy-key MCP runtime;
- update docs and tests;
- add stale-surface checks.

Acceptance criteria:

```bash
rg "mcpKeys|cmsMcpConvexAuthIssuer|createMcpConvexCaller|projectTool|CONVEX_DEPLOY_KEY.*MCP" packages
```

Expected:

- no normal runtime matches;
- only migration/deprecation docs or explicit admin/setup paths remain.

### Phase 9: Release Hardening

Actions:

- add package consumer MCP smoke;
- add packed manifest dependency-spec check;
- add role downgrade token smoke;
- add trusted-mode disabled smoke;
- update docs.

Acceptance criteria:

- `pnpm run check`;
- `pnpm run release:verify`;
- package consumer can install, build, create token, call MCP read tool;
- packed manifests contain no `workspace:`, `file:`, or `link:`;
- docs explain MCP permissions, token scopes, agent runs, and review/trusted
  modes.

## Test Matrix

### Token Tests

- create token as owner/publisher/editor/viewer;
- list own tokens;
- revoke own token;
- expired token fails;
- revoked token fails;
- malformed token fails;
- raw token never appears in audit/log output.

### Role Intersection Tests

- editor token writes draft;
- editor token cannot publish;
- editor downgraded to viewer loses draft write;
- removed member loses protected MCP access;
- owner token cannot use scopes not granted to token.

### Agent Run Tests

- write creates/requires run;
- run capability enforced;
- collection scope enforced;
- completed run cannot write;
- revoked run cannot write;
- failed run rejects pending agent-created review rows where appropriate.

### Review Tests

- request publish does not change public projection;
- approval publishes through canonical operation;
- stale reviewed draft fails approval;
- editor cannot approve;
- publisher/owner can approve;
- reject has no public output effect.

### Trusted Mode Tests

- disabled by default;
- direct publish requires trusted token scope;
- role downgrade blocks trusted publish;
- audit records agent direct publish;
- direct delete/purge blocked unless explicitly designed and owner-scoped.

### MCP Surface Tests

- expected tool list;
- no authority input fields;
- no schema/member/settings/raw table tools;
- public tools cannot reveal private state;
- responses redact secrets and raw documents.

## Rollout Strategy

Recommended rollout:

1. Ship MCP read/draft/review path first.
2. Keep direct public/destructive actions disabled.
3. Let real usage validate token UX and agent-run audit.
4. Add trusted/autonomous mode only after proof and tests pass.

Do not run old and new MCP write authorities side by side as normal paths.

Temporary compatibility is allowed only for released users and must have:

- deprecation notice;
- migration path;
- removal target;
- tests proving old path cannot exceed new permissions.

## Risks And Mitigations

### Risk: Better Auth API Keys Do Not Fit Convex/Nuxt Runtime

Mitigation:

- run Experiment 1 first;
- fallback to tiny CMS-owned token table only if needed.

### Risk: Tokens Become Too Powerful

Mitigation:

- effective permission equals token scope intersect current role;
- role downgrade/removal checked at execution time;
- owner tokens still scoped.

### Risk: AI Bypasses Human Workflow

Mitigation:

- supervised mode default;
- review requests default for public/destructive changes;
- trusted mode proof-gated and disabled by default.

### Risk: MCP Recreates Admin API

Mitigation:

- no schema/member/settings/raw table/deploy tools;
- explicit product tools only;
- no generic `projectTool`.

### Risk: Audit Becomes Unclear

Mitigation:

- token identifies connection;
- agent run identifies task;
- audit event identifies exact operation;
- review request identifies human approval.

## Final Definition Of Done

This migration is done when:

- users can create scoped MCP tokens in Studio;
- external MCP clients can connect through Nuxt MCP Toolkit;
- editor MCP can draft but not publish;
- publisher/owner MCP can request publish/archive review;
- trusted direct publish is either disabled or proven safe;
- role changes affect existing tokens immediately;
- all MCP writes are tied to agent runs;
- public/destructive agent actions are audited;
- old custom MCP auth/runtime surfaces are removed or explicitly deprecated;
- package verification proves the feature in a packed consumer.
