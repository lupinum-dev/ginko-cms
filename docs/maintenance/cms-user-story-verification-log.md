# CMS User Story Verification Log

This log contains dated verification evidence for the stable story catalog in [cms-user-story-checklist.md](./cms-user-story-checklist.md). It can reference local screenshots, temporary JSON evidence, and exact commands from individual runs.

## Latest Verified Slice

On 2026-07-05, `pnpm run smoke:live-stories` passed against the rebuilt packed
consumer at `http://localhost:9999`. The JSON evidence was written to
`/tmp/ginko-live-story-smoke.json` and covered 32 harness stories:

- signed-out protected-route enforcement;
- invalid sign-in failure;
- valid sign-in redirect;
- Studio home deep link;
- posts collection list;
- assets deep link;
- content model deep link;
- activity deep link;
- agents deep link;
- reviews deep link;
- imports deep link;
- site data deep link;
- settings deep link;
- code-defined read-only content model contracts;
- Site Data view and empty/block-list state;
- command palette navigation to Assets;
- entry list public-state and locale-readiness labels;
- entry list search/filter by title, slug, or path;
- entry editor draft/publish controls;
- public API list using published data only;
- public API navigation using published data only;
- public API search using published data only;
- public API sitemap using published data only;
- public API missing-query validation;
- unauthenticated `/mcp` rejection;
- malformed `/mcp` auth rejection without header reflection;
- unknown MCP bearer-key rejection without key reflection;
- MCP connection create;
- authenticated MCP initialize;
- raw MCP key visible at creation and hidden after Settings reload;
- MCP `tools/list`;
- MCP `list-collections`;
- MCP `get-collection`;
- MCP `list-entries`;
- MCP `get-entry`;
- MCP public `list`;
- MCP public `search`;
- MCP revoke;
- revoked-key rejection;
- Studio sign-out and protected-route access loss.

An in-app browser pass also verified Settings after sign-in/session reuse and
sign-in after sign-out. Screenshots were written to
`/tmp/ginko-iab-settings.png` and `/tmp/ginko-iab-signin-after-signout.png`.

The package slice was refreshed with `pnpm run package:e2e`; it rebuilt the
tarballs, checked packed manifests, installed a clean consumer, ran `ginko-cms
init`, ran `ginko-cms doctor`, prepared the Nuxt/Convex consumer surface without
live deploy, and verified package imports.

Screenshots from earlier runs were written to `/tmp/ginko-final-*.png` and
`/tmp/ginko-live-*.png`.

## Latest Browser Role Slice

On 2026-07-05, the packed consumer was rebuilt and checked with browser
contexts for owner, publisher, editor, viewer, and invalid-session access:

- `pnpm run package:e2e`
- `pnpm install --force` in the clean test consumer
- `pnpm run build` in the clean test consumer
- `PORT=9999 HOST=127.0.0.1 node .output/server/index.mjs`

The browser pass verified:

- owner can see entry creation, save, publish, and owner-only Settings controls;
- publisher can create, save, and publish entries but cannot see owner-only
  Settings write controls;
- editor can create and save entries but cannot see publish controls or
  owner-only Settings write controls;
- viewer can list and open readable entries without seeing New entry, Save
  draft, Publish, Choose asset, or owner-only Settings write controls;
- invalid session state returns to the sign-in form without exposing protected
  Studio data.

The JSON evidence was written to `/tmp/ginko-role-evidence-final.json`.
Screenshots were written to:

- `/tmp/ginko-role-owner-list-final.png`
- `/tmp/ginko-role-owner-entry-final.png`
- `/tmp/ginko-role-owner-settings-final.png`
- `/tmp/ginko-role-publisher-list-final.png`
- `/tmp/ginko-role-publisher-entry-final.png`
- `/tmp/ginko-role-publisher-settings-final.png`
- `/tmp/ginko-role-editor-list-final.png`
- `/tmp/ginko-role-editor-entry-final.png`
- `/tmp/ginko-role-editor-settings-final.png`
- `/tmp/ginko-role-viewer-list-final.png`
- `/tmp/ginko-role-viewer-entry-final.png`
- `/tmp/ginko-role-viewer-settings-final.png`
- `/tmp/ginko-state-invalid-session-signin-final.png`

## Latest Browser State And Safety Slice

On 2026-07-05, the packed consumer was rebuilt after fixing member removal to
use the existing preview/confirmation token path. Current verification passed:

- `pnpm exec vue-tsc -p packages/cms/studio-app/tsconfig.json --noEmit`
- `pnpm exec oxfmt --check packages/cms/studio-app/src/composables/internal/useStudioSettingsAdmin.ts`
- `pnpm run package:e2e`
- `pnpm install --force` in the clean test consumer
- `pnpm run build` in the clean test consumer
- `pnpm exec vitest run test/module/module-bridge.test.ts test/runtime/cms-studio-query.test.ts`
- `pnpm exec vitest run test/component/members-crud.test.ts test/component/mcpCredentials.test.ts`

The browser pass verified:

- editor role changes take effect after refresh and restore without stale write
  controls;
- removing a member through Settings blocks that signed-in user from protected
  Studio routes after refresh, then restoring the same user id restores access;
- owner asset upload registers a new uploaded PNG in the asset manager;
- dirty entry edits show the unsaved-changes dialog, cancel keeps the user on
  the editor route, and explicit confirmation allows navigation;
- live empty states render for Agents, Reviews, and Site Data;
- loading, error, and denied states have screenshot coverage.

Evidence was written to:

- `/tmp/ginko-role-change-refresh-evidence.json`
- `/tmp/ginko-member-removal-evidence.json`
- `/tmp/ginko-asset-upload-evidence.json`
- `/tmp/ginko-unsaved-navigation-evidence.json`
- `/tmp/ginko-empty-state-evidence.json`
- `/tmp/ginko-error-state-evidence.json`

Screenshots were written to:

- `/tmp/ginko-role-change-editor-as-viewer-refresh.png`
- `/tmp/ginko-role-change-editor-restored-refresh.png`
- `/tmp/ginko-member-removal-viewer-forbidden.png`
- `/tmp/ginko-member-removal-viewer-restored.png`
- `/tmp/ginko-asset-upload-smoke.png`
- `/tmp/ginko-unsaved-navigation-dialog.png`
- `/tmp/ginko-unsaved-navigation-after-confirm.png`
- `/tmp/ginko-empty-agents.png`
- `/tmp/ginko-empty-reviews.png`
- `/tmp/ginko-empty-site-data.png`
- `/tmp/ginko-loading-preparing-studio.png`
- `/tmp/ginko-error-invalid-collection.png`

## Latest Browser Mobile Slice

On 2026-07-05, the packed consumer was rebuilt and checked in the in-app browser
at a 390 x 844 mobile viewport:

- `pnpm run package:e2e`
- `pnpm install` in the clean test consumer
- `pnpm build` in the clean test consumer
- `PORT=9999 HOST=127.0.0.1 node .output/server/index.mjs`

The browser pass verified signed-in Studio access at `http://localhost:9999`
and checked these primary routes:

- `/studio/`
- `/studio/content/posts`
- `/studio/assets`
- `/studio/agents`
- `/studio/reviews`
- `/studio/imports`
- `/studio/settings`

That pass found and fixed a real mobile Dashboard layout bug. The root causes
were the shared scroll-area wrapper allowing min-content flex expansion, the
Dashboard grid column inheriting width from a wide inventory table, and page
header actions refusing to wrap. The final measurements showed
`documentElement.scrollWidth === innerWidth === 390` on all checked routes.
Remaining wide elements are table contents inside internal horizontal scroll
regions, not page-level layout expansion.

Screenshots were written to:

- `/tmp/ginko-iab-mobile-home-verified.png`
- `/tmp/ginko-iab-mobile-posts-verified.png`
- `/tmp/ginko-iab-mobile-assets-verified.png`
- `/tmp/ginko-iab-mobile-agents-verified.png`
- `/tmp/ginko-iab-mobile-reviews-verified.png`
- `/tmp/ginko-iab-mobile-imports-verified.png`
- `/tmp/ginko-iab-mobile-settings-verified.png`

## Latest Browser Owner Slice

On 2026-07-05, the packed consumer was started with:

- `PORT=9999 HOST=127.0.0.1 node .output/server/index.mjs`

Browser login succeeded at `http://localhost:9999/studio/` with the consumer's
configured test owner. A first attempt on `http://127.0.0.1:9999` correctly
failed with Better Auth `Invalid origin`, so the verified browser origin is
`localhost`.

The browser pass checked these owner routes at 1440 x 1000:

- `/studio/`
- `/studio/settings`
- `/studio/content/blog/new`
- `/studio/content/posts`
- `/studio/content/posts/k57emvajwf1zhns7pwmm0fayhn874dj0`
- `/studio/model`

