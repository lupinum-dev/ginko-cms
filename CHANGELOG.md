# Changelog

## Unreleased

### Added

- Studio: archived entries can be restored — the archived notice gains a
  "Restore draft" action and the entry-actions menu offers Restore instead of
  Archive on archived entries (`restoreEntry` joined the Studio API surface).
- Studio: work-queue deep links — collection lists read and mirror
  `?status=` / `?work=` / `?q=`, Home's queue rows link to pre-filtered
  lists, and Home gains a "New content" primary action (plus a guided
  "Create your first content" empty state on first run).
- Studio: writing surface — the entry title renders as a large borderless
  heading with the description as a quiet subtitle (per locale pane in
  compare mode); the URL block and shared metadata move below the content,
  and the shared panel hides itself when the hero absorbed everything.
- Studio: the status rail's next step is a real button when actionable
  (focus the missing field, switch locale, open reviews, run route checks,
  or open the publish preview through the standard flow).
- `createEntry` accepts an explicit `bodyMdc` argument; rich-text content
  sent inside the localized values map by older callers is lifted onto the
  draft body column instead of being stranded where no reader looks.

### Fixed

- Asset uploads (and every other component action: backups, portability)
  work again: Convex does not propagate user auth into component actions,
  so host-app facades now forward a `_trustedCaller` resolved from their own
  `ctx.auth`; component actions accept it only when `ctx.auth` is empty and
  MCP callers are still re-validated against stored credentials. Consumer
  facades regenerated from the templates pick this up automatically.
- `ginko-cms push` works against fresh component builds again — the
  component entrypoint list was missing `policy.js`, so
  `checkCmsPolicy`/`installCmsPolicy` never deployed.
- Tree collections: the "Parent" select on the new-entry page never opened
  (reka-ui rejects empty-string SelectItem values); nested entries can now
  be created through the UI.
- Status pill tones derive from readiness state codes instead of comparing
  localized labels — non-English Studios show correct tones, and plain
  drafts render neutral instead of warning.
- Activity rows store the actor's display name at write time (rename-stable
  audit trail); legacy rows still resolve at read time.
- Playground public pages and live-story checks now use the Ginko Content
  engine instead of the removed `/api/ginko/v1` facade; CMS-backed navigation
  and search also honor the component's public argument and limit contracts.
  Provider failures now remain 5xx errors instead of masquerading as empty
  lists or missing posts.
- MCP invalid-credential limiting is atomic in Convex while retaining the
  real client IP at the Nuxt boundary; signed host calls reject replay,
  tampering, and stale requests, and expired-bucket cleanup no longer
  contends with authentication transactions.
- Draft route ownership is validated through indexed effective siblings for
  saves, moves, locale creation, and published-state reverts. Parent/slug
  precedence now has one canonical implementation, including the distinction
  between no parent override and an explicit move to root.
- Asset-manager relationship reads use focused per-locale title resolution
  and deduplicate shared/locale metadata work instead of constructing full
  Studio draft views for every referenced entry.

### Changed

- Studio i18n is complete: Media (asset browser family), Home, Site-wide
  content, Content setup, and the new-entry URL block are fully translated
  (≈200 new keys per pack, en/de parity enforced).
- Studio dark mode gains a real elevation ladder — popovers/menus/selects
  AND dialogs sit on `--popover` at `oklch(0.269 0 0)` above cards (0.205),
  hover fills at 0.371. Consumer note: dialogs are now themed through
  `--ginko-cms(-dark)-popover` instead of the background token. Tinted
  semantic surfaces carry `dark:` opacity bumps.
- Studio motion is tokenized: structural panels share `--motion-panel`
  (240ms, fixes the sidebar/inset timing seam), sheets slide at
  `--motion-slow` (was 500ms), pages crossfade opacity-only, and
  `prefers-reduced-motion` zeroes every motion token (1ms) globally.

- Studio design review (simplification + shadcn fidelity, follows the shell
  migration). Highlights: in-card layouts now respond to their container
  (`@container` queries) instead of the viewport, so forms and lists never
  crush beside an open details panel; the content list is title-first with a
  column set that cannot collapse; Home states each queue once (zero-count
  queues hide, the publishing-path diagram and duplicate sections are gone,
  Home is a discrete sidebar item again); the editor's details panel opens at
  the compact 320px width, its top-bar primary action is a stable
  "Publish {locale}" (blockers are explained in the dialog, which now leads
  with the blocked/ready verdict), and the six-step workflow/track cards sit
  behind the Advanced-details toggle; single-language sites see no
  translation machinery anywhere; Media has one Library navigation section
  and on-demand filters; Content setup consolidates its developer facts into
  one Advanced-details block; the Activity log shows collection/entry/actor
  display names instead of raw document ids (and its entry links now
  actually resolve); Settings → Appearance is Theme + five curated accents
  (Type and Corners pickers removed; stored preferences still apply and can
  be reset); page-header eyebrows are gone. Full findings and rationale:
  `studio-design-review.md`.
