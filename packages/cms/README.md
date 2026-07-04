# @lupinum/ginko-cms

Nuxt module and CLI for Ginko CMS.

This package mounts the Studio UI, validates the CMS setup, wires the public
content provider, handles Tailwind v4 source registration, and exposes the
`ginko-cms` command used to initialize and validate a host app.

## Install

Install the CMS-facing packages in the Nuxt host app:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex better-convex-nuxt @convex-dev/better-auth better-auth
pnpm add -D convex
```

Register the modules:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

## Setup

Generate the host-owned Convex setup files and check them:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

The CLI manages `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`,
`convex/schema.ts` and the Ginko CMS component registration in `convex/convex.config.ts`.

Before deploying or pushing contracts, provide Convex admin auth:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Deploy the generated Convex functions and install collection contracts:

```bash
pnpm exec ginko-cms deploy
```

`pnpm exec ginko-cms deploy` runs `ginko-cms doctor`, the default local Convex
deploy command, and collection contract sync in the required order. Use
`pnpm exec ginko-cms deploy --check` for CI validation that must not run a Convex
deploy.

`pnpm exec ginko-cms doctor` is the canonical local and CI validation command.

## What It Owns

- Studio routes, layout, and runtime components.
- CMS setup CLI commands.
- Direct Convex setup validation.
- Filesystem migration helpers.
- Public CMS provider integration.
- Tailwind v4 integration for the CMS UI.

The Convex component implementation lives in `@lupinum/ginko-cms-convex`. The
framework-neutral contract types live in `@lupinum/ginko-cms-contract`.

## Scope

Generated host files should stay thin and import the Ginko CMS Convex component
and Better Auth config directly. Keep app-specific Better Auth provider setup in
`convex/auth.config.ts` and app tables in `convex/schema.ts`.

See the workspace docs for
[environment variables](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/getting-started/environment.md),
[next collection steps](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/getting-started/next-collections.md),
[collection changes](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/guides/changing-collections.md),
[CMS config helpers](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/reference/cms-config-helpers.md),
[migration recipes](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/guides/migrations/recipes.md),
[Tailwind/theming notes](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/guides/theming-the-studio.md),
and
[release-candidate validation](https://github.com/lupinum-dev/ginko-cms/blob/main/docs/maintenance/release-candidate.md).

For agent-assisted setup, debugging, or maintenance, use the repo-local
[Ginko CMS Codex skill](https://github.com/lupinum-dev/ginko-cms/blob/main/skills/ginko-cms/SKILL.md).

## License

[MIT](./LICENSE)