That slice proves:

- owner login works on the configured origin;
- owner dashboard, Settings, new-entry editor, and Content model render without
  page-level horizontal overflow;
- Settings exposes owner-only member, MCP, revalidation, locale, and
  configuration controls;
- the new-entry editor shows create/publish controls, locale state, draft setup,
  slug generation, scalar fields, rich text controls, and no desktop toolbar
  overflow;
- the posts entry list keeps the expected entry visible after opening an editor
  and reloading the list route;
- the Content model page exposes code-defined collection fields, required and
  localized markers, relation/public-output language, route settings, SEO,
  sitemap/search/navigation participation, and import metadata.

Screenshots were written by the browser tool to:

- `/tmp/ginko-owner-dashboard-2026-07-05.png`
- `/tmp/ginko-owner-settings-2026-07-05.png`
- `/tmp/ginko-owner-new-entry-editor-2026-07-05.png`
- `/tmp/ginko-owner-posts-list-2026-07-05.png`
- `/tmp/ginko-owner-content-model-2026-07-05.png`

## Latest MCP Auth, Activity, And Settings Slice

On 2026-07-05, focused MCP auth, credential, activity, settings, review, and
asset checks passed:

- `pnpm exec vitest run test/runtime/mcp-auth-middleware.test.ts test/runtime/better-auth-api-key-gate.test.ts test/runtime/mcp-response-redaction.test.ts test/component/agentRuns.test.ts test/component/mcpCredentials.test.ts test/component/entries/read.test.ts test/component/reviewRequests.test.ts test/component/assets.test.ts test/component/settings.test.ts`
- `pnpm exec vitest run test/component/agentRuns.test.ts`
- `pnpm exec vitest run test/runtime/mcp-response-redaction.test.ts test/runtime/mcp-auth-middleware.test.ts test/component/settings.test.ts`
- `pnpm exec vitest run test/shared/mcp-tools.test.ts test/runtime/mcp-runtime.test.ts`
- `pnpm exec vitest run test/module/package-boundaries.test.ts`
- `pnpm exec oxfmt --check test/runtime/mcp-auth-middleware.test.ts test/component/agentRuns.test.ts`

That slice proves:

- Better Auth deleted/expired API keys and inactive or revoked CMS credential
  settings are rejected before protected MCP access;
- MCP auth failure messages and limiter storage do not include raw bearer-token
  material;
- MCP denied-tool output includes the capability/action reason while redacting
  secret-bearing detail fields;
- each failed MCP auth request records one failure per limiter bucket before the
  sixth matching request is rate-limited;
- MCP credential access is recomputed from the current CMS member role and
  revoked when a member is removed;
- MCP asset URL resolution returns only active readable asset URLs and rejects
  unbounded requests;
- the documented root, quickstart, CMS package, Convex package, and Trellis-era
  migration install commands use publishable package specs;
- agent-run details expose delegated user, credential id, requested credential
  scopes, safety mode, expiry, and last-write timestamps; writes are listed in
  activity with the acting user, delegated run, operation id, and credential id
  rather than raw key material;
- publishers and owners can inspect pending review status, while editors cannot.
- the MCP tool surface exposes preview/review workflows without default direct
  publish, delete, purge, or raw confirmation-token tools.
- package-boundary checks keep domain policy out of host bridge files, forbid
  reverse package dependencies, and restrict Studio global bridge reads to
  boundary modules;
- Convex identity resolution uses Better Auth user identity plus optional API-key
  session id as the single source for user, role, and MCP authority.

## Latest Editor, Publish, And Import Slice

On 2026-07-05, focused editor, publish-impact, import, and workflow component
checks passed:

- `pnpm exec vitest run test/component/entries/draft.test.ts test/component/entries/tree.test.ts test/component/entries/publish.test.ts test/component/diagnostics.test.ts test/component/import.test.ts test/runtime/studio-workflow-components.test.ts`

That slice proves:

- entry create, scalar draft save, rich-text draft save, shared slug save, and
  localized draft save all write canonical draft state without creating publish
  revisions;
- localized entry variants keep per-locale draft and published data separate;
- publish impact reports required-field blockers, route collisions, route/SEO
  effects, redirect effects for stable slugs, and data-only output warnings;
- import preview/apply blocks invalid collection fields, missing relation
  targets, invalid route paths, invalid/unsupported locales, unresolved assets,
  and publish-blocking changes before writing;
