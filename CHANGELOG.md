# Changelog

## Unreleased

### Fixed

- Made package e2e/release verification pack the sibling local
  `@lupinum/ginko-content` package by default in coordinated release QA, so
  verification does not depend on publishing order.

## v0.1.3

Align Ginko CMS with the removed foundation `0.2.0` release line.

### Release Stack

| Package                       | Version |
| ----------------------------- | ------: |
| `@lupinum/ginko-cms`          | `0.1.3` |
| `@lupinum/ginko-cms-convex`   | `0.1.2` |
| `@lupinum/ginko-cms-contract` | `0.1.1` |
| `@lupinum/ginko-content`      | `0.1.2` |
| `removed foundation package`            | `0.2.0` |
| `removed bridge package`     | `0.2.0` |

### Changed

- Updated the release tuple to the published removed foundation `0.2.0` runtime and bridge
  packages.

### Fixed

- Routed permanent asset purge through the removed foundation destructive operation
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
| `removed foundation package`            | `0.1.1` |
| `removed bridge package`     | `0.1.1` |

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

Align Ginko CMS with the removed foundation `0.1.1` release line.

### Release Stack

| Package                       | Version |
| ----------------------------- | ------: |
| `@lupinum/ginko-cms`          | `0.1.1` |
| `@lupinum/ginko-cms-convex`   | `0.1.1` |
| `@lupinum/ginko-cms-contract` | `0.1.1` |
| `@lupinum/ginko-content`      | `0.1.0` |
| `removed foundation package`            | `0.1.1` |
| `removed bridge package`     | `0.1.1` |

### Changed

- Updated Ginko CMS and Convex package dependencies to require the published
  removed foundation `0.1.1` runtime and bridge packages.
- Added removed foundation package ranges to the Ginko CMS compatibility matrix so stale
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
| `removed foundation package`            |  `0.4.0` |
| `removed bridge package`     |  `0.1.0` |

### Added

- Convex-backed CMS component for collections, entries, assets, members,
  settings, imports, projections, and operation-backed workflows.
- Nuxt Studio module with auth pages, Studio shell, public content provider,
  Tailwind v4 integration, and package-owned bridge manifest.
- Shared contract package for runtime-neutral content types, validators, route
  diagnostics, permissions, caller shape, and CMS field definitions.
- Package E2E release gate proving packed packages install into a clean Nuxt
  consumer with removed foundation and Ginko Content.
