# Changelog

## Unreleased

## v0.1.1

Align Ginko CMS with the Trellis `0.1.1` release line.

### Release Stack

| Package                       |  Version |
| ----------------------------- | -------: |
| `@lupinum/ginko-cms`          |  `0.1.1` |
| `@lupinum/ginko-cms-convex`   |  `0.1.1` |
| `@lupinum/ginko-cms-contract` |  `0.1.1` |
| `@lupinum/ginko-content`      |  `0.1.0` |
| `@lupinum/trellis`            |  `0.1.1` |
| `@lupinum/trellis-bridge`     |  `0.1.1` |

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
