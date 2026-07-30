# Local Studio Development

Use this workflow when changing the CMS Studio and you need a real Nuxt host,
Convex data, Better Auth login, and Studio hot module replacement (HMR).

## One-time setup

From the Ginko CMS repository root:

```bash
corepack pnpm install
corepack pnpm run dev:prepare
```

The repository-local `.env.local` must contain:

```bash
CONVEX_DEPLOYMENT=dev:...
CONVEX_URL=https://....convex.cloud
CONVEX_SITE_URL=https://....convex.site
```

The configured Convex deployment must contain:

```bash
BETTER_AUTH_SECRETS=0:...
BCN_AUTH_PROXY_IP_SECRET=...
GINKO_FIRST_OWNER_EMAIL=owner@example.com
SITE_URL=http://localhost:3000
```

Do not print secret values while checking the environment. To list only the
local variable names:

```bash
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env.local | sort
```

Use the same `localhost` origin configured by `SITE_URL`. Better Auth rejects a
different hostname or port as an invalid origin.

After the first deploy to a fresh Convex deployment, bootstrap its signing key
once before opening Studio:

```bash
corepack pnpm exec better-convex-nuxt-convex run auth:rotateSigningKey '{}'
```

This operator action is intentional: public JWKS reads never create signing
state. Run it again only for a planned key rotation.

## Start the authenticated HMR stack

```bash
corepack pnpm run dev:consumer
```

This one command:

- loads the repository `.env.local`;
- starts the Nuxt playground at `http://localhost:3000`;
- starts the Studio Vite server at `http://localhost:5252` (or the next free
  port);
- injects the Vite URL into the Nuxt host so Studio source edits use HMR.

The launcher keeps pnpm's dependency auto-verifier in warning mode because this
workflow runs the source-linked local workspace during active development. It
does not relax peer resolution or alter candidate manifests; clean packed
consumers still install from scratch and enforce the compatibility tuple.

Open:

```text
http://localhost:3000/studio
```

Sign in with the local owner account. Keep credentials only in `.env.local` or
your secret manager; never add them to committed docs or shell history.

## Verify HMR

1. Open `http://localhost:3000/studio` and sign in.
2. Edit visible text or styling under `packages/cms/studio-app/src/`.
3. Confirm the browser updates without a full Nuxt restart and the terminal
   reports a Vite hot update.
4. Revert the temporary visual edit.

Studio SPA changes under `packages/cms/studio-app/src/` hot-reload. Changes to
the Nuxt module, runtime host pages, Convex component, or built package output
do not use this Studio HMR path. For those changes, stop the stack, run:

```bash
corepack pnpm run dev:prepare
corepack pnpm run dev:consumer
```

Also stop the stack before running `corepack pnpm run check`. The check runs
Nuxt preparation and rewrites `playground/.nuxt`; doing that underneath a live
Nuxt dev server can leave its generated virtual-module aliases stale.

## Useful overrides

```bash
GINKO_CMS_CONSUMER_URL=http://localhost:3001 corepack pnpm run dev:consumer
GINKO_STUDIO_PORT=5253 corepack pnpm run dev:consumer
corepack pnpm run dev:consumer -- --studio-only
```

If the consumer URL changes, update the deployment's Better Auth `SITE_URL` (or
its trusted-origin configuration) to the exact browser origin before testing
login.

## Fast troubleshooting

- `Invalid origin`: use `http://localhost:3000`, not `127.0.0.1`, and verify
  the Convex deployment's `SITE_URL`.
- Redirected back to sign-in: verify the account exists and its email matches
  the configured first owner or an existing CMS member.
- Empty or failed CMS queries: rerun `corepack pnpm run dev:prepare` and inspect
  the Convex deployment logs.
- Studio loads but edits do not hot-reload: confirm the page requests
  `http://localhost:5252/src/main.ts` and that the Studio Vite process is still
  running.
- `[plugin:vite:import-analysis] Failed to resolve import "#app-manifest"`:
  stop and restart `corepack pnpm run dev:consumer`. This occurs when
  `playground/.nuxt` was regenerated while Nuxt dev was running; do not disable
  the Vite overlay.
- Port already in use: stop the existing process or set
  `GINKO_CMS_CONSUMER_URL` / `GINKO_STUDIO_PORT` to free ports, keeping the auth
  origin in sync.