- Studio layout usage (Phase L): ultra-wide viewports clamp the content card
  at `--studio-content-max` (new public override
  `--ginko-cms-studio-content-max`, default 105rem) and center the
  card/panel pair; detail panels can register `compact` to keep the 320px
  metadata width on laptop viewports; `StudioSplitPane` is the sanctioned
  in-card scoped-navigation pattern (resizable, persisted, collapses below
  md). The in-card action rail is fully retired in favor of right-sidebar
  panels — the `--studio-action-rail-*` public override tokens are removed
  (consumer-contract change; they no longer style anything).

- Migrated the Studio UI onto the shadcn dashboard shell (template parity):
  new sticky global header with breadcrumbs, template-structured sidebar
  (icon-collapse, mobile Sheet), and a resizable right sidebar that now hosts
  the entry editor's Status / Workflow / History details (replacing the
  editor's action rail), plus asset and review detail panels. Publish stays
  canonical in the entry top bar; the panel adds a contextual trigger driving
  the same dialog. Toggle with the header button or Cmd/Ctrl+Period; panel
  open state and width persist per browser.
- Refreshed all vendored shadcn ui primitives to the current template
  snapshot and added breadcrumb, kbd, popover, resizable, table, and tabs
  sets. Deliberate Studio customizations (button motion/density system, badge
  variants, testids) are preserved and documented per set.
- Merged the template's design tokens and theme system: 10 accent color
  themes, mono/scaled type variants, and radius variants, selectable in the
  new Settings → Appearance section (persisted per browser in localStorage).
  All tokens remain overridable through the existing `--ginko-cms-*` consumer
  contract, which gained `--header-height`, `--surface`, and
  `--surface-foreground`. `tw-animate-css` is now bundled (compiled fully
  under the `ginko` prefix; built CSS +3KB gzipped). The Studio now ships
  Geist and Geist Mono (self-hosted woff2) and renders in the template's
  inset layout: the content area floats as a rounded card on a
  sidebar-colored canvas.
- Fixed `convex dev` pushes failing with "BETTER_AUTH_SECRET is required":
  module analysis runs without deployment env vars, so the import-time check
  became a lazy resolver that stays fail-closed (a missing secret yields an
  unverifiable per-isolate value instead of breaking every push).

- Made Studio authentication mandatory. Hosts using the unsupported
  `convex.auth: false` topology must configure Better Convex Nuxt
  authentication before upgrading.
- Convex JWTs now carry a server-issued `ginkoCredentialKind` claim so browser
  sessions and Better Auth API-key sessions have disjoint, fail-closed CMS
  authority.
- Added explicit backup and portability permission keys. Backup and owner
  diagnostics now use permission-bearing guards on direct Convex callables.
- Migrated the Nuxt provider and public Convex reads to Ginko Content Wire V2
  with `@lupinum/ginko-content@0.3.0`; V1 provider payloads are no longer
  accepted.
- Upgraded the Nuxt integration baseline to `better-convex-nuxt@0.6.0` (the
  vNext public surface) and `@convex-dev/better-auth@0.12.5`, collapsing the
  prior dual `0.12.2`/`0.12.5` resolution to a single copy.
- Adopted `serverConvex(event, options)` as the only server call API,
  replacing the removed `serverConvexQuery`/`serverConvexMutation`/
  `serverConvexAction` functions everywhere in the CMS server runtime (MCP
  middleware, public API routes, and the event-backed `nuxt-provider.mjs`
  data helpers).
- Adopted `useConvexAuth()`'s vNext `status`/`ready()` contract in the auth
  components, `useCmsAuthState`, and `studio-host.vue`; sign-in/sign-up no
  longer call a manual `refreshAuth()` since `signIn`/`signUp` synchronize
  Convex automatically.
- Added `packages/cms/src/runtime/convex-auth.ts`, a `defineConvexAuthClient`
  definition registering the `@better-auth/api-key` client plugin, consumed
  through `better-convex-nuxt`'s `auth.client` module option with
  host-definition precedence.