- Studio workflow components render route validation states, translation
  readiness blockers, and disabled publish confirmations until a fresh
  confirmation token is available.
- content create/publish, import runs, backup restore/delete, MCP agent writes,
  and review approval/rejection all have focused activity-source coverage.

## Latest Settings And Site Data Slice

On 2026-07-05, focused settings and site-data checks passed:

- `pnpm exec vitest run test/component/settings.test.ts test/component/site-data.test.ts`
- `pnpm exec vitest run test/component/site-data.test.ts`
- `pnpm exec vitest run test/component/settings.test.ts test/component/revalidation.test.ts`
- `rg -n "autonomous|auto[- ]?publish|automatically publish|direct publish|publish automatically|publish without" packages/cms/studio-app packages/cms/src/public/locales docs -g '*.vue' -g '*.ts' -g '*.md'`
- `pnpm exec oxfmt --check test/component/settings.test.ts`

That slice proves:

- owners can update supported settings fields and the settings mutation writes a
  `settings.updated` activity record;
- read-only viewers get only sanitized Studio settings and cannot read full
  owner settings;
- invalid webhook URLs, raw API-key payloads, and raw webhook secrets are
  rejected at the mutation boundary;
- invalid local/public revalidation endpoints are rejected unless explicitly
  allowed by development or hostname allow-list configuration;
- Settings UI copy does not claim autonomous/direct publish behavior; the only
  matching docs state that direct publish/delete/purge is unsupported in v1;
- site data enforces localized versus non-localized shape, JSON-only payloads,
  public revalidation enqueueing, and one-use destructive confirmations;
- read-only users can list and inspect site data blocks but cannot create, save,
  change visibility, or preview delete operations, and the Studio site-data page
  hides write controls for users without settings management.

## Latest CLI Diagnostics Slice

On 2026-07-05, focused CLI, bridge, and package diagnostics checks passed:

- `pnpm exec vitest run test/module/ginko-cli.test.ts test/module/module-bridge.test.ts test/module/package-exports.test.ts`
- `pnpm run check:publish-specifiers`

That slice proves:

- stale generated bridge files and missing direct setup files fail with exact
  file paths and cleanup guidance;
- missing direct package dependencies name the exact package;
- collection contract drift reports the affected collection and
  migration-required guidance;
- packed-manifest specifier checks reject local `workspace:`, `file:`, and
  `link:` fields with the offending package and manifest field.

## Latest CLI And Architecture Slice

On 2026-07-05, focused CLI and architecture checks passed:

- `pnpm exec vitest run test/module/ginko-cli.test.ts`
- `pnpm exec vitest run test/module/ginko-cli.test.ts test/shared/mcp-tools.test.ts test/module/package-boundaries.test.ts test/runtime/mcp-response-redaction.test.ts`
- `pnpm run check:convex-surface`
- `pnpm run check:stale-surfaces`
- `pnpm exec oxfmt --check packages/cms/src/cli/ginko-cms.ts test/module/ginko-cli.test.ts`

That slice proves:

- top-level CLI errors redact `.env.local` deploy keys and bearer-shaped MCP
  tokens;
- `mcp-doctor`, `push --check`, `deploy --check`, and migration plan flows are
  covered by focused tests;
- active MCP tools no longer use `projectTool`;
- generated setup no longer writes legacy `mcpKeys` files;
- active checked source does not use Trellis aliases or runtime imports.

## Latest Backup Slice

On 2026-07-05, focused backup checks passed:

- `pnpm exec vitest run test/module/ginko-cli.test.ts`
- `pnpm exec vitest run test/module/ginko-cli.test.ts test/component/backup.test.ts`
- `pnpm exec vitest run test/component/backup.test.ts`

That slice proves:

- CLI backup export calls the installed backup API for full, collection, entry,
  and asset scopes;
- CLI backup download writes the archive JSON to disk;
- backup verify reports checksum and current-data match status;
- restore preview reports affected tables without writing;
- restore apply is limited to the documented asset-scoped restore path, with
  full restore blocked.
- migration recovery, Trellis-era migration, release-candidate, and backup docs
  describe backups as owner-authenticated recovery artifacts, not automatic full
  rollback/import support.

## Latest MCP And Review Slice

On 2026-07-05, focused MCP write, agent-run, and review checks passed:

- `pnpm exec vitest run test/component/entries/draft.test.ts test/component/agentRuns.test.ts test/component/reviewRequests.test.ts test/runtime/mcp-preview-publish.test.ts test/runtime/mcp-request-publish-review.test.ts test/shared/mcp-tools.test.ts test/runtime/mcp-response-redaction.test.ts`
- `pnpm exec vitest run test/component/reviewRequests.test.ts`

