# Quickstart

This page gets a Nuxt app to the first checked Ginko CMS setup: packages
installed, one collection defined, direct Convex setup files written,
Convex deployed, collection contracts synced, and Studio reachable by the first
owner.

## Prerequisites

You need a Nuxt app, pnpm through Corepack, and a Convex deployment for the app.
The commands below assume the app uses Ginko Content as the content contract
source.

## Install Packages

Install the CMS-facing packages in the host app:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex better-convex-nuxt better-auth
pnpm add -D convex
```

The host app installs the Convex component and `better-convex-nuxt` directly
because `convex/convex.config.ts` mounts components from the owning packages and
the Nuxt app owns Convex/Better Auth runtime wiring.

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

const pages = defineCollection({
  type: 'page',
  source: '**/*.md',
})

export default defineContentConfig({
  provider: 'cms',
  collections: { pages },
})
```

## Generate Convex Setup Files

Run the init command from the Nuxt app root:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

The first doctor run names the still-unbound generated contract binding and
directs you to `pnpm exec ginko-cms deploy`. Deploy reruns every other setup
check, binds the canonical hashes, and completes the fix. Rerun doctor after the
deployment to confirm the setup is clean.

`ginko-cms init` writes the host-owned Convex setup files:

- `convex/auth.ts`
- `convex/auth.config.ts`
- `convex/http.ts`
- `convex/schema.ts`
- the Ginko CMS component registration in `convex/convex.config.ts`

Keep `convex/convex.config.ts`, `convex/auth.config.ts`, and
`convex/schema.ts` app-owned after the setup baseline is present. Add
app-specific Better Auth providers in `convex/auth.config.ts` and app tables in
`convex/schema.ts`.

The generated baseline wires the CMS Better Auth setup and email/password
Studio auth. Production OAuth, SSO, custom email delivery, or organization auth
policy remains host-owned Better Auth configuration.

## Configure Local Environment

For local setup and contract sync, the CLI needs a Convex URL and deploy key.
Create the deploy key with:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Then ensure `.env.local` includes either `CONVEX_URL` or
`NUXT_PUBLIC_CONVEX_URL`.

Set the email allowed to claim the first Studio owner:

```bash
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
```

See [Environment](./environment.md) for the full runtime and CI environment
contract.

## Deploy And Sync Contracts

Deploy the generated Convex files and sync the code-defined collection
contracts with one command:

```bash
pnpm exec ginko-cms deploy
```

`ginko-cms deploy` runs `ginko-cms doctor`, the default local Convex deploy command
(`convex dev --once --tail-logs disable --typecheck disable`), then contract
sync. Successful setup prints that the collection contracts are installed.

For CI or read-only validation after the first deploy, run:

```bash
pnpm exec ginko-cms deploy --check
```

If `deploy --check` reports drift, follow
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
For the next content-model steps, use
[Next collections](./next-collections.md).
