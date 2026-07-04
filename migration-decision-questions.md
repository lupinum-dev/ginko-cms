# Ginko CMS Migration Decision Questions

Status: decision guide for migration planning.

Date: 2026-07-04.

Audience: maintainers and junior developers who need enough context to make or
implement migration decisions without reading all prior research first.

This document expands the decision list from `cms2-comparison.md`. Each section
explains:

- what the decision means;
- why it matters;
- what the current `ginko-cms` does;
- what `ginko-cms2` suggests;
- the available options;
- the recommended default;
- what the decision changes in the migration.

## Research Sources For The Recommendations

Local sources reviewed:

- `/Users/matthias/Git/convex/better-convex-nuxt/starters/mcp-agent`
- `/Users/matthias/Git/convex/better-convex-nuxt/starters/team`
- `/Users/matthias/Git/convex/better-convex-nuxt/starters/agentic-saas`
- `/Users/matthias/Git/workspace/ginko-cms2`
- `/Users/matthias/Git/workspace/ginko-cms`

External source checked:

- Better Auth API Key plugin docs:
  `https://better-auth.com/docs/plugins/api-key`

Important findings:

- `mcp-agent` proves the right MCP transport direction: use
  `@nuxtjs/mcp-toolkit`, keep tool handlers explicit, parse bearer tokens at
  the Nuxt boundary, forward to Convex, and keep product authorization in
  Convex.
- `mcp-agent` also proves the right destructive-action shape: preview,
  request approval, human approval, then execute with re-checks. MCP tool inputs
  do not carry organization ids; Convex derives scope from the credential.
- `team` proves the right Better Auth ownership shape for products that need
  organizations/teams: Better Auth owns auth-domain org/team/member/invitation
  state; app tables store product data and audit only. For Ginko CMS, this means
  do not add CMS tenant/workspace tables unless isolation becomes a real product
  requirement.
- `agentic-saas` proves the right agent-run shape: app-owned `agentRuns`,
  capability lists, expiry, current permission re-checks, revocation, terminal
  statuses, audit, usage events, and review rows for destructive agent output.
- `ginko-cms2` proves a good CMS-specific MCP tool surface and review-request
  model, but its route-issued short-lived token should be adapted to the target
  UX where users create familiar MCP connection tokens in Studio.
- Better Auth's API Key plugin supports key creation, verification, expiry,
  metadata, prefixes, permissions, rate limiting, multiple configurations, and
  user/organization-owned keys. That makes it a strong candidate for MCP
  connection-token lifecycle, while CMS should still own CMS scopes and agent
  workflow.

## Recommended Decision Summary

| #   | Decision                          | Recommended answer                                                                                                               |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exposed MCP                       | Yes. MCP is first-class and uses Nuxt MCP Toolkit.                                                                               |
| 2   | MCP tokens                        | Use Better Auth API keys for connection tokens, with CMS-owned scopes and agent runs.                                            |
| 3   | Direct MCP publish/archive/delete | No by default. MCP requests publish/archive review; add direct publish only later as explicit trusted automation.                |
| 4   | `agentRuns` and `reviewRequests`  | Yes. Add both as core CMS concepts.                                                                                              |
| 5   | Role matrix                       | Owner controls destructive/admin; publisher publishes and approves; editor drafts; viewer reads; agents follow delegated scopes. |
| 6   | Canonical user id                 | Use Better Auth stable `user.id` as CMS `authUserId`. Do not use email.                                                          |
| 7   | `publicRoutes`                    | Collapse into `publicEntries` unless a measured index/query reason proves it must stay.                                          |
| 8   | Released-surface migration        | Hard cut unreleased internals; semver-visible migration/deprecation for released APIs/data.                                      |
| 9   | Contract package                  | Keep short-term; move neutral semantics toward Ginko Content long-term.                                                          |
| 10  | Standalone Studio SPA             | Keep.                                                                                                                            |
| 11  | Host Convex setup files           | Keep tiny: five or fewer files, no generated bridge sprawl.                                                                      |
| 12  | `better-convex-nuxt`              | Use as official Nuxt/Convex/Better Auth host integration.                                                                        |
| 13  | Deploy key actor                  | No. Deploy key is setup/admin transport only.                                                                                    |
| 14  | Session-backed MCP                | External MCP should use API keys. Sessions are for Studio/bootstrap only.                                                        |
| 15  | Derived tables                    | Keep only with canonical source, rebuild, health, and invariant tests.                                                           |
| 16  | Backup vs content exchange        | Keep separate.                                                                                                                   |
| 17  | Restore claim                     | Do not claim operator-grade restore until dry-run/apply exists.                                                                  |
| 18  | Import behavior                   | Keep strict preview/apply and no-partial-write behavior.                                                                         |
| 19  | Assets                            | Keep current asset invariants; adopt clearer exchange language.                                                                  |
| 20  | Tenants/sites/workspaces          | No CMS tenants now. Use Better Auth teams only if host/team auth is truly needed.                                                |
| 21  | AI authority                      | AI can act like a delegated user within explicit permissions; default mode proposes/drafts, trusted mode can execute.            |
| 22  | Agent destructive actions         | Default to review requests; allow explicit trusted/autonomous mode later with narrow scopes and audit.                           |
| 23  | Editor workflow                   | Optimize Studio for attention, visibility, preview impact, rollback/archive/restore confidence.                                  |
| 24  | CMS2 Studio primitives            | Import concepts: agent workspace, review panel, readiness, projection health, AI cards.                                          |
| 25  | Old site DSL ergonomics           | Preserve through Ginko Content provider, not old DSL revival.                                                                    |
| 26  | Packed local dependency specs     | Block `workspace:`, `file:`, and `link:` in packed manifests.                                                                    |
| 27  | Observability                     | Keep opt-in.                                                                                                                     |
| 28  | Old CMS concepts                  | Keep ban list; do not re-add platform/SaaS/admin-shell concepts.                                                                 |

