# Changelog

## Unreleased

### Changed

- Upgraded the Nuxt integration baseline to `better-convex-nuxt@0.5.0` and
  migrated runtime composables to its auto-import-only public API.
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

### Removed

- Removed legacy CMS-owned `mcpKeys`, generic `projectTool`, and inactive direct
  destructive MCP tools from the active v1 surface.
- Removed Trellis package metadata/runtime dependencies from the CMS release
  path.

### Migration Notes

- Install the publishable package tuple directly:
  `@lupinum/ginko-content`, `@lupinum/ginko-cms`,
  `@lupinum/ginko-cms-convex`, `better-convex-nuxt`,
  `@convex-dev/better-auth`, `better-auth`, and `convex`.
- Delete old Trellis aliases, `#trellis` imports, `_trellisForwarding`, legacy
  generated operation bridge files, and custom MCP-key UI or docs.
- Keep `CONVEX_DEPLOY_KEY` server-only for setup and contract sync. MCP runtime
  needs Convex URL plus Better Auth base URL configuration, not deploy-key
  transport.
- See `docs/guides/migrations/trellis-era-migration.md` for the host cleanup
  checklist.

### Fixed

- Made package e2e/release verification pack the sibling local
  `@lupinum/ginko-content` package by default in coordinated release QA, so
  verification does not depend on publishing order.

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
