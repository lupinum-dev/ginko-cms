# Ginko CMS2 Comparison

Status: working architecture comparison.

Date: 2026-07-04.

This document compares the current `ginko-cms` package, the greenfield
`ginko-cms2` proof, and the older/original Ginko CMS direction. The goal is to
identify what each version does better, where each one is weaker, and what the
final Ginko CMS should look like.

## Repositories Reviewed

Primary current repo:

- `/Users/matthias/Git/workspace/ginko-cms`
- Current package family:
  - `@lupinum/ginko-cms`
  - `@lupinum/ginko-cms-convex`
  - `@lupinum/ginko-cms-contract`

Greenfield comparison repo:

- `/Users/matthias/Git/workspace/ginko-cms2`
- Package name: `@lupinum/ginko-cms2`

Older/original references:

- `/Users/matthias/Git/1_apps/ginko-cms-old`
- `/Users/matthias/Git/0_libs/nuxt-ginko-cms`

Main files used:

- `README.md`
- `move-off-trellis.md`
- `docs/concepts/positioning.md`
- `docs/concepts/studio/product-model.md`
- `docs/concepts/studio/workflows.md`
- `docs/reference/content-model.md`
- `adr/0016-direct-convex-better-auth-cutover.md`
- `packages/convex/src/schema.ts`
- `packages/convex/src/functions.ts`
- `packages/convex/src/auth/appIdentity.ts`
- `packages/cms/src/server/mcp/**`
- `packages/cms/src/module.ts`
- `ginko-cms2/README.md`
- `ginko-cms2/docs/cms2-product-spec.md`
- `ginko-cms2/docs/final-version.md`
- `ginko-cms2/convex/components/ginkoCms/schema.ts`
- `ginko-cms2/convex/authz.ts`
- `ginko-cms2/convex/mcp.ts`
- `ginko-cms2/server/internal/mcp/**`
- `ginko-cms2/module.ts`
- `ginko-cms-old/docs/ginko-mental-model.md`
- `nuxt-ginko-cms/README.md`
- `nuxt-ginko-cms/docs/ARCHITECTURE.md`

## Executive Summary

The current `ginko-cms` is the stronger release vehicle. It has the better
package split, setup CLI, direct Convex setup validation, package E2E,
release gates, mature content model, managed assets, backups, imports,
public provider surface, and production documentation.

`ginko-cms2` is the stronger product architecture reference. It keeps the core
CMS much closer to the actual product: Better Auth owns identity and sessions,
CMS members own product roles, Convex component functions own invariants, MCP is
a delegated workflow surface, and agent/AI flows are product concepts rather
than generic runtime abstractions.

The older/original Ginko CMS had a valuable mental model around separate planes:
admin/write, public delivery, and Nuxt site consumption. It also had strong UI
ambition and a broad component kit. Its weakness was that this plane separation
became key-heavy and API-heavy. It drifted toward a platform with many surfaces
instead of a focused website CMS.

The sweet spot is:

- keep current `ginko-cms` as the publishable package foundation;
- adopt `ginko-cms2`'s auth, MCP, agent, and review-request model;
- keep current `ginko-cms`'s mature content lifecycle, assets, backups, imports,
  provider, release verification, and docs;
- remove remaining generic framework shapes from current `ginko-cms`, especially
  `CmsCaller`, synthetic MCP Convex identity, `projectTool`, permanent MCP keys
  as the default, and ordinary MCP use of `CONVEX_DEPLOY_KEY`;
- make the final product a focused self-hosted website CMS, not a page builder,
  generic database admin, multi-tenant platform, or model-owned publishing
  system.

## High-Level Verdict

| Area | Current `ginko-cms` | `ginko-cms2` | Sweet spot |
| --- | --- | --- | --- |
| Package/release readiness | Strongest | Still MVP/package proof | Keep current package/release machinery |
| Product simplicity | Medium | Strongest | Move current repo toward CMS2 boundaries |
| Better Auth boundary | Improved but still has local caller abstraction | Strongest | Better Auth owns identity/session; CMS owns roles |
| MCP architecture | Powerful but too generic | Stronger workflow shape | Use CMS2's delegated model and explicit tools |
| Destructive safety | Strongest invariants | Safer MCP policy, less generic machinery | Keep current Studio safety; restrict MCP direct execute |
| Content lifecycle | Rich and mature | Clearer but slightly simpler | Keep current lifecycle, simplify wrappers |
| Public reads | Mature provider/API shape | Clear projection-only principle | Keep current public provider, consider CMS2 single projection simplification |
| Assets | Current is deeper | CMS2 has simpler external/managed policy | Keep current asset manager but simplify public metadata story |
| Backups/imports | Current is deeper | CMS2 has good content exchange direction | Keep current operator backup and CMS2 content exchange distinction |
| AI/agents | Current MCP-centric, less native | Strongest product model | Adopt agent runs and proposal-first AI |
| Studio UI | Current is packaged SPA, feature-complete | CMS2 has stronger product workspace concepts | Merge CMS2 workflow UX into current SPA architecture |
| Old Nuxt site DSL | Separate package had useful consumer API | CMS2 uses Ginko Content provider | Keep Ginko Content provider as the official site read path |

## What Current `ginko-cms` Does Better

### 1. Publishable Package Boundary

Current `ginko-cms` has a real package family:

- `@lupinum/ginko-cms`: Nuxt module, Studio, CLI, public provider integration,
  MCP route definitions.
- `@lupinum/ginko-cms-convex`: Convex component implementation.
- `@lupinum/ginko-cms-contract`: framework-neutral validators, field metadata,
  public types, and Convex validators.