- Narrowed the Studio host bridge to a single `convexClient` handle
  (`ConvexClientHandle`) and dropped the raw `nuxtApp`, `convexUrl`, and
  `getAuthToken`/JWT-bearing fields; the Studio SPA can no longer observe the
  Convex JWT or reach unlisted API functions.
- Replaced ad hoc transport-envelope/JSON/message-substring error
  classification in Studio (`useCmsStudioQuery.ts`) and MCP
  (`agent-tools.ts`) with `normalizeConvexError`/`ConvexCallError` from
  `better-convex-nuxt/errors`.
- Collapsed the MCP credential exchange to a single `exchangeCredential`
  dependency backed by one `exchangeConvexToken` call and one narrow
  `serverConvex` caller per request; the raw JWT is no longer stored in the
  MCP request context, and duplicate `/convex/token` requests are gone.
- Migrated the v1 package story to direct publishable CMS packages:
  `@lupinum/ginko-cms`, `@lupinum/ginko-cms-convex`, and
  `@lupinum/ginko-cms-contract` install without local `workspace:`, `file:`, or
  `link:` dependency specs in packed artifacts.
- Replaced Trellis-era host bridge/runtime assumptions with direct Convex,
  Better Auth, and CMS component ownership. Host apps should regenerate the
  setup baseline with `pnpm exec ginko-cms init` and remove old Trellis
  generated files.
- Moved MCP credentials to Better Auth API keys plus CMS
  `mcpCredentialSettings`. Normal MCP tool calls now use Better Auth Convex
  tokens instead of `CONVEX_DEPLOY_KEY` or a synthetic MCP Convex identity.
- Kept agent public-output changes review-gated by default. Direct trusted
  publish remains out of the v1 default surface until it has a separately
  reviewed model.
- Bounded MCP agent runs to a four-hour server default, a 24-hour maximum, and
  ten concurrent active runs per credential. Expired and abandoned runs are
  now reclaimed by indexed retention cleanup.
- Narrowed `defineGinkoAuth` to the supported `emailPassword` and
  `trustedOrigins` options so callers cannot diverge from the generated Better
  Auth schema or replace Ginko's fixed plugin ordering.
- Made the contract-validated `can` map the sole access-context permission
  surface and derive it from the backend guard registry. The undocumented
  duplicate `permissions` alias was removed.
- Made `runtimeConfig.public.convex.siteUrl` from `better-convex-nuxt` the sole
  Nuxt MCP token-exchange origin, removing CMS-specific request-time environment
  fallbacks.
- Generated Better Auth HTTP setup now uses the component's maintained lazy
  route registration API.
- Safe create, draft-save, asset-move, and entry-restore writes are now direct
  protected mutations. The operation export surface is reserved for writes that
  actually require preview and confirmation.
- Replaced migration-era vocabulary and deleted-model scanners with a focused
  release-hygiene check for template parity, private local paths, and tracked
  build artifacts.
- Destructive preview functions now validate their shared result envelope
  instead of accepting arbitrary return values.
- Backup artifact storage is now represented by its only supported driver
  instead of advertising hypothetical backend adapters.
- Removed completed root-level migration journals, comparison notes, and audit
  plans that contradicted current architecture. Durable behavior remains in the
  maintained docs and Git history.

### Removed

- Removed legacy CMS-owned `mcpKeys`, generic `projectTool`, and inactive direct
  destructive MCP tools from the active v1 surface.
- Removed Trellis package metadata/runtime dependencies from the CMS release
  path.
- Removed automatic orphan-storage deletion. Storage hygiene remains
  observable, but unowned bytes are no longer deleted without an atomic
  ownership protocol.
- Removed the unused generated host `users` table and no-op
  `createUserIfNeeded` export. Better Auth remains the identity source of truth
  and CMS membership remains component-owned.

### Migration Notes

- Set `BETTER_AUTH_SECRET`; runtime startup and `ginko-cms doctor` no longer
  accept an invented development fallback.
- Regenerate the host member adapter. First-owner bootstrap no longer accepts a
  caller-provided email; it authorizes only the verified JWT email against
  `GINKO_FIRST_OWNER_EMAIL`.
- Install the publishable package tuple directly:
  `@lupinum/ginko-content`, `@lupinum/ginko-cms`,
  `@lupinum/ginko-cms-convex`, `better-convex-nuxt`,
  `@convex-dev/better-auth`, `better-auth`, and `convex`.
- Delete old Trellis aliases, `#trellis` imports, `_trellisForwarding`, legacy
  generated operation bridge files, and custom MCP-key UI or docs.