## Short Glossary

### Ginko CMS

The current package in this repo. It is the more mature release/package base. It
has the Studio SPA, Convex component, package verification, content lifecycle,
assets, imports, backups, public provider, MCP route, and many operational
checks.

### Ginko CMS2

The greenfield comparison repo. It is not the package we should copy wholesale.
Its value is the simpler product architecture: Better Auth owns identity, CMS
owns CMS roles, agents are modeled as delegated runs, MCP is narrow and
review-gated, and AI proposes changes instead of directly publishing.

### Convex

The backend/database/runtime. CMS data such as entries, drafts, revisions,
assets, members, audit events, and public projections lives in Convex.

### Better Auth

The auth system. It should own users, sessions, accounts, and later teams if we
need them. The CMS should not invent a second user/session framework.

### Ginko Content

The content-query/provider layer. It should own neutral website content query
semantics where possible. The CMS should own editorial workflow around content,
not become a separate generic content query framework.

### Studio

The human editor/admin UI. In current `ginko-cms`, this is a standalone Vite SPA
hosted by the Nuxt module. Editors use Studio to create drafts, publish,
rollback, manage assets, run imports, and inspect activity.

### MCP

MCP means Model Context Protocol. In this project, an MCP route exposes tools
that an AI agent/client can call, for example:

- list collections;
- read entries;
- create or update drafts;
- preview publish impact;
- request a human review;
- search public content.

Think of MCP as an API specifically shaped for AI tools and agent clients. It is
not the same as the Studio UI, and it should not become a second admin backend.

### Exposed MCP Route

An exposed MCP route means the Nuxt app serves an endpoint such as `/api/mcp`
that external MCP clients can connect to. "External" means outside the Studio UI:
Claude Desktop, Codex, Cursor, another agent runner, a local automation, or a
custom script.

If MCP is exposed, we must maintain:

- authentication for agent clients;
- tool schemas;
- prompt/resource compatibility;
- authorization;
- audit;
- token expiry/revocation;
- public/draft data separation;
- tests for every sensitive tool.

If MCP is not exposed, AI can still exist inside Studio as a writing assistant.
That is a simpler product: users open Studio, click an AI action, see a proposal,
and accept or reject it.

### Agent Run

An `agentRun` is not the same thing as an MCP token.

Use this mental model:

```text
MCP token = key to connect the external tool
Agent run = one tracked work session/job done by the agent
```

An `agentRun` is a bounded work-session record. It says:

- which user delegated the agent;
- which external client/tool is doing the work;
- what the requested task is;
- what the agent is allowed to do;
- which collections it can touch;
- which entries/assets/review requests it touched;
- when the run started and ended;
- whether the run is active, completed, or revoked.

Example:

```text
MCP token:
- name: Matthias Codex
- expires: 30 days
- scopes: read content, write drafts, request publish

Agent run:
- delegated by: Matthias
- client: Codex
- task: write a launch blog post
- status: completed
- actions: created draft, updated title, requested publish
```

One MCP token can have many agent runs over time. The token authenticates the
client. The agent run groups and audits the actual work.

### Review Request

A review request is a product workflow where an agent asks a human publisher to
approve a destructive/public-state change, such as publishing or archiving. The
agent does not directly publish. The human reviews the request and approves or
rejects it.

### Public Projection

Public projection rows are derived rows used by the website. They contain only
published content. Public reads should never query drafts, review requests,
members, audit rows, or agent state.

### Derived Table

A derived table stores data copied or computed from canonical state. Example:
`publicEntries` is derived from published revisions. Derived tables are allowed
only if they can be rebuilt and verified.

## Decision 1: Should Exposed MCP Exist At All?

Decision status: decided.

Decision: yes. Exposed MCP is a first-class Ginko CMS product surface.

Rationale from product direction:

- Ginko CMS should be strong in the AI-native CMS world.
- Users should be able to connect an MCP-capable client and ask it to work with
  CMS content.
- Example user requests should be supported as normal product workflows:
  - "write a new blog post";
  - "translate this blog post";
  - "improve this page";
  - "prepare this entry for publish";
  - "publish this entry" through the approved publish workflow.
- Studio AI alone is not enough for the intended product. Studio AI is still
  useful, but it should not be the only AI integration surface.

Implementation direction:

- use the Nuxt MCP toolkit as the MCP hosting/tooling layer;
- follow CMS2's delegated-agent model;
- keep MCP explicit and product-shaped, not a generic admin API;
- use short-lived delegated agent runs as the normal authority model;
- use review requests for destructive/public-state changes unless Decision 3
  explicitly allows direct MCP publish later.

### The Plain Question

Do we want external AI clients to connect to Ginko CMS through an MCP endpoint,
or is it enough to have AI features inside Studio?

### What This Means

If we expose MCP, a user could connect an external tool to the CMS and ask it to
work with content. Example:

1. The user opens an AI client.
2. The client connects to `https://site.com/api/mcp`.
3. The user delegates a short-lived agent run.
4. The agent lists collections, reads entries, drafts changes, and requests
   publish review.

If we do not expose MCP, AI only runs inside Studio. Example:

1. The user opens Studio.
2. The user clicks "Improve SEO" or "Translate".
3. Studio asks AI for a proposal.
4. The user sees a diff and applies it to the draft.

### Why It Matters

Exposed MCP is powerful, but expensive. It creates a public integration surface
that must be secured, versioned, tested, documented, and maintained. A bug in
MCP can leak drafts or allow unintended writes.

Studio AI is simpler. The user is already authenticated in Studio, and the UI can
control the workflow.

For Ginko CMS, the product value of exposed MCP is high enough to accept this
cost. The migration should treat MCP as a core integration surface, similar to
the public content provider and Studio, but with a much narrower authority model
than the current implementation.

### Current State