This is more maintainable for release than the current CMS2 single-package MVP.
CMS2 intentionally proves the product direction locally before splitting. For
the final product, current `ginko-cms` is the better base because the package
boundaries and release tooling already exist.

Keep:

- separate Nuxt module and Convex component packages;
- explicit package exports;
- package E2E;
- publish specifier checks;
- compatibility matrix checks;
- docs install-story checks;
- release verification.

Challenge:

- the separate `@lupinum/ginko-cms-contract` package should stay only if it is
  truly useful outside the Convex and Nuxt packages. CMS2's final spec argues
  that Ginko Content should own most neutral content contract semantics. That is
  probably right long-term.

### 2. Setup CLI And Doctor

Current `ginko-cms` has the better install path:

- `ginko-cms init`
- `ginko-cms doctor`
- `ginko-cms deploy`
- `ginko-cms push`
- `ginko-cms migrate`

The CLI validates direct Convex setup, detects stale bridge files, and gives a
repeatable path for package consumers. CMS2 still has `generate:bridges` and a
more local-MVP install posture. The final product should use current
`ginko-cms`'s CLI posture, but keep generated host files minimal.

Keep:

- direct setup file generation;
- stale artifact detection;
- deploy-key-only narrow setup/admin operations;
- package consumer install proof.

Remove or avoid:

- generated wrapper/bridge file sprawl;
- compatibility generation;
- repair paths for old bridge files.

### 3. Release Discipline

Current `ginko-cms` has the stronger verification stack:

- `format:check`
- `lint`
- component auth boundary checks;
- Convex surface checks;
- live MCP token checks;
- CMS contract vendor parity;
- docs install story checks;
- public vocabulary checks;
- compatibility matrix;
- stale surface checks;
- package E2E;
- production audit;
- `release:verify`.

CMS2 has many useful smokes, especially browser, MCP, HTTP, AI, observability,
package consumer, and real consumer tarball checks. But current `ginko-cms` is
more mature as a releasable multi-package library.

Sweet spot:

- keep current `release:verify`;
- selectively import CMS2's real user-story smokes:
  - short-lived MCP token smoke;
  - protected MCP smoke;
  - browser owner/editor flow;
  - AI proposal flow;
  - export/import roundtrip;
  - observability smoke.

### 4. Mature Content Model

Current `ginko-cms` has a deeper active schema:

- `collections`
- `collectionReindexJobs`
- `entries`
- `entryDrafts`
- `entryRevisions`
- `redirects`
- `collectionImportRuns`
- `publicEntries`
- `publicRoutes`
- `assets`
- `contentAssetRefs`
- `siteData`
- `cmsSettings`
- `outboxEvents`
- `revalidationTargets`
- `members`
- `mcpKeys`
- `destructiveConfirmations`
- `destructiveAuditLog`
- `activity`
- `backupArtifacts`

This covers more production operations than CMS2's MVP schema. Current
`ginko-cms` is stronger on:

- redirects;
- collection reindex jobs;
- public route rows;
- asset references;
- backup artifact records;
- destructive confirmation invariants;
- site data;
- revalidation target delivery;
- import run history;
- detailed public provider operations.

Keep:

- canonical drafts and immutable revisions;
- projection-only public reads;
- asset reference derivation;
- backup artifact records;
- import run records;
- site data;
- redirects;
- revalidation outbox;
- activity/audit feed.

Challenge:

- `publicRoutes` duplicates part of `publicEntries`. CMS2's final spec argues
  for `publicEntries` as the only public projection and route lookup source. The
  current split may still be justified for indexed route lookup, but it should
  be proven by query/index needs, not habit.
- `mcpKeys` should not remain the default MCP auth model.
- `destructiveConfirmations` should remain for Studio and owner/admin actions,
  but direct MCP use should be restricted.

### 5. Public Provider Surface

Current `ginko-cms` has a richer public read adapter:

- page;
- route metadata;
- list;
- nav;
- surround;
- search;
- sitemap;
- singleton;
- site data.

This is closer to a production Nuxt website need than CMS2's smaller
`page/list/navigation/search/sitemap` MVP shape.

Keep current:

- Ginko Content provider integration;
- public HTTP facade as secondary integration;
- anonymous deterministic reads;
- published rows only;
- route-backed versus data-only capability checks;
- sitemap/nav/search inclusion flags.

Consider CMS2 simplification:

- make `publicEntries` the one public source if route lookups can stay fast and
  unambiguous without `publicRoutes`;
- keep public API vocabulary website-shaped, not table-shaped.

### 6. Assets

Current `ginko-cms` has the more complete asset manager:

- upload URL generation;
- asset registration;
- asset scope validation;
- attach assets to entries;
- update asset metadata;
- move asset scope;
- resolve public URLs;
- list colocated assets;
- asset manager data;
- rebuild asset refs;
- delete, restore, purge with previews and backup gates.

CMS2 has a simpler managed/external asset policy and content exchange story. It
preserves external URLs and can include managed bytes in export modes, but the
core asset manager is less mature.

Sweet spot:

- keep current managed asset support;
- adopt CMS2's clear distinction:
  - content exchange is not backup;
  - external URLs are preserved, not fetched;
  - managed bytes are optional export payloads;
  - missing managed bytes warn by default and can fail in strict mode;
- keep purge gated by recent operational backup.

### 7. Backups, Imports, And Operator Recovery

Current `ginko-cms` has stronger operational backup features:

- backup export;
- verify backup;
- download backup;
- delete backup artifact with confirmation;
- backup artifact table;
- purge safety gates.

CMS2 has clearer product language around:

- content exchange versus backup;
- import/export as Ginko Content-compatible files;
- operator backup/restore as recovery artifacts.

Sweet spot:

- keep current backup artifact model and purge gates;
- adopt CMS2's terminology and UX split:
  - "content exchange" for portable content files;
  - "backup/restore" for operator recovery;
- do not collapse both into one CMS-specific JSON format.

### 8. Destructive Confirmation Invariants

Current `ginko-cms` has the stronger generic destructive confirmation invariant:

- token hash;
- operation id;
- execute path;
- preview path;
- caller binding;
- scope binding;
- args hash;
- preview hash;
- optional version hash;
- expiry;
- one-time redemption;
- audit record.

This is important and should not be thrown away. The problem is not the
invariant. The problem is exposing too much of this mechanism through MCP and
generic tool wrappers.

Keep:

- preview before execute for Studio destructive actions;
- one-time, caller-bound, args-bound tokens;
- audit.

Change:

- MCP should default to preview and review request tools instead of direct
  execute tools;
- direct MCP publish/archive/delete should require an explicit product decision.

## What `ginko-cms2` Does Better

### 1. Better Auth Boundary

CMS2 has the cleaner auth model:

- Better Auth owns users and sessions.
- `convex/authz.ts` derives only:
  - `authUserId`;
  - `email`;
  - `name`.
- App-level Convex wrappers call `requireCmsPrincipal(ctx)` and pass
  `authUserId` into component functions.
- Component functions enforce CMS roles from `cmsMembers`.
- Component functions do not read `ctx.auth` or environment variables.

Current `ginko-cms` still has a local identity abstraction:

- `CmsCaller`
  - `anonymous`;
  - `user`;
  - `mcp`;
  - `deploy`;
- `cmsMcpConvexAuthIssuer`;
- `getAppIdentity`;
- synthetic MCP identity mapping;
- deploy as a modeled caller kind.

That abstraction is too close to a replacement auth framework. It made sense
during Trellis removal, but the final CMS should simplify.

Sweet spot:

- Better Auth owns identity/session/team primitives.
- CMS owns only CMS product roles and content authorization.
- Deploy/admin is transport for narrow internal setup functions, not a CMS
  actor.
- MCP is delegated authority, not a synthetic Convex user.

### 2. MCP As Delegated Product Workflow

CMS2's MCP design is materially better:

- short-lived bearer tokens;
- token bound to an `agentRun`;
- capabilities and collection scope live on the run;
- tools never accept `authUserId`, role, or delegated user id;
- Convex resolves token hash to run;
- MCP operations call canonical CMS component operations;
- MCP creates drafts and review requests;
- direct publish/archive is not the default MCP path.

Current `ginko-cms` MCP is stronger in tool hardening but weaker in product
shape:

- permanent 90-day member-bound MCP keys;
- MCP middleware consumes tokens via admin Convex caller;
- normal MCP runtime requires `CONVEX_DEPLOY_KEY`;
- MCP tools use synthetic Convex identity;
- `projectTool` hides too much dispatch and schema conversion;
- destructive MCP tools directly expose `_confirmationToken` execution.

Sweet spot:

- use CMS2's delegated agent-run model;
- keep current structured MCP resources/prompts where useful;
- delete `projectTool`;
- make each MCP tool an explicit product operation;
- remove `CONVEX_DEPLOY_KEY` from ordinary MCP runtime;
- keep deploy key for CLI setup/admin only.

### 3. Agent Runs Are A Product Concept

CMS2 models agents explicitly:

- `agentRuns`;
- delegated user;
- capabilities;
- collection scopes;
- expiry;
- run status;
- MCP token hash;
- audit actor as `agent`.

This is much better than treating MCP keys as long-lived alternate users.

Current `ginko-cms` has MCP keys but no equally central agent-run concept. This
means "the agent did this" is harder to represent as a bounded product action.

Sweet spot:

- add/adopt agent runs;
- make MCP a channel over agent runs;
- keep audit clear:
  - user action;
  - agent action delegated by user;
  - deploy/admin setup action;
  - scheduled/internal action.

### 4. AI Is Proposal-First

CMS2 has a stronger AI philosophy:

- AI proposes refinements, translations, outlines, SEO, or draft data;
- AI does not directly own draft write paths;
- accepted proposals save through canonical draft operations;
- no `aiProposals` table until a real proposal inbox is required.

Current `ginko-cms` has less native AI product modeling. It has rich MCP and
editor infrastructure, but AI is not as cleanly integrated as a proposal layer.

Sweet spot:

- adopt CMS2's proposal-first AI model;
- keep writes through `saveEntryDraft`;
- store accepted AI context in audit/revision messages;
- add durable proposal tables only when a real inbox/review lifecycle exists.

### 5. Review Requests For Agent Destructive Actions

CMS2 makes a product distinction that current `ginko-cms` should adopt:

- humans with proper roles can publish/archive directly through Studio;
- agents/MCP should usually request publish/archive;
- publishers approve or reject review requests;
- public output remains unchanged until approval.

This is safer and simpler than teaching every MCP client a confirmation-token
protocol for destructive execution.

Sweet spot:

- direct Studio publish stays;
- MCP `preview_publish` stays;
- MCP `request_publish` and `request_archive` become primary;
- MCP direct `publish_entry`, `archive_entry`, `delete_entry` are not default.

### 6. Component Boundary

CMS2's component boundary is easier to reason about:

- component owns durable CMS state and invariants;
- app-level Convex files own auth/session resolution;
- wrapper passes explicit actor id into component;
- component ids cross boundary as strings;
- component does not read app auth or env.

