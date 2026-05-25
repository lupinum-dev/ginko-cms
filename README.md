# @lupinum/ginko-cms

Self-hosted CMS for Nuxt teams building structured websites with Ginko, with
first-class support for multilingual content.

Ginko CMS provides the CMS/admin layer for Ginko: Studio, Convex-backed content
storage, Better Auth, managed assets, public projections, filesystem migration,
MCP operations, and the provider integration used by Ginko-powered Nuxt sites.

## Foundation Docs

- [a_target.md](./a_target.md) is the active A+ refactor target. Use it as the
  phase ledger for deletion-biased cleanup and cross-repo content/CMS seam work.
- [VISION.md](./VISION.md) describes the product boundary and non-goals.
- [ARCHITECTURE.md](./ARCHITECTURE.md) describes the package/runtime shape.
- [ABSTRACTIONS.md](./ABSTRACTIONS.md) defines the shared vocabulary.
- [adr/](./adr) contains accepted architecture decisions.

## Release Compatibility

The first clean public release line is:

| Package                       | Version | Role                                           |
| ----------------------------- | ------: | ---------------------------------------------- |
| `@lupinum/ginko-cms`          | `0.1.1` | Nuxt module, Studio, CLI, provider integration |
| `@lupinum/ginko-cms-convex`   | `0.1.1` | Convex component implementation                |
| `@lupinum/ginko-cms-contract` | `0.1.1` | Runtime-neutral CMS contract                   |
| `@lupinum/ginko-content`      | `0.1.0` | Content engine and filesystem provider         |
| `@lupinum/trellis`            | `0.1.1` | Nuxt + Convex app runtime                      |
| `@lupinum/trellis-bridge`     | `0.1.1` | Package-author bridge utilities                |

Publish in dependency order: Content, Trellis, Trellis Bridge, CMS Contract, CMS
Convex, then CMS. Consumer apps install the CMS-facing packages together; they
should not install Trellis bridge helpers directly unless they are authoring a
package integration.

## What It Owns

When you install the module, it wires the CMS into the consuming app by:

- registering the studio pages and layout
- configuring the internal bridge/runtime needed by Ginko CMS
- validating the generated `convex/auth.ts`, `convex/http.ts`, and `convex/ginkoCms/*` bridge files
- injecting its Tailwind v4 `@source` registration into the app stylesheet that imports `tailwindcss`

That last point is important: consumer apps should not manually import package CSS for the CMS and should not add manual `@source` lines for `@lupinum/ginko-cms`.

## Consumer Setup

Install the CMS, content module, and the Convex component packages the host app
mounts directly:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

Add the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

Generate the host-owned Convex bridge files explicitly:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

This command owns:

- generated host bridge files in `convex/auth.ts`, `convex/http.ts`, `convex/ginkoCmsMcp.ts`, and `convex/ginkoCms/*`
- the managed `@lupinum/ginko-cms` registration block inside `convex/convex.config.ts`

Generated `convex/convex.config.ts` must install Convex components from their
owning package exports:

```ts
import betterAuth from '@convex-dev/better-auth/convex.config'
import ginkoCms from '@lupinum/ginko-cms-convex/convex.config'
import { defineApp } from 'convex/server'
```

Do not install components through `@lupinum/ginko-cms/convex/config` or
`@lupinum/ginko-cms/convex/better-auth`. Those old compatibility specifiers are
invalid; `ginko-cms doctor` reports them with the canonical replacements.

Ginko CMS publishes its `./convex/manifest` package subpath. The bridge tooling
resolves that manifest, writes the host files, checks drift, and reports bridge
health.
Generated function wrappers are intentionally thin host bindings: they import
package-owned bridge factories from the documented `@lupinum/ginko-cms/bridge`
subpath and export Convex functions from those factories. Do not add business
logic to generated consumer files.

