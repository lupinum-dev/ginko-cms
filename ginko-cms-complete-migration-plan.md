# Ginko CMS vNext Coordinated Implementation Plan

Status: authoritative implementation specification

Target: coordinated `0.2.0-rc.1`, followed by `0.2.0`

Last reviewed: 2026-07-13

Owners: Ginko CMS maintainers, with coordinated changes in Ginko Content and
Better Convex Nuxt where this document explicitly assigns them

## 1. Purpose And Authority

This document defines the coordinated Ginko CMS vNext architecture and the work
required across Ginko Content, Ginko CMS, and Better Convex Nuxt integration to
make it release-ready. It replaces the previous migration diary that used this
filename.

Repository-specific Ginko Content `0.4` implementation details live in
[`../ginko-content/VNEXT-0.4.md`](../ginko-content/VNEXT-0.4.md). That document
owns Ginko Content files and public APIs; this document owns coordinated ordering
and release acceptance.

The old migration diary and the release evidence dated 2026-07-11 are historical
records. They are not evidence that the current branch is release-ready. Current
release approval must be based on artifacts produced after every work package in
this document is complete.

When implementation, documentation, and historical checklists disagree, use
this priority order:

1. Security invariants and executable tests.
2. This implementation specification and accepted architecture decisions.
3. Public package contracts and migration guidance.
4. Historical plans, logs, and release evidence.

Every completed work package must update this file's acceptance matrix. Do not
turn it into an implementation diary. Detailed command output belongs in a new
candidate evidence artifact generated from the exact release tuple.

## 2. Executive Decision

Ginko CMS is not ready for a near-1.0 architecture freeze.

The correct next release is a coordinated pre-1.0 minor:

- `@lupinum/ginko-content@0.4.0`;
- Better Convex Nuxt `0.6.0` or an accepted lifecycle-compatible successor;
- `@lupinum/ginko-cms@0.2.0`
- `@lupinum/ginko-cms-convex@0.2.0`
- `@lupinum/ginko-cms-contract@0.2.0`

Use Ginko Content `0.4.0-rc.1` and CMS `0.2.0-rc.1` while validating real
consumers. Freeze every exact upstream version and hash in compatibility before
candidate verification. Promote Ginko Content to `0.4.0` only with the
coordinated CMS candidate. Do not publish `1.0.0` until the public exports,
Content provider and portability contracts, configuration model, runtime
support, and migration policy have baked in at least two independent packed
consumers.

The vNext direction is:

```text
content.config.ts
  |
  v
Ginko Content resolved policy
  |
  +--> Ginko Content runtime projection
  |
  +--> one immutable CMS policy artifact
          |
          v
one atomic CMS policy + collection sync
          |
          v
Ginko CMS Convex domain and raw published facts
          |
          v
typed request-scoped CMS Content provider
          |
          v
Ginko Content owns public route, locale, query, navigation,
search, sitemap, prerender, agent, and rendered-document projection
```

Studio and MCP operate authenticated CMS domain commands. They do not define
public routing policy. The Nuxt module hosts Studio and connects the packages;
it does not become a second public-content engine.

Filesystem content and CMS content are two first-class backends for this model.
Ginko Content owns a portable Markdown/MDC codec so adoption of the CMS is not a
one-way decision:

```text
Markdown/MDC + assets <--> portable Ginko Content model <--> Ginko CMS
```

## 3. Product Boundaries

### 3.1 Ginko Content Owns

- canonical content collection identifiers;
- public locale codes, default locale, fallback policy, and translated slugs;
- collection mounts and route projection;
- provider wire contracts and canonical document envelopes;
- the versioned Markdown/MDC portability format, semantic codecs, canonical
  reference syntax, and portable asset-path rules;
- one portable document model, deterministic codecs, safe directory format,
  structural reference/asset rules, and observable Level-1 contract tests;
- navigation, surroundings, search, sitemap, prerender, and agent projection;
- public route alternatives and `x-default` behavior;
- the framework-free resolved policy consumed by CMS setup.

### 3.2 Ginko CMS Owns

- editable collection field/domain contracts derived from Content collections;
- drafts, revisions, publishing, unpublishing, archiving, and restore;
- CMS members, roles, permissions, review requests, and audit;
- public projection records and raw provider facts;
- managed assets, imports, backups, recovery, and revalidation outbox;
- authenticated published-export rosters, draft-import plans, host-side asset
  transfer, and CMS-specific import/export receipts;
- Studio workflows;
- MCP tools that invoke canonical CMS operations.

CMS may persist a derived copy of Content policy only when it is:

- installed from the canonical Content policy;
- marked and treated as derived;
- replaced atomically with collection contracts;
- rebuildable;
- checked for drift;
- not editable in Studio.

### 3.3 Better Convex Nuxt Owns

- the Nuxt Convex client lifecycle;
- authentication settlement and replacement;
- stable replacement-safe client handles;
- `serverConvex()` token policy and caller construction;
- Nuxt route-protection middleware;
- normalized Convex call errors.

Ginko CMS must not duplicate those responsibilities. The standalone Studio is a
separate Vite application, so it may adapt the stable client handle to Vue
state. That adapter must add CMS scope and identity guards without reconstructing
Better Convex Nuxt auth or client ownership.

### 3.4 The Host Application Owns

- deployment environment and secrets;
- the Nuxt installation;
- thin generated Convex root adapters;
- authentication provider configuration;
- the canonical `content.config.ts`.

Generated host adapters may be one file per stable CMS domain. They must remain
thin, generated, and sync-checked. A previous goal of forcing all host setup into
five files is rejected because it would create a monolith without reducing
product complexity.

### 3.5 Third-Party CMS Adapter Authors Own

- verified operator identity and authorization;
- backend transactions, cursor implementation, authorization, and operational
  cleanup;
- entry and asset persistence, including D1/R2, SQL/object storage, or another
  platform;
- a Ginko Content read provider when the backend serves runtime content;
- direct import/export orchestration when the backend needs it;
- passing published runtime data-source and Level-1 codec contracts, plus
  adapter-owned restart, fault, authorization, and cleanup evidence.

Adapter authors consume canonical Ginko Content models and codecs. They do not
copy manifest schemas, route projection, locale policy, reference syntax,
Markdown parsing, or asset-rewrite rules into their integration.

## 4. Non-Goals

Do not add these while completing vNext:

- tenants or workspaces;
- a second team or identity system;
- anonymous Studio operation;
- trusted autonomous publishing;
- collection-limited MCP credentials without an approved product requirement;
- compatibility shims for unreleased internals;
- a generic service or repository layer;
- a generic release framework;
- live bidirectional synchronization or dual writes between Git and CMS;
- preservation of byte-for-byte Markdown formatting, comments, or complete CMS
  revision/audit history in a portable content export;
- dual Content Wire versions;
- a second export allowlist;
- publication, tagging, or pushing from an agent session.

`publicRoutes` is not scheduled for deletion merely for architectural purity.
It may remain as an explicitly documented, rebuildable route-collision index
until measurement proves a simpler indexed `publicEntries` model can replace it.

## 5. Current Baseline

The implementation starts from Ginko CMS commit
`125828d0a0f9b7ed1c1d35ec038e40424c3acfd1`.

Confirmed useful foundations:

- Content Wire V2 is the only active provider query path.
- The provider caches one `serverConvex(event, { auth: 'none' })` caller per H3
  event and reuses it for documents and assets.
- CMS provider reads use published projections; the Content preview cookie does
  not authorize CMS drafts.
- Production code does not read `ConvexCallError.cause`.
- Studio receives the stable Better Convex Nuxt handle rather than a raw client.
- Same-user token rotation does not require subscription replacement.
- Current source checks pass, but the missing semantic cases in this plan remain
  release blockers.
- Ginko Content `/cms-import` and the CMS filesystem migration planner provide a
  useful one-way import foundation, but no lossless semantic CMS export or asset
  round trip exists yet.

Known artifact baseline:

- Better Convex Nuxt lifecycle fix: `fb238d96`.
- Ginko Content `0.3.0` provides the import foundation but not the data-source
  and portability contracts required by WP3A. The coordinated target is
  `0.4.0-rc.1`, promoted to `0.4.0` after certification.
- The canonical CMS compatibility file still points to an older Better Convex
  Nuxt artifact and must be updated only after a clean candidate is produced.
- The current Ginko Content worktree is not a release artifact.
- Existing CMS packed evidence predates the two latest locale-policy commits.

## 6. Architectural Invariants

The following statements must become executable invariants:

1. A client argument can never grant identity, role, scope, email, or ownership.
2. An MCP credential can never degrade into its owner's browser authority.
3. Missing auth secrets fail closed.
4. Outgoing-principal data is retired before replacement identity work begins.
5. No disposed Vue scope can acquire or reacquire a subscription.
6. No stale query, page, transform, callback, error, or log can commit.
7. Content policy has one canonical source and one rebuildable CMS projection.
8. Provider-returned identity facts cannot override locally requested facts.
9. Published reads never expose drafts, archived data, private fields, or
   credentials.
10. Remote error data and response bodies never cross a boundary unsanitized.
11. Every destructive operation uses preview, confirmation, and canonical
    execution; agent public-output changes are review-gated in vNext.
12. Release verification installs exact immutable tarballs with no sibling,
    workspace, link, or registry substitute.
13. Markdown to CMS to Markdown preserves supported authored fields, route
    inputs, locales, references, bodies, and assets; projected routes,
    navigation, search, and sitemap are rebuilt and behaviorally compared.

### Work Package Execution Protocol

Use the same sequence for every work package:

1. Confirm all involved repositories are clean and record their starting
   commits.
2. Add the smallest failing regression test that proves the finding. A source
   scan is useful, but it does not replace a behavioral test when the behavior
   can be executed.
3. Implement the simplest hard cutover that makes the invariant true. Delete
   the contradictory path in the same work package.
4. Run the focused tests first, then formatting, lint, typecheck, boundary
   checks, and the affected repository gate.
5. Inspect the complete diff for duplicate sources of truth, compatibility
   leftovers, generated-output churn, secrets, and undocumented public changes.
6. Update the acceptance matrix and migration guidance.
7. Commit only that work package. Do not combine unrelated cleanup.

Generated files are regenerated through their canonical commands and reviewed
separately from source changes. Release artifacts remain uncommitted.

### Cross-Repository Delivery Map

| Work package                 | Primary repository          | Coordinated repository                       | Prerequisite                  | Produced contract or evidence                          |
| ---------------------------- | --------------------------- | -------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| WP1 identity/auth            | Ginko CMS                   | Better Convex Nuxt verification              | current auth public API       | fail-closed caller matrix                              |
| WP2 Content policy           | Ginko Content               | Ginko CMS                                    | accepted policy shape         | immutable policy artifact and atomic sync              |
| WP2A upgrade/recovery        | Ginko CMS                   | host deployment docs                         | WP2 contract hashes           | resumable ledger and recovery drill                    |
| WP3 provider/assets          | Ginko Content               | Ginko CMS                                    | Wire V2 and render policy     | validated raw facts and safe assets                    |
| WP3A integration/portability | Ginko Content first         | Ginko CMS second                             | WP2 and WP3 semantics         | data source, codec, Node directory, CMS vertical slice |
| WP4 Studio lifecycle         | Ginko CMS                   | Better Convex Nuxt only on reproduced defect | accepted stable client handle | identity-safe Studio operations                        |
| WP5 MCP                      | Ginko CMS                   | none                                         | WP1 canonical authority       | supervised, scoped automation                          |
| WP6 public delivery          | Ginko Content               | Ginko CMS                                    | WP3 data source               | bounded public queries and delivery                    |
| WP7 API freeze               | Ginko Content and Ginko CMS | Better Convex Nuxt contract probe            | preceding public APIs         | intentional packed exports                             |
| WP8 artifacts/CI             | Ginko CMS coordinator       | all repositories                             | clean accepted commits        | exact compatibility tuple                              |
| WP8A operational quality     | Ginko CMS                   | adapter examples                             | stable workflows              | accessibility, retention, scale, onboarding            |
| WP9 certification            | Ginko CMS coordinator       | all repositories and consumers               | exact candidate tuple         | final executable evidence                              |

For cross-repository work, finish and pack the upstream contract before editing
the downstream adapter. Record its commit and SHA-256 in a temporary work-package
note; update compatibility only when the work package is accepted. Never make a
downstream test green through a sibling source alias.

## 7. Work Package 1: Secure Identity And Auth Topology

### Objective

Remove the two authorization vulnerabilities, require real secrets, and make
the supported authentication topology explicit.

### 7.1 First-Owner Bootstrap

Delete email authority from the client-facing mutation. The browser may provide
a display name, but ownership authorization must use the verified JWT email.
The configured owner email must come from the deployment, not the browser.

Cornerstone shape:

```ts
// Public host mutation contract.
export const bootstrapCmsOwnerArgs = {
  displayName: v.optional(v.string()),
}

// Host adapter. The environment value overrides nothing supplied by a caller
// because the public args do not contain either email field.
export const bootstrapCmsOwner = mutation({
  args: bootstrapCmsOwnerArgs,
  handler: async (ctx, args) => {
    const configuredOwnerEmail = process.env.GINKO_FIRST_OWNER_EMAIL
    return await ctx.runMutation(components.ginkoCms.members.bootstrapCmsOwner, {
      ...(args.displayName ? { displayName: args.displayName } : {}),
      ...(configuredOwnerEmail ? { configuredOwnerEmail } : {}),
    })
  },
})

// Component mutation.
const appIdentity = await ctx.appIdentity()
const verifiedEmail = appIdentity.caller.kind === 'user' ? appIdentity.caller.email : undefined

validateFirstOwnerEmail(verifiedEmail, args.configuredOwnerEmail)
```

If the Convex component can safely read the deployment environment directly,
delete `configuredOwnerEmail` from the component args too. Do not pass the
authenticated email through args merely to avoid reading it from identity.

Required tests:

- attacker JWT email plus configured-owner client email must fail;
- missing verified email must fail;
- missing configured owner email must fail;
- matching normalized verified email succeeds exactly once;
- concurrent claims create one owner;
- a later caller cannot use bootstrap to change membership.

### 7.2 Explicit Credential Kind

`sessionId` exists on browser and API-key sessions. It is not a credential-type
discriminator.

The signed Convex JWT must carry a trusted claim:

```ts
type GinkoCredentialKind = 'user-session' | 'mcp-api-key'

type GinkoConvexIdentity = {
  subject: string
  sessionId: string
  ginkoCredentialKind: GinkoCredentialKind
}
```

The issuer must derive this claim from a trusted Better Auth validation signal.
Do not infer it in Convex from whether a CMS credential row happens to exist.
Do not guess from arbitrary IDs.

The resolver then becomes exhaustive:

```ts
export async function resolveCmsCaller(ctx: RootCtx): Promise<CmsCaller> {
  const identity = await readGinkoConvexIdentity(ctx)
  if (!identity) return cmsAnonymousCaller()

  switch (identity.ginkoCredentialKind) {
    case 'user-session':
      return cmsCallerFromConvexAuthIdentity(identity)

    case 'mcp-api-key': {
      const caller = cmsMcpCaller(identity.sessionId)
      const appIdentity = await getAppIdentity(ctx, caller)
      if (appIdentity?.kind !== 'member' || appIdentity.userId !== identity.subject) {
        throwCmsError('MCP_CREDENTIAL_REJECTED', 'MCP credential is not active.')
      }
      return caller
    }
  }
}
```

Implementation order:

1. Add a focused Better Auth integration test proving which trusted signal is
   available during JWT issuance.
2. Prefer a claim supplied from validated request context.
3. If the upstream plugin cannot expose a reliable signal, implement a dedicated
   MCP Convex-token issuer.
4. Reject prefix-only or row-existence inference as the final design.
5. Keep browser sessions working with their normal `sessionId`.

Required tests:

- browser JWT resolves to user;
- active API key resolves to MCP caller;
- missing settings, revoked settings, wrong owner, expired key, and cleanup
  failure all fail closed;
- every case is exercised through a direct protected Convex call, not only MCP
  HTTP middleware;
- role downgrade and membership removal take effect on the next call.

### 7.3 Auth Secret

Use one required secret:

```ts
function requireBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required.')
  }
  return secret
}
```

Delete the public development literal. Development setup may generate a local
secret into an ignored environment file; runtime code must not invent one.
`ginko-cms doctor` must report a missing secret without printing any value.

### 7.4 Supported Topology

Ginko CMS Studio requires authentication. Reject nested `convex.auth: false` at
module setup with an actionable error. Public Content provider calls continue
to use `auth: 'none'`; that is unrelated to disabling CMS authentication.

Wire Better Convex Nuxt route protection explicitly:

```ts
{
  name: 'studio-host',
  path: '/studio/:slug(.*)*',
  file: resolveRuntimePage('studio-host.vue'),
  meta: {
    layout: false,
    convexAuth: true,
  },
}
```

Required browser proof:

- signed-out SSR navigation redirects before Studio mounts;
- auth pages remain unprotected;
- pending auth never flashes the Studio shell;
- signed-in non-members receive the CMS membership boundary;
- sign-out immediately retires Studio data.

### 7.5 Permission-Complete Callable Guards

Every MCP-reachable protected callable must carry a permission-bearing guard.
Role-only guards are insufficient because the canonical `can()` function
intersects MCP scopes only when `guard.permission` exists.

The current backup and owner diagnostics functions use bare `hasRole('owner')`
guards. A read-only API key owned by an owner can therefore call those packed
Convex wrappers directly and bypass the MCP tool's capability check.

Make the authority explicit:

- add a deliberate `manageBackups` permission for export, verify, download,
  restore, and backup-artifact deletion, or map each operation to an existing
  permission only where the product meaning is exact;
- add a separate `managePortability` permission for every portability plan,
  upload, apply, roster, download, finalize, abort, and cleanup boundary;
- restrict MCP entry-backup export to entry scope and `deleteEntries`;
- use `manageSettings` for owner storage diagnostics;
- reject public protected definitions with unscoped guards unless they are an
  explicitly documented bootstrap-only function that rejects MCP identity;
- do not rely on a Nitro/MCP tool check to protect a direct Convex callable.

Cornerstone invariant:

```ts
export function can(identity: CmsAppIdentity, guard: CmsGuard): boolean {
  if (!guard.check(identity)) return false
  if (identity?.kind === 'member' && identity.audit.origin === 'mcp') {
    if (!guard.permission) return false
    return identity.mcpEffectivePermissions?.[guard.permission] === true
  }
  return true
}
```

Required tests:

- table-driven role x origin x scope coverage for every exported callable;
- direct wrapper calls, not only Studio and MCP HTTP calls;
- read-only owner MCP cannot export/download a full backup, restore an asset,
  delete a backup, or read owner storage diagnostics;
- entry backup through MCP rejects non-entry scopes;
- a static guard fails when an MCP-reachable protected definition has no
  permission.

### Gate And Commit

Focused auth tests, component auth-boundary checks, module tests, typecheck, and
lint must pass.

Suggested commit:

`fix!: make CMS identity and authentication fail closed`

## 8. Work Package 2: Canonical Content Policy

### Objective

Make Ginko Content policy the one source of public locale, collection, and route
truth. Keep CMS storage as a derived operational projection.

### 8.1 One Framework-Free Resolved Contract

Evolve Ginko Content's existing `CmsContract` into the single
`ResolvedContentContractV1` defined by the Ginko Content `0.4` specification.
Do not add `ResolvedContentCmsPolicy`, a second locale/routing object, or a
separate collection-contract array.

Ginko Content produces one deterministic artifact and its RFC 8785/SHA-256
hash. The exact artifact contains collection, field, locale, reference, media,
and authored routing policy. It is used by:

- the Ginko Content module;
- the Ginko CMS Nuxt module;
- `ginko-cms push`;
- generated CMS types and portability codecs;
- the integrated playground;
- package-consumer fixtures.

Do not let CMS independently parse a subset of `content.config.ts`, reconstruct
defaults, or accept an overlapping policy input. Every semantic mutation to the
resolved artifact changes its one canonical hash.

CMS presentation configuration is permitted only as a separate
`CmsEditorialLayout` keyed by contract collection and field IDs. It contains
labels, icons, widths, grouping, and conditional presentation; it cannot contain
locales, routes, field types, defaults, validation, identity, or component
policy. Setup rejects unknown keys. This non-semantic layout is not installed as
Content policy and does not change `contractSha256`.

### 8.2 One Atomic Backend Sync

Replace separate locale bootstrap and collection install behavior with one
deploy-authorized operation:

```ts
type InstallCmsPolicyInput = {
  contract: ResolvedContentContractV1
  contractSha256: string
}

// Component mutation called only by the host's deploy-authorized
// internalMutation adapter.
export const installCmsPolicy = mutation({
  args: installCmsPolicyValidator,
  handler: async (ctx, input) => {
    await validatePolicyAndCollectionDrift(ctx, input)
    await replaceDerivedPolicy(ctx, input.contract, input.contractSha256)
    await installCollectionContracts(ctx, input.contract.collections)
    return await readInstalledPolicySummary(ctx)
  },
})
```

Convex does not provide multi-mutation transactions across separate calls, so
policy and collection installation must happen inside one mutation.

The installed state records the canonical contract bytes or their lossless JSON
value plus `contractSha256`. `push --check` reconstructs the exact artifact,
recomputes the hash, and reports concrete field, locale, fallback, route,
reference, and media drift. No independently hashed sub-policy is accepted.

### 8.3 Delete Parallel Configuration

Remove these `0.1.x` configuration paths in the `0.2.0` breaking release:

- `collectionsDir`;
- inline CMS `collections` as a second source;
- CMS routing/schema overrides layered on Content;
- `content: false`;
- mutable Studio locales and default locale;
- fallback inference from Nuxt i18n;
- the internal `contentTranslatedSlugs` option.

Studio displays resolved locale policy read-only. CMS-specific editorial
metadata may be introduced later only when keyed by canonical locale codes and
clearly not used for routing.

### 8.4 Runtime Reads

On the server, prefer `runtimeConfig.content`. Use
`runtimeConfig.public.content` only as a fallback in constrained test/runtime
environments. Never merge either with `public.ginkoCms` or Nuxt i18n.

The public CMS HTTP facade is scheduled for deletion in Work Package 6. Until it
is deleted, its locale selection must use this same resolved policy.

### 8.5 Generation-Safe Reindexing

Collection reindex jobs must be keyed by the requested policy/contract
generation. Returning early merely because a job already exists can lose a
newer generation: early rows may be processed under policy A, later rows under
policy B, while the request to restart for B is discarded.

Use explicit requested and applied generations:

```ts
type CollectionReindexJob = {
  collectionId: Id<'collections'>
  requestedGeneration: string
  appliedGeneration: string | null
  phase: 'drafts' | 'public' | 'verify'
  cursor: string | null
}
```

Scheduling a newer generation updates `requestedGeneration` even when a job is
running. Before each batch, the worker compares generations. A mismatch resets
the phase and cursor so every row is processed under one generation. The job is
deleted only when verification proves `appliedGeneration === requestedGeneration`.

### Required Tests

- private Content runtime wins over conflicting public Content runtime;
- CMS and Nuxt i18n values never override Content policy;
- code policy changes appear as `push --check` drift;
- applying sync changes Studio, fallback, diagnostics, hrefs, provider routes,
  and revalidation consistently;
- collection-local locale/default rules override site defaults where the
  Content contract says they should;
- malformed and cyclic fallbacks fail before deployment;
- a dirty or missing policy artifact cannot be pushed.
- pausing after reindex page one, syncing a second generation, and completing
  leaves every entry on the second generation with one clean terminal job.

### Gate And Commit

Run Content policy tests, CMS module and CLI tests, Convex projection tests,
typecheck, package boundary checks, and the integrated playground prepare.

Suggested commit:

`fix!: make Ginko Content policy canonical in CMS`

## 8A. Work Package 2A: Versioned Upgrade And Recovery

### Objective

Make the published `0.1.x` to `0.2.0` upgrade executable, resumable, auditable,
and honest about recovery. The current migration command transforms drafts in
50-entry transactions, stores no run or entry receipts, and still cannot make
an incompatible contract pushable when entries exist.

### 8A.1 Migration Ledger

Persist one run per migration source and contract transition:

```ts
type ContentMigrationRun = {
  migrationId: string
  sourceHash: string
  fromContractHash: string
  toContractHash: string
  status: 'planned' | 'applying' | 'validating' | 'ready' | 'activated' | 'failed'
  cursor: string | null
  startedAt: number
  completedAt: number | null
}

type ContentMigrationEntryReceipt = {
  runId: Id<'contentMigrationRuns'>
  entryId: Id<'entries'>
  inputHash: string
  outputHash: string
  appliedDraftVersion: number
  appliedAt: number
}
```

The exact table shape may be combined when it remains bounded and queryable,
but the following behavior is mandatory:

- reusing a migration ID with a different source hash fails;
- a committed entry receipt is skipped on retry;
- a changed entry fails with an actionable conflict instead of being silently
  transformed again;
- run status and cursor are updated in the same transaction as each batch;
- user-authored transforms do not need to be idempotent.

### 8A.2 Contract Transition Approval

Successful draft transformation is not sufficient. Finalization validates all
stored entries against the proposed contract and creates a single-use approval
bound to exactly:

```ts
type ContractTransitionApproval = {
  migrationId: string
  fromContractHash: string
  toContractHash: string
  validatedEntryCount: number
  expiresAt: number
  consumedAt: number | null
}
```

Atomic policy/collection sync consumes that approval. A different target
contract, changed migration source, new conflicting entry, or expired approval
fails.