That slice proves:

- explicit `mcpCreateEntry` and `mcpSaveEntryDraft` component wrappers require
  and use an active `agentRunId`;
- completed, revoked, and expired agent runs reject subsequent write recording;
- MCP draft writes do not change public projection rows;
- MCP publish preview returns diagnostics without public-output side effects;
- MCP publish-review creation previews impact first, creates a pending human
  review request, and does not publish;
- review approval rejects stale draft versions and routes approved publishes
  through the canonical publish operation;
- pending review lists mark stale requests with the current draft-version reason
  before approval;
- review rejection leaves public output unchanged;
- response redaction removes secret-bearing fields and Convex creation metadata.

## Latest Role And Member Slice

On 2026-07-05, focused role and member checks passed:

- `pnpm exec vitest run test/component/auth/members.test.ts test/component/auth/access-context.test.ts test/component/members-crud.test.ts test/component/settings.test.ts`
- `pnpm exec vitest run test/component/reviewRequests.test.ts`

That slice proves:

- first-owner bootstrap creates exactly one owner and validates the configured
  owner email;
- owner-only member add, role update, and confirmed removal work;
- owner, publisher, editor, and viewer roles map to the expected permission
  matrix;
- MCP access context derives effective permissions from the Better Auth API-key
  id, credential settings, configured scopes, and current CMS member role;
- publisher and owner callers can inspect pending publish reviews;
- editor and viewer callers cannot approve publish reviews;
- viewers only receive sanitized settings reads, while full settings reads stay
  owner-only.

## Latest Publish, Public API, And Import Slice

On 2026-07-05, focused publish, public API, import, revalidation, versioning, and
site-data checks passed:

- `pnpm exec vitest run test/component/entries/publish.test.ts test/component/diagnostics.test.ts test/component/public-api.test.ts test/component/import.test.ts test/component/revalidation.test.ts test/component/entries/read.test.ts test/component/entries/versioning.test.ts`
- `pnpm exec vitest run test/component/site-data.test.ts`

That slice proves:

- publish execution requires a confirmation token and rejects stale draft
  versions;
- successful publish writes immutable versions, active public projections, and
  pending revalidation events;
- draft saves leave active public projection rows unchanged, and a confirmed
  publish that becomes blocked before execute leaves the previous public output
  active;
- unpublish and archive clear public entry state through the shared transition
  flow;
- public visibility diagnostics cover required fields, route collisions, broken
  relations, data-only output, invalid entries, and old-route redirects;
- public page/list/nav/search/sitemap reads come from published projections,
  including locale fallback rules and hidden-field exclusion;
- Studio entry lists and activity feeds paginate with cursors;
- import preview/apply report unknown collections, unmapped fields, unresolved
  relations, and unresolved assets without partial writes;
- import run history records status, source metadata, and per-entry diffs;
- site data writes validate public JSON boundaries.

## Latest MCP Credential And Asset Slice

On 2026-07-05, focused MCP credential, asset, storage maintenance, and backup
checks passed:

- `pnpm exec vitest run test/component/mcpCredentials.test.ts test/runtime/mcp-auth-middleware.test.ts test/runtime/mcp-runtime.test.ts test/component/assets.test.ts test/component/storage-maintenance.test.ts test/component/backup.test.ts`
- `pnpm exec vitest run test/component/agentRuns.test.ts test/component/mcpCredentials.test.ts test/runtime/mcp-auth-middleware.test.ts test/component/assets.test.ts test/component/backup.test.ts`
- `pnpm exec vitest run test/component/assets.test.ts`

That slice proves:

- MCP credential access is resolved from active credential settings, current
  member role, configured scopes, and matching Better Auth API-key id;
- member removal revokes that member's MCP credential settings;
- completed, revoked, failed, and expired agent runs reject subsequent writes;
- asset manager reads include metadata, storage state, and usage;
- entry draft asset selections create content asset refs, and replacing the
  selected asset updates refs to the replacement without leaving stale draft
  references;
- active asset URL resolution excludes deleted or malformed asset ids;
- referenced asset delete/purge flows surface blockers or warnings;
- asset purge requires a matching, current backup artifact;
- stale or wrong-scope backup artifacts are refused for purge;
- the supported asset-scoped restore path can dry-run and apply from a verified
  backup artifact.
