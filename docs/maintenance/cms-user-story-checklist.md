# CMS User Story Verification Checklist

Use this checklist to decide what must be verified before a Ginko CMS release or
major migration gate. It is intentionally broader than the latest browser smoke:
some stories are covered by automated tests, some need browser/manual checks,
and some are explicit negative stories that must stay unsupported.

Status legend:

- `[x]` checked in the latest package/browser verification run.
- `[ ]` still needs a focused browser, CLI, API, or MCP check before declaring a
  full release candidate.
- `[n/a]` intentionally unsupported v1 behavior that should be verified as
  absent.

## Package And Install Stories

- [x] A clean consumer can install packed `@lupinum/ginko-cms`,
      `@lupinum/ginko-cms-convex`, and `@lupinum/ginko-cms-contract` artifacts.
- [x] Packed package manifests contain no `workspace:`, `file:`, or `link:`
      dependency specifiers.
- [x] Packed package metadata does not reintroduce a Trellis runtime dependency.
- [x] A clean consumer gets `better-convex-nuxt` as a publishable dependency.
- [x] `ginko-cms init` writes the required Convex setup files in a clean
      consumer.
- [x] `ginko-cms doctor` passes after generated setup is present.
- [x] Generated setup uses the local Better Auth component schema with the MCP
      API-key table.
- [x] Generated setup uses local `convex/betterAuth/*` imports, not the stock
      `@convex-dev/better-auth/convex.config` component import.
- [x] Generated host bridge files for `ginkoCms/*` are present in packed
      artifacts.
- [x] Packed Convex component exports include required host bridge entrypoints
      for MCP credentials, agent runs, and review requests.
- [x] Package imports resolve in a clean consumer after install.
- [x] A clean consumer can run Convex codegen or `convex dev --once` from packed
      artifacts without local workspace assumptions.
- [x] A clean consumer can run the documented production deploy preparation flow
      up to, but not including, live publish/deploy commands.
- [x] Release docs and README install commands match the publishable install
      story.

## Auth And Session Stories

- [x] A user can open the Studio sign-in page.
- [x] A configured test user can sign in through Better Auth.
- [x] A signed-in user lands inside Studio instead of getting stuck on auth.
- [x] A user with invalid credentials sees a clear sign-in failure.
- [x] A signed-out user cannot access protected Studio routes.
- [x] A signed-out user is redirected back to the intended Studio route after
      successful sign-in.
- [x] A user can sign out and loses access to protected Studio routes.
- [x] The first configured owner email can claim initial CMS ownership.
- [x] A non-allowed first-owner email cannot claim ownership.
- [x] Session expiry or invalid session state returns the user to sign-in
      without exposing Studio data.

## Role And Member Stories

- [x] An owner can view CMS member settings.
- [x] An owner can add or update a CMS member role.
- [x] An owner can remove a CMS member.
- [x] A publisher can approve public content changes but cannot manage CMS
      owner-only settings.
- [x] An editor can create and edit drafts but cannot publish.
- [x] A viewer can inspect readable CMS content and diagnostics but cannot write.
- [x] Role changes affect Studio controls after refresh or reactive reload.
- [x] Role downgrades affect MCP authority on the next protected MCP operation.
- [x] Member removal blocks protected Studio and MCP operations.
- [n/a] CMS does not expose a tenant, organization, or workspace management
  story.

## Studio Navigation Stories

- [x] Studio home loads for an authenticated user.
- [x] Content collection list for posts loads.
- [x] Existing entry editor opens.
- [x] Assets view loads.
- [x] Content model view loads.
- [x] Activity view loads.
- [x] Agents view loads.
- [x] Reviews view loads.
- [x] Imports view loads.
- [x] Settings view loads.
- [x] Settings shows Members.
- [x] Settings shows MCP connections.
- [x] Command palette opens and navigates to primary Studio sections.
- [x] Studio handles refresh/deep-link navigation for every primary route.
- [x] Studio shows useful empty states when no content, assets, imports, reviews,
      or agent runs exist.
- [x] Studio shows a useful backend/setup error when Convex or auth config is
      missing.

## Content Model Stories