Public-output changes require an explicit strategy:

- `preserve` is allowed only when validation proves the public projection is
  unaffected;
- `rebuild` must process a named target generation and verify every affected
  public row before the transition is considered complete;
- `unpublish` intentionally removes affected variants before activation.

For `0.2.0`, prefer an honest maintenance-window transition over a partially
implemented zero-downtime deployment system. Never leave mixed public rows from
two contract generations while claiming the migration is complete.

### 8A.3 Legacy MCP Credential Cutover

The published `0.1.3` schema contains legacy `mcpKeys`; vNext replaces it with
Better Auth API keys plus `mcpCredentialSettings`. Raw legacy credentials cannot
be safely migrated.

Use a two-stage schema rollout:

1. Retain the legacy table only for an internal one-shot cutover.
2. Revoke/delete every legacy credential and record an audit receipt.
3. Prove old tokens fail immediately.
4. Require owners to create replacement Better Auth credentials.
5. Remove the empty legacy table and cutover function in the next coordinated
   schema commit.

No legacy runtime API remains active during the bridge release.

### 8A.4 Recovery Contract

The custom backup mechanism is an export/comparison artifact, not credible full
disaster recovery:

- non-asset scopes cannot be restored;
- asset restore creates a new ID and does not repair old references;
- the current CLI uses deploy-key admin auth while calling owner-guarded actions;
- full exports collect and serialize complete tables and asset bytes in memory.

For `0.2.0`:

- remove permanent entry purge; reversible archive remains supported;
- remove forced purge for referenced assets;
- retain asset restore only for provably unreferenced assets;
- rename/document custom `full` backup as a bounded export snapshot unless a
  complete round-trip restore is implemented;
- use an officially tested Convex deployment snapshot procedure for disaster
  recovery;
- make the operator backup command actually authenticate through an explicit
  owner session/credential, or remove it from the production runbook.

Do not use the presence of a non-restorable export as authorization for
permanent deletion.

### 8A.5 Archive And Import Limits

Strictly decode export manifests. Record CMS schema version, package version,
contract hashes, table allowlist, row counts, byte counts, and checksum. Reject
unknown tables, incompatible schema versions, and malformed rows during preview.

Define and enforce limits before parsing or traversal:

- maximum import/export bytes;
- maximum files, entries, locales, fields, and relation edges;
- maximum filesystem depth;
- maximum asset bytes per export;
- maximum batch size and total run duration.

Filesystem migration uses `lstat`, rejects or deliberately confines symlinks,
tracks visited real paths, and prevents cycles. Large imports are resumable
bounded batches with run identity rather than one unbounded request.

### 8A.6 Downgrade Policy

Downgrade from data written by `0.2.x` to `0.1.3` is unsupported. Recovery means
a forward fix or an independently verified pre-upgrade Convex snapshot restore.
State this in release notes and migration guidance.

### Required Tests

- real `v0.1.3` data upgraded through the exact packed candidate;
- failure during batch two followed by retry transforms every entry once;
- reused migration ID with changed source fails;
- incompatible field, localization, locale, and routing transitions finalize
  and consume only their exact approval;
- changed/new entries invalidate finalization;
- no mixed public contract generation after activation;
- all legacy MCP tokens fail after cutover;
- permanent entry purge and referenced-asset purge are absent;
- official snapshot recovery drill restores a sanitized deployment;
- archive manifest rejects wrong schema, unknown tables, malformed rows, excess
  size, symlink cycles, and excessive depth.

### Gate And Commit

Run migration unit/integration tests, a sanitized upgrade drill, backup/import
tests, policy sync tests, package typecheck, and the exact packed consumer.

Suggested commits:

- `fix!: make content migrations resumable and contract-bound`
- `fix!: remove non-restorable destructive recovery claims`
- `build: prove the v0.1 to v0.2 upgrade path`

## 9. Work Package 3: Typed Provider And Asset Boundary

### Objective

Make the CMS-to-Content boundary explicit, typed, hostile-input-safe, and
bounded.

### 9.1 Provider Operation Context

Convert the provider implementation to TypeScript and use one immutable request
context:

```ts
interface CmsProviderRequestContext {
  event: H3Event
  caller: Awaited<ReturnType<typeof serverConvex>>
  policy: ResolvedContentCmsPolicy
}

const contexts = new WeakMap<H3Event, Promise<CmsProviderRequestContext>>()

async function contextFor(event: H3Event): Promise<CmsProviderRequestContext> {
  const current = contexts.get(event)
  if (current) return current

  const pending = createProviderContext(event)
  contexts.set(event, pending)
  return pending
}
```

The context is reused for document, navigation, search, route, site-data, and
asset operations. Pure shaping functions receive data and policy, never H3
events or transport constructors.

### 9.2 Runtime Decoders

Use Ginko Content-owned provider decoders when available. If the public provider
package exposes only TypeScript types, add runtime parsers upstream rather than
maintaining a divergent CMS copy.

Every operation follows this order:

```ts
const raw = await context.caller.query(reference, requestArgs)
const wire = parseCmsListWireResult(raw)

assertRequestedFacts({
  requested: {
    collection: request.collection,
    locale: request.locale,
  },
  returned: wire,
})

return wire.entries.map((entry) => shapeProviderDocument(entry, context.policy))
```

Reject before transformation, asset resolution, cache publication, or logging:

- wrong collection or locale;
- conflicting stable identity;
- absolute or credential-bearing paths;
- paths with query strings or fragments;
- site-locale double prefixes;
- projected fields supplied by CMS where Content owns projection;
- invalid route variants;
- invalid ISO dates;
- malformed cursors or page envelopes;
- unknown collections;
- duplicate canonical identities or route collisions.

Locally captured `operation` is always authoritative in normalized errors.

### 9.3 Error Redaction

Sanitize both text and structured data:

```ts
const publicError = {
  code: localCode(remote),
  status: localStatus(remote),
  message: redactSecretString(localMessage(remote)),
  data: redactSecretValue(selectAllowedRemoteData(remote.data)),
  operation,
}
```

Do not spread arbitrary remote data. Use an allowlist for useful application
fields. Never include `cause`, raw bodies, tokens, cookies, keys, or headers.

### 9.4 Canonical Render-Safety Policy

Ginko Content owns one framework-free render policy for parsed Markdown/MDC
ASTs. CMS invokes that exact policy after Comark parsing and before writing a
revision or public projection. Ginko Content enforces it again while rendering
as defense in depth.

The current chain accepts active tags and arbitrary native properties. Raw MDC
can produce `script`, `style`, `iframe`, `svg`, and event properties such as
`onerror`; the Content renderer forwards node properties to Vue `h()`.

The canonical policy must:

- allow only safe structural HTML tags and registered content components;
- reject `script`, `style`, `iframe`, `object`, `embed`, active SVG/MathML, and
  other executable document contexts by default;
- reject event-like properties, `innerHTML`, `textContent`, unsafe `is`/`as`,
  directives, and prototype-polluting keys;
- validate URL-bearing props against an explicit protocol policy;
- keep component prop policy tied to the registered component contract;
- return structured publish issues with exact AST paths;
- share the same URL/tag/prop rules with agent Markdown serialization.

Cornerstone boundary:

```ts
const parsed = await parseMdcBody(bodyMdc)
const validated = validatePublicMarkdownAst(parsed.body, resolvedRenderPolicy)

if (!validated.ok) {
  throwCmsError('PUBLISH_BODY_UNSAFE', 'Rich content contains unsafe markup.', {
    issues: validated.issues,
  })
}
```

Do not create a CMS-only sanitizer that can drift from the renderer. Unknown or
unsafe nodes fail publication; silently dropping executable content would make
editor previews and published output disagree.

### 9.5 Structured Asset Resolution

Delete recursive arbitrary-string asset detection. Asset references must come
from:

- fields whose canonical CMS schema type is `image`, `images`, or `file`;
- known body AST image/media nodes;
- explicit public asset-reference records.

Resolve authorized public asset facts inside the Convex public document query,
where the collection contract, canonical identity, locale, revision, and typed
field path are all available. Do not expose a generic key-based asset resolver:
an asset ID and field path alone cannot prove that a document is authorized to
publish the asset.

The Convex public query returns the final bounded public asset fact while that
authorization context is available:

```ts
type PublicAssetFact = {
  assetId: string
  url: string
  expiresAt: number | null
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  bytes: number
  sha256: string
}
```

The URL is credential-free and suitable for anonymous public delivery. If it
expires, every provider/SSR cache TTL is clamped below `expiresAt`; an already
expired URL fails the query. Prefer a durable application delivery URL so public
content does not embed storage capabilities. CLI portability transfer URLs are
a separate authenticated boundary and never enter provider data, SSR, cache,
Studio, logs, or DevTools.

### 9.6 Asset Publication And Byte Verification

Asset ownership scope and public visibility are separate concepts. A global
asset is reusable across entries; it is not automatically public merely because
its opaque ID becomes known.

For `0.2.0`, require a public reference for anonymous URL resolution. If the
product needs standalone public global assets, add an explicit publication
state and audit event rather than overloading `scope: 'global'`.

The server already enforces a 25 MB limit and excludes SVG, HTML, and archives.
Storage `contentType` is still uploader-controlled. Before registration, a
backend-owned verification action reads the stored bytes, incrementally
recomputes SHA-256 and length, parses the complete supported image container,
checks the Content 0.4 dimension/frame/decoded-size limits, and selects the
verified media type. The internal registration mutation accepts only that
verification result. Caller or CLI metadata is never labeled verified.

Managed PDF is deferred with Ginko Content 0.4. Reject MIME mismatches,
truncation, invalid terminal structure, and unsupported bytes. Failed
verification marks the run-owned storage object `cleanup-required`; indexed
retry cleanup continues until deletion succeeds or an operator-visible terminal
failure is recorded.

### Required Tests

- every provider operation rejects malformed envelopes;
- requested `docs/en` cannot return `other/fr`;
- recursive secret sentinels do not appear in serialization or inspection;
- script/style/iframe/SVG/event-handler/unsafe-protocol ASTs fail publication
  and cannot render through the exact packed SSR/client chain;
- route and stable-ID shaping match Content Wire V2;
- missing body AST fails deterministically;
- draft and private projections remain unavailable;
- unknown asset-like strings are never queried or replaced;
- a document with many assets performs one bounded lookup;
- unpublished global assets cannot resolve anonymously;
- mismatched file signatures and MIME metadata are rejected;
- concurrent document and asset work uses one request caller.

### Gate And Commit

Run provider contract tests against installed Ginko Content, focused security
tests, typecheck, lint, and a packed provider import probe.

Suggested commit:

`fix!: enforce the typed Ginko Content provider boundary`

## 9A. Work Package 3A: CMS Integration SDK And Markdown Portability

### Objective

Make Ginko Content a backend-neutral integration foundation and make filesystem
Markdown/MDC and Ginko CMS interchangeable storage backends for the same content
model. A team must be able to build a CMS adapter on Convex, Cloudflare, SQL, or
another platform, begin with files, adopt that CMS, and later return to files
without proprietary content lock-in or manual asset reconstruction.

The current foundation is incomplete:

- Ginko Content's `/cms-import` subpath parses filesystem files and builds a
  canonical content graph;
- Ginko CMS plans filesystem imports and can upload discovered local assets;
- raw MDC is already the CMS's canonical editable body;
- no CMS-to-filesystem export contract exists;
- asset discovery and replacement currently scan arbitrary strings and rewrite
  substrings, which is unsafe and cannot prove reference fidelity;
- backup JSON is an operational artifact, not a portable Markdown export.

Do not extend the backup format into this feature and do not create a live
Git/CMS synchronization engine.

### 9A.1 One Ginko Content Portability Contract

Ginko Content `VNEXT-0.4.md` normatively defines `PortableDocumentV1`, the
frontmatter/data mapping, the one resolved contract, RFC 8785/SHA-256 hashing,
manifest rebuilding, MDC policy, assets, errors, and filesystem limits. CMS does
not redefine any of those shapes.

CMS identity maps exactly:

```text
PortableDocumentV1.canonicalKey <-> entries.stableId
```

The CMS column name may remain `stableId`, but its value is the unmodified
Content-owned opaque `canonicalKey`. New imports never derive it from a path,
slug, route, locale, or `${collection}:...` prefix. Legacy `stableId` and
`translationKey` conversion happens once in the `0.1.x` migration.

Portable files always materialize collection, canonical key, and locale.
Deleting and rebuilding `.ginko/portable.json` in an unchanged directory must
be byte-identical. Moving a file preserves identity but updates its indexed
path; the deterministic writer restores the canonical path. Final
routes, navigation trees, search indexes, sitemap entries, AST, TOC, and public
projections are rebuilt behavior, not portable authority.

### 9A.2 Backend-Neutral Runtime Data Source

