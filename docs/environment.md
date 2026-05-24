# Environment Contract

Ginko CMS keeps environment variables explicit, but each variable should belong
to one owner. Do not add a new variable when an existing owner already exposes
the value.

## Required By Surface

### Consumer Nuxt App

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SITE_URL=https://your-deployment.convex.site
NUXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
CONVEX_DEPLOYMENT=dev:your-deployment-name
BETTER_AUTH_SECRET=long-random-secret
SITE_URL=https://your-site.example
NUXT_PUBLIC_SITE_URL=https://your-site.example
```

- `NUXT_PUBLIC_CONVEX_URL`: public browser URL used by Nuxt and the Ginko
  content provider.
- `CONVEX_URL`: server-side Convex URL used by CLI/server routes. It may match
  `NUXT_PUBLIC_CONVEX_URL`.
- `CONVEX_SITE_URL`: Convex HTTP action site URL.
- `NUXT_PUBLIC_CONVEX_SITE_URL`: public Convex HTTP action site URL when the
  browser needs to call Convex HTTP actions.
- `CONVEX_DEPLOYMENT`: Convex CLI deployment name. Convex owns and writes this
  during project setup.
- `BETTER_AUTH_SECRET`: Better Auth session/signing secret.
- `SITE_URL`: canonical site origin for auth redirects and public URLs.
- `NUXT_PUBLIC_SITE_URL`: browser-visible canonical site origin when public
  runtime config needs it.

### Ginko CMS Server/MCP

```bash
CONVEX_DEPLOY_KEY=prod:...
GINKO_FIRST_OWNER_EMAIL=owner@example.com
GINKO_CONTENT_PROVIDER_SITE=default
CONVEX_IDENTITY_FORWARDING_KEY=long-random-secret
# or:
GINKO_CMS_COMPONENT_FORWARDING_KEY=long-random-secret
```

- `CONVEX_DEPLOY_KEY`: Convex-owned admin key. Ginko uses it for server-to-Convex
  admin calls, collection contract sync, and MCP operations.
- `GINKO_FIRST_OWNER_EMAIL`: optional bootstrap owner email read by Convex.
- `GINKO_CONTENT_PROVIDER_SITE`: optional site partition for the Ginko Content
  provider. Defaults to `default`.
- `CONVEX_IDENTITY_FORWARDING_KEY`: preferred signing key for Ginko CMS
  component bridge envelopes.
- `GINKO_CMS_COMPONENT_FORWARDING_KEY`: CMS-specific fallback signing key when
  the Convex-wide identity-forwarding key is not used.

### Maintainer Smoke Tests

```bash
GINKO_CMS_TEST_EMAIL=owner@example.com
GINKO_CMS_TEST_PASSWORD=replace-me
```

These are only for browser smoke tests. They are not runtime app config.

## Deploy Key Setup

Local development:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Production/CI:

```bash
pnpm exec convex deployment token create ginko-cms-production --prod
```

Store the printed value as `CONVEX_DEPLOY_KEY` in the server or CI secret store.
Do not expose it through `NUXT_PUBLIC_*`.

Ginko uses `CONVEX_DEPLOY_KEY` only as Convex admin auth. The CMS caller is
passed as explicit function input to the generated internal bridge functions,
so deploy-key auth and product audit identity are not mixed.

## Workflow Checks

After `pnpm exec ginko-cms init`, the safe local order is:

```bash
pnpm exec convex dev --once --tail-logs disable --typecheck disable
pnpm exec ginko-cms push
pnpm exec ginko-cms push --check
pnpm exec ginko-cms mcp-doctor
```

`ginko-cms push` and `ginko-cms mcp-doctor` read `.env.local` as well as the
process environment. The MCP runtime itself still needs the same keys in the
actual server environment.

## Network Egress Allowlists

MCP does not fetch remote assets. Public cache revalidation targets require an
exact hostname allowlist:

```bash
GINKO_CMS_REVALIDATION_ALLOWED_HOSTS=www.example.com
```

Local revalidation targets remain development-only and require
`GINKO_CMS_ALLOW_LOCAL_REVALIDATION=1`.

## Removed Names

- `GINKO_CMS_INSTALL_SECRET`: removed. Collection contract sync uses
  `CONVEX_DEPLOY_KEY` admin auth and generated internal bridge functions.
- `GINKO_CONVEX_URL`: removed. Use `NUXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`.
- `GINKO_REVALIDATE_TOKEN`: removed. Use
  `GINKO_CONTENT_REVALIDATE_TOKEN`.
- `GINKO_PROVIDER_*`: removed. Provider-owned names use
  `GINKO_CONTENT_PROVIDER_*`; function prefix and default locale are not env
  variables.
- `CMS_SMOKE_EMAIL` / `CMS_SMOKE_PASSWORD`: renamed to
  `GINKO_CMS_TEST_EMAIL` / `GINKO_CMS_TEST_PASSWORD`.

## Naming Rule

- Keep provider-owned names under `GINKO_CONTENT_*`.
- Keep CMS-owned names under `GINKO_CMS_*`.
- Keep Trellis-owned names under `TRELLIS_*`.
- Keep Convex-owned names as `CONVEX_*`.
- Do not expose server secrets with `NUXT_PUBLIC_*`.
