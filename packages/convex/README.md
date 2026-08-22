# @lupinum/ginko-cms-convex

Convex component implementation for Ginko CMS.

This package owns the backend implementation for CMS content, assets, members,
the installed contract, projections, guarded operations, and owner-CLI
portability. Studio and MCP do not expose portability execution.
Most Nuxt apps install it next to `@lupinum/ginko-cms` and let
`pnpm exec ginko-cms init` mount it through the host app's Convex config.

## Install

Host apps install the component with the CMS module:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @lupinum/better-convex-nuxt better-auth
pnpm add -D convex
```

The generated `convex/convex.config.ts` mounts Better Convex's packaged auth
component, then mounts the Ginko CMS component from this package:

```ts
import betterAuth from '@lupinum/better-convex-nuxt/better-auth/convex.config'
import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'
```

## Public Subpaths

- `@lupinum/ginko-cms-convex/convex.config`
- `@lupinum/ginko-cms-convex/convex.auth`
- `@lupinum/ginko-cms-convex/mcp`
- `@lupinum/ginko-cms-convex/component`
- `@lupinum/ginko-cms-convex/operations`

The `mcp` subpath handles one request through Better Convex's request-local
transport and Ginko's fixed tool catalog. Generated host setup binds those
tools to current component operations and asks the Better Auth component to
revalidate provider-owned access on every request. Bearer credentials never
enter Convex arguments, and current membership, role, delegation, review, and
operation authorization remain application-owned.

## Scope

The component package is not the app-facing Studio module. Use
`@lupinum/ginko-cms` for Nuxt setup, CLI commands, direct setup validation,
and public provider integration. Do not import component internals directly from
host app code.

## License

[MIT](./LICENSE)