Use the fixed, bounded `ContentDataSource<Context>` from Ginko Content `0.4`.
It returns `ProviderDocumentInput`, `JsonValue | null` site data, bounded search
and navigation, and cursor-paged routes. It has no caller-selected generics,
`resolveAssets()`, `defineContentDataSource()`, or provider-owned invalidation.

The CMS implementation lives in `packages/cms/src/nuxt-provider/` and uses one
request-scoped context:

```ts
interface GinkoCmsDataSourceContext {
  event: H3Event
  caller: ReturnType<typeof serverConvex>
}
```

The H3 binder creates it once and reuses the caller. Convex public queries return
authorized, typed public asset URLs while entry identity, locale, publication,
and the field contract are available. A guessed asset key or field path never
forms a separate authorization API.

Migrate current provider invalidation to Ginko Content's single configured cache
adapter in one hard-cutover commit, then remove `provider.invalidate`. A
before/after contract test proves the same bounded tags are invalidated once;
the final runtime has no provider-only or dual invalidation topology.

CMS routes use a stable indexed order
`(collection, canonicalKey, locale, publicProjectionId)`. The opaque cursor binds
that sort key, requested collection/locale scope, source name, and a public-
projection snapshot generation. A sitemap enumeration retains the generation
until exhaustion; mutation invalidates the cursor rather than silently skipping
or duplicating a route. Return at most 250 rows per page and enforce the Content
configured maximum total route count in the host consumer.

### 9A.3 No Generic Transactional Ports In This Release

Do not publish `PortableSnapshotSource`, `PortableImportTarget`, generic leases,
or a durable-receipt framework in Content `0.4` or CMS `0.2`. Their lifecycle was
not proven by two real backends and would force filesystem, Convex, and remote
systems into one speculative state machine.

Ginko Content publishes codecs and Node directory operations. Ginko CMS builds
one direct, CMS-specific CLI vertical slice. A generic protocol may be designed
later from the proven Node, CMS, and one additional production backend.

### 9A.4 Executable Adapter Kit

Publish these intentional entries from the same declarative package manifest:

```text
@lupinum/ginko-content/data-source
@lupinum/ginko-content/provider
@lupinum/ginko-content/portability
@lupinum/ginko-content/portability/node
@lupinum/ginko-content/testing/data-source-contract
@lupinum/ginko-content/testing/portability-contract
```

`package.json.exports` is the sole allowlist. Generate or check public metadata,
declarations, docs, and probes from it. `/data-source` contains the pure read
contract. `/provider` contains the H3 binder. `/portability` contains the model,
codecs, hashing, structural references/assets, manifest rebuild, and semantic
comparison. `/portability/node` performs safe directory I/O.

The testing entries provide Level-1 observable protocol conformance only:

- `runContentDataSourceContract()`;
- portable codec/directory contract vectors;
- canonical multilingual tree/data fixtures with references and assets;
- hostile fixtures for bounds, cursors, hashes, paths, identities, MDC, and
  assets.

CMS separately records Level-2 authorization, restart, concurrent replay,
fault-after-effect, expiry cleanup, and storage evidence. Do not call Level-1
results production certification.

The released `0.3.0` `/cms-import` API is folded into the new portability codec
during the next pre-`1.0` minor. Migrate Ginko CMS in the same coordinated
release, document the replacement, and remove the duplicate entry rather than
maintaining two parsers or an indefinite alias.

### 9A.5 Semantic Round-Trip Guarantee

The supported guarantee is semantic normalization:

```ts
const before = normalizePortableModel(sourceBundle)
const cms = await importIntoCms(sourceBundle)
const exported = await exportFromCms(cms)
const after = normalizePortableModel(exported)

expect(after).toEqual(before)
```

Equality covers:

- collection, canonical key, locale, parent, authored slug, and order;
- shared and localized typed field values;
- canonical relation references, including arrays and nested fields;
- raw MDC meaning and supported custom-component syntax;
- authored visibility flags;
- asset bytes, verified media type, and every typed reference;
- translated slugs and collection-local locale behavior.

Final routes, navigation, search, sitemap, AST, TOC, and public rows are rebuilt
from authored inputs and compared in a separate behavioral suite. They are not
part of portable canonical equality.

The guarantee does not cover YAML comments, whitespace style, frontmatter key
order from the original author, editor-only TipTap state, CMS revision history,
reviews, members, audit logs, revalidation history, or byte-identical Markdown.
State those exclusions in product documentation and CLI output.

Every exported file always carries collection, `canonicalKey`, and locale.
Relations serialize through Ginko Content's canonical reference shape, never
Convex document IDs or routes.

### 9A.6 Published Export Only

CMS `0.2` exports immutable published revisions only. Working drafts, revision
history, reviews, and audit records are not portable in this release. There is
no `--state working` option.

Imports create or update drafts. Finalization verifies completeness and records
the receipt; it never publishes. Publication remains a separate canonical,
confirmed CMS operation. Working export is deferred until immutable checkpoints
exist and pass concurrent edit/asset replacement tests.

### 9A.7 Deterministic Asset Portability

Byte objects use the Ginko Content path
`public/ginko-assets/<sha256>.<verified-extension>`. Original filenames and
display metadata belong to logical references, never to the byte-object path.
Two CMS assets with identical bytes therefore share one portable byte object
without losing per-reference metadata.

Reference rewriting is schema-aware:

- `image`, `images`, and `file` fields are rewritten from CMS asset ID to a
  typed portable asset reference;
- Markdown image/link nodes and known MDC media props are parsed and rewritten;
- nested typed fields use their field contract;
- arbitrary strings are never searched or replaced;
- external HTTPS assets remain external and are never downloaded implicitly;
- `http:`, `data:`, `blob:`, executable formats, SVG, HTML, and archives are
  rejected in the initial portability profile.

At CMS asset registration, persist immutable verified SHA-256, byte count,
verified media type, and verification status. The initial allowlist is PNG,
JPEG, GIF, and WebP. Managed PDF is deferred with Content 0.4. Byte structure,
not filenames or caller MIME claims, selects the type and extension.

On import:

1. validate every manifest path before filesystem access;
2. verify size, checksum, media signature, and declared type;
3. stream each unique byte object through the host-side CMS adapter once;
4. register managed assets and receive new CMS asset IDs;
5. structurally rewrite portable references to those IDs;
6. validate all references before applying entries;
7. remove newly uploaded unreferenced objects when the import fails.

Convex operations exchange JSON rosters, plans, receipts, upload authorizations,
and export holds. They never return or accept a `ReadableStream`.

Import transfer is exact:

1. an authenticated mutation creates `PortableAssetStage` before URL issuance;
2. the CLI sends bytes to an authenticated CMS Nitro stage endpoint rather than
   directly to Convex storage;
3. the endpoint rechecks `managePortability`, obtains a Convex single-use upload
   URL, streams at most 25 MiB with a 30-second idle and two-minute total timeout,
   receives the storage ID, and records it against the stage before responding;
4. a backend-owned action obtains that storage object's URL, permits only the
   configured Convex storage origin, uses `redirect: 'error'`, incrementally
   hashes/parses the body, and rejects length/type/integrity mismatch;
5. an internal mutation conditionally records verified facts or marks the stage
   cleanup-required.

The stage attempt lease is five minutes, leaving a three-minute commit margin
after the maximum transfer. Persist only `HMAC(serverSecret, attemptToken)` and
an attempt generation; return the bearer token once and redact it everywhere.
A stale token/generation, wrong caller/run, reused response, or unexpected
storage origin cannot advance the stage. Every request re-resolves current
membership and `managePortability`; caller ID alone is insufficient, so role or
credential revocation takes effect on the next call.

Convex generated uploads have one unavoidable platform window: storage may
commit before the Nitro endpoint records the returned ID. Close it with one
bounded global orphan reconciler over `_storage`, not a pretend run-only claim.
After a ten-minute grace period, it deletes storage objects absent from the one
canonical storage-reference inventory covering assets, backups, portability
stages, and export holds. It runs only inside the Ginko CMS Convex component's
proven isolated storage namespace. A component-boundary test must show that
root-application and other-component storage is neither enumerable nor
deletable. The inventory helper and sweeper are shared by every CMS upload path.
Fault injection after storage commit/before stage record and after record/before
HTTP response must prove eventual deletion or idempotent recovery. If the
installed Convex version cannot prove both paged `_storage` enumeration and
component namespace isolation, portability upload is blocked; do not ship an
unverifiable or cross-application cleanup promise.

Export bytes use an authenticated Nitro endpoint owned by the CMS package:
`GET /api/_ginko/portability/assets/:holdId`. It requires the same operator
credential as the run, validates caller/run/hold/expiry through one
`serverConvex()` caller, fetches the held immutable storage object server-side,
permits only the configured Convex storage origin, follows zero redirects, and
streams with the same byte/time limits. A download capability stores only a
keyed nonce hash, expires after 60 seconds, and permits at most three atomically
claimed attempts so a broken connection is retryable. Every attempt rechecks
current `managePortability` authority.
Responses set `Cache-Control: no-store`; tokens and storage URLs are never
logged, serialized, redirected to the client, or placed in SSR.

The CLI streams without `arrayBuffer()` or base64 conversion and recomputes the
expected SHA-256. Portability transfer capabilities are unrelated to public
provider asset URLs.

Missing, corrupt, hostile, or unsupported assets block apply. HTTPS references
may remain external only when they were external in the source. Import never
fetches remote bytes implicitly.

### 9A.8 Plan, Apply, And Receipt Workflow

Expose one direct CLI operator workflow:

```bash
ginko-cms content export --out ./ginko-content-export
ginko-cms content verify ./ginko-content-export
ginko-cms content import ./ginko-content-export --plan ./import-plan.json
ginko-cms content import --apply ./import-plan.json
```

Studio and MCP do not receive bulk import/export authority in `0.2.0`. A later
Studio workflow may call the same canonical operations after the CLI workflow
has production evidence; it must not define its own policy or format.

The plan is immutable and binds:

- source manifest and content-contract hashes;
- target deployment and target contract hash;
- caller and collection scope;
- create, guarded-update, skip, and conflict counts;
- asset upload/reuse decisions;
- warnings and blockers.

Portability uses one dedicated bounded run/receipt model. It does not reuse the
contract-migration ledger from WP2A because the two workflows have different
identities, effects, and cleanup rules. Replace the old summary-only
`collectionImportRuns` model instead of keeping overlapping import ledgers.

```ts
type PortablePlanPayload = PortableImportPlanPayload | PortableExportPlanPayload

type PortablePlanPayloadBase = {
  format: 'ginko-cms-portability-plan'
  version: 1
  deploymentId: string
  scope: { collections: string[] }
  targetContractSha256: string
}

type PortableImportPlanPayload = PortablePlanPayloadBase & {
  mode: 'import'
  sourceManifestSha256: string
  sourceContractSha256: string
  itemCount: number
  itemRootSha256: string
  assetCount: number
  assetRootSha256: string
}

type PortableExportPlanPayload = PortablePlanPayloadBase & {
  mode: 'export'
}

type PortablePlanRecord = {
  planId: string
  payload: PortablePlanPayload
  payloadSha256: string
  callerId: string
  createdAt: number
  expiresAt: number
}

type PortableImportPlanItemPayload = {
  identity: { collection: string; canonicalKey: string; locale: string }
  expectedDraftSha256: string | null
  effect: 'create' | 'update' | 'skip' | 'conflict'
  documentSha256: string
  dependencyKeys: string[]
}

type PortableImportPlanItemRow = {
  planId: string
  itemKey: string
  inputSha256: string
  payload: PortableImportPlanItemPayload
}

type PortableImportPlanAssetPayload = {
  sha256: string
  bytes: number
  mediaType: PortableMediaType
  effect: 'upload' | 'reuse' | 'conflict'
  referencedBy: string[]
}

type PortableImportPlanAssetRow = {
  planId: string
  assetKey: string
  inputSha256: string
  payload: PortableImportPlanAssetPayload
}

type PortableImportRun = PortableRunBase & {
  mode: 'import'
  state: 'planned' | 'applying' | 'verifying' | 'complete' | 'aborted' | 'expired'
  sourceManifestSha256: string
  sourceContractSha256: string
}

type PortableExportRun = PortableRunBase & {
  mode: 'export'
  state: 'capturing' | 'ready' | 'complete' | 'aborted' | 'expired'
  rosterGeneration: number
}

type PortableRunBase = {
  runId: string
  planId: string
  payloadSha256: string
  callerId: string
  deploymentId: string
  scope: { collections: string[] }
  targetContractSha256: string
  createdAt: number
  updatedAt: number
  expiresAt: number
}

type PortableItemReceipt = {
  runId: string
  itemKey: string
  inputSha256: string
  status: 'committed'
  effect: 'created-draft' | 'updated-draft' | 'skipped'
  resultId: string
  committedAt: number
}

type PortableAssetStage = {
  runId: string
  sha256: string
  byteLength: number
  mediaType: PortableMediaType
  state:
    | 'awaiting-upload'
    | 'uploaded'
    | 'verifying'
    | 'verified'
    | 'attached'
    | 'cleanup-required'
    | 'cleaned'
  storageId: string | null
  assetId: string | null
  attemptTokenHash: string
  attemptGeneration: number
  leaseExpiresAt: number
}

type PortableExportRosterItem = {
  runId: string
  rosterIndex: number
  identity: { collection: string; canonicalKey: string; locale: string }
  revisionId: string
  documentSha256: string
}

type PortableExportAssetHold = {
  runId: string
  sha256: string
  storageId: string
  bytes: number
  mediaType: PortableMediaType
  expiresAt: number
}

type PortableExportReceipt = {
  runId: string
  manifestSha256: string
  documentCount: number
  assetCount: number
  completedAt: number
}
```

