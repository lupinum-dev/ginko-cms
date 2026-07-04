# Environment Contract

This page lists the environment variables used by a Ginko CMS host app, the CMS
server/MCP surface, and maintainer smoke tests. Each variable should have one
owner; do not add a CMS-specific name when Convex, Better Auth, or Ginko Content
already owns the value.

## Values Ginko CMS Reads

Ginko CMS reads these values directly from the host app, CLI process, server
runtime, or Convex environment:

```bash
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:...
CONVEX_IDENTITY_FORWARDING_KEY=long-random-secret
GINKO_FIRST_OWNER_EMAIL=owner@example.com
```

- `NUXT_PUBLIC_CONVEX_URL`: public browser URL used by Nuxt and the Ginko
  content provider.
- `CONVEX_URL`: server-side Convex URL used by CLI/server routes. It may match
  `NUXT_PUBLIC_CONVEX_URL`.
- `CONVEX_DEPLOY_KEY`: Convex-owned admin key. Ginko uses it for server-to-Convex
  admin calls, collection contract sync, and MCP operations.
- `CONVEX_IDENTITY_FORWARDING_KEY`: preferred signing key for Ginko CMS component
  bridge envelopes. The CLI/server environment and Convex deployment must use the
  same value.
- `GINKO_FIRST_OWNER_EMAIL`: required until the first CMS owner has claimed
  ownership in Studio.

## Host, Auth, And Convex Values

These values may be required by the host Nuxt app, Convex, Better Auth, or site
integrations. Ginko CMS does not own all of them, but a complete host deployment
often needs them:

```bash
CONVEX_SITE_URL=https://your-deployment.convex.site
NUXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
CONVEX_DEPLOYMENT=dev:your-deployment-name
BETTER_AUTH_SECRET=long-random-secret
SITE_URL=https://your-site.example
NUXT_PUBLIC_SITE_URL=https://your-site.example
```

- `CONVEX_SITE_URL`: Convex HTTP action site URL.
- `NUXT_PUBLIC_CONVEX_SITE_URL`: public Convex HTTP action site URL when the
  browser needs to call Convex HTTP actions.
- `CONVEX_DEPLOYMENT`: Convex CLI deployment name. Convex owns and writes this
  during project setup.
- `BETTER_AUTH_SECRET`: Better Auth session/signing secret.
- `SITE_URL`: canonical site origin for auth redirects and public URLs.
- `NUXT_PUBLIC_SITE_URL`: browser-visible canonical site origin when public
  runtime config needs it.

## CMS Server And MCP Runtime

MCP and CLI operations that cross the generated bridge also accept a
CMS-specific fallback forwarding key. Prefer `CONVEX_IDENTITY_FORWARDING_KEY`
unless the deployment needs a separate CMS-only secret.

```bash
GINKO_CMS_COMPONENT_FORWARDING_KEY=long-random-secret
```

- `GINKO_CMS_COMPONENT_FORWARDING_KEY`: CMS-specific fallback signing key when
  the Convex-wide identity-forwarding key is not used.

`GINKO_CONTENT_PROVIDER_SITE` is reserved for a future provider site partition.
The provider reads it and defaults to `default`, but current public Convex
queries are not partitioned by this value.

## Maintainer Smoke Tests

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

The bridge forwarding key must also exist in Convex:

```bash
pnpm exec convex env set CONVEX_IDENTITY_FORWARDING_KEY long-random-secret
```

Ginko uses `CONVEX_DEPLOY_KEY` only as Convex admin auth. The CMS caller is
passed as explicit function input to the generated internal bridge functions,
so deploy-key auth and product audit identity are not mixed.

## Workflow Checks

After `pnpm exec ginko-cms init`, the safe local order is:

```bash
pnpm exec ginko-cms deploy
```

`ginko-cms deploy` reads `.env.local` as well as the process environment. It
runs `ginko-cms doctor`, the default local Convex deploy command
(`convex dev --once --tail-logs disable --typecheck disable`), then collection
contract sync.

For CI validation that must not run Convex deploy, use:

```bash
pnpm exec ginko-cms deploy --check
```

If you need a different Convex command, pass the Convex CLI arguments after
`--`. For example, this runs `convex deploy` before contract sync:

```bash
pnpm exec ginko-cms deploy -- deploy
```

For MCP installations, also run:

```bash
pnpm exec ginko-cms mcp-doctor
```

`ginko-cms mcp-doctor` expects the MCP runtime prerequisites, including
`secure-exec`, and reads `.env.local` as well as the process environment. The
MCP runtime itself still needs the same keys in the actual server environment.

## Revalidation Egress

Public cache revalidation targets require an exact hostname allowlist:

```bash
GINKO_CMS_REVALIDATION_ALLOWED_HOSTS=www.example.com
```

Local revalidation targets remain development-only and require
`GINKO_CMS_ALLOW_LOCAL_REVALIDATION=1`.

Each revalidation target stores the name of its signing-token environment
variable as `secretEnv`. Set that target-specific secret in the Convex
environment. Ginko CMS does not require one fixed revalidation token variable
name.

## Removed Names

- `GINKO_CMS_INSTALL_SECRET`: removed. Collection contract sync uses
  `CONVEX_DEPLOY_KEY` admin auth and generated internal bridge functions.
- `GINKO_CONVEX_URL`: removed. Use `NUXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`.
- `GINKO_REVALIDATE_TOKEN`: removed as a fixed global name. Revalidation
  targets store their own `secretEnv` names.
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

## Related Pages

- [Quickstart](./quickstart.md)
- [Nuxt content provider](../reference/nuxt-content-provider.md)