Current `ginko-cms` has an opt-in MCP route, tools, prompts, resources, and
destructive tools. It is too powerful and too framework-like today.

### CMS2 Direction

CMS2 treats MCP as delegated agent workflow. It uses agent runs, short-lived
tokens, and review requests. That is better if MCP exists.

### Options

Option A: No exposed MCP.

- Keep Studio AI proposals.
- Keep public website reads.
- Delete exposed `/api/mcp` work.
- Best if there are no real external agent clients.

Option B: Exposed MCP, but narrow.

- MCP is opt-in.
- MCP uses short-lived delegated runs.
- MCP can read, draft, preview, and request review.
- MCP cannot directly publish/archive/delete.
- Best if external agents are a real product requirement.
- This is the selected direction.

Option C: Full admin MCP.

- MCP can do almost everything Studio can do.
- This is not recommended. It recreates a second admin API.

### Recommended Default

Choose Option B.

External agent clients are a real product requirement for the target CMS. The
important constraint is that "first-class MCP" does not mean "full admin MCP".
It means a safe, delegated, well-tested agent workflow surface.

### How To Decide

The answer is yes because these are target product requirements:

- users need Claude Desktop/Codex/Cursor/agent runners to edit CMS content;
- the product promise includes "connect your agent to the CMS";
- we are willing to maintain MCP as a public integration surface.

The following are still not reasons to expose a full admin MCP:

- "agents might need every Studio operation eventually";
- "it is easier to expose raw component functions";
- "we already have generic tool wrappers";
- "maybe someone wants schema/admin access later".

### What The Decision Changes

Because the decision is yes:

- implement `agentRuns`;
- implement short-lived MCP tokens;
- implement review requests;
- build MCP auth and audit tests;
- use the Nuxt MCP toolkit for MCP route/tool integration;
- remove ordinary MCP dependency on `CONVEX_DEPLOY_KEY`;
- remove synthetic MCP Convex identity;
- remove `projectTool` as the default generic tool runtime;
- make MCP route exposure configurable, but supported as a first-class feature;
- document the MCP connection flow for external clients.

First-class MCP should support these workflows:

- read collection contracts and publishing rules;
- list and inspect entries;
- create a draft entry;
- update an existing draft;
- translate an entry into another locale;
- propose refinements, SEO updates, titles, summaries, or outlines;
- register or reference assets where permitted;
- preview publish impact;
- request publish/archive review;
- explain why something is or is not public.

First-class MCP should not expose these by default:

- raw table access;
- schema mutation;
- member management;
- settings mutation;
- deploy/admin functions;
- backup restore;
- direct purge/delete;
- direct publish/archive unless Decision 3 explicitly allows it.

Open follow-up from this decision:

- Decision 3 must still decide whether "publish this entry" means direct MCP
  publish or "create a publish review request for a human publisher." The safer
  default remains review request.

## Decision 2: How Should MCP Connection Tokens Work?

Decision status: direction chosen, implementation details still open.

Decision direction: use Better Auth API keys for MCP connection tokens if the
plugin works cleanly with the Convex/Nuxt setup. Do not keep the old custom
`mcpKeys` model as the default unless Better Auth cannot support the required
flow.

Important distinction:

```text
Better Auth API key
  -> authenticates the external MCP client

Ginko CMS MCP credential settings
  -> decide allowed CMS scopes, collections, expiry policy, and UI warnings

Agent run
  -> tracks one actual task/work session performed through that token

Audit events
  -> record exact content changes and review requests inside that run
```

### The Plain Question

Should Ginko CMS create and verify MCP tokens itself, or should it use Better
Auth's API Key plugin for token lifecycle and keep CMS-specific permissions in
Ginko CMS?

### What This Means

An MCP token is the credential a user copies into an external MCP client such as
Codex, Claude Desktop, Cursor, or another agent runner.

The token answers: "May this external client connect as this user/client?"

It does not answer everything. Ginko CMS still needs to answer:

- which CMS member owns this token;
- what CMS role that member has now;
- which scopes the token has;
- which collections it can touch;
- whether this action needs an agent run;
- whether this action needs human review.

So the token should authenticate the client, while Ginko CMS authorizes the CMS
operation.

### Why It Matters

Using Better Auth for API keys has real advantages:

- key creation and verification is standard auth infrastructure;
- key hashing/storage/revocation is not custom CMS code;
- expiration and metadata are built-in concepts;
- API keys can be user-owned;
- Better Auth remains the owner of authentication.

Doing our own token system has advantages too:

- total control over token shape;
- no dependency on Better Auth API-key plugin details;
- easier to put CMS-specific fields directly on the token table.

The risk with a custom token system is that we recreate another auth product
inside the CMS.

Long-lived MCP tokens are convenient but risky:

- they can leak;
- they carry broad authority for longer;
- they require a key-management UI;
- they can become a second auth product if CMS owns everything.

Agent runs reduce that risk because the long-lived token is not treated as one
giant work session:

- token authenticates the client;
- agent run tracks a specific task;
- audit records individual content operations;
- review requests gate public/destructive changes.

### Current State

Current `ginko-cms` has `mcpKeys`. They are long-lived and member-bound.

### CMS2 Direction

CMS2 uses `agentRuns` with short-lived token hashes and run status. That is a
good safety model, but for the target product we likely want a more familiar app
experience: a user creates an MCP token in Studio, chooses an expiry, connects
their external client, and can use it for multiple tasks until it expires or is
revoked.

### Options

Option A: Use Better Auth API keys for MCP connection tokens.

- Recommended, if it works cleanly with Convex/Nuxt.
- Better Auth owns key lifecycle.
- Ginko CMS owns CMS scopes, role checks, agent runs, and audit.

Option B: Build our own CMS token system.

- Use only if Better Auth API keys cannot support the required flow.
- Must include hashing, prefix, expiration, revocation, rate limiting or abuse
  protection, and audit.

Option C: Keep current custom `mcpKeys`.