Current `ginko-cms` is close after the Trellis cutover, but its custom
`functions.ts` builder and `appIdentity` abstraction still make the component
feel framework-like.

Sweet spot:

- keep current component package;
- simplify app-facing functions toward CMS2's wrapper pattern;
- avoid a local generic auth/caller runtime;
- keep only small Convex helper builders if they reduce duplication without
  becoming a policy framework.

### 7. Single-Site, No-Tenant Bias

CMS2 repeatedly states that multi-organization tenancy is out of scope until
tenant isolation is an explicit acceptance criterion.

This matches the actual product. Current `ginko-cms` has already moved away
from Trellis tenant/workspace assumptions, but some of the old shape remains in
identity, MCP, and bridge vocabulary.

Sweet spot:

- no tenant tables;
- no organization tables inside CMS;
- if teams/account identity becomes needed, use Better Auth primitives;
- map Better Auth account/team identity into CMS roles only after a real
  acceptance criterion exists.

### 8. Product-Facing Studio Concepts

CMS2's Studio component list shows stronger product vocabulary:

- `StudioAgentWorkspace`;
- `StudioAgentPanel`;
- `ReviewRequestsPanel`;
- `StudioPublicWorkflowCard`;
- `StudioArchiveWorkflowCard`;
- `StudioRouteReadinessPreview`;
- `StudioTranslationReadinessCard`;
- `StudioProjectionHealthPanel`;
- `StudioProviderSurfacesPanel`;
- `StudioWorkflowRail`;
- `StudioWorkflowImpactStrip`;
- `DraftAiProposal`;
- `DraftPublishPreview`;
- `DraftRollbackPreview`;
- `DraftUnpublishPreview`.

Current `ginko-cms` Studio is more package-ready and has a clean standalone SPA
boundary, but CMS2 points to the better editor mental model: content operations,
readiness, workflow impact, agents, review, projection health, and public
visibility.

Sweet spot:

- keep current standalone Vite SPA packaging;
- adopt CMS2's workflow vocabulary and UX organization;
- keep advanced diagnostics available but not primary.

## What The Older/Original Direction Did Better

### 1. Clear Consumer Site DSL

The older `nuxt-ginko-cms` package focused on a simple Nuxt consumer API:

- `useGinkoPage`;
- `useGinkoList`;
- `useGinkoNavigation`;
- `useGinkoNav`;
- `useGinkoSurround`;
- `useGinkoSearch`;
- `queryGinko`;
- generated `ginko.generated.ts`;
- `ginkoCms.site` route and locale DSL.

That was useful because it gave website developers a clean read API. The final
product should preserve this ease, but probably through Ginko Content provider
semantics rather than a separate CMS-specific Nuxt DSL.

Sweet spot:

- official site consumption goes through Ginko Content provider;
- Nuxt app APIs stay website-shaped;
- no public website runtime should call admin/MCP/write APIs.

### 2. Plane Separation

The old mental model separated:

- admin/write plane: MCP/admin APIs;
- public delivery plane: public API and delivery keys;
- Nuxt site DSL plane: site composables.

The distinction is valuable. The implementation became too key-heavy and
endpoint-heavy.

Sweet spot:

- keep the conceptual separation;
- implement it with fewer primitives:
  - Studio and MCP write through authenticated Convex operations;
  - public website reads use anonymous published projections;
  - CLI setup/admin uses deploy key on narrow internal functions;
  - Nuxt site rendering uses Ginko Content provider.

### 3. UI Component Breadth

The old app had a broad shadcn-style component system and editor tooling. That
helped with building a real Studio quickly.

Weakness:

- the README was still dashboard-template flavored;
- the app carried broad UI/platform dependencies;
- the product shape risked becoming a generic admin dashboard.

Sweet spot:

- keep practical UI components only if the Studio uses them;
- avoid importing a whole dashboard/product surface that expands the CMS scope;
- favor dense, work-focused content operations UI.

## Where Current `ginko-cms` Is Weaker

### 1. Remaining Auth Ceremony

Current `ginko-cms` still models multiple local caller kinds. This is too much
for a single-site CMS:

- Better Auth already owns user identity.
- CMS members already own product roles.
- Deploy key should be transport authority only.
- MCP should be delegated run authority, not a synthetic identity.

Recommendation:

- add a simple `requireCmsPrincipal(ctx)` pattern;
- gradually replace user-facing `CmsCaller` paths with explicit `authUserId`;
- keep deploy-key access only on narrow internal functions;
- remove `cmsMcpConvexAuthIssuer` from normal MCP runtime.

### 2. MCP Runtime Recreates A Framework

`projectTool` is the clearest remaining framework-like surface:

- converts Convex validators to Zod;
- computes tool context;
- resolves capability maps;
- dispatches query/action/mutation/operation;
- handles generic destructive confirmation;
- returns generic errors.

That is useful but too broad. It hides tool behavior. For a simple CMS, direct
tool files are easier to audit.

Recommendation:

- delete `projectTool`;
- keep small helpers:
  - `ok`;
  - `fail`;
  - `loadMcpContext`;
  - `requireMcpCapability`;
  - `getTokenHash`;
- write tool handlers explicitly.

### 3. Permanent MCP Keys As Default

Current `mcpKeys` are long-lived API-key-like credentials bound to members.
That creates:

- another credential lifecycle;
- another user acting model;
- Studio key management surface;
- normal MCP dependency on `CONVEX_DEPLOY_KEY`;
- higher blast radius if tokens leak.

Recommendation:

- make short-lived delegated tokens the default;
- use agent runs as the MCP authority source;
- keep persistent automation tokens only if a concrete external automation
  workflow requires them.