- [x] A user can view the content model page.
- [x] A user can inspect code-defined collections as read-only truth.
- [x] A user can inspect fields, required fields, localized fields, relations,
      route mode, and public-output metadata for a collection.
- [x] The Studio does not let users mutate schema from the CMS UI.
- [x] The CLI/setup diagnostics explain stale or missing generated content model
      setup.
- [x] Current content model checks fail when generated contracts drift.

## Entry List And Search Stories

- [x] A user can open a collection entry list.
- [x] A user can filter or search entries by supported fields.
- [x] A user can page through a collection with more than one page of entries.
- [x] A user can distinguish draft, published, changed, archived, and public
      state in the list.
- [x] A user can identify locale and translation availability in the list.
- [x] A user with read-only access can open entries without seeing write actions.
- [x] Entry list state remains stable after refresh and navigation back from an
      editor.

## Entry Editing Stories

- [x] A user can open an existing entry editor.
- [x] The editor shows publish or draft controls for an editable entry.
- [x] An editor can create a new entry draft.
- [x] An editor can edit scalar fields and save a draft.
- [x] An editor can edit rich text fields and save a draft.
- [x] An editor can edit localized fields without overwriting other locales.
- [x] An editor can set or change slug/route fields with validation feedback.
- [x] Required-field validation blocks invalid saves or publish attempts.
- [x] Relation-field validation blocks unresolved or invalid references.
- [x] Asset-field validation blocks unresolved or invalid asset references.
- [x] Draft save does not change public output.
- [x] Version history shows draft and published versions.
- [x] A user can restore or compare versions where supported.
- [x] Unsaved changes are not silently lost on navigation.
- [x] Concurrent/stale draft state is detected before publish.

## Publishing And Public Output Stories

- [x] A publisher or owner can preview publish impact before publishing.
- [x] Publish preview lists blockers for required fields, routes, relations,
      assets, locale readiness, and public-output rules.
- [x] Publish preview describes affected pages, SEO, sitemap/search/nav inclusion,
      alternates, redirects, and revalidation facts where applicable.
- [x] Publishing requires explicit confirmation.
- [x] Successful publish creates an immutable published version.
- [x] Successful publish refreshes public projections atomically.
- [x] Failed publish leaves the previous public output active.
- [x] An editor cannot publish directly.
- [x] A viewer cannot publish or draft.
- [x] A publisher or owner can unpublish/archive where the product supports it.
- [x] Public visibility diagnostics explain why an entry is or is not public.
- [x] Public reads use published projection data only.
- [n/a] Public website reads never expose draft content through the public
  provider.

## Site Data Stories

- [x] A permitted user can view site data.
- [x] A permitted user can edit site data drafts.
- [x] Site data validation blocks invalid payloads.
- [n/a] Site data has no separate canonical publish operation in v1; public
  visibility changes revalidate after successful settings writes.
- [x] Read-only users can inspect site data without write controls.

## Asset Stories

- [x] A user can open the Assets view.
- [x] A permitted user can upload an asset.
- [x] Uploaded assets show metadata, preview, and storage status.
- [x] A user can select an asset from an entry field.
- [x] Asset usage is visible before delete or purge.
- [x] Replacing an asset preserves or clearly updates references according to the
      documented behavior.
- [x] Deleting an asset is blocked or warned when active content references it.
- [x] Asset purge requires a valid backup artifact when that safety rule applies.
- [x] Asset restore from backup works for the narrow supported asset-scoped case.
- [x] Public asset URL resolution works for published content.

## Import And Migration Stories

- [x] A user can open the Imports view.
- [x] A user can preview a filesystem import run before applying it.
- [x] Import preview reports unknown collection blockers.
- [x] Import preview reports unknown field blockers.
- [x] Import preview reports unresolved relation blockers.
- [x] Import preview reports missing asset upload blockers.
- [x] Import preview reports invalid route blockers.
- [x] Import preview reports invalid locale blockers.
- [x] Import preview reports publish blockers.
- [x] Applying an import writes only after preview/confirmation succeeds.
- [x] Failed imports do not partially write content.
- [x] Import run history is visible and actionable.
- [x] Migration CLI can run check/dry-run flows without live publish commands.
- [x] Migration recovery docs match actual backup and restore guarantees.
- [n/a] Imports do not create or mutate code-defined schema.