- Not recommended as-is.
- It keeps old authority assumptions and should not survive unchanged.

### Token Expiry UX

The Studio token creation UI should offer presets:

- `3 days`;
- `7 days`;
- `30 days`;
- `90 days`;
- maybe `never expires`.

Recommended defaults:

- default expiry: `7 days` or `30 days`;
- normal max: `90 days`;
- `never expires`: owner-only, warning-heavy, and possibly disabled by default
  in config.

### Token Scope UX

A token should not simply mean "act as this user for everything." It should
store CMS-specific settings such as:

- token name;
- owner user/member;
- allowed collections;
- allowed actions:
  - read content;
  - create drafts;
  - update drafts;
  - translate;
  - propose refinements;
  - request publish;
  - request archive;
- whether direct destructive tools are unavailable;
- last used time;
- created by;
- revoked by/revoked at.

These CMS-specific settings can live in CMS tables linked to the Better Auth API
key id, or in Better Auth API key metadata if that is reliable and queryable
enough. The safer default is to store critical CMS authorization state in CMS
tables and store only auth-key lifecycle in Better Auth.

### Agent Run Creation Rule

An MCP token should not itself be the agent run.

Recommended rule:

- read-only browsing/search may use the token and write lightweight audit only;
- the first write workflow creates an `agentRun`;
- create/update/translate/refine draft actions must belong to an active
  `agentRun`;
- request publish/archive must belong to an active `agentRun`;
- the run can complete after the task or be manually ended/revoked;
- one MCP token can create many agent runs over its lifetime.

Example:

```text
Token:
- "Matthias Codex"
- expires in 30 days
- can read pages/blog
- can write drafts
- can request publish

Run 1:
- "Write launch blog post"
- created draft
- requested publish

Run 2:
- "Translate launch blog post to German"
- updated de draft
- requested publish
```

### Recommended Default

Use Better Auth API keys for MCP connection tokens, plus CMS-owned scopes and
agent runs.

Do not treat long-lived MCP tokens as agent runs.

### Why This Is Better Than Pure Short-Lived Run Tokens

Pure short-lived run tokens are very safe, but they can be awkward for users:

- every external client setup needs a fresh token;
- long-running clients become annoying;
- it does not feel like other apps where users create an API token once and
  paste it into a client.

Better Auth API keys give the familiar product flow. Agent runs give the audit
and task boundary we still need for AI work.

### How To Decide If Better Auth Is Enough

Use Better Auth API keys if we can prove:

- token creation works from authenticated Studio;
- token verification works in the Nuxt MCP route;
- tokens can have useful expiration presets;
- tokens can be revoked;
- token id/owner can be linked to CMS member and CMS scopes;
- no raw token is stored in CMS audit;
- the MCP route can accept the token in the required header format.

Build our own token system only if one of those cannot be made reliable.

### What The Decision Changes

If using Better Auth API keys:

- add Better Auth API-key plugin/config to the host auth setup;
- add Studio UI for MCP token creation/revocation;
- add CMS table or metadata mapping for token scopes/collections;
- add MCP middleware that verifies the Better Auth API key;
- create agent runs for write workflows;
- audit token creation, revocation, first use, write actions, and run
  completion.

If building our own token system:

- implement hashing, prefix, storage, expiry, revoke, last-use, rate-limit or
  abuse controls, and tests ourselves;
- explain why Better Auth API keys were insufficient.

Open implementation question:

- should CMS scopes live in Better Auth API key metadata or in a CMS-owned table
  linked to the Better Auth API key id? Recommended default: CMS-owned table for
  authorization-critical fields.

## Decision 3: Can MCP Directly Publish, Archive, Or Delete?

Decision status: recommended answer chosen.

Recommended answer: no direct MCP publish/archive/delete by default. The MCP
tool may accept a user instruction like "publish this post", but the default
product behavior should be:

1. preview publish impact;
2. create a publish review request;
3. let a human owner/publisher approve in Studio;
4. execute through the canonical CMS publish operation after approval.

Future exception: trusted automation can be added later as a separate explicit
mode with its own token scope, owner-only setup, disabled-by-default config, and
tests. Do not build it into the default agent surface.

### The Plain Question

Should an external agent be allowed to directly change public/destructive state?

### What This Means

Direct MCP publish means an agent can call a tool that publishes content without
human approval. Direct archive/delete means the agent can remove or hide content.

The alternative is request-review:

1. Agent drafts content.
2. Agent previews publish impact.
3. Agent creates a review request.
4. Human publisher approves or rejects in Studio.

### Why It Matters

Publishing changes the public website. Archive/delete can remove content. These
actions need strong accountability. Agents make mistakes and can misunderstand
instructions.

### Current State

Current `ginko-cms` exposes destructive MCP tools with confirmation tokens. The
confirmation invariant is strong, but it is still too complex for external
agents as the default workflow.

### CMS2 Direction

CMS2 points toward agent review requests. Agents request publish/archive; humans
approve.

### Options

Option A: MCP can preview and request review only.

- Recommended.
- Human publishers approve public/destructive changes.

Option B: Direct MCP publish exists but is disabled by default.

- Possible later if a concrete requirement appears.
- Needs strict tests and product approval.

Option C: Direct MCP destructive tools are normal.

- Not recommended.

### Recommended Default

MCP cannot directly publish, archive, or delete by default.

This recommendation is supported by `mcp-agent`, `agentic-saas`, and CMS2:
destructive/public-state changes are previewed, requested, approved by a human,
and then executed with re-checks.

### How To Decide

Allow direct destructive MCP only if:

- a maintainer explicitly accepts the risk;
- a real product use case requires it;
- tests prove confirmation, route uniqueness, audit, token binding, and role
  checks;
- the feature remains opt-in.

### What The Decision Changes

If direct destructive MCP is removed:

- implement `request_publish` and `request_archive`;
- keep direct destructive actions in Studio for humans;
- remove direct MCP `publish`, `archive`, and `delete` tools from the default
  surface.

## Decision 4: Do We Add `agentRuns` And `reviewRequests` Now?

Decision status: recommended answer chosen.

Recommended answer: yes. They should be core CMS concepts because first-class
MCP is now a product requirement.

### The Plain Question

Should the migration include CMS2's agent delegation and review workflow tables?

### What This Means

`agentRuns` are needed to safely delegate work to an agent. `reviewRequests` are
needed when the agent wants a human to approve publish/archive actions.

### Why It Matters

Without these tables, MCP and AI behavior is harder to audit:

- Who delegated the agent?
- What was the agent allowed to do?
- Was the run expired or revoked?
- Did a human approve the public change?

### Current State

Current `ginko-cms` has `mcpKeys` and destructive confirmations, but no central
agent-run model.

### CMS2 Direction

CMS2 models `agentRuns` and `reviewRequests` as product concepts.

### Options

Option A: Add both now.

- Recommended if MCP remains.
- Also useful for Studio AI audit later.

Option B: Add only `agentRuns`.

- Useful if agents can draft but not request destructive changes yet.

Option C: Add neither.

- Only reasonable if exposed MCP is removed and AI remains simple Studio-only
  proposal logic.

### Recommended Default

Add both if exposed MCP remains. Add neither only if MCP is removed and Studio AI
is intentionally simple.

Since Decision 1 is yes, the practical answer is: add both.

### What The Decision Changes

If added:

- update Convex schema;
- add audit actor shape;
- add Studio review UI;
- add tests for expired/revoked runs and stale review approvals.

## Decision 5: What Is The Final CMS Role Matrix?

Decision status: recommended answer chosen, with one product detail to confirm.

Recommended answer:

- owner: all CMS/admin/destructive authority;
- publisher: publish/unpublish and approve/reject review requests;
- editor: create/update drafts and use AI/MCP draft workflows;
- viewer: read-only Studio access;
- agent: only actions delegated by token scope and active agent run.

Product detail to confirm later: whether publishers may archive/restore, or
whether archive/restore remains owner-only.

### The Plain Question

Which roles can perform which actions?

### Why It Matters

This is product policy, not just code. If we import CMS2 behavior blindly, we may
allow publishers to do actions that current `ginko-cms` reserves for owners.

### Roles

Current roles are:

- owner;
- publisher;
- editor;
- viewer;
- delegated agent.

### Actions To Decide

| Action                       | Needs decision                      |
| ---------------------------- | ----------------------------------- |
| Read Studio content          | Usually all members                 |
| Save drafts                  | Owner/publisher/editor              |
| Publish/unpublish            | Owner/publisher                     |
| Archive/restore              | Owner only, or publisher too?       |
| Purge/delete                 | Owner only                          |
| Approve/reject agent reviews | Owner/publisher                     |
| Manage members/settings      | Owner only                          |
| Start agent runs             | Which roles and which capabilities? |

### Recommended Default

- Owners can do everything.
- Publishers can publish/unpublish and approve/reject review requests.
- Editors can draft but not publish.
- Viewers can read only.
- Agents can only do what a delegated run allows.
- Purge/delete stays owner-only.
- Archive/restore should be explicitly decided; safest default is owner-only
  until product says publishers need it.

### What The Decision Changes

This affects:

- Convex authorization checks;
- Studio button availability;
- MCP run capability issuance;
- review-request approval rules;
- tests.

## Decision 6: What Is The Canonical Better Auth User Id?

Decision status: recommended answer chosen.

Recommended answer: use Better Auth's stable `user.id` as CMS `authUserId`.
Do not use email. Avoid using provider-specific or token-specific identifiers
unless Better Auth/Convex integration proves that `user.id` is unavailable.

### The Plain Question

Which user id string do we store in CMS rows?

### Why It Matters

CMS rows need to refer to the same user consistently:

- `members`;
- audit events;
- `agentRuns`;
- `reviewRequests`;
- entry created/updated fields;
- MCP delegation.

If different parts store different identifiers, permissions and audit become
hard to trust.

### Current State

Current `ginko-cms` has its own caller abstraction and maps Convex auth identity
into CMS caller ids.

### CMS2 Direction

CMS2 derives an `authUserId` from Better Auth/Convex auth identity and passes it
explicitly into component functions.

### Options

Option A: Store Better Auth's stable user id.

- Usually best if easily available from auth/session.

Option B: Store Convex auth `tokenIdentifier`.

- Works if that is the stable identifier exposed everywhere.

Option C: Store email.

- Not recommended. Emails can change.

### Recommended Default

Pick one stable Better Auth user id format and use it everywhere. Do this before
data migration.

The recommended format is Better Auth `user.id`, matching the direction in the
`team` and `agentic-saas` starters where product rows store stable Better Auth
ids as strings.

### What The Decision Changes

This affects:

- member lookup;
- audit actor shape;
- migration scripts;
- tests;
- whether existing rows need rewriting.

## Decision 7: Should `publicRoutes` Be Deleted?

Decision status: recommended answer chosen.

Recommended answer: collapse `publicRoutes` into `publicEntries` unless a
measured index/query reason proves the separate table must stay.

### The Plain Question

Do we need a separate derived table for route lookup, or can `publicEntries` do
the job alone?

### What This Means

`publicEntries` stores published content for website reads. `publicRoutes`
stores route lookup rows such as `(locale, path) -> entry`.

If both tables store route data, there is duplication. Duplication is okay only
when it gives a real benefit and can be rebuilt/verified.

### Why It Matters

Two derived tables can drift:

- route row exists but public entry changed;
- old path remains after publish path change;
- archive/unpublish removes one row but not the other.

### Current State

Current `ginko-cms` uses `publicRoutes` for route lookup. It may still be useful
for indexes, but that must be proven.

### CMS2 Direction