Store payload and rows server-side. `payloadSha256` hashes only the semantic
payload, never its own hash, IDs, caller, or timestamps. `itemKey` is the SHA-256
of canonical JSON identity. `documentSha256` hashes canonical
`PortableDocumentV1` before CMS asset-ID rewriting. `inputSha256` hashes the row
payload without its envelope. `assetKey` is the verified blob SHA-256. Dependency
keys are sorted item/asset keys.

Import rows sort by key; `itemRootSha256` and `assetRootSha256` incrementally
hash JCS arrays of payloads only, excluding `planId`, keys, and input hashes.
Runs bind the immutable payload hash. Use indexed
rows with explicit limits: at most 100,000 documents, 100,000 unique assets, 250
items per mutation, a 10 GiB total bundle limit, a two-hour run TTL, and a
five-minute stage-attempt lease. Plans enforce every Content per-file, count,
depth, and aggregate limit before issuing an upload or creating a run.
Each plan/receipt/roster row is at most 256 KiB canonical JSON, each document has
at most 256 direct relation/asset dependency keys, and reverse reference lists
page through separate indexed rows rather than growing one Convex document.

Every Convex callable and Nitro route in this workflow uses the standard
permission-bearing guard with `managePortability`, accepts only the CLI/operator
origin, and resolves current membership and credential state on every call.
Planning authority is not a durable capability: role removal, membership
removal, key revocation, or scope reduction blocks the next upload, apply,
download, finalize, abort, or cleanup call. Cleanup also has an internal bounded
scheduler path that grants no content-read authority.

Document apply is one Convex transaction: validate run/plan/current draft hash,
check an existing `(runId,itemKey)` receipt, apply the draft command, and insert
the committed receipt. There is no pre-effect pending row for documents. Same
key and input returns the committed receipt; same key with changed input fails.
This makes crash-after-effect/before-response deterministic.

Assets require external byte transfer, so create the run-owned stage before
issuing an upload URL. Reclaim after lease expiry uses a new attempt token;
stale attempts cannot advance state. Verification and attachment transitions
are conditional on the current token/state. Expiry has the same stop-and-clean-
run-owned-staging semantics as abort.

Allowed run transitions are closed:

```text
import: planned -> applying -> verifying -> complete
export: capturing -> ready -> complete
active import/export state -> aborted | expired
```

Terminal states never reopen. Every transition is an authenticated transaction
that checks caller, plan hash, current state, expiry, and expected counts.
Import verification requires all planned item receipts committed and every
referenced asset attached. Export is deliberately restart-only in `0.2.0`: the
CLI writes to a new local staging directory, verifies its manifest, then calls
complete once with the manifest hash and counts. That call atomically records or
idempotently replays `PortableExportReceipt`. A CLI crash deletes the abandoned
local staging directory, aborts or lets the server run expire, and starts a new
run; there is no partial export resume or per-file server acknowledgment.

Default conflict policy is fail. The initial release supports create, guarded
draft update, and skip. A draft update requires the plan's expected current
draft hash to still match. Route reassignment, deletion, and blind overwrite are
not portability operations in `0.2.0`.

Imports always create or update drafts. Publishing is a separate normal CMS
command after review. `finalize` only verifies completeness and seals receipts.
`abort` prevents new effects and cleans newly staged, unreferenced assets owned
by that run; it does not attempt to roll back created drafts.

Successful import and export create bounded receipts containing hashes and
counts, not full content or asset bytes. Receipts support retry and audit but do
not become a second content source.

### 9A.9 Consistent And Bounded Export

Exports must not `.collect()` all entries or assets into memory. Process entries
and asset bytes in bounded pages and stream files to the destination.

For a consistent published scope, acquire a CMS-owned short-lived editorial
write lease, capture a durable roster of immutable public revision IDs and
verified asset hashes in bounded pages, then release the lease before byte
streaming and serialization. This lease is a CMS implementation detail, not a
generic Ginko Content protocol requirement. It expires automatically after
failure. Public reads remain available; only conflicting editorial writes in
the selected scope receive an actionable retry response.

Every roster row binds the run ID, collection, canonical key, locale, immutable
revision ID, and document hash. Asset rows bind the immutable Convex storage ID,
verified byte hash, length, media type, and an export hold owned by the run.
Deletion and retirement commands must reject or defer deletion of a storage
object with a live hold. Holds expire with the run and indexed cleanup removes
them after complete, abort, or expiry.

The lease contains a monotonically increasing fencing generation and opaque
token. Every roster-page transaction verifies and renews the unexpired token;
every conflicting editorial write checks the same scoped lease. If the lease
expires or its generation changes before the seal transaction, discard the
partial roster and holds and restart capture. Sealing verifies the final page,
roster counts, and holds before marking the export ready and releasing the
lease.

The host exports only from the sealed roster and held storage IDs. Publication,
unpublication, asset deletion, or replacement immediately after capture
therefore cannot create a mixed snapshot.

### 9A.10 Ownership And Hard Cutover

After the shared codec exists:

- replace CMS-local frontmatter mapping with the Ginko Content codec;
- replace regex asset discovery and global substring rewriting;
- keep CMS filesystem orchestration thin and Node-specific;
- keep Convex operations JSON-only and focused on authenticated rosters, plans,
  receipts, staged upload authorization, export holds, asset registration, and
  canonical entry commands;
- delete duplicate portable schemas and serializers from CMS;
- keep backup/recovery and content portability separate in code and docs.

### 9A.11 Junior-Executable Implementation Phases

Implement in this order. Each phase starts with a failing test and ends green;
do not build the Convex adapter before the pure model is accepted.

#### Phase 0: Extract The Runtime Data Source Contract

Suggested Ginko Content ownership:

```text
packages/content/src/data-source/
  capabilities.ts
  types.ts
  errors.ts
  index.ts
packages/content/src/public/provider.ts
packages/content/src/testing/data-source-contract.ts
```

Move raw provider facts, queries, capabilities, and response contracts into the
pure entry. Keep H3 context creation, cache application, and provider binding in
`public/provider.ts`. Migrate the filesystem provider and provider fixture
first, then Ginko CMS. Delete direct external `ContentProvider` construction
after every provider uses `bindContentProvider()`.

Extend the existing provider contract suite rather than creating overlapping
tests. Verify every optional operation, response decoder, capability, cache
hint, locale/identity guard, and error code.

Gate: filesystem and fixture providers pass the same data-source suite; pure
imports pass Node and Worker-compatible V8; H3 binder tests prove one context
per request and no backend error cause escapes.

#### Phase A: Freeze Canonical Fixtures In Ginko Content

Create fixtures under `packages/content/test/fixtures/portability/` for:

- one multilingual tree collection;
- one localized flat collection;
- one data-only collection;
- shared and localized fields of every supported type;
- parent/child order, translated slugs, scalar/array relations, MDC components,
  authored public-visibility flags, and duplicate asset bytes.

For each fixture, record the normalized semantic model and asset SHA-256 values.
Use the existing filesystem parser to create the initial expected model, then
review it manually. Do not derive expectations from CMS output.

Gate: focused Ginko Content fixture tests and `git diff --check`.

#### Phase B: Implement The Pure Ginko Content Codec

Suggested ownership:

```text
packages/content/src/portability/
  model.ts
  manifest.ts
  errors.ts
  frontmatter.ts
  documents.ts
  references.ts
  assets.ts
  semantic-equality.ts
  index.ts
```

Start with manifest parsing and canonical hashing. Add document serialization,
then parsing, relations, and finally structural asset rewriting. Every module is
framework-free and operates on validated values. Export it through one
`./portability` package entry.

Delete or move the corresponding logic from `/cms-import` only after all
existing import fixtures pass through the new codec.

Gate: unit tests, package purity scan, direct Node ESM import, Worker-compatible
V8 import, declarations, and packed type/runtime consumer.

#### Phase C: Add Observable Contract Tests

Suggested ownership:

```text
packages/content/src/testing/portability-contract.ts
test/contracts/portability-contracts.test.ts
```

Keep fixtures inside `/testing/portability-contract`; do not publish a separate
fixture-only entry. Prove codecs, manifest rebuild, canonical hashing, bounds,
and structured errors through observable Level-1 tests. Do not claim that a
shared black-box suite certifies persistence durability, authorization,
transactions, cleanup, restart behavior, or deployment security.

Gate: conforming fixtures pass; broken identity, manifest, bound, hash, MIME,
path, and error fixtures fail for the expected structured reason.

#### Phase D: Add The Node Directory Adapter

Suggested ownership:

```text
packages/content/src/portability-node/
  read-directory.ts
  write-directory.ts
  safe-path.ts
  streams.ts
  index.ts
```

Use structured YAML/JSON APIs and Ginko codecs. Normalize line endings and file
ordering. Reject traversal, symlinks, devices, oversized files, excessive
counts/depth, and changed bytes. Write into a new staging directory, verify the
complete manifest, then rename into place; never partially overwrite a target
directory.

Gate: Level-1 contract tests, hostile filesystem tests, exact manifest rebuild,
two deterministic writes, and npm/pnpm packed consumers.

#### Phase E: Replace The Ginko CMS Import Path

Suggested ownership:

```text
packages/cms/src/portability/
  directory.ts
  asset-transport.ts
  commands.ts
  plan.ts
packages/convex/src/portability/
  rosters.ts
  runs.ts
  items.ts
  assets.ts
  receipts.ts
```

Implement the direct CLI-to-CMS vertical slice, not generic public ports. The
host reads or writes Ginko Content directories and streams
assets. Convex exposes JSON-only authenticated plans, immutable published
rosters, committed item receipts, canonical draft commands, staged upload
authorizations, and export holds.

Implement import first using the CMS-specific run and receipt model. Then add
published export using immutable revision rosters. Keep WP2A contract migration
records separate. Replace `collectionImportRuns` so there is one CMS content
import authority.

Delete `FilesystemMigrationEntry`, CMS-local frontmatter mapping, regex asset
detection, and substring replacement after the new adapter covers their public
behavior. Do not expose Convex IDs in portable documents or manifests.

Gate: authorization matrix, bounded JSON pagination and host streaming tests,
crash/restart and lost-response receipt tests, scoped cleanup, concurrent
published-roster tests, and production audit.

#### Phase F: Add Operator UX

Wire the CLI commands to the direct portability operations. CLI performs local
filesystem access; Convex never reads a caller path. Present the immutable plan,
published scope, conflicts, asset totals, and blockers before confirmation.

Do not add a Studio flow in `0.2.0`. Record it as later product work only after
the CLI workflow is proven and user research justifies browser bundle UX.

Gate: CLI integration tests with a real temporary directory and exact packed
packages. Test interruption after asset upload, after entry batch, before
finalize, and after a lost successful response.

#### Phase G: Prove Pure Runtime Compatibility

Import the pure data-source and portability entries in Node and a real
Worker-compatible V8 runtime. Hash the canonical JSON vectors incrementally in
both runtimes. This proves core import-graph and algorithm portability; it does
not pretend that a production D1/R2 adapter exists or is certified.

Gate: packed Node and Worker-runtime import/hash/codec probes pass without Node,
Nuxt, H3, Convex, or vendor SDKs in the pure entry graphs.

#### Phase H: Documentation And Release Evidence

Publish one adapter-author guide containing:

1. implement the runtime read data source when a CMS serves live content;
2. create an adapter-owned verified context;
3. implement bounded, fixed-shape operations;
4. use the Ginko codec rather than defining document or manifest shapes;
5. keep persistence, authorization, streaming, and retry policy in the adapter;
6. run Level-1 conformance and publish separate operational evidence;
7. integrate the separate read-side `ContentProvider` when runtime delivery is
   required;
8. pack and test without workspace resolution.

Generate API documentation from the package manifest and public declarations.
Include a complete minimal adapter and a production checklist. Never document
an adapter as certified unless its artifact hash and conformance results appear
in release evidence.

### 9A.12 Cross-Repository Dependency Order

The work moves across repositories in one direction:

```text
Ginko Content fixtures
  -> pure portability model/codecs
  -> Level-1 codec/data-source contracts
  -> Node directory adapter
  -> accepted Ginko Content tarball
  -> Ginko CMS direct import/export integration
  -> CLI orchestration
  -> exact coordinated tarballs
  -> packed Node and Worker-runtime proof
```

Ginko CMS pins the exact accepted Ginko Content tarball while implementing its
integration. Never develop it against a sibling source alias. Better Convex Nuxt
is not part of portability; it is used only by the Nuxt/Studio host for
authenticated calls and lifecycle management.

### Required Tests

- pure portability imports contain no Nuxt, H3, Node, Convex, Cloudflare, or CMS
  dependencies;
- pure data-source imports contain no Nuxt, H3, Node, Convex, Cloudflare, or CMS
  dependencies;
- filesystem and Ginko CMS read adapters pass the same runtime data-source
  suite;
- runtime adapters reject hostile identity fields, malformed cache hints,
  oversized pages, unrequested assets, credential-bearing asset URLs, arbitrary
  error bodies, and recursive secret sentinels;
- every advertised data-source capability has a positive and negative probe;
- Node-directory codecs pass the shared Level-1 portability suite;
- CMS operational evidence covers restart, concurrent replay, authorization,
  scoped cleanup, and fault-after-effect cases that Level 1 cannot prove;
- filesystem to CMS to filesystem semantic equality for Markdown, MDC, YAML,
  and JSON collections;
- CMS to filesystem to CMS semantic equality;
- shared/localized fields, nested objects, arrays, nulls, dates, and Unicode;
- localized routes, translated slugs, fallbacks, tree parents, root entries,
  navigation order, and data-only collections;
- scalar/array relations, forward references, missing targets, and cycles;
- Markdown images, links, custom MDC media props, nested asset fields, duplicate
  assets, same-name different-byte assets, and Unicode filenames;
- missing files, changed checksums, MIME/signature mismatches, traversal paths,
  symlinks, oversized files, excessive counts/depth, and interrupted uploads;
- lost upload-URL response, URL expiry/replay, wrong caller/run/token/storage
  origin, crash after upload before verification, and cleanup retry;
- image truncation, invalid terminal bytes, excessive dimensions/pixels/frames,
  calculated decoded-size overflow, and unsupported PDF/SVG/archive bytes;
- published export excludes unpublished edits and remains internally consistent
  across concurrent publication, unpublication, and asset replacement;
- no working-export option or code path exists;
- import retry after a lost response creates no duplicate entries or assets;
- same receipt key with changed input is rejected;
- crash after the atomic draft effect but before the response returns replays the
  committed receipt; concurrent attempts commit once;
- abort stops new effects and cleans only run-owned staged assets;
- interrupted imports leave drafts but never alter public projections;
- concurrent edit during export is rejected or excluded by the captured roster;
- lease expiry or fencing-generation change during paged roster capture discards
  the partial roster and holds;
- delete/replace immediately after sealing cannot remove a held export blob;
- deterministic export twice produces identical files and manifest hashes;
- a packed Ginko Content + CMS consumer performs both directions without
  workspace or sibling-source resolution;
- browser proof that the exported filesystem site renders the same pages,
  references, localized routes, navigation, search, sitemap, and assets as the
  CMS-backed site.

### Gate And Commit

Run Ginko Content codec tests first, then CMS planning/application tests, exact
packed cross-package tests, typecheck, lint, security limits, and the CMS-backed
versus exported-filesystem browser comparison.

Suggested commits:

- Ginko Content: `feat!: define the portable content bundle contract`
- Ginko CMS: `feat!: add deterministic Markdown import and export`
- Coordinated tests: `test: prove filesystem and CMS semantic round trips`

## 10. Work Package 4: Identity-Safe Studio State

### Objective

Make Studio state obey principal, argument, pagination, and scope lifetimes.

### 10.1 One Operation Context

Every Studio subscription captures:

```ts
interface StudioOperationContext {
  readonly operationId: number
  readonly principalKey: string
  readonly argsKey: string
  readonly paginationGeneration: number
  readonly disposedGeneration: number
}
```

The adapter owns monotonic generations:

```ts
function isCurrent(context: StudioOperationContext): boolean {
  return (
    !disposed.value &&
    context.principalKey === currentPrincipalKey.value &&
    context.operationId === currentOperationId &&
    context.paginationGeneration === paginationGeneration
  )
}

function commitIfCurrent(context: StudioOperationContext, commit: () => void): void {
  if (isCurrent(context)) commit()
}
```

Check currentness before:

- transforms;
- data and error commits;
- pagination cursor changes;
- callbacks;
- logs or debug output;
- refresh/reacquisition;
- loading-state completion.

### 10.2 Principal Retirement

The host bridge already exposes auth status and user refs. Derive a principal
key from the settled authenticated user. On pending replacement, sign-out, or a
different user ID:

1. increment the principal generation;
2. unsubscribe;
3. clear permissions and private query data immediately;
4. mark Studio loading/unauthenticated;
5. acquire new subscriptions only after the replacement principal settles.

Delete `hadReadyStudioAccess` behavior that can keep the outgoing principal
visible.

### 10.3 Disposal

Set `disposed = true` before unsubscribing. After disposal:

- `refresh()` and `reset()` return without acquiring work;
- `loadMore()` returns without dispatch;
- pending completions cannot transform or commit;
- awaited lifecycle promises settle deterministically.

Delete the current `PromiseLike` implementation that resolves immediately and
does not represent query settlement. Return a normal object. If an awaited API
is later required, design and test its settlement contract explicitly.

### 10.4 Pagination

Track an in-flight cursor request. Concurrent `loadMore()` calls for the same
cursor must not append duplicate pages. A first-page update may rebuild the
loaded tail, but each page completion must be guarded by principal, arguments,
cursor, generation, and disposal.

### 10.5 Exact API Types

Keep the runtime allowlist, but derive its type from the generated component API
rather than mapping every entry to generic `FunctionReference`:

```ts
type StudioMembersApi = Pick<
  ComponentApi['members'],
  'getAccessContext' | 'bootstrapCmsOwner' | 'listMembers'
>

export interface GinkoCmsStudioHostApi {
  ginkoCms: {
    members: StudioMembersApi
    // Other groups are picked from the same generated ComponentApi.
  }
}
```

One descriptor may drive the runtime pick, but the exact generated argument and
return types must remain intact.

### Required Tests

- unmount before first live value;
- refresh and reset immediately after unmount;
- A to B, user to anonymous, and anonymous to user;
- queued callbacks from the retired client;
- route transition during first load, refresh, and tail rebuild;
- same-user token rotation without duplicate subscription;
- concurrent same-cursor `loadMore()`;
- mutation, action, and upload completion after disposal;
- exact compile-time args and return types through the Studio bridge.

### Gate And Commit

Run focused Studio lifecycle tests, Better Convex Nuxt handle integration tests,
Studio typecheck, browser-component tests, and lint.

No Better Convex Nuxt API addition is required for this work package. Add a
framework-free library helper only if a second real non-Nuxt consumer proves the
same need.

Suggested commit:

`fix: make Studio state principal and scope safe`

## 11. Work Package 5: Supervised MCP Authority

### Objective

Make the MCP product match its documented authority model.

### 11.1 vNext Tool Surface

For `0.2.0`, MCP may:

- inspect collection contracts;
- read published and editable content when scoped;
- create entries and save drafts;
- inspect assets;
- preview publish impact;
- request publish review;
- inspect its own agent runs and review status.

Remove direct MCP publish and archive tools for this release. Do not keep hidden
callable wrappers that provide the same unreviewed path. Human Studio approval
invokes the canonical operation and rechecks role, version, and blockers.

### 11.2 Credential Authority

Effective authority is the intersection of:

```text
verified Better Auth API key identity
AND active CMS credential settings
AND current CMS membership and role
AND configured CMS scopes
```

Do not add collection limits or trusted safety mode merely because historical
docs mentioned them. Remove those claims. Add either feature later only with a
concrete use case and an executable authorization matrix.

### 11.3 Honest Agent Runs

Agent runs are audit and lifecycle records, not a second permission system.
Store immutable start-time audit facts:

```ts
type AgentRunAuditSnapshot = {
  credentialApiKeyId: string
  delegatedUserId: string
  scopeSnapshot: CmsPermissionKey[]
  taskName: string
  createdAt: number
  expiresAt: number | null
}
```

Current credential status, scopes, and member role are still checked on every
operation. Do not render current credential scopes as though they were the
historical requested scopes.

### 11.4 MCP Redaction

All success summaries, error messages, suggested actions, structured output,
inspection output, and logs use one recursive redactor. The raw API key appears
only once in the Better Auth creation response shown to the authenticated owner.

### 11.5 Idempotent Entry Creation

MCP transports and clients may retry after a lost response. Entry creation is
the one write that cannot rely on draft-version checks or destructive
confirmation redemption.

Require a caller-bound request key for MCP create:

```ts
type CreateEntryRequest = {
  requestId: string
  collection: string
  input: CreateEntryInput
}
```

Persist a bounded receipt keyed by credential/caller plus `requestId`, with an
arguments hash and created entry ID. The exact duplicate returns the original
result. Reusing the key with different arguments fails. Expired receipts are
removed by indexed bounded cleanup.

Do not make every mutation pass through a generic idempotency framework. Add
durable idempotency only to operations whose transport retry can duplicate a
product action.

### Required Tests

- every tool has an explicit required scope;
- direct publish/archive tools and wrappers are absent;
- editor cannot approve or publish;
- publisher/owner approval rechecks current role and draft version;
- revoked/expired/orphan keys fail in MCP and direct Convex calls;
- agent run ownership and expiry are enforced;
- role and scope changes affect the next call;
- exact and concurrent duplicate create requests return one entry, while the
  same request key with different arguments or another credential is rejected;
- secret sentinels are absent from text and structured output;
- no tool accepts user ID, role, token hash, or authority overrides.

### Gate And Commit

Run MCP middleware, token, tool contract, operation, audit, and browser tests.

Suggested commit:

`fix!: make MCP public-output work review gated`

## 12. Work Package 6: Public Delivery And Projection Performance

### Objective

Let Ginko Content own website projection and remove avoidable per-row work.

### 12.1 Delete Parallel Public Delivery

Delete `publicContent.prerender` and CMS-owned locale/path prerender projection.
Ginko Content owns prerender and sitemap.

The recommended `0.2.0` decision is also to delete the optional CMS public HTTP
facade and its generated website API types. Ginko Content already provides the
consumer-facing query surface. No named non-Ginko consumer currently justifies
maintaining a second website API.

If a real consumer blocks deletion, stop and record that product requirement.
Move the facade into an explicitly versioned package with its own contract; do
not keep it as an incidental option in the main Nuxt module.

Convex public functions remain as the raw, published-only provider backend.

### 12.2 Remove Query N+1 Behavior

Immediately remove the clear route lookup N+1 by using the route facts already
stored on the public projection when valid.

Translation/navigation queries must have a fixed query budget independent of
row count. Choose one measured implementation:

- one bounded collection projection read grouped in memory; or
- a derived `routeVariants` summary stored on each public projection.

If `routeVariants` is chosen, document it as derived and rebuildable, update all
variants transactionally on publish/unpublish, and add a rebuild/health check.

Cornerstone acceptance:

```ts
expect(queryCountForNavigation({ entries: 1 })).toBeLessThanOrEqual(MAX_QUERIES)
expect(queryCountForNavigation({ entries: 1000 })).toBeLessThanOrEqual(MAX_QUERIES)
```

Do not replace one N+1 with unbounded `Promise.all`.

### 12.3 Revalidation Safety

Outbound delivery:

```ts
await fetch(target.endpoint, {
  method: 'POST',
  redirect: 'error',
  headers: signedHeaders,
  body,
  signal,
})
```

Reject endpoint usernames/passwords. Store a stable local category and HTTP
status, never the remote body. Remove CMS webhook configuration and unused event
types if only revalidation delivery is implemented.

For `0.2`, enforce exactly one enabled revalidation target per environment.
The current UI suggests multiple targets while an event is permanently assigned
to the first enabled production target. Reject a second enabled target during
configuration instead of silently providing incomplete fan-out semantics.

Delivery is at least once. Every request carries the stable event idempotency
key, and the receiver contract must require durable deduplication by that key.
Document and test this boundary; do not describe successful HTTP delivery as
exactly once.

Expired lock recovery must be indexed and bounded:

```ts
outboxEvents.index('by_status_lock_expiry', ['status', 'lockExpiresAt'])

const expired = await db
  .query('outboxEvents')
  .withIndex('by_status_lock_expiry', (q) => q.eq('status', 'processing').lt('lockExpiresAt', now))
  .take(RECOVERY_BATCH_SIZE)
```

Reschedule recovery while another batch remains. Never call `.collect()` across
all processing events.

### 12.4 Stable Operational Pagination