Keep `convex/convex.config.ts` app-owned outside that managed block. The module validates both the generated files and the managed registration at startup. If they are missing or stale, startup fails and tells you to rerun `pnpm exec ginko-cms init`. `pnpm exec ginko-cms doctor` is the canonical validation command for local development and CI.
Advanced maintainers can use `pnpm exec ginko-cms bridge check` and
`pnpm exec ginko-cms bridge inspect` to inspect generated files, managed edits,
and drift state directly.

Keep `convex/auth.config.ts` app-owned. That file is the customization point
for Better Auth providers and auth policy. The bridge command seeds it when the
file is missing, but leaves your edits untouched afterwards.

Generated Convex host files import only `@lupinum/ginko-cms/*` public bridge
subpaths. The app still owns the direct Convex component dependencies above,
because Convex discovers mounted components from the host app's
`convex/convex.config.ts`.

Deploy the generated Convex functions, then install collection contracts:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
```

`ginko-cms push` uses Convex admin auth through `CONVEX_DEPLOY_KEY`; it does
not use a separate Ginko install secret. For local development, create a deploy
key with:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Keep your app's normal Tailwind entrypoint minimal:

```css
@import 'tailwindcss';
```

If your app uses additional Tailwind plugins or local theme tokens, keep those in your own stylesheet as usual. Do not add:

```css
@import '@lupinum/ginko-cms';
@source "../node_modules/@lupinum/ginko-cms";
```

The module injects its own runtime Tailwind source registration into the consumer app's real Tailwind entry CSS, so it works in both dev and build without extra site-specific wiring.

For the Tailwind v4 integration details and debugging notes, see
[`docs/tailwind-v4-integration.md`](./docs/tailwind-v4-integration.md).

For relation behavior, storage, frontend usage, and migration details, see
[`docs/relations.md`](./docs/relations.md).

For public read behavior and the Ginko provider integration, see
[`docs/public-content-api.md`](./docs/public-content-api.md) and
[`docs/nuxt-content-provider.md`](./docs/nuxt-content-provider.md).
For required environment variables and ownership, see
[`docs/environment.md`](./docs/environment.md).
For the release-candidate staging drill, see
[`docs/release-candidate.md`](./docs/release-candidate.md).
For changing collection contracts during a project, see
[`docs/changing-collections.md`](./docs/changing-collections.md),
[`docs/migration-recipes.md`](./docs/migration-recipes.md), and
[`docs/migration-recovery.md`](./docs/migration-recovery.md).
For CMS cache ownership and canonical dependency tags, see
[`docs/cache-invalidation.md`](./docs/cache-invalidation.md).

For the cross-repo CMS provider/cache contract, use the Ginko Content
[`CMS-SPEC.md`](https://github.com/lupinum-dev/ginko-content/blob/main/CMS-SPEC.md)
as the source of truth.

For filesystem migration, see
[`docs/filesystem-migration.md`](./docs/filesystem-migration.md).

## Credits

Ginko CMS is its own implementation, but its product direction is inspired by
[Nuxt Studio](https://nuxt.studio/) and the editing workflow around the MDC
editor.

## Local Development

```bash
pnpm install
pnpm dev
pnpm check
```

Maintainer commands:

```bash
pnpm run prepare:component
pnpm run prepare:module
pnpm run prepare:playground
pnpm run prepare:convex
pnpm run dev:prepare
pnpm run build
```

Notes:

- `pnpm dev` is for the module-local playground only.
- Component codegen runs before package-surface preparation.
- `src/module/bridge-manifest.ts` is the authored bridge manifest. `convex/manifest.{js,d.ts}` is generated package output.
- `src/module.ts` and `packages/cms/src/runtime` remain the implementation source of truth, but cross-repo validation is package-first.
- During active sibling-repo development, internal bridge/runtime dependencies point at sibling workspace checkouts. Before publishing ginko-cms packages, publish the internal dependency versions that contain the bridge API used by Ginko CMS.
- The release-proof downstream contract lives in the package-first consumer fixture under `test/module/e2e-package-consumer.test.ts`.
- Source of truth rules: collection contracts own schema, raw MDC owns editable body content, Convex component state owns CMS operations, public projections are derived, and Studio/MCP operate content without mutating schema.

## License

[MIT](./LICENSE)