CMS2 uses `publicEntries` as the single public projection and includes route
lookup indexes there.

### Options

Option A: Collapse `publicRoutes` into `publicEntries`.

- Recommended unless a measured reason says otherwise.
- Add global `(locale, path)` index to `publicEntries`.

Option B: Keep `publicRoutes` as a derived route index.

- Only if query/index needs justify it.
- Must have rebuild/health/invariant tests.

### Recommended Default

Delete unless proven.

### What The Decision Changes

If collapsed:

- add/prove global `(locale, path)` lookup on `publicEntries`;
- update public page lookup;
- update projection tests.

If retained:

- document it as derived;
- include it in projection health;
- test stale rows after publish path change, unpublish, archive, import, and
  rebuild.

## Decision 8: What Is The Migration Policy For Released Surfaces?

Decision status: recommended answer chosen.

Recommended answer: hard cut unreleased internals; use semver-visible
migration/deprecation for released package exports, public APIs, documented
behavior, and user data.

### The Plain Question

Can we hard-delete old paths, or do we need deprecation/migration support?

### Why It Matters

Repo guidance says hard cutovers are good for unreleased internals. Released
public APIs, package exports, user data, and documented behavior need
compatibility discipline.

### Examples

Potential released surfaces:

- `mcpKeys`;
- package exports;
- public provider API;
- generated contract package;
- setup files;
- Studio routes;
- CLI commands.

### Options

Option A: Hard cutover.

- Good for unreleased internals.
- Simplest implementation.

Option B: Semver-visible migration.

- Needed for released user data or public APIs.
- Includes deprecation notes, migration scripts, or compatibility windows.

Option C: Keep old and new paths forever.

- Not recommended.
- Creates two sources of truth.

### Recommended Default

Hard cut unreleased internals. Use semver-visible migration/deprecation for
released surfaces.

## Decision 9: Should `@lupinum/ginko-cms-contract` Remain?

Decision status: recommended answer chosen.

Recommended answer: keep short-term, reduce long-term. Do not block the MCP/auth
migration on this package split.

### The Plain Question

Should CMS keep a separate contract package, or should neutral content contract
semantics move to Ginko Content?

### Why It Matters

The contract package is useful today, but it can become another source of truth.
If Ginko Content owns neutral content semantics, CMS can focus on workflow.

### Options

Option A: Keep short-term.

- Recommended.
- Avoids breaking current package boundaries.

Option B: Move neutral semantics to Ginko Content over time.

- Recommended long-term.

Option C: Delete immediately.

- Risky unless replacement is already proven.

### Recommended Default

Keep short-term, reduce long-term.

## Decision 10: Should Studio Remain A Standalone Vite SPA?

Decision status: recommended answer chosen.

Recommended answer: keep standalone Studio SPA.

### The Plain Question

Should Studio stay isolated from the host Nuxt app, or become normal Nuxt pages?

### Why It Matters

Standalone Studio protects host apps from Studio dependencies, CSS, routing, and
SSR behavior. A Nuxt runtime Studio can be simpler locally but couples Studio to
the host app.

### Current State

Current `ginko-cms` uses a standalone Vite SPA.

### CMS2 Direction

CMS2 uses Nuxt runtime pages.

### Recommended Default

Keep standalone Studio SPA unless package complexity clearly outweighs the
isolation benefit.

## Decision 11: Should Setup Stay At Five Or Fewer Host Convex Files?

Decision status: recommended answer chosen.

Recommended answer: yes. Prefer current direct setup templates over CMS2-style
bridge generation.

### The Plain Question

How much code should the package generate into the host app?

### Why It Matters

Generated bridge sprawl is hard to maintain. It creates files users do not
understand and migration paths we later have to support.

### Recommended Default

Yes. Keep host-owned Convex setup tiny:

- five or fewer files;
- no generated wrapper directory;
- no broad `convex/app/*` bridge sprawl;
- doctor checks for drift.

## Decision 12: Should `better-convex-nuxt` Be The Official Host Integration?

Decision status: recommended answer chosen.

Recommended answer: yes. Use `better-convex-nuxt` for Nuxt/Convex/Better Auth
host integration. Fix the current local `file:` dependency before release.

### The Plain Question

Do we rely on `better-convex-nuxt` for Nuxt/Convex/auth integration instead of
custom CMS module plumbing?

### Why It Matters

`better-convex-nuxt` provides:

- `#convex/api`;
- `#convex/server`;
- SSR query hydration;
- realtime client upgrade;
- Better Auth integration;
- auth-aware composables and utilities.

Using it reduces custom integration code in CMS.

### Recommended Default

Yes, use it for host Nuxt integration. But published packages must depend on a
real package version, not a local `file:` specifier.

## Decision 13: Should Deploy Key Ever Be A CMS Actor?

Decision status: recommended answer chosen.

Recommended answer: no. Deploy key is setup/admin transport only.

### The Plain Question

Should `CONVEX_DEPLOY_KEY` represent a user-like actor in CMS operations?

### Why It Matters

Deploy key is powerful. It should be setup/admin transport, not ordinary
editor/publisher authority.

### Current Problem

Current MCP runtime still depends on deploy-key-backed calls. That violates the
clean boundary.

### Recommended Default

No. Deploy key is only for narrow internal setup/admin functions:

- setup;
- contract sync;
- migration;
- backup/admin operations if explicitly required.

Ordinary Studio and MCP operations should use Better Auth user identity or
delegated agent runs.

## Decision 14: Should Session-Backed MCP Be Supported?

Decision status: recommended answer chosen.

Recommended answer: external MCP should use Better Auth API-key bearer tokens.
Session-backed flows are for Studio/bootstrap only, not the normal external MCP
runtime.

### The Plain Question

Can MCP tools rely on an active browser/session auth context, or should external
MCP use only bearer tokens?

### Why It Matters

