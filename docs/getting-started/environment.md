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
CONVEX_SITE_URL=https://your-deployment.convex.site
CONVEX_DEPLOY_KEY=prod:...
GINKO_FIRST_OWNER_EMAIL=owner@example.com
```

- `NUXT_PUBLIC_CONVEX_URL`: public browser URL used by Nuxt and the Ginko
  content provider.
- `CONVEX_URL`: server-side Convex URL used by CLI/server routes. It may match
  `NUXT_PUBLIC_CONVEX_URL`.
- `CONVEX_SITE_URL`: Convex HTTP action site URL. `better-convex-nuxt` resolves
  it into the canonical `runtimeConfig.public.convex.siteUrl` used by MCP token
  exchange.
- `CONVEX_DEPLOY_KEY`: Convex-owned admin key. Ginko uses it for setup and
  collection contract sync admin transport.
- `GINKO_FIRST_OWNER_EMAIL`: required until the first CMS owner has claimed
  ownership in Studio.

## Host, Auth, And Convex Values

These values may be required by the host Nuxt app, Convex, Better Auth, or site
integrations. Ginko CMS does not own all of them, but a complete host deployment
often needs them:

```bash
NUXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
CONVEX_DEPLOYMENT=dev:your-deployment-name
BETTER_AUTH_SECRETS=0:long-random-secret
BCN_AUTH_PROXY_IP_SECRET=independent-proxy-signature-secret
GINKO_CMS_MCP_SERVER_SECRET=independent-mcp-server-secret
GINKO_CMS_PORTABILITY_SECRET=independent-portability-token-secret
GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL=https://mailer.example/hooks/password-recovery
GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN=secret-manager-value
GINKO_MEMBER_INVITATION_DELIVERY_URL=https://mailer.example/hooks/member-invitation
GINKO_MEMBER_INVITATION_DELIVERY_SECRET=secret-manager-value
GINKO_MEMBER_INVITATION_ACCEPT_URL=https://your-site.example/studio/invitations/accept
SITE_URL=https://your-site.example
NUXT_PUBLIC_SITE_URL=https://your-site.example
```

- `NUXT_PUBLIC_CONVEX_SITE_URL`: public Convex HTTP action site URL when the
  browser needs to call Convex HTTP actions.
- `CONVEX_DEPLOYMENT`: Convex CLI deployment name. Convex owns and writes this
  during project setup.
- `BETTER_AUTH_SECRETS`: Convex-only, versioned Better Auth encryption and
  signing secrets. The first version is current; retain older versions while
  ciphertext still depends on them. Never expose this value to Nuxt.
- `BCN_AUTH_PROXY_IP_SECRET`: separate secret shared by Nuxt and Convex for the
  Better Convex Nuxt trusted-client-IP assertion.
- `GINKO_CMS_MCP_SERVER_SECRET`: separate secret shared by Nuxt and Convex when
  private MCP service credentials are enabled. Minimum 32 characters.
- `GINKO_CMS_PORTABILITY_SECRET`: Nuxt-only secret that seals owner-CLI asset
  transfer attempts. Do not reuse an auth or MCP secret.
- `GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL`: approved HTTPS email-delivery webhook
  for Better Auth password recovery. Embedded URL credentials are rejected.
- `GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN`: bearer credential sent only to the
  configured recovery webhook. Keep it in the Convex environment/secret store.
- `GINKO_MEMBER_INVITATION_DELIVERY_URL`: approved host-owned HTTPS delivery
  boundary for CMS member invitations. Localhost HTTP is accepted only for
  development.
- `GINKO_MEMBER_INVITATION_DELIVERY_SECRET`: bearer credential sent only to the
  invitation delivery boundary. Keep it in the Convex environment/secret store.
- `GINKO_MEMBER_INVITATION_ACCEPT_URL`: absolute Studio acceptance URL. Use
  `<studio-route>/invitations/accept`; production values must use HTTPS.
- `SITE_URL`: canonical site origin for auth redirects and public URLs.
- `NUXT_PUBLIC_SITE_URL`: browser-visible canonical site origin when public
  runtime config needs it.

Password recovery remains Better Auth-owned: its one-hour token is consumed
once by Better Auth, existing sessions are revoked after reset, and CMS
membership is checked again on the next sign-in. Ginko sends the provider URL
to the configured webhook but never creates a password-reset table or writes
the token to logs/activity.

The invitation delivery boundary receives a JSON `POST` with
`invitationId`, normalized `email`, reviewed `role`, `expiresAt`, and
`acceptUrl`, authenticated by
`Authorization: Bearer $GINKO_MEMBER_INVITATION_DELIVERY_SECRET`. The raw
one-time token exists only in the URL fragment of `acceptUrl`, so it is not sent
with the page request. It is never returned to Studio, persisted in CMS data, or
included in activity. The acceptance page removes the fragment after capture,
requires authentication, and is marked `noindex`.

## CMS Server And MCP Runtime

Server-side MCP tools use CMS-owned private service credentials. Studio creates
a random bearer once, Convex stores only its SHA-256 hash, and the Nuxt MCP
boundary sends only that hash plus the private server assertion to Convex. The
component re-checks credential status, expiry, owner membership, role, and
scopes on every protected tool call. This path does not exchange a Better Auth
session token and does not require `CONVEX_DEPLOY_KEY`.

## Owner Maintenance Session

The `ginko-cms content`, `ginko-cms repair`, `ginko-cms asset cleanup`,
`ginko-cms asset recovery`, and `ginko-cms doctor --deployment` operator commands
also require:

```bash
GINKO_CMS_SESSION_COOKIE='better-auth.session_token=...'
```

Provide this short-lived Better Auth session cookie in the invoking shell or a
secret manager-backed process environment. Do not commit it to `.env.local`, a
portable directory, or an import plan. The commands exchange the cookie for a
fresh Convex token before each JSON operation and send it only to the configured
Better Auth and CMS origins. `CONVEX_DEPLOY_KEY` is not an alternative product
identity for these commands.

The operator commands also use `CONVEX_DEPLOYMENT` to bind plans and runs,
`CONVEX_SITE_URL` for token exchange, and `SITE_URL` (or
`NUXT_PUBLIC_SITE_URL`) for authenticated asset byte transfer. The CLI also
accepts `GINKO_CMS_BETTER_AUTH_BASE_URL` as an explicit operator-only override;
the Nuxt MCP runtime does not.
See [Portable content export and import](../guides/content-portability.md).

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

Ginko uses `CONVEX_DEPLOY_KEY` only as Convex admin transport. Product audit
identity is resolved by the CMS component from member auth or Better Auth API-key
credential settings, so deploy-key auth and product authorization are not mixed.

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
`secure-exec`, a Convex URL, and a Better Auth base URL source. It reads
`.env.local` as well as the process environment. The MCP runtime itself needs
the same values in the actual server environment.

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

Only one target may be enabled for each of `production`, `preview`, and
`development`. Disable the current target before enabling a replacement. Target
URLs must not contain a username or password, and delivery never follows HTTP
redirects.

## Removed Names

- `GINKO_CMS_INSTALL_SECRET`: removed. Collection contract sync uses
  `CONVEX_DEPLOY_KEY` admin auth and narrow internal component functions.
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
- Keep integration-owned names scoped to the integration that reads them.
- Keep Convex-owned names as `CONVEX_*`.
- Do not expose server secrets with `NUXT_PUBLIC_*`.

## Related Pages

- [Quickstart](./quickstart.md)
- [Nuxt content provider](../reference/nuxt-content-provider.md)
