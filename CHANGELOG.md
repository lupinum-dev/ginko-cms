# Changelog

## Unreleased

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
