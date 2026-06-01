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

The CLI manages `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`,
`convex/schema.ts`, `convex/ginkoCmsMcp.ts`, `convex/ginkoCms/*`, and the
Ginko CMS component registration in `convex/convex.config.ts`.

Before pushing contracts, provide Convex admin auth and the generated bridge
forwarding secret:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
FORWARDING_KEY="$(openssl rand -base64 32)"
printf "\nCONVEX_IDENTITY_FORWARDING_KEY=%s\n" "$FORWARDING_KEY" >> .env.local
pnpm exec convex env set CONVEX_IDENTITY_FORWARDING_KEY "$FORWARDING_KEY"
```

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
- Public CMS provider integration.
- Tailwind v4 integration for the CMS UI.

The Convex component implementation lives in `@lupinum/ginko-cms-convex`. The
framework-neutral contract types live in `@lupinum/ginko-cms-contract`.

## Scope

Generated host files should stay thin and import package-owned bridge factories
from public `@lupinum/ginko-cms/*` subpaths. Keep app-specific Better Auth
provider setup in `convex/auth.config.ts` and app tables in `convex/schema.ts`.

See the workspace docs for
[environment variables](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/getting-started/environment.md),
[collection changes](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/guides/changing-collections.md),
[migration recipes](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/guides/migrations/recipes.md),
[Tailwind/theming notes](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/guides/theming-the-studio.md),
and
[release-candidate validation](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/maintenance/release-candidate.md).

For agent-assisted setup, debugging, or maintenance, use the repo-local
[Ginko CMS Codex skill](https://github.com/lupinum-dev/ginko-cms/blob/main/skills/ginko-cms/SKILL.md).

## License

[MIT](./LICENSE)
