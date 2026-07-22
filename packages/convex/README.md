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
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex better-convex-nuxt better-auth
pnpm add -D convex
```

The generated `convex/convex.config.ts` mounts a local Better Auth component so
Ginko's API-key schema is deployed with the host app, then mounts the Ginko CMS
component from this package:

```ts
import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'

import betterAuth from './betterAuth/convex.config'
```

## Public Subpaths

- `@lupinum/ginko-cms-convex/convex.config`
- `@lupinum/ginko-cms-convex/convex.auth`
- `@lupinum/ginko-cms-convex/mcp`
- `@lupinum/ginko-cms-convex/mcp-limiter-protocol`
- `@lupinum/ginko-cms-convex/component`
- `@lupinum/ginko-cms-convex/operations`

The experimental `mcp` subpath provides the Ginko-owned tool catalog and
schemas on top of `@better-convex/mcp`. Generated host setup binds those tools
to current component operations; it does not forward bearer credentials into
Convex arguments or move CMS authorization into the transport layer.

## Scope

The component package is not the app-facing Studio module. Use
`@lupinum/ginko-cms` for Nuxt setup, CLI commands, direct setup validation,
and public provider integration. Do not import component internals directly from
host app code.

## License

[MIT](./LICENSE)