- Keep `CONVEX_DEPLOY_KEY` server-only for setup and contract sync. MCP runtime
  needs Convex URL plus Better Auth base URL configuration, not deploy-key
  transport.
- This migration note describes the pre-greenfield host cleanup. The former
  Trellis transition guide is not part of the current fresh-deployment path.
- Existing hosts may delete the old generated `users` table after confirming
  their application did not adopt it for host-owned data. Ginko CMS never read
  or wrote that table.

### Fixed

- Added a strict candidate verification lane that consumes prebuilt Ginko
  Content and Better Convex Nuxt tarballs by exact SHA-256 instead of repacking
  mutable sibling checkouts.
- Made normal CMS-contract vendor checks self-contained through a committed
  checksum manifest and installed-package parity. Regeneration now requires the
  exact clean Ginko Content source commit recorded in the compatibility matrix.

## v0.1.3

Align Ginko CMS with the Trellis `0.2.0` release line.

### Release Stack

| Package                       | Version |
| ----------------------------- | ------: |
| `@lupinum/ginko-cms`          | `0.1.3` |
| `@lupinum/ginko-cms-convex`   | `0.1.2` |
| `@lupinum/ginko-cms-contract` | `0.1.1` |
| `@lupinum/ginko-content`      | `0.1.2` |
| `@lupinum/trellis`            | `0.2.0` |
| `@lupinum/trellis-bridge`     | `0.2.0` |

### Changed

- Updated the release tuple to the published Trellis `0.2.0` runtime and bridge
  packages.

### Fixed

- Routed permanent asset purge through the Trellis destructive operation
  confirmation flow.
- Replaced cleanup full scans with existing indexes for asset references, public
  projections, and tree move path checks.

## v0.1.2

Align Ginko CMS with the Ginko Content `0.1.2` release line.

### Release Stack

| Package                       | Version |
| ----------------------------- | ------: |
| `@lupinum/ginko-cms`          | `0.1.2` |
| `@lupinum/ginko-cms-convex`   | `0.1.1` |
| `@lupinum/ginko-cms-contract` | `0.1.1` |
| `@lupinum/ginko-content`      | `0.1.2` |
| `@lupinum/trellis`            | `0.1.1` |
| `@lupinum/trellis-bridge`     | `0.1.1` |

### Changed

- Made `ginko-cms deploy` the documented first-run path for bridge checks,
  Convex deployment, and contract push.
- Added a progressive CMS collection ladder and a separate advanced reference
  for CMS-native config helpers.
- Removed the stale `ginkoCms.publicContent.sitemap` option from defaults and
  playground configuration.

### Fixed

- Fixed `ginko-cms deploy --check` so it runs contract checks without starting
  Convex deployment.
- Stabilized Studio workflow component tests by installing deterministic test
  `localStorage`.

## v0.1.1

Align Ginko CMS with the Trellis `0.1.1` release line.

### Release Stack

| Package                       | Version |
| ----------------------------- | ------: |
| `@lupinum/ginko-cms`          | `0.1.1` |
| `@lupinum/ginko-cms-convex`   | `0.1.1` |
| `@lupinum/ginko-cms-contract` | `0.1.1` |
| `@lupinum/ginko-content`      | `0.1.0` |
| `@lupinum/trellis`            | `0.1.1` |
| `@lupinum/trellis-bridge`     | `0.1.1` |

### Changed

- Updated Ginko CMS and Convex package dependencies to require the published
  Trellis `0.1.1` runtime and bridge packages.
- Added Trellis package ranges to the Ginko CMS compatibility matrix so stale
  runtime or bridge ranges fail the release gate.

## v0.1.0

First public Ginko CMS release.

### Release Stack

| Package                       |  Version |
| ----------------------------- | -------: |
| `@lupinum/ginko-cms`          |  `0.1.0` |
| `@lupinum/ginko-cms-convex`   |  `0.1.0` |
| `@lupinum/ginko-cms-contract` |  `0.1.0` |
| `@lupinum/ginko-content`      | `2.13.4` |
| `@lupinum/trellis`            |  `0.4.0` |
| `@lupinum/trellis-bridge`     |  `0.1.0` |

### Added

- Convex-backed CMS component for collections, entries, assets, members,
  settings, imports, projections, and operation-backed workflows.
- Nuxt Studio module with auth pages, Studio shell, public content provider,
  Tailwind v4 integration, and package-owned bridge manifest.
- Shared contract package for runtime-neutral content types, validators, route
  diagnostics, permissions, caller shape, and CMS field definitions.
- Package E2E release gate proving packed packages install into a clean Nuxt
  consumer with Trellis and Ginko Content.