## Backup And Recovery Stories

- [x] An owner-authenticated operator can export a full backup.
- [x] An owner-authenticated operator can export a collection backup.
- [x] An owner-authenticated operator can export an entry backup.
- [x] An owner-authenticated operator can export an asset backup.
- [x] Backup verify reports archive checksum status.
- [x] Backup verify reports whether live data still matches the backup scope.
- [x] Backup download writes a usable artifact.
- [x] Restore preview reports affected tables without writing.
- [x] Restore apply supports only the documented narrow asset-scoped restore.
- [x] Restore apply refuses checksum-mismatched artifacts.
- [x] Restore apply refuses stale artifacts.
- [n/a] The CLI does not claim full table restore/import support.

## Settings Stories

- [x] A user can open Settings.
- [x] Settings shows Members.
- [x] Settings shows MCP connections.
- [x] A permitted user can update supported CMS settings.
- [x] Settings validation blocks invalid webhook and revalidation options.
- [x] Read-only users can view allowed settings without write controls.
- [x] Settings changes are audited or visible in activity where supported.
- [x] Settings copy does not claim unsupported autonomous publish behavior.

## MCP Connection Stories

- [x] A user can create an MCP connection/API key from Studio settings.
- [x] The UI confirms MCP connection creation.
- [x] The created MCP connection appears in Settings.
- [x] Anonymous `/mcp` requests are rejected with `401`.
- [x] MCP initialize succeeds with the created key.
- [x] A user can revoke an MCP connection from Studio settings.
- [x] The UI confirms MCP connection revocation.
- [x] A revoked MCP key is rejected with `401`.
- [x] Raw MCP key material is shown only at creation time and is not persisted in
      CMS state.
- [x] MCP connection settings bind a Better Auth API-key id to CMS scopes,
      optional collection limits, and safety mode.
- [x] Expired or inactive MCP credentials are rejected.
- [x] MCP auth accepts the documented bearer-token shape.
- [x] MCP auth rejects missing keys with redacted failure output.
- [x] MCP auth rejects revoked keys with redacted failure output.
- [x] MCP auth rejects unknown keys with redacted failure output.
- [x] MCP auth rejects malformed keys with redacted failure output.
- [x] MCP auth rejects expired keys with redacted failure output.
- [x] MCP auth does not double-count rate limits for one request.

## MCP Tool Stories

- [x] A real MCP client or SDK can list CMS tools.
- [x] MCP can list collection contracts.
- [x] MCP can inspect a collection contract.
- [x] MCP can list entries for an allowed collection.
- [x] MCP can search public/readable content.
- [x] MCP can read an entry.
- [x] MCP can create an entry draft when role and scope allow it.
- [x] MCP can save a draft when role and scope allow it.
- [x] MCP draft writes require an active agent run.
- [x] MCP can inspect assets and resolve public asset URLs.
- [x] MCP can preview publish impact.
- [x] MCP can request publish review.
- [x] MCP can inspect own agent runs and review status.
- [x] MCP responses redact secret-bearing fields and Convex creation metadata.
- [x] MCP denial output names the tool/action reason without leaking secrets.
- [x] Completed, revoked, failed, or expired agent runs cannot keep writing.
- [n/a] MCP does not expose raw table reads.
- [n/a] MCP does not expose schema mutation.
- [n/a] MCP does not expose member management.
- [n/a] MCP does not expose settings management.
- [n/a] MCP does not expose deploy/admin tools.
- [n/a] MCP does not expose direct delete, purge, or direct publish as v1
  defaults.
- [n/a] MCP tools do not accept authority inputs such as `authUserId`,
  `memberId`, role, token hash, or organization.

## Agent Run And Review Stories

- [x] A user can open the Agents view.
- [x] A user can open the Reviews view.
- [x] An MCP draft-write operation creates or uses an active agent run.
- [x] Agent run detail shows delegated user, credential, requested scopes, safety
      mode, expiry, and write timestamps.