### 4. Destructive MCP Direct Execute

Current MCP exposes direct destructive actions:

- publish;
- unpublish;
- archive;
- delete entry;
- delete asset.

Even with strong confirmation tokens, this is a complex protocol for external
agents and clients.

Recommendation:

- keep direct destructive actions in Studio for humans;
- expose MCP preview and request-review workflows first;
- add direct MCP execute only with dedicated acceptance tests.

### 5. Too Many Sources Of Content Contract Truth

Current `ginko-cms` has:

- `@lupinum/ginko-cms-contract`;
- synced collection snapshots;
- content config integration;
- vendor/parity scripts.

Some of this is necessary today. Long-term, Ginko Content should own as much of
the neutral content contract as possible. CMS should own CMS workflow around the
contract, not a parallel neutral contract ecosystem.

Recommendation:

- keep contract package until replacement is proven;
- move neutral content contract semantics into Ginko Content when practical;
- keep CMS-specific validators close to the Convex component.

## Where `ginko-cms2` Is Weaker

### 1. It Is Still A Greenfield MVP Shape

CMS2 is not yet the better final package by itself. It has:

- local MVP app assumptions;
- package proof but less mature release discipline;
- single package with many responsibilities;
- exports for many app wrapper files;
- `generate:bridges` still present;
- local tarball/package-consumer workflows that are not as clean as current
  `ginko-cms`.

Recommendation:

- do not replace current `ginko-cms` with CMS2 wholesale;
- import CMS2's architectural lessons into current `ginko-cms`.

### 2. It Still Has Bridge-Like Host Wrapper Exports

CMS2 exports many `./convex/app/*` files:

- agents;
- assets;
- auditEvents;
- backup;
- auth;
- authz;
- collections;
- contentExchange;
- entries;
- mcp;
- members;
- outbox;
- publicContent;
- reviewRequests;
- settings.

These are simpler than Trellis bridges, but still a generated/host-wrapper
story. Current `ginko-cms` has moved toward direct setup validation and fewer
generated wrapper artifacts. That is better.

Recommendation:

- keep host Convex files minimal;
- avoid generated wrapper sprawl;
- use direct package exports only where Convex requires host-owned files.

### 3. Public Read Model Is Less Complete

CMS2's public content surface is intentionally MVP-sized:

- provider status;
- page;
- list;
- navigation;
- search;
- sitemap.

Current `ginko-cms` already supports a fuller website provider surface,
including route metadata, surround, singleton, and site data.

Recommendation:

- keep current provider richness;
- align implementation with CMS2's one-source projection principle where
  possible.

### 4. Asset Manager Is Less Mature

CMS2 has a good asset policy direction but current `ginko-cms` has more mature
asset operations.

Recommendation:

- keep current asset manager;
- adopt CMS2 content exchange/export modes and external URL policy.

### 5. Destructive Safety Is Less Centralized

CMS2's product policy is safer for agents, but current `ginko-cms` has more
complete generic confirmation invariants.

Recommendation:

- keep current confirmation invariants for human/owner destructive flows;
- use CMS2 review requests to avoid needing the invariant on most MCP paths.

## Feature Comparison

### Setup And Install

Current `ginko-cms`:

- install packages directly;
- register `@lupinum/ginko-content` and `@lupinum/ginko-cms`;
- run `ginko-cms init`;
- run `ginko-cms doctor`;
- deploy/sync through `ginko-cms deploy` or `ginko-cms push`;
- validates stale Trellis/bridge artifacts.

CMS2:

- installs one CMS2 module plus Better Auth, Convex, Ginko Content;
- has package consumer proof;
- still documents bridge generation for host Convex files.

Winner:

- current `ginko-cms`.

End-state:

- current setup CLI and doctor;
- no Trellis bridges;
- no CMS2-style broad bridge generation;
- app-owned Convex setup files stay tiny.

### Auth And Membership

Current `ginko-cms`:

- Better Auth integrated through direct Convex setup;
- CMS `members` table with owner/publisher/editor/viewer;
- `CmsCaller` and `CmsAppIdentity` abstraction;
- MCP keys map to members;
- first owner email gate.

CMS2:

- Better Auth session identity -> `authUserId`;
- CMS `cmsMembers` roles;
- app wrappers pass `authUserId` into component;
- no local user/session/team abstraction;
- agent runs for delegated authority.

Winner:

- CMS2.

End-state:

- Better Auth owns identity/session/team;
- CMS owns product roles;
- no local generic caller framework;
- deploy key is not a CMS actor;
- MCP uses delegated run tokens.

### Content Contracts

Current `ginko-cms`:

- host code owns collection definitions;
- synced read-only `collections` table;
- contract package and validators;
- i18n compatibility helpers;
- contract sync through deploy/admin path.

CMS2:

- `content.config.ts` is canonical;
- Ginko Content generates CMS contract;
- Convex component reads generated `contract.generated.ts`;
- contract unsupported states fail closed.

Winner:

- CMS2 conceptually, current `ginko-cms` operationally.

End-state:

- Ginko Content owns neutral content contract semantics;
- CMS stores synced contract snapshot for operations;
- Studio/MCP inspect but do not mutate schema;
- contract sync remains explicit and deploy/admin-gated.

### Drafts, Revisions, Publishing

Current `ginko-cms`:

- rich draft/revision model;
- shared and locale draft rows;
- dirty locales;
- immutable revisions for publish/unpublish/rollback/archive/checkpoint;
- preview and confirmation operations;
- route diagnostics;
- publish impact;
- revalidation outbox.

