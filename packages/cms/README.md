# @lupinum/ginko-cms

Nuxt module and CLI for Ginko CMS.

This package mounts the Studio UI, validates the CMS bridge, wires the public
content provider, handles Tailwind v4 source registration, and exposes the
`ginko-cms` command used to initialize and validate a host app.

## Install

Install the CMS-facing packages in the Nuxt host app:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

Register the modules:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

## Setup

Generate the host-owned Convex bridge files and check them:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

The CLI manages `convex/auth.ts`, `convex/http.ts`, `convex/ginkoCmsMcp.ts`,
`convex/ginkoCms/*`, and the managed `@lupinum/ginko-cms` registration block in
`convex/convex.config.ts`.

Deploy the generated Convex functions, then install collection contracts:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
```

`pnpm exec ginko-cms doctor` is the canonical local and CI validation command.
`pnpm exec ginko-cms bridge check` and `pnpm exec ginko-cms bridge inspect` are
maintainer diagnostics for generated files and managed edits.

## What It Owns

- Studio routes, layout, and runtime components.
- CMS setup CLI commands.
- Host bridge manifest and generated-file validation.
- Filesystem migration helpers.
- Public Ginko provider integration.
- Tailwind v4 integration for the CMS UI.

The Convex component implementation lives in `@lupinum/ginko-cms-convex`. The
framework-neutral contract types live in `@lupinum/ginko-cms-contract`.

## Scope

Generated host files should stay thin and import package-owned bridge factories
from public `@lupinum/ginko-cms/*` subpaths. Keep app-specific Better Auth
provider setup in `convex/auth.config.ts`.

See the workspace README for environment variables, Tailwind notes, migration
recipes, collection contract changes, and release-candidate validation.

## License

[MIT](./LICENSE)
