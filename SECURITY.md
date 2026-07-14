# Security Policy

Report security issues through GitHub private vulnerability reporting for this
repository. Do not open a public issue for suspected auth bypasses, package
compromise, token leaks, MCP permission bypasses, bridge secret exposure, or
destructive-operation bypasses. If private vulnerability reporting is not
enabled yet, enable it before the first public release.

## Maintained Versions

Before `1.0.0`, only the latest published `0.x` release line is maintained.
Security fixes should be released as soon as they are verified.

## Release Security

- No long-lived npm publish tokens in CI.
- Prefer npm trusted publishing plus staged publishing after the first package
  release exists on npm.
- First releases are manual owner-controlled publishes with 2FA because npm
  staged publishing requires an existing package.
- Release jobs must not use package-manager caches.
- Every release candidate must pass `pnpm run release:verify`.
- CMS release candidates must also pass `pnpm run release:verify:registry` after
  Ginko Content and `better-convex-nuxt` are published.