CMS2:

- clear entry/draft/revision/public projection model;
- publish preview;
- rollback/unpublish/archive/restore/purge;
- route readiness;
- review requests for agent actions.

Winner:

- current `ginko-cms` for maturity;
- CMS2 for review-gated agent destructive policy.

End-state:

- keep current lifecycle;
- add CMS2 review-request path as first-class;
- direct Studio publish remains;
- MCP requests publish/archive by default.

### Public Reads

Current `ginko-cms`:

- `publicEntries` and `publicRoutes`;
- page, route metadata, list, nav, surround, search, sitemap, singleton,
  site data;
- public HTTP facade and Ginko Content provider integration.

CMS2:

- `publicEntries` as public source;
- page, list, navigation, search, sitemap;
- strong docs that public reads never query drafts/review/audit/agent state.

Winner:

- current `ginko-cms` for capability;
- CMS2 for "one public projection source" discipline.

End-state:

- keep current public provider capability;
- verify whether `publicRoutes` is required;
- if not required, collapse route lookup into `publicEntries`;
- public reads stay anonymous and deterministic.

### Studio

Current `ginko-cms`:

- standalone Vite SPA;
- hosted by Nuxt module;
- Studio route/auth pages;
- collection pages;
- entry pages;
- assets;
- imports;
- activity;
- settings;
- site data;
- command palette;
- advanced editor and autosave.

CMS2:

- integrated Nuxt runtime page;
- richer product workspace vocabulary;
- agents;
- review requests;
- dashboard lanes;
- route readiness;
- translation readiness;
- provider surfaces;
- projection health;
- AI proposal cards.

Winner:

- current `ginko-cms` for package architecture;
- CMS2 for product UX model.

End-state:

- keep standalone SPA if it continues to protect host apps from Studio
  internals;
- adopt CMS2 workspace concepts;
- primary navigation should be content operations, not implementation tables;
- diagnostics stay available but secondary.

### MCP

Current `ginko-cms`:

- opt-in MCP route;
- prompts/resources;
- read tools;
- public tools;
- destructive tools;
- permanent MCP keys;
- admin Convex caller with synthetic MCP identity;
- generic `projectTool`.

CMS2:

- MCP as delegated run workflow;
- short-lived bearer token;
- explicit tools:
  - list/get collections;
  - list/get entries;
  - create/update draft;
  - tree tools;
  - public visibility;
  - preview publish;
  - request publish/archive;
  - review requests;
  - AI proposals;
  - asset metadata;
- no direct publish as default.

Winner:

- CMS2.

End-state:

- use CMS2 MCP tool set and authority model;
- keep current MCP resources/prompts where they add real context;
- remove generic MCP runtime;
- remove deploy-key requirement for normal MCP;
- no direct destructive MCP by default.

### AI

Current `ginko-cms`:

- editor and MCP infrastructure exist;
- AI not as central in product model.

CMS2:

- AI proposal routes;
- proposal-first model;
- refinement and translation tools;
- AI policy in settings;
- no direct model-owned publishing.

Winner:

- CMS2.

End-state:

- AI proposes;
- canonical draft operation applies;
- no durable `aiProposals` table until a real inbox exists;
- accepted AI changes are reflected in audit/revision messages.

### Assets

Current `ginko-cms`:

- stronger managed asset system;
- scoped assets;
- attachment;
- metadata;
- deletion/restoration/purge;
- asset refs.

CMS2:

- simpler managed/external policy;
- export modes for managed bytes;
- external URLs preserved.

Winner:

- current `ginko-cms` for operations;
- CMS2 for content exchange policy.

End-state:

- current asset manager plus CMS2 export/import semantics.

### Backup, Import, Export

Current `ginko-cms`:

- backup artifacts;
- import runs;
- filesystem migration helpers;
- restore/purge gates.

CMS2:

- strong distinction between content exchange and backup;
- export zips with asset modes;
- restore dry-run/apply routes.

Winner:

- current `ginko-cms` for operator safety;
- CMS2 for product language and portable content exchange.

End-state:

- two separate workflows:
  - content exchange for Ginko Content files;
  - backup/restore for recovery.

### Observability

Current `ginko-cms`:

- release gates and diagnostics;
- revalidation outbox;
- activity feed.

CMS2:

- evlog integration;
- PostHog/Sentry runtime options;
- explicit smoke tests for observability.

Winner:

- CMS2 for observability integration;
- current `ginko-cms` for release verification.

End-state:

- add CMS2-style event logging and redaction policy if production operations
  need it;
- keep release verification.

## The Final CMS Should Look Like This

### Product Positioning

Ginko CMS is a focused self-hosted website CMS for Nuxt teams using Convex,
Better Auth, and Ginko Content.

It is for:

- professional business websites;
- app-owned Nuxt sites;
- teams that want code-defined content;
- teams that need drafts, localization, assets, public-read projections,
  publishing, rollback, backup, import/export, and safe agent assistance.

It is not:

- a page builder;
- a runtime schema builder;
- a generic database admin;
- a multi-tenant SaaS control plane;
- a model billing system;
- a marketing automation platform;
- a general workflow engine.

### Final Ownership Boundaries

Ginko Content owns:

- content collection definitions;
- field semantics where they are CMS-neutral;
- locale and route semantics;
- provider read contracts;
- filesystem exchange semantics;
- CMS contract generation if possible.

Better Auth owns:

- users;
- sessions;
- accounts;
- teams/organizations if the product later needs them.

Ginko CMS owns:

