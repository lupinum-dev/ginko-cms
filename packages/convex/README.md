# @lupinum/ginko-cms-convex

Convex component implementation for Ginko CMS.

This package owns the backend implementation for CMS content, assets, members,
settings, imports, projections, and operation surfaces used by Studio and MCP.
Most Nuxt apps install it next to `@lupinum/ginko-cms` and let
`pnpm exec ginko-cms init` mount it through the host app's Convex config.

## Install

Host apps install the component with the CMS module:

```bash
pnpm add @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

The generated `convex/convex.config.ts` imports component configs from their
owning packages:

```ts
import betterAuth from '@convex-dev/better-auth/convex.config'
import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'
```

## Public Subpaths

- `@lupinum/ginko-cms-convex/convex.config`
- `@lupinum/ginko-cms-convex/convex.auth`
- `@lupinum/ginko-cms-convex/component`
- `@lupinum/ginko-cms-convex/component-bridge`
- `@lupinum/ginko-cms-convex/operations`

## Scope

The component package is not the app-facing Studio module. Use
`@lupinum/ginko-cms` for Nuxt setup, CLI commands, generated bridge validation,
and public provider integration. Do not import component internals directly from
host app code.

## License

[MIT](./LICENSE)
