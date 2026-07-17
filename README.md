# Ginko CMS

Self-hosted CMS for Nuxt teams building structured websites with Ginko Content.
It provides a Studio UI backed by Convex, Better Auth, managed assets, content
publishing, filesystem migration, public-read projections, and MCP operations.

Use Ginko CMS when your Nuxt app already treats content as collections and you
want an app-owned editing workflow instead of a hosted SaaS dependency.

## Quick Start

Install the Nuxt content engine, CMS module, Convex component, and auth
dependencies in the host app:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex better-convex-nuxt @convex-dev/better-auth better-auth
pnpm add -D convex
```

Register the Nuxt modules:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

Generate the host-owned Convex setup files and verify the setup:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

Contract sync through `ginko-cms deploy` or `ginko-cms push` needs Convex admin
auth through `CONVEX_DEPLOY_KEY`. Create one before deploying:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Set the email allowed to claim the first Studio owner:

```bash
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
```

Deploy the generated Convex functions and sync the collection contracts:

```bash
pnpm exec ginko-cms deploy
```

`ginko-cms deploy` runs `ginko-cms doctor`, starts the default local Convex
deploy command, then pushes collection contracts. For CI or read-only
validation, run `pnpm exec ginko-cms deploy --check`; it skips the Convex deploy
step and validates setup plus contract drift.

For the full setup path, see [Quickstart](./docs/getting-started/quickstart.md)
and [Environment](./docs/getting-started/environment.md).

## What You Get

- Studio routes and layout mounted into the Nuxt app.
- Convex-backed content, assets, members, settings, and public projections.
- Better Auth integration through host-owned Convex files.
- Public content reads for Ginko-powered Nuxt sites.
- Owner-only CLI portability for deterministic content export and draft import.
- MCP operations that go through the CMS operation layer.
- Tailwind v4 source registration handled by the Nuxt module.

## Generated Files

`ginko-cms init` writes the host-owned Convex setup files:

- `convex/auth.ts`
- `convex/auth.config.ts`
- `convex/betterAuth/*`
- `convex/http.ts`
- `convex/schema.ts`
- `convex/.ginko-cms-setup.json` (template provenance only)

Running `ginko-cms init` again updates generated files that still match their
recorded template hash. If both the host file and package template changed, the
command preserves the host file, prints a safe merge diff, and exits with a
setup conflict instead of overwriting user work.

- the Ginko CMS component registration in `convex/convex.config.ts`

Keep `convex/convex.config.ts`, `convex/auth.config.ts`, and
`convex/schema.ts` app-owned after the setup baseline is present. Those
files are where the app registers Convex components, configures Better Auth
providers, and defines app tables.

Generated Convex files should stay thin. They mount the Ginko CMS Convex
component and a local Better Auth component whose schema includes Ginko's MCP
API-key table. Put business logic in the CMS package or Convex component, not
in generated host files.

## Tailwind

Keep the app's Tailwind v4 entrypoint simple:

```css
@import 'tailwindcss';
```

Do not add manual CMS CSS imports or manual `@source` lines for
`@lupinum/ginko-cms`. The module injects the source registration into the real
Tailwind entry CSS for dev and build.

## Packages

- `@lupinum/ginko-cms`: Nuxt module, Studio, CLI, migration helpers, and public
  provider integration.
- `@lupinum/ginko-cms-convex`: Convex component implementation.
- `@lupinum/ginko-cms-contract`: framework-neutral CMS contracts, field
  metadata, public content types, and Convex validators.

The host app installs the CMS-facing packages directly because Convex discovers
mounted components from the host app's `convex/convex.config.ts`.

## Documentation

- [Docs index](./docs/index.md)
- [Codex skill for agents](./skills/ginko-cms/SKILL.md)
- [Quickstart](./docs/getting-started/quickstart.md)
- [Next collections](./docs/getting-started/next-collections.md)
- [Auth and roles](./docs/reference/auth-and-roles.md)
- [MCP agent workflows](./docs/guides/mcp-agent-workflows.md)
- [Changing collections](./docs/guides/changing-collections.md)
- [Contract transitions](./docs/guides/changing-collections.md)
- [Public content API](./docs/reference/public-content-api.md)
- [Nuxt content provider](./docs/reference/nuxt-content-provider.md)
- [Studio theming](./docs/guides/theming-the-studio.md)
- [Release candidate checklist](./docs/maintenance/release-candidate.md)

## Scope

Ginko CMS owns the CMS product layer. Ginko Content owns CMS-neutral content
querying and provider contracts. Host apps own normal Nuxt, Convex, and Better
Auth configuration.

## Local Development

```bash
pnpm install
pnpm dev
pnpm run check
```

Useful maintainer commands:

```bash
pnpm run prepare:component
pnpm run prepare:module
pnpm run prepare:playground
pnpm run prepare:convex
pnpm run dev:prepare
pnpm run build
```

`pnpm dev` runs the module-local playground. Before publishing or changing
public setup behavior, run the release verification flow from `AGENTS.md` and
let a human maintainer inspect the packed output.

For a real Nuxt host with Better Auth login and Studio HMR, follow
[Local Studio Development](./docs/maintenance/local-studio-development.md).

## Credits

Ginko CMS is its own implementation, but its product direction is inspired by
[Nuxt Studio](https://nuxt.studio/) and the editing workflow around the MDC
editor.

## License

[MIT](./LICENSE)
