# Quickstart

This page gets a Nuxt app to the first checked Ginko CMS setup: packages
installed, one collection defined, generated Convex bridge files written,
collection contracts pushed, and Studio reachable by the first owner.

## Prerequisites

You need a Nuxt app, pnpm through Corepack, and a Convex deployment for the app.
The commands below assume the app uses Ginko Content as the content contract
source.

## Install Packages

Install the CMS-facing packages in the host app:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex @convex-dev/better-auth better-auth
pnpm add -D convex
```

The host app installs the Convex component package directly because
`convex/convex.config.ts` mounts components from the owning packages.

## Register Nuxt Modules

Register Ginko Content before Ginko CMS:

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],
})
```

By default, Studio is mounted at `/studio`.

## Define One Collection

Create `content.config.ts` with one route-backed collection. The CMS module reads
this contract and turns it into the initial Studio collection.

```ts
import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'

const pages = defineCollection('pages', {
  type: 'page',
  source: '**/*.md',
})

export default defineContentConfig({
  provider: 'cms',
  collections: { pages },
})
```

## Generate Bridge Files

Run the init command from the Nuxt app root:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

`ginko-cms init` writes the host-owned Convex bridge files:

- `convex/auth.ts`
- `convex/auth.config.ts`
- `convex/http.ts`
- `convex/schema.ts`
- `convex/ginkoCmsMcp.ts`
- `convex/ginkoCms/*`
- the Ginko CMS component registration in `convex/convex.config.ts`

Keep `convex/convex.config.ts`, `convex/auth.config.ts`, and
`convex/schema.ts` app-owned after the generated baseline is present. Add
app-specific Better Auth providers in `convex/auth.config.ts` and app tables in
`convex/schema.ts`.

The generated baseline wires the CMS Better Auth bridge and email/password
Studio auth. Production OAuth, SSO, custom email delivery, or organization auth
policy remains host-owned Better Auth configuration.

## Configure Local Environment

For local setup and contract sync, the CLI needs a Convex URL, deploy key, and
bridge forwarding secret. Create the deploy key with:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Then ensure `.env.local` includes either `CONVEX_URL` or
`NUXT_PUBLIC_CONVEX_URL`.

Generate one forwarding secret and put the same value in `.env.local` and the
Convex deployment:

```bash
FORWARDING_KEY="$(openssl rand -base64 32)"
printf "\nCONVEX_IDENTITY_FORWARDING_KEY=%s\n" "$FORWARDING_KEY" >> .env.local
pnpm exec convex env set CONVEX_IDENTITY_FORWARDING_KEY "$FORWARDING_KEY"
```

Set the email allowed to claim the first Studio owner:

```bash
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
```

See [Environment](./environment.md) for the full runtime and CI environment
contract.

## Deploy And Push Contracts

Deploy the generated Convex files, then sync the code-defined collection
contracts:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
```

Successful setup prints that the collection contracts are installed. If
`push --check` reports drift, follow
[Changing collections](../guides/changing-collections.md) before changing shared
data.

## Start Studio

Start the host app with the app's dev command, usually:

```bash
pnpm dev
```

Open `/studio`, register or sign in with the email stored in
`GINKO_FIRST_OWNER_EMAIL`, and claim ownership when Studio prompts for the first
owner. The `pages` collection should appear in the Studio sidebar.

For published website reads, use the
[Nuxt content provider reference](../reference/nuxt-content-provider.md).
