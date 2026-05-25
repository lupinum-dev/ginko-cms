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
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

Register the Nuxt modules:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

Generate the host-owned Convex bridge files and verify the setup:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

Deploy the generated Convex functions, then push the collection contracts:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
```

For local development, `ginko-cms push` needs Convex admin auth through
`CONVEX_DEPLOY_KEY`. Create one with:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

## What You Get

- Studio routes and layout mounted into the Nuxt app.
- Convex-backed content, assets, members, settings, imports, and projections.
- Better Auth integration through host-owned Convex files.
- Public content reads for Ginko-powered Nuxt sites.
- Filesystem-to-CMS migration tooling.
- MCP operations that go through the CMS operation layer.
- Tailwind v4 source registration handled by the Nuxt module.

## Generated Files

`ginko-cms init` writes the host bridge files in:

- `convex/auth.ts`
- `convex/http.ts`
- `convex/ginkoCmsMcp.ts`
- `convex/ginkoCms/*`
- the managed `@lupinum/ginko-cms` block in `convex/convex.config.ts`

Keep `convex/convex.config.ts` app-owned outside the managed block. Keep
`convex/auth.config.ts` app-owned too; that is where the app configures Better
Auth providers and auth policy.

Generated Convex files should stay thin. They import package-owned bridge
factories from public `@lupinum/ginko-cms/*` subpaths and export Convex
functions from those factories. Put business logic in the CMS package or Convex
component, not in generated host files.

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

## Scope

Ginko CMS owns the CMS product layer. Ginko Content owns CMS-neutral content
querying and provider contracts. Trellis owns generic Nuxt, Convex, Better Auth,
and MCP app primitives.


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

## Credits

Ginko CMS is its own implementation, but its product direction is inspired by
[Nuxt Studio](https://nuxt.studio/) and the editing workflow around the MDC
editor.

## License

[MIT](./LICENSE)