- Studio workflows;
- CMS roles;
- content entries, drafts, revisions;
- publishing and public projections;
- managed assets;
- imports and content exchange workflows;
- backups and recovery gates;
- agent runs;
- MCP tools;
- AI proposal integration;
- review requests;
- audit/activity;
- revalidation and diagnostics.

Host app owns:

- rendering;
- routes and layouts;
- app-specific Better Auth providers;
- deployment;
- environment variables;
- model/provider keys;
- CDN/upload policy if overriding default managed assets.

### Final Runtime Shape

```text
Nuxt host app
  -> better-convex-nuxt
  -> Better Auth session
  -> #convex/api and #convex/server

Studio
  -> direct Convex app wrappers
  -> CMS component functions

MCP
  -> short-lived delegated agent token
  -> explicit api.mcp.* functions
  -> canonical CMS component operations

Public website
  -> Ginko Content provider
  -> anonymous public projection reads

CLI setup/admin
  -> CONVEX_DEPLOY_KEY
  -> narrow internal sync/migration/backup functions only
```

### Final Data Model Direction

Keep from current `ginko-cms`:

- `collections`;
- `entries`;
- `entryDrafts`;
- `entryRevisions`;
- `publicEntries`;
- `assets`;
- `contentAssetRefs`;
- `siteData`;
- `cmsSettings`;
- `outboxEvents`;
- `revalidationTargets`;
- `members`;
- `activity`;
- `backupArtifacts`;
- `collectionImportRuns`;
- `destructiveConfirmations`;
- `destructiveAuditLog`.

Adopt from CMS2:

- `agentRuns`;
- `reviewRequests`;
- explicit `auditEvents` actor shape or equivalent richer activity actor data;
- short-lived MCP token fields on `agentRuns`;
- settings policy for AI and MCP.

Challenge:

- `mcpKeys`: delete as default; keep only as explicit automation tokens if
  required.
- `publicRoutes`: keep only if query/index needs justify a separate table.
- broad contract package ownership: move neutral semantics toward Ginko Content
  when practical.

### Final MCP Surface

Default tools:

- `cms.list_collections`
- `cms.get_collection`
- `cms.list_entries`
- `cms.list_tree_entries`
- `cms.get_entry`
- `cms.create_entry_draft`
- `cms.create_tree_page_draft`
- `cms.update_entry_draft`
- `cms.move_tree_entry`
- `cms.preview_publish`
- `cms.request_publish`
- `cms.request_archive`
- `cms.list_review_requests`
- `cms.reject_review_request`
- `cms.get_public_entry`
- `cms.search_public`
- `cms.explain_visibility`
- `cms.propose_refinement`
- `cms.propose_translation`
- `cms.register_asset_metadata`

Not default:

- direct publish;
- direct archive;
- direct delete;
- member management;
- schema mutation;
- raw table access;
- environment/config mutation;
- background job control.

### Final Studio Shape

Keep current:

- standalone Studio bundle if it remains the cleanest package boundary;
- host auth bridge via Better Auth/Convex state;
- typed API boundary;
- asset manager;
- site data;
- imports;
- settings;
- activity;
- advanced editor and autosave.

Adopt from CMS2:

- dashboard lanes;
- agent workspace;
- review requests;
- route readiness;
- translation readiness;
- projection health;
- provider surfaces;
- workflow impact panels;
- AI proposal cards;
- public workflow cards.

Primary editor vocabulary:

- page;
- route;
- locale;
- draft;
- publish;
- public visibility;
- translation;
- asset;
- review request;
- affected pages;
- rollback;
- backup.

Secondary/developer vocabulary:

- projection;
- outbox;
- cache tags;
- contract checksum;
- public row;
- internal id.

## Recommended Migration Path From Current `ginko-cms`

### Phase A: Lock The Target

- [ ] Accept this document as the comparison baseline.
- [ ] Decide whether short-lived delegated MCP tokens replace permanent MCP
      keys by default.
- [ ] Decide whether direct MCP destructive execution is removed from the
      default surface.
- [ ] Decide whether `agentRuns` and `reviewRequests` are added to current
      `ginko-cms`.

### Phase B: Simplify Auth Boundary

- [ ] Add CMS2-style `requireCmsPrincipal(ctx)` for app-facing Convex wrappers.
- [ ] Reduce ordinary user paths to `authUserId`.
- [ ] Keep CMS role checks in Convex component.
- [ ] Stop modeling deploy key as a CMS actor.
- [ ] Keep deploy key only for narrow internal functions.

Verification:

```bash
rg "CmsDeployCaller|kind: 'deploy'|cmsDeployCaller" packages
pnpm run typecheck
vitest run test/component test/runtime
```

### Phase C: Add Agent Runs

- [ ] Add `agentRuns` table.
- [ ] Add delegated capabilities and collection scopes.
- [ ] Add expiry/status/revocation.
- [ ] Add audit actor shape for delegated agents.
- [ ] Add Studio flow to start a delegated run.

Verification:

```bash
vitest run test/component
```

Required tests:

- owner/editor can start allowed runs;
- viewer cannot start write-capable runs;
- expired run fails;
- revoked/completed run fails;
- collection scope is enforced;
- audit distinguishes user and agent.

### Phase D: Rebuild MCP On Delegated Runs

- [ ] Add explicit `api.mcp.*` Convex functions.
- [ ] Resolve bearer token hash inside Convex.
- [ ] Remove normal MCP use of `CONVEX_DEPLOY_KEY`.
- [ ] Delete synthetic MCP Convex identity.
- [ ] Delete `projectTool`.
- [ ] Convert remaining tools to direct `defineMcpTool` handlers.
- [ ] Replace direct destructive tools with preview/request-review tools.