Activity and audit pagination must use a stable cursor. A timestamp-only cursor
skips records when multiple events share the boundary timestamp. Prefer native
Convex pagination; otherwise use the immutable tuple `(createdAt, _id)` and
encode both values in an opaque cursor.

The same rule applies to every operational history exposed by Studio or MCP.
Do not claim native cursor semantics while returning a timestamp.

### Required Tests

- public route, navigation, search, sitemap, and list query budgets;
- route collisions and rebuild invariants;
- draft/public separation;
- redirect rejection and URL credential rejection;
- secret response bodies never persist;
- a second enabled revalidation target is rejected with an actionable error;
- retries deliver the same idempotency key and the receiver fixture deduplicates
  it;
- expired delivery locks recover in bounded indexed batches;
- identical activity timestamps paginate without loss or duplication;
- Content prerender and sitemap cover translated routes and fallbacks after CMS
  prerender deletion.

### Gate And Commit

Run public API/provider tests, projection rebuild tests, performance fixtures,
Content sitemap/prerender integration, audit, and typecheck.

Suggested commit:

`refactor!: let Ginko Content own public delivery`

## 13. Work Package 7: Maintainability And Public API Freeze

### Objective

Delete phantom contracts and make the remaining code understandable without
inventing generic layers.

### 13.1 Direct Ginko Content Contract

First prove that `@lupinum/ginko-content/cms-contract` imports, bundles, and runs
inside the exact packed Convex component.

If it passes:

- delete the vendored contract directory;
- delete the regex source transformer;
- delete its checksum manifest;
- delete duplicate parser dependencies;
- test the public subpath directly.

If it fails, fix the upstream framework-free package boundary. Do not continue
source rewriting as the permanent architecture.

### 13.2 Delete Phantom Surfaces

Audit and remove:

- unused `search.enabled`, `siteData.enabled`, and `forms.enabled` options;
- discarded `GINKO_CONTENT_PROVIDER_SITE` reads;
- `outboxEvents.siteId` while there is no site model;
- webhook/event contracts without delivery;
- `plan` and `workspaceId` Studio access fields;
- fake `reads` metadata that does not enforce table access;
- compatibility comments and stale Trellis runtime claims;
- duplicate generated component exports when no production consumer requires
  them.

### 13.3 Focused Decomposition

Decompose only after behavior is covered:

- `StudioAssetBrowser.vue`: orchestration, selection state, upload workflow, and
  presentation components;
- `useStudioAssetFinder.ts`: query state, filters, selection, and commands;
- `Editor.vue`: editor orchestration versus toolbars/dialogs;
- `public.ts`: page, list, navigation, search, routes, and site-data operations;
- `validators.ts`: domain-owned validator modules;
- large Convex workflow files: commands, pure projections, and validation.

Rules:

- domain logic does not move into Vue or transport code;
- no `BaseService`, generic repository, or generic command bus;
- each extracted module has one domain responsibility;
- public exports do not increase merely because files were split;
- generated files are excluded from size goals.

### 13.4 Public Export Freeze

Use each package's `exports` field as the only public allowlist. Generate packed
runtime imports, type imports, and negative deep-import probes from it.

Before `1.0.0`:

- decide whether `@lupinum/ginko-cms-convex/_generated/component.js` remains
  public or only `/component` remains;
- replace wildcard Contract exports if they expose new files accidentally;
- document every retained subpath;
- declare the supported Node engine range consistently.

### Required Tests

- no removed phantom option appears in declarations or docs;
- packed Convex directly imports the Content contract;
- every declared export runtime-imports and type-imports;
- forbidden private paths fail;
- Studio exact types compile without broad casts;
- module-size checks exclude generated sources and prevent regression.

### Gate And Commit

Run format, lint, typecheck, package contracts, dependency boundaries, packed
imports, and focused behavior tests.

Suggested commits:

- `refactor!: remove duplicate vNext contracts and phantom surfaces`
- `refactor: decompose the largest CMS ownership boundaries`

## 14. Work Package 8: Exact Artifact And CI Pipeline

### Objective

Make one reproducible path from clean commits to an integrated candidate.

### 14.1 Standalone Workspace

Remove normal-check dependencies on sibling repositories:

- remove sibling Ginko Content from `pnpm-workspace.yaml`;
- remove Vitest aliases into sibling Content source;
- remove the absolute Better Convex Nuxt tarball override;
- remove stale `legacy-peer-deps` and `link-workspace-packages` settings when a
  strict install passes;
- run installed package parity against the pinned Content tarball.

A clean `git archive` or clone must pass frozen install without adjacent
checkouts.

### 14.2 Local Tarball Development And Candidate Lanes

Do not publish npm packages while the coordinated APIs are changing. Use two
explicit local lanes:

```bash
# Fast integration feedback. Dirty source is allowed and recorded.
pnpm run dev:pack

# Release evidence. Every source must be clean and compatibility-pinned.
pnpm run candidate:pack
pnpm run release:verify:candidate
```

`dev:pack` writes to `.pack/dev/`, records source commit and dirty state, and
may compute hashes for diagnostics. Its artifacts must contain a development
evidence marker and are never written to `compatibility.json`, changelogs, or
release evidence.

Each dev pack is immutable and cache-proof: pack to a temporary name, compute
SHA-256, then atomically rename to
`<package>-<version>-dev.<commit>.<sha256>.tgz`. Never overwrite a path. Every
probe uses a fresh consumer directory, manifest, lockfile, package-manager store
or cache, and install. A regression test creates two dirty packs with one semver
and different bytes and proves the second consumer executes the second build.

`candidate:pack` writes to `.pack/candidate/`, refuses any dirty coordinated
repository, packs each package once per run, verifies version and source commit,
and runs twice serially to compare archive and content-manifest hashes. Candidate
verification installs those exact local `.tgz` paths into fresh temporary
consumers. It never resolves a candidate package from npm, a workspace, a link,
or a sibling source directory.

Temporary consumer manifests may use exact `file:/absolute/path/package.tgz`
dependencies because they are generated evidence, not published source.
Committed package manifests retain semver ranges and must contain no machine-
specific paths. The consumer lockfile is inspected for one physical resolution
of every coordinated package.

Only reviewed clean upstream candidate artifacts may be recorded in
compatibility. Publication is a later explicit promotion decision after all
release gates pass; neither lane publishes, tags, or pushes.

### 14.3 Coordinated Versions

Set Ginko Content to `0.4.0-rc.1` and all three CMS packages to `0.2.0-rc.1` for
the first coordinated candidate. Use explicit workspace ranges inside each
repository so packed dependency rewriting is deterministic:

```json
{
  "dependencies": {
    "@lupinum/ginko-cms-contract": "workspace:^0.2.0-rc.1",
    "@lupinum/ginko-cms-convex": "workspace:^0.2.0-rc.1"
  }
}
```

Promote Ginko Content to `0.4.0` and all three CMS packages to `0.2.0` only after
coordinated candidate approval.

The CMS release-candidate peer dependency is
`"@lupinum/ginko-content": "^0.4.0-rc.1"`; the final `0.2.0` peer is
`"^0.4.0"`. npm and pnpm candidate installs treat every peer warning as a
failure. The current `^0.3.0` range is removed in the same cutover.

### 14.4 Compatibility Is The Only Tuple Authority

Candidate verification accepts artifact paths only. Expected commit, version,
and SHA-256 come from `packages/cms/compatibility.json`:

```ts
const expected = compatibility.releaseArtifacts[packageName]
const actualHash = sha256(artifactPath)

assertEqual(actualHash, expected.sha256)
assertPackedVersion(artifactPath, compatibility.releaseStack[packageName])
assertSourceCommit(evidence, expected.sourceCommit)
```

Do not accept a caller-provided expected hash. That creates a second authority
and allows any same-version tarball to pass.

`compatibility.releaseArtifacts` contains external upstream artifacts only:
Ginko Content and Better Convex Nuxt. It must not contain the CMS packages that
embed this file because their own hashes would be self-referential. Contract,
Convex, and CMS tarball hashes belong only to generated, uncommitted candidate
evidence.

The candidate order is fixed:

1. clean and pack each upstream repository twice;
2. compare its two archives and content manifests;
3. review the upstream commits, versions, and hashes;
4. update and commit CMS compatibility with those upstream facts;
5. from that clean CMS commit, pack Contract, Convex, and CMS twice;
6. generate external evidence containing all five artifact hashes;
7. install those exact five local tarballs into fresh npm and pnpm consumers;
8. reject any tuple, peer, lockfile, source-commit, or hash mismatch.

### 14.5 Immutable Upstream Artifacts

Before CMS candidate verification:

1. Ginko Content is clean at the accepted integration-SDK commit and packs
   `0.4.0-rc.1`, matching compatibility exactly.
2. Better Convex Nuxt is clean at `fb238d96` or an accepted successor and packs
   `0.6.0`.
3. Each upstream pack records commit, dirty state, package manager, Node
   version, content manifest, and SHA-256.
4. CMS verifies those values against compatibility.

CI checks out immutable commits, never mutable branch fallbacks. Remove obsolete
Trellis checkouts.

### 14.6 Deterministic Packing

Pack Contract, Convex, and CMS twice from unchanged built source. Compare:

- archive SHA-256;
- file paths;
- modes;
- sizes;
- per-file content hashes;
- packed `package.json`.

Any difference fails the gate. Do not normalize a difference away without
identifying its source.

### 14.7 Real Packed Consumer

The candidate consumer must install the exact five-package tuple and:

1. register packed Ginko Content and packed Ginko CMS;
2. configure provider `cms` in `content.config.ts`;
3. run CMS init, doctor, and offline codegen;
4. prepare, typecheck, and build Nuxt;
5. boot the Nitro server;
6. execute provider-backed `one()`;
7. execute nested `populate()`;
8. execute navigation, surroundings, search, site data, and routes;
9. generate provider-backed sitemap and localized routes;
10. prove the provider virtual module loads from the tarball;
11. inspect the lockfile for one exact physical resolution per coordinated
    package;
12. run public package-export probes;
13. import the filesystem fixture into CMS, export it back to files, and compare
    normalized content plus asset hashes;
14. boot the exported filesystem backend and compare its public routes,
    navigation, search, sitemap, rendered content, and assets with the CMS
    backend.

No workspace, link, sibling source, external absolute path, or registry duplicate
may satisfy a candidate package.

### 14.8 Evidence Schema

Generate evidence instead of hand-maintaining version tables:

```json
{
  "candidate": "0.2.0-rc.1",
  "source": {
    "commit": "<cms-commit>",
    "dirty": false
  },
  "toolchain": {
    "node": "<version>",
    "pnpm": "<version>",
    "os": "<platform>"
  },
  "artifacts": {
    "@lupinum/ginko-content": {
      "version": "0.4.0-rc.1",
      "commit": "<commit>",
      "sha256": "<sha256>"
    }
  },
  "consumer": {
    "lockfileSha256": "<sha256>",
    "scenarios": ["prepare", "typecheck", "build", "provider-one", "portable-round-trip"]
  },
  "gates": {
    "check": "passed",
    "packageCandidate": "passed",
    "browser": "passed"
  }
}
```

The final evidence document may summarize this JSON but must not duplicate the
tuple manually.

### Gate And Commit

Run clean standalone install, two serial pack runs, the real packed consumer,
package contract probes, production audit, and CI workflow validation.

Suggested commit:

`build!: certify exact standalone vNext artifacts`

## 14A. Work Package 8A: 1.0 Operational Quality

### Objective

Close the product-operability gaps that do not justify new architecture but do
determine whether the CMS is supportable, inclusive, and predictable near
`1.0.0`.

### 14A.1 Data Retention And Privacy Inventory

Create one reviewed inventory for every durable operational record:

| Record family       | Purpose                     | User-visible | Retention                                 | Exported        | Deletion rule                    |
| ------------------- | --------------------------- | ------------ | ----------------------------------------- | --------------- | -------------------------------- |
| activity            | editorial history           | yes          | explicit duration                         | yes/no          | indexed batch                    |
| destructive audit   | security evidence           | restricted   | explicit duration or justified indefinite | yes/no          | indexed batch or documented hold |
| agent runs/reviews  | assisted-authoring evidence | restricted   | explicit duration                         | yes/no          | indexed batch                    |
| confirmations       | replay prevention           | no           | expiry plus bounded grace                 | no              | indexed batch                    |
| revalidation events | delivery evidence           | operator     | delivered/failed duration                 | no              | indexed batch                    |
| backup manifests    | recovery                    | owner        | explicit duration                         | operator export | explicit owner deletion          |

Record actual policy, not aspirational prose. Each retained field needs a
purpose; backup/export payloads containing member or credential-adjacent data
need the same classification. Cleanup jobs must use retention indexes and
bounded batches. Do not introduce a generic retention engine.

Before `1.0.0`, document the application-owner procedure for data access,
export, correction, and deletion requests, including records that cannot be
deleted immediately for security reasons.

### 14A.2 Accessibility As An Executable Contract

