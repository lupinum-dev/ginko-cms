# @lupinum/ginko-cms

Nuxt module for Ginko CMS.

This package owns the user-facing CMS integration: Studio hosting, auth pages,
published-read routes, filesystem migration tooling, Ginko provider integration,
Tailwind setup, and the bridge manifest used by the Ginko CMS setup path.

Ginko CMS is Convex-backed for v1. Trellis powers internal bridge/runtime
mechanics, but the public install/setup story is framed as Ginko CMS. Trellis
is an internal dependency of this package — consumers should not need to
understand `caller`, `appIdentity`, or identity-forwarding envelopes to install or
operate Ginko CMS.

## Compatibility

`@lupinum/ginko-cms@0.1.1` is released with
`@lupinum/ginko-cms-convex@0.1.1`, `@lupinum/ginko-cms-contract@0.1.1`,
`@lupinum/ginko-content@0.1.0`, `@lupinum/trellis@0.1.1`, and
`@lupinum/trellis-bridge@0.1.1`.

Install the CMS-facing packages together. `@lupinum/trellis-bridge` remains a
package-author dependency behind the CMS bridge workflow, not an app-facing
setup step.

## Consumer Setup

Convex components are discovered from the host app's
`convex/convex.config.ts`, so the host owns those package dependencies
directly. Install Ginko CMS, its CMS Convex component, Better Auth, and
Ginko Content together:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

Then generate the host-owned bridge files and the managed registration block:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

The CLI sets up `convex/auth.ts`, `convex/http.ts`, `convex/ginkoCmsMcp.ts`,
and `convex/ginkoCms/*`, plus the managed `@lupinum/ginko-cms` registration
block inside `convex/convex.config.ts`. Generated host files import only
public bridge factories from `@lupinum/ginko-cms/*`; the host owns the direct
Convex component dependencies above.

`pnpm exec ginko-cms doctor` is the canonical local and CI validation command.
`pnpm exec ginko-cms bridge check` and `pnpm exec ginko-cms bridge inspect` are
advanced diagnostics for maintainers who need to inspect generated files and
managed edits directly.

Deploy the generated Convex functions, then install collection contracts:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
```

See the workspace root README for full setup details, environment variables,
release-candidate validation, changing collection contracts, and Tailwind notes.

## Credits

Ginko CMS is its own implementation, but its product direction is inspired by
[Nuxt Studio](https://nuxt.studio/) and the editing workflow around the MDC
editor.

## License

[MIT](./LICENSE)
