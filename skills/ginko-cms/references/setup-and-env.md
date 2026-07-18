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
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex better-convex-nuxt better-auth
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

`init` writes host-owned Convex setup files under `convex/`, including thin
`convex/ginkoCms/*` root adapters, Better Auth setup, the app schema baseline,
and component registration in `convex/convex.config.ts`.

## Better Auth Boundary

The generated baseline includes the CMS Better Auth setup and an email/password
Studio path:

- `convex/auth.ts` wires `defineGinkoAuth`.
- `convex/http.ts` registers Better Auth routes.
- `convex/auth.config.ts` exports `providers: [getAuthConfigProvider()]`.
- `convex/schema.ts` starts empty so the host can add only app-owned tables.

The generated `defineGinkoAuth` wrapper deliberately fixes the Better Auth
plugins and component schema. If an app needs OAuth, SSO, custom email delivery,
or additional Better Auth plugins, the host must own a complete auth factory and
matching generated schema instead of passing unsupported options through the CMS
wrapper.

## Required Values

Ginko CMS directly reads:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=https://your-deployment.convex.site
CONVEX_DEPLOY_KEY=prod:...
BETTER_AUTH_SECRETS=0:long-random-secret
BCN_AUTH_PROXY_IP_SECRET=independent-proxy-secret
GINKO_CMS_MCP_SERVER_SECRET=independent-mcp-secret
GINKO_FIRST_OWNER_EMAIL=owner@example.com
```

Rules:

- Use `NUXT_PUBLIC_CONVEX_URL` for browser-visible Convex reads.
- Use `CONVEX_URL` as a server-side fallback. It may match
  `NUXT_PUBLIC_CONVEX_URL`.
- Keep `CONVEX_DEPLOY_KEY` server-side only. Do not expose it through
  `NUXT_PUBLIC_*`.
- Keep versioned `BETTER_AUTH_SECRETS` in Convex only. Never copy it into the
  Nuxt process or expose it through `NUXT_PUBLIC_*`.
- Set the same independent `BCN_AUTH_PROXY_IP_SECRET` in Nuxt and Convex when a
  trusted client-IP header is configured.
- Set the same independent `GINKO_CMS_MCP_SERVER_SECRET` in Nuxt and Convex
  when private MCP credentials are enabled.
- Use `CONVEX_SITE_URL` for the Better Auth HTTP action origin used by MCP and
  authenticated operator commands.
- Set `GINKO_FIRST_OWNER_EMAIL` until the first Studio owner has claimed
  ownership.

Local deploy key:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Better Auth secret:

```bash
printf '0:%s' "$(openssl rand -base64 32)" | pnpm exec better-convex-nuxt-convex env set BETTER_AUTH_SECRETS
```

First owner:

```bash
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
```

## First Successful Push

Deploy generated Convex files and sync contracts through the canonical command:

```bash
pnpm exec ginko-cms deploy
pnpm exec ginko-cms deploy --check
```

`ginko-cms deploy` reads `.env.local` and process env. If `deploy --check` reports
drift, follow `docs/guides/changing-collections.md` before changing shared data.

## Common Setup Failures

- Missing `@lupinum/ginko-cms-convex`, `better-convex-nuxt`, or
  `better-auth`: install them in the host app; generated Convex files mount from
  direct dependencies.
- Missing `better-convex-nuxt`: install the supported integration foundation in
  the host app.
- Missing Convex URL: set `NUXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`.
- Missing deploy key: create `CONVEX_DEPLOY_KEY`; contract sync uses it.
- Missing Better Auth secrets: set versioned `BETTER_AUTH_SECRETS` in Convex;
  do not put them in Nuxt.
- Missing auth origin: set `CONVEX_SITE_URL` or the documented Better Auth URL
  override.
- Studio owner cannot claim: verify `GINKO_FIRST_OWNER_EMAIL`.
- MCP doctor fails: install `secure-exec` when MCP code mode is enabled and make
  the same env values available to the MCP runtime.