Session-backed MCP is convenient for demos or browser tooling, but it expands
the MCP surface. It can blur the line between Studio UI and external agents.

### Recommended Default

External MCP should be bearer-token only. Session/bootstrap flows should live in
Studio or explicit app APIs unless there is a real hosted-session MCP client
requirement.

## Decision 15: What Derived Tables Are Allowed?

Decision status: recommended answer chosen.

Recommended answer: derived tables are allowed only with canonical source,
rebuild command, health report, and invariant tests.

### The Plain Question

Which duplicated/computed tables are worth keeping?

### Why It Matters

Derived state creates speed and convenience, but also drift risk.

### Recommended Rule

No derived table survives without:

- named canonical source;
- rebuild command;
- health report;
- invariant tests.

Apply this to:

- `publicEntries`;
- `publicRoutes`;
- `contentAssetRefs`;
- public search text;
- cache tags;
- `bodyAst`;
- backup-included derived rows.

## Decision 16: What Is Backup Versus Content Exchange?

Decision status: recommended answer chosen.

Recommended answer: keep backup/restore and content exchange as separate
workflows.

### The Plain Question

Are export/import files meant for portable content movement, or operator
recovery?

### Difference

Content exchange:

- portable files;
- good for moving content between systems;
- external URLs are preserved;
- should align with Ginko Content.

Backup/restore:

- operator recovery;
- includes enough metadata to recover state;
- may include managed asset bytes;
- has verification, restore dry-run, and restore apply.

### Recommended Default

Keep them separate.

## Decision 17: Do We Claim Restore Support Now?

Decision status: recommended answer chosen.

Recommended answer: no. Do not claim operator-grade restore until restore
dry-run/apply exists and is tested.

### The Plain Question

Can we tell users the CMS supports operator-grade restore?

### Current State

Current `ginko-cms` is strong on backup export, verification, artifact records,
asset bytes, and purge gates. It should not claim full restore until restore
dry-run/apply exists.

### Recommended Default

No operator-grade restore claim until restore dry-run/apply is implemented and
tested.

## Decision 18: Do We Keep Current Import Behavior?

Decision status: recommended answer chosen.

Recommended answer: yes. Keep strict preview/apply and no-partial-write
behavior.

### The Plain Question

Should imports keep the current strict preview/apply validation behavior?

### Why It Matters

Current import protects the CMS:

- missing collections block import;
- unmapped fields block import;
- type/localization mismatches block import;
- unresolved assets block by default;
- relation/parent blockers prevent writes;
- publishing imported rows goes through canonical publish.

### Recommended Default

Yes. Keep strict preview/apply and no-partial-write behavior. Reshape the file
format if needed, but do not create a second import path.

## Decision 19: How Much Of The Current Asset Model Stays?

Decision status: recommended answer chosen.

Recommended answer: keep current asset invariants and mature asset manager.
Adopt CMS2's clearer content-exchange language without weakening access rules.

### The Plain Question

Should assets be simplified to CMS2's lighter model, or keep current asset
invariants?

### Why It Matters

Assets affect public content safety. Current `ginko-cms` has important guards:

- scope validation;
- public URL gating;
- derived `contentAssetRefs`;
- metadata snapshot until republish;
- backup-gated purge.

### Recommended Default

Keep current asset manager and invariants. Adopt CMS2's clearer content exchange
language, but do not weaken public asset access rules.

## Decision 20: Do We Support Tenants, Sites, Or Workspaces?

Decision status: recommended answer chosen.

Recommended answer: no CMS tenants/workspaces now. If the host app needs teams
or organizations, use Better Auth for auth-domain team/org state and map it into
CMS roles only after a concrete product requirement exists.

### The Plain Question

Is the CMS single-site, or does it need tenant/workspace isolation?

### Why It Matters

Tenant support is expensive. Every canonical and derived table must be
partitioned and tested. Partial tenant fields are dangerous because they imply
isolation that does not exist.

### Recommended Default

No tenants/workspaces. Remove reserved site knobs or document them loudly as
non-isolation.

Use Better Auth teams later only if there is a concrete product requirement.

## Decision 21: What Is AI Allowed To Do?

Decision status: revised from user input.

Recommended answer: AI should eventually be able to do everything a normal user
can do, but only through explicit delegated permissions, current role checks,
canonical CMS operations, and audit.

Important correction:

- AI is not a separate superuser.
- AI is not permanently limited to proposals.
- AI is an actor channel.
- What AI can do depends on the MCP token, agent run, CMS role, tool scopes, and
  selected safety mode.

### The Plain Question

Can AI write or publish directly, or only propose changes?

### Product Goal

The end-state should support powerful AI workflows, for example:

- write a new blog post;
- translate an entry;
- rewrite a landing page;
- update metadata and SEO fields;
- create drafts for multiple locales;
- prepare publish;
- publish if the agent has explicit publish authority;
- archive/delete only if explicitly delegated and gated.

If AI always stops at proposals and a human must manually perform every action,
the CMS will feel weak in an AI-native workflow. The goal is not "AI suggests
and humans do all work." The goal is "AI can operate the CMS safely under the
same permission model as humans."

### Recommended Safety Modes

Mode 1: Assistant mode.

- propose refinement;
- propose translation;
- propose SEO improvements;
- propose outline;
- show diff;
- apply accepted proposal through canonical draft save.

This is the safest default for inline Studio AI.

Mode 2: Supervised agent mode.

- read content;
- create drafts;
- update drafts;
- translate;
- register/reference assets;
- preview publish impact;
- request publish/archive review.

This is the recommended default for normal external MCP agents.

Mode 3: Trusted/autonomous agent mode.

- can publish/unpublish/archive/delete only when explicitly delegated;
- requires narrow scopes and role checks;
- should be owner/publisher-created;
- should be disabled by default until the safety tests exist;
- must record audit for every public/destructive action;
- should still use preview/confirmation internally where useful.