Add automated axe checks and keyboard scenarios for the actual Studio shell,
dialogs, field relations, arrays, asset selection, version history, and
destructive confirmations.

Correct known semantic defects directly:

- do not nest interactive `role="button"` elements in relation fields;
- implement combobox/listbox semantics only where the keyboard and focus model
  actually supports them;
- give icon-only version-history and array controls accessible names;
- restore focus after dialogs and preserve a visible focus indicator;
- announce validation, upload, and background-operation failures.

Automated checks complement, but do not replace, one manual screen-reader and
keyboard pass before `1.0.0`.

### 14A.3 Measured Scale Envelope

Publish supported operating bounds for:

- entries per collection and locales per entry;
- navigation, search, sitemap, and public-route result sizes;
- asset size and assets returned per page;
- import file count, depth, total bytes, and per-document bytes;
- portable export entry/asset counts, total bytes, lease duration, and retry
  behavior;
- backup/export size and expected recovery mechanism;
- Studio initial compressed JavaScript and CSS.

Use fixtures at the documented boundary. Add gzip or Brotli budgets for the
initial Studio route and keep editor/asset features lazy. A large total lazy
chunk graph is not itself a release blocker; regressions in initial interactive
cost are.

### 14A.4 Novice And Upgrade Journeys

Certify two workflows without undocumented operator knowledge:

1. a new owner installs the packages, creates the first owner through the
   server-only bootstrap, configures Content, publishes one entry, and observes
   it in the real provider consumer;
2. a sanitized `0.1.3` fixture follows the documented `0.2` cutover, including
   legacy-key revocation, contract migration, recovery preparation, and packed
   artifact verification;
3. an existing Markdown site imports its entries and assets into CMS, edits and
   publishes content, exports back to a standalone filesystem site, and verifies
   semantic parity.

The test records commands and expected decisions but never embeds credentials.
Failures must identify the owner action required instead of exposing internal
Convex or Nuxt terminology.

### Required Tests

- retention cleanup boundaries and legal-hold exceptions, if supported;
- axe checks with zero serious or critical violations on primary workflows;
- keyboard-only creation, editing, relation selection, publishing, and delete
  confirmation;
- boundary-size public queries, import rejection, and bounded cleanup;
- compressed initial-route budget;
- clean novice install and sanitized `0.1.3` cutover drills.

### Gate And Commit

Treat unresolved serious accessibility defects, undocumented sensitive-data
retention, and a failed supported upgrade drill as `1.0.0` blockers. They may be
scheduled after the first `0.2.0-rc.1` only when the candidate is explicitly not
represented as generally available.

Suggested commits:

- `fix: make Studio workflows accessibly operable`
- `docs: define retention scale and upgrade guarantees`
- `test: certify novice and upgrade journeys`

## 15. Work Package 9: Coordinated Release Certification

### Objective

Prove deterministic invariants first, then validate the exact candidate in a
real browser and deployment.

### 15.1 Repository Gates

Ginko Content:

```bash
pnpm run check
pnpm run release:pack
pnpm run package:e2e
```

Better Convex Nuxt:

```bash
pnpm run check
pnpm run check:contracts
pnpm run test:e2e
pnpm run release:verify
```

Ginko CMS:

```bash
pnpm run check
pnpm run package:e2e
pnpm run audit:prod
pnpm run release:verify:candidate
```

Run candidate verification twice serially and compare the complete evidence and
artifact hashes.

### 15.2 Deterministic Security And Lifecycle Matrix

Mandatory cases:

- owner bootstrap with hostile email args;
- browser versus API-key JWT kind;
- missing, revoked, expired, mismatched, and orphan MCP credentials;
- A to B, sign-out, and anonymous to user;
- queued old-client callbacks;
- unmount before first query value;
- refresh/reset after disposal;
- pagination cursor changes and concurrent `loadMore()`;
- provider fact conflicts and malformed envelopes;
- draft/public projection separation;
- Content preview cookie with published-only CMS provider;
- route collision and policy drift;
- revalidation redirect and secret body;
- MCP message/data/log secret sentinels.

### 15.3 Browser And Live Proof

Use only the exact recorded candidate tuple.

Verify:

- signed-out SSR Studio redirect;
- registration/sign-in and owner claim;
- member and role boundaries;
- authenticated Studio shell;
- A to B replacement when two principals are available;
- sign-out with immediate data retirement;
- collection and locale policy display;
- draft create/edit/preview;
- publish through human approval;
- unpublish/archive/restore through canonical operations;
- public Content reads;
- navigation, search, pagination, translated slugs, fallback routes, and sitemap;
- nested reference population;
- upload and public asset resolution;
- filesystem-to-CMS import with assets and CMS-to-filesystem export from the
  same candidate data, followed by semantic comparison and filesystem rendering;
- MCP key creation, scoped draft work, review request, approval, revocation, and
  post-revocation denial;
- mutation/action/upload error operation labels.

Inspect console, network, SSR payloads, error serialization, logs, and MCP output
for:

- stale principal data;
- auth flicker;
- duplicate subscriptions;
- uncaught rejections;
- credentials or causes;
- private provider responses;
- workspace or development asset paths.

Clean all temporary entries, assets, API keys, agent runs, review requests, and
membership changes.

### 15.4 Candidate Approval

The release candidate is approved only when:

- all three source repositories are clean;
- every mandatory work package is committed separately;
- compatibility matches exact artifacts;
- both serial verification runs are identical;
- the real packed consumer and browser suite pass;
- no active checklist item remains unchecked;
- known external limits are explicit and do not invalidate a mandatory scenario.

Do not publish, tag, or push as part of automated implementation.

Suggested commit:

`test: certify the coordinated Ginko CMS vNext candidate`

## 16. Implementation Order

Use this order. Do not begin cosmetic decomposition while security and ownership
are unstable.

1. WP1 - identity and auth.
2. WP2 - canonical Content policy.
3. WP2A - versioned upgrade and recovery.
4. WP3 - provider, render safety, and assets.
5. WP3A - backend-neutral CMS integration and Markdown portability.
6. WP4 - Studio lifecycle and exact types.
7. WP5 - supervised MCP.
8. WP6 - public delivery and performance.
9. WP7 - maintainability and export freeze.
10. WP8 - exact artifacts and CI.
11. WP8A - `1.0` operational quality.
12. WP9 - coordinated certification.

Each work package must leave its affected repository green. Do not combine
unrelated packages into a single commit.

## 17. Acceptance Matrix

Use only these statuses:

- `open`
- `implemented`
- `amended`
- `deferred` with an explicit owner and reason

| Area                                | Status      | Required executable evidence            |
| ----------------------------------- | ----------- | --------------------------------------- |
| First-owner identity                | implemented | Hostile email argument test             |
| JWT credential kind                 | implemented | Direct Convex browser/MCP matrix        |
| Required auth secret                | implemented | Missing-secret startup and doctor tests |
| Studio route protection             | implemented | SSR signed-out redirect test            |
| Unsupported auth-disabled topology  | implemented | Module rejection test                   |
| Permission-complete call guards     | implemented | Role/origin/scope direct-call matrix    |
| Canonical Content policy            | implemented | Drift/apply invariant suite             |
| Atomic policy and collection sync   | implemented | Transactional sync tests                |
| Generation-safe reindex             | implemented | Mid-run policy replacement test         |
| Contract migration finalization     | implemented | Entry validation and approval test      |
| Migration retry and resume          | implemented | Crash/retry receipt test                |
| Legacy MCP-key cutover              | implemented | Old-token denial and audit test         |
| Recoverable destructive actions     | open        | Snapshot/restore drill                  |
| Bounded import and archive parsing  | open        | Hostile archive/filesystem limits       |
| Provider runtime decoders           | open        | Adversarial Wire V2 suite               |
| Public render safety                | open        | Packed AST-to-render exploit probes     |
| Structured asset resolution         | implemented | No arbitrary-string lookup test         |
| Asset publication state             | implemented | Unreferenced-global denial test         |
| Upload byte verification            | implemented | MIME/signature mismatch tests           |
| Backend-neutral runtime data source | implemented | Filesystem/CMS/Worker contract suite    |
| One request adapter context         | implemented | Binder reuse and disposal tests         |
| Portable Content contract           | implemented | Packed public codec probes              |
| Portable codecs and directory       | implemented | Node and Worker purity probes           |
| Level-1 portability contracts       | implemented | Codec/manifest hostile fixture suite    |
| Bidirectional semantic round trip   | implemented | Files to CMS to files equality          |
| Deterministic asset portability     | implemented | Byte/hash/reference round-trip suite    |
| Portable conflict and retry safety  | implemented | Immutable plan and lost-response tests  |
| Bounded consistent export           | implemented | Lease, roster, and pagination tests     |
| Studio principal retirement         | implemented | A to B and sign-out tests               |
| Disposed-scope settlement           | implemented | Refresh/reset-after-unmount tests       |
| Pagination concurrency              | implemented | Same-cursor deduplication test          |
| Exact Studio API types              | implemented | Packed type consumer                    |
| Supervised MCP surface              | implemented | Direct publish/archive negative probes  |
| MCP credential fail-closed          | implemented | Revoked/orphan direct-call tests        |
| Idempotent MCP entry creation       | implemented | Lost-response retry test                |
| Agent-run audit truth               | implemented | Immutable snapshot test                 |
| Revalidation boundary               | open        | Redirect/body sentinel tests            |
| Revalidation target cardinality     | open        | Second-enabled-target rejection         |
| Bounded outbox recovery             | open        | Indexed multi-batch recovery test       |
| Stable operational cursors          | open        | Equal-timestamp pagination test         |
| Ginko Content public ownership      | open        | CMS facade/prerender absence tests      |
| Public query budget                 | open        | 1 versus 1000 entry query-count test    |
| Direct Content contract             | open        | Packed Convex import proof              |
| Phantom surface deletion            | open        | Declaration/docs negative checks        |
| Standalone install                  | open        | Clean archive frozen install            |
| Exact compatibility tuple           | open        | Manifest-owned hash tests               |
| Deterministic packs                 | open        | Two identical serial packs              |
| Real packed provider consumer       | open        | Nitro runtime scenario suite            |
| Retention and privacy inventory     | open        | Indexed cleanup and policy evidence     |
| Accessible Studio workflows         | open        | Axe, keyboard, and focus suite          |
| Supported scale envelope            | open        | Boundary fixtures and bundle budgets    |
| Novice and upgrade journeys         | open        | Fresh install and `0.1.3` drill         |
| Browser and MCP certification       | open        | Exact-tuple evidence                    |

Do not mark all rows at the end. Update each row when its work package passes.

## 18. Definition Of vNext Done

Ginko CMS vNext is done when:

- identity and API-key authority fail closed;
- every callable guard is complete for browser, server, and MCP origins;
- Studio requires authentication and has no outgoing-principal retention;
- Content policy is canonical and CMS policy is a rebuildable projection;
- policy reindexing cannot mix generations;
- upgrades are resumable, contract transitions are validated, and destructive
  operations have a tested recovery path;
- Content Wire V2 inputs and outputs are strictly validated;
- CMS publishes only raw provider facts and Ginko Content owns public projection;
- unsafe Markdown AST cannot become active browser content;
- arbitrary strings are never treated as assets;
- public asset access is explicit and uploaded bytes match their accepted type;
- runtime CMS integrations implement one pure Ginko Content data-source
  contract and receive H3/Nuxt behavior only through the official binder;
- published Markdown/MDC and CMS content move through one Ginko Content
  portability contract;
- non-Convex CMS authors can reuse the same content model, codecs, data-source
  boundary, and Level-1 contract tests without inheriting Convex policy;
- authored entries, locales, slug/parent/order route inputs, references, bodies,
  and asset bytes survive both directions semantically; projected routes,
  navigation, search, and sitemap are rebuilt and behaviorally compared;
- CMS imports are deterministic, bounded, resumable, and conflict-safe; exports
  are deterministic and restart-safe; both have CMS-owned operational evidence;
- MCP public-output work is review-gated;
- retried MCP creates cannot duplicate content;
- remote errors, redirects, and bodies cannot leak secrets;
- revalidation target semantics, retry delivery, and lock recovery are explicit
  and bounded;
- query cost is bounded independently of result count;
- operational pagination is stable under timestamp collisions;
- duplicate and phantom contracts are removed;
- public package exports and Node support are intentional;
- a standalone clone installs and verifies without sibling repositories;
- exact artifacts pack deterministically;
- a real packed Content + CMS consumer builds, boots, and exercises the provider;
- the exact candidate passes deterministic, browser, and MCP certification;
- migration guidance explains every `0.1.x` removal;
- retention, accessibility, supported scale, and novice operation have
  executable evidence;
- the coordinated `0.2.0` packages bake in two independent consumers.

Promotion to `1.0.0` is a separate decision. It requires no unresolved security
or ownership finding, an intentionally frozen public surface, and evidence that
the `0.2.x` architecture works outside the development workspace.