- [x] An agent can prepare a draft without changing public output.
- [x] An agent can request publish review after previewing publish impact.
- [x] Publishers and owners can see pending review requests.
- [x] Editors and viewers cannot approve review requests.
- [x] Review approval re-checks current reviewer role.
- [x] Review approval re-checks stale draft/version state.
- [x] Review approval calls the canonical backend publish operation.
- [x] Review rejection has no public-output effect.
- [x] Stale review requests are clearly marked.
- [x] Trusted direct execution metadata does not grant direct publish/delete/purge
      in v1.
- [n/a] Autonomous direct publish is not a v1 default.

## Activity And Audit Stories

- [x] A user can open the Activity view.
- [x] Content draft, publish, import, backup, MCP, and review operations produce
      useful activity records where supported.
- [x] Activity can be filtered or inspected enough to diagnose recent changes.
- [x] Activity records identify the acting user or delegated agent run.
- [x] Sensitive token/key material is never displayed in activity.
- [x] Failed or denied operations produce useful diagnostics without leaking
      secrets.

## Public Website And API Stories

- [x] Public provider reads published projection data only.
- [x] Public API returns published entries and public metadata for valid routes.
- [x] Public API returns missing/not-public diagnostics for unpublished content.
- [x] Public navigation reflects published content only.
- [x] Public search reflects published content only.
- [x] Sitemap output reflects published content only.
- [x] Locale alternates and fallback behavior match the content contract.
- [x] Public cache/revalidation behavior runs after successful publish only.
- [x] Public reads do not require Studio authentication.
- [x] Draft/private CMS data is not exposed through public endpoints.

## CLI Stories

- [x] `ginko-cms doctor` passes in a configured packed consumer.
- [x] `ginko-cms mcp-doctor` reports MCP setup status accurately.
- [x] `ginko-cms push --check` validates generated contracts without writing.
- [x] `ginko-cms migrate` supports dry-run/check mode before apply.
- [x] CLI errors name the exact package, manifest field, setup file, or config
      value that caused the failure.
- [x] CLI output redacts secrets and bearer tokens.
- [x] CLI does not require Trellis packages or Trellis runtime metadata.
- [x] CLI does not run live publish commands during verification flows.

## Trellis Removal And Architecture Stories

- [x] Package metadata and runtime dependencies do not reintroduce Trellis.
- [x] No active Trellis runtime path remains.
- [x] No old and new MCP authority paths remain side by side.
- [x] No old `mcpKeys` token lifecycle remains active beside Better Auth API keys.
- [x] No `projectTool` or generic admin MCP runtime remains.
- [x] CMS domain policy stays in the CMS package or Convex component.
- [x] Bridge files remain transport/setup glue, not business logic.
- [x] There is one source of truth for identity, CMS role, and MCP authority.

## Visual And UX Regression Stories

- [x] Sign-in screenshot captured.
- [x] Studio home screenshot captured.
- [x] Entry editor screenshot captured.
- [x] Settings before MCP action screenshot captured.
- [x] Settings after MCP revoke screenshot captured.
- [x] In-app browser Settings screenshot captured.
- [x] In-app browser sign-in-after-sign-out screenshot captured.
- [x] Screenshots cover owner, publisher, editor, and viewer role differences.
- [x] Screenshots cover empty, loading, error, and denied states.
- [x] Mobile or narrow viewport layout is checked for primary Studio routes.
- [x] Text does not overlap or overflow in navigation, toolbar, settings, editor,
      review, and MCP connection views.
- [x] Destructive actions have clear preview/confirmation states.

## Verification Log

Dated browser screenshots, temporary evidence paths, and exact command logs live in [cms-user-story-verification-log.md](./cms-user-story-verification-log.md). Keep this checklist as the stable release story catalog.

The live browser/MCP harness is manual and requires an explicit running
consumer:

```bash
CMS_STORY_BASE_URL=https://cms.example.test \
  GINKO_CMS_TEST_EMAIL=owner@example.test \
  GINKO_CMS_TEST_PASSWORD=... \
  pnpm run smoke:live-stories
```

Set `CMS_STORY_OUTPUT` only when a run should write JSON evidence.