This is the long-term powerful mode. It lets AI act like a normal authorized
user, but not like an unrestricted backend.

### Hard Rules

AI may:

- perform any CMS operation that is explicitly delegated;
- use the same canonical operations as Studio;
- publish/archive/delete if the selected mode and scopes allow it;
- create review requests when the selected mode requires human approval.

AI may not:

- bypass Better Auth/CMS role checks;
- exceed the delegating user's current permissions;
- mutate raw tables;
- mutate schema/contracts;
- use deploy/admin functions;
- hide or skip audit;
- bypass draft save.

### Recommended Default

Default product mode: supervised agent mode.

Long-term target: support trusted/autonomous mode for users who explicitly grant
it. That mode is what makes Ginko CMS powerful for AI-native work, but it should
ship only after the delegated-scope, preview, confirmation, and audit tests are
solid.

## Decision 22: Do Agents Need Review Requests For Destructive Actions?

Decision status: revised from user input.

Recommended answer: review requests are the default safety mode, not the only
possible end-state. Trusted/autonomous agents may later perform destructive or
public-state actions directly if explicitly delegated.

### The Plain Question

When an agent wants to publish/archive, does it need human approval?

### Recommended Default

Default: yes. Normal MCP agent destructive public-state changes go through
review requests.

Approval should fail closed if the reviewed draft, contract, path, or title
changed after the request was created.

Long-term trusted mode:

- direct publish/archive/delete may be allowed for explicitly scoped tokens;
- the delegating user must currently have the required CMS role;
- the operation must use canonical CMS functions;
- the operation must write audit as an agent action;
- the feature should be disabled by default until tests prove it is safe.

## Decision 23: What Editor Workflow Is The Product Target?

Decision status: recommended answer chosen.

Recommended answer: Studio should optimize for editorial attention, public
visibility, publish-impact preview, and safe rollback/archive/restore decisions.

### The Plain Question

What should Studio optimize for?

### Recommended Target

Editors should be able to:

- see what needs attention;
- understand why content is not public;
- preview affected pages/locales before publish;
- roll back/archive/restore without guessing public impact;
- see agent/AI proposals clearly;
- trust that public-state changes are audited.

This matters because implementation should not expose database tables as the
primary mental model.

## Decision 24: Which CMS2 Studio Primitives Do We Import?

Decision status: recommended answer chosen.

Recommended answer: import the concepts, not the implementation wholesale.

### The Plain Question

Which CMS2 UI concepts should move into current Studio?

### Recommended Default

Import concepts, not the whole implementation:

- agent workspace;
- review requests panel;
- route readiness;
- translation readiness;
- projection health;
- provider surfaces;
- workflow impact panels;
- AI proposal cards.

Keep current standalone Studio package architecture.

## Decision 25: Do We Preserve Old Site DSL Ergonomics?

Decision status: recommended answer chosen.

Recommended answer: yes, through Ginko Content provider APIs.

### The Plain Question

Should website developers still get a simple content consumption API?

### Why It Matters

The old `nuxt-ginko-cms` had useful ergonomics:

- page composables;
- list composables;
- navigation;
- search;
- route/locale/search/sitemap config.

The final CMS should not make website developers think in CMS tables.

### Recommended Default

Yes. Preserve the ergonomics through Ginko Content provider APIs, not by
reviving the old CMS-specific DSL wholesale.

## Decision 26: Do We Block Packed Packages With Local Dependency Specifiers?

Decision status: recommended answer chosen.

Recommended answer: yes. This is a release gate.

### The Plain Question

Should release verification fail if packed package manifests contain local
dependency specifiers?

### Examples

Block:

- `workspace:`;
- `file:`;
- `link:`.

### Why It Matters

Published packages cannot depend on local paths from one developer's machine.

### Recommended Default

Yes. This should be a hard release gate.

## Decision 27: Do We Make Observability Mandatory?

Decision status: recommended answer chosen.

Recommended answer: no. Keep observability opt-in.

### The Plain Question

Should event logging/PostHog/Sentry-style observability be installed by default?

### Why It Matters

Observability is useful, but mandatory runtime dependencies increase setup and
privacy/config burden.

### Recommended Default

No. Keep observability opt-in until production support requirements justify a
mandatory dependency.

## Decision 28: What Old CMS Concepts Are Banned From Coming Back?

Decision status: recommended answer chosen.

Recommended answer: keep the ban list and enforce it in architecture/review.

### The Plain Question

Which old ideas should we explicitly reject so they do not return under new
names?

### Recommended Ban List

Do not revive without explicit acceptance criteria:

- billing/team SaaS shell;
- team-scoped API/admin keys;
- public delivery keys as a CMS product surface;
- runtime schema authoring in the database;
- deployment webhooks as CMS core;
- preview environment as a content status;
- denormalized counters without rebuilds;
- table view configs and user preferences in CMS core;
- asset source reservations;
- MCP tools for schema, bootstrap, team, deployment, migration, or raw status
  mutation.

## Minimal Decisions Needed Before Implementation

If a maintainer has limited time, answer these first:

1. Should exposed MCP exist at all? Answered: yes, first-class MCP.
2. How should MCP connection tokens work? Recommended: Better Auth API keys plus
   CMS-owned scopes and agent runs.
3. Can MCP directly publish/archive/delete? Recommended: no by default; review
   request first.
4. Do we add `agentRuns` and `reviewRequests` now? Recommended: yes.
5. What is the final role matrix? Recommended baseline written above; confirm
   publisher archive/restore later.
6. What is the canonical Better Auth user id? Recommended: Better Auth
   `user.id`.
7. Should `publicRoutes` be deleted? Recommended: collapse unless proven.
8. What is the migration policy for released surfaces? Recommended: hard cut
   unreleased internals, semver migration for released surfaces.

These eight decide the shape of the migration. They now have recommended
answers; the remaining work is to validate the implementation details while
building.