Verification:

```bash
rg "cmsMcpConvexAuthIssuer|createMcpConvexCaller|projectTool|CONVEX_DEPLOY_KEY.*MCP" packages
vitest run test/runtime/mcp-auth-middleware.test.ts test/shared/mcp-tools.test.ts
```

### Phase E: Add Review Requests

- [ ] Add `reviewRequests` if not already present.
- [ ] Implement request publish.
- [ ] Implement request archive.
- [ ] Implement approve/reject.
- [ ] Wire MCP to request flows.
- [ ] Wire Studio publisher review panel.

Verification:

```bash
vitest run test/component test/runtime
```

Required tests:

- agent can request publish but not publish directly;
- publisher can approve;
- editor cannot approve;
- rejected request has no public output effect;
- approved archive/publish uses canonical CMS operation;
- audit records requester, reviewer, and action.

### Phase F: Bring In CMS2 Product UX

- [ ] Add agent workspace.
- [ ] Add review requests panel.
- [ ] Add route readiness panel.
- [ ] Add translation readiness panel.
- [ ] Add projection health panel.
- [ ] Add provider surfaces panel.
- [ ] Add AI proposal UI.

Do this after backend invariants exist. Do not build frontend state machines
that compensate for missing backend guarantees.

### Phase G: Revisit Public Projection Tables

- [ ] Measure whether `publicRoutes` is still required.
- [ ] If not required, collapse route lookup to `publicEntries`.
- [ ] If required, document why and add invariant tests proving rebuildability.

Verification:

```bash
vitest run test/component/diagnostics.test.ts test/shared/contracts.test.ts
```

### Phase H: Merge Content Exchange Language

- [ ] Rename docs and UI so "content exchange" and "backup" are distinct.
- [ ] Preserve external asset URLs on export.
- [ ] Add managed asset byte export modes if missing.
- [ ] Keep backup/restore as operator recovery.

## Decisions To Make Explicit

### Decision 1: Permanent MCP Keys

Recommendation: remove as default.

Reason:

- They are a second auth product.
- They expand credential management.
- CMS2's short-lived delegated run model is safer and simpler.

Keep only if:

- a real external automation workflow cannot use short-lived tokens;
- owner-created automation tokens have expiry, scope, revocation, and audit;
- they do not keep `projectTool` or synthetic MCP identity alive.

### Decision 2: Direct MCP Publish

Recommendation: remove from default MCP surface.

Reason:

- Agents should request publish/archive.
- Human publishers should approve.
- Preview/request-review is easier for clients to use safely than
  `_confirmationToken` execution.

Keep only if:

- a maintainer explicitly decides MCP direct publish is a product requirement;
- tests prove client confirmation, route uniqueness, audit, and token binding;
- direct publish remains disabled by default.

### Decision 3: `publicRoutes`

Recommendation: challenge, do not delete blindly.

Reason:

- CMS2's single `publicEntries` source is simpler.
- Current `publicRoutes` may still be useful for indexed route lookup.

Keep only if:

- query shape or index limitations justify it;
- rebuild invariants are covered;
- docs mark it as derived from canonical content.

### Decision 4: `@lupinum/ginko-cms-contract`

Recommendation: keep short-term, reduce long-term.

Reason:

- It currently stabilizes validators and package boundaries.
- CMS2 correctly points toward Ginko Content owning neutral content contract
  semantics.

Move out only when:

- Ginko Content can own the neutral contract without CMS-specific leakage;
- current package consumers have a clear migration path.

### Decision 5: Standalone Studio SPA

Recommendation: keep for current package.

Reason:

- It protects host apps from Studio internals.
- It avoids treating Studio as host Nuxt app UI.
- Current ADR 0002 still makes sense.

Revisit only if:

- package complexity clearly outweighs isolation benefits;
- the Studio can still avoid SSR/public-site coupling.

## Final Acceptance Criteria

The final CMS architecture is good enough when:

- a clean Nuxt app installs with Convex, Better Auth, Ginko Content, and Ginko
  CMS through one documented path;
- setup writes only minimal host-owned Convex files;
- Better Auth is the only user/session source of truth;
- CMS members are the only CMS product-role source of truth;
- public reads are anonymous and published-only;
- Studio can create/edit/publish/rollback/archive with safe previews;
- assets support upload, metadata, references, deletion, restore, and purge
  gates;
- backup/restore is operator-grade and separate from content exchange;
- MCP uses short-lived delegated runs by default;
- MCP cannot directly publish/archive/delete by default;
- AI creates proposals and canonical draft saves apply them;
- review requests handle agent destructive intent;
- audit distinguishes user, agent, reviewer, deploy/admin, and scheduled
  actions;
- package E2E proves install/build/typecheck/smoke from packed artifacts;
- release verification blocks stale Trellis, bridge, or generic framework
  surfaces.

## Bottom Line

Do not throw away current `ginko-cms`. It is the better release and package
foundation.

Do not ignore `ginko-cms2`. It is the better architecture direction for the
parts where current `ginko-cms` still feels too much like a framework:

- auth;
- MCP;
- agents;
- review requests;
- AI proposals;
- product-facing Studio workflow.

The final product should be current `ginko-cms` with CMS2's simpler product
heart:

```text
current package maturity
+ current content/assets/backups/provider depth
+ CMS2 Better Auth boundary
+ CMS2 delegated MCP/agent model
+ CMS2 review-gated destructive agent flow
+ CMS2 proposal-first AI
- Trellis-shaped generic runtime ceremony
- permanent MCP keys as the default
- direct destructive MCP execution as the default
- generated bridge/wrapper sprawl
```

