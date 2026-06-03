# Setup And Environment

Use this reference when installing Ginko CMS in a host Nuxt app, debugging init
or doctor output, or writing setup docs. Canonical docs:

- `docs/getting-started/quickstart.md`
- `docs/getting-started/environment.md`
- `packages/cms/README.md`

## Contents

- [Minimum Host Setup](#minimum-host-setup)
- [Better Auth Boundary](#better-auth-boundary)
- [Required Values](#required-values)
- [First Successful Push](#first-successful-push)
- [Common Setup Failures](#common-setup-failures)

## Minimum Host Setup

Install:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

Register modules in this order:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

Define at least one collection in `content.config.ts`:

```ts
import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'

const pages = defineCollection({
  type: 'page',
  source: '**/*.md',
})

export default defineContentConfig({
  provider: 'cms',
  collections: { pages },
})
```

Run from the host app root:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

`init` writes generated Convex bridge files under `convex/`, including
`convex/ginkoCms/*`, `convex/ginkoCmsMcp.ts`, Better Auth glue, schema glue, and
the component registration in `convex/convex.config.ts`.

## Better Auth Boundary

The generated baseline includes the CMS Better Auth bridge and an email/password
Studio path:

- `convex/auth.ts` wires `defineGinkoAuth`.
- `convex/http.ts` registers Better Auth routes.
- `convex/auth.config.ts` exports `providers: [getAuthConfigProvider()]`.
- `convex/schema.ts` defines the required `users.by_auth_key` index.

Production sign-in providers are host-owned. If the app needs OAuth, SSO,
custom email delivery, or organization-specific auth policy, configure that in
the host-owned Better Auth setup, especially `convex/auth.config.ts`, after
`ginko-cms init`. Do not invent provider-specific setup in generic Ginko CMS
instructions; point the user to their Better Auth provider requirements.

## Required Values

Ginko CMS directly reads:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:...
CONVEX_IDENTITY_FORWARDING_KEY=long-random-secret
GINKO_FIRST_OWNER_EMAIL=owner@example.com
```

Rules:

- Use `NUXT_PUBLIC_CONVEX_URL` for browser-visible Convex reads.
- Use `CONVEX_URL` as a server-side fallback. It may match
  `NUXT_PUBLIC_CONVEX_URL`.
- Keep `CONVEX_DEPLOY_KEY` server-side only. Do not expose it through
  `NUXT_PUBLIC_*`.
- Set the same `CONVEX_IDENTITY_FORWARDING_KEY` in the app/server env and the
  Convex deployment.
- Set `GINKO_FIRST_OWNER_EMAIL` until the first Studio owner has claimed
  ownership.

Local deploy key:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Forwarding key:

```bash
FORWARDING_KEY="$(openssl rand -base64 32)"
printf "\nCONVEX_IDENTITY_FORWARDING_KEY=%s\n" "$FORWARDING_KEY" >> .env.local
pnpm exec convex env set CONVEX_IDENTITY_FORWARDING_KEY "$FORWARDING_KEY"
```

First owner:

```bash
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
```

## First Successful Push

Deploy generated Convex files before pushing contracts:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
```

`ginko-cms push` reads `.env.local` and process env. If `push --check` reports
drift, follow `docs/guides/changing-collections.md` before changing shared data.

## Common Setup Failures

- Missing `@lupinum/ginko-cms-convex`, `@convex-dev/better-auth`, or
  `better-auth`: install them in the host app; generated Convex files mount from
  direct dependencies.
- Missing Convex URL: set `NUXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`.
- Missing deploy key: create `CONVEX_DEPLOY_KEY`; contract sync uses it.
- Forwarding mismatch: use the same forwarding secret in app/server env and
  Convex env.
- Studio owner cannot claim: verify `GINKO_FIRST_OWNER_EMAIL`.
- MCP doctor fails: install `secure-exec` when MCP code mode is enabled and make
  the same env values available to the MCP runtime.
