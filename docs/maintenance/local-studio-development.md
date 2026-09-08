# Local Studio Development

Use this workflow when changing the CMS Studio and you need a real Nuxt host,
Convex data, Better Auth login, and Studio hot module replacement (HMR).

## One-time setup

Each worktree owns one ignored `.env.local` and one local Convex data directory.
Do not copy `.env.local`, `.convex`, accounts, or data from another checkout.
From the Ginko CMS repository root:

```bash
corepack pnpm install
corepack pnpm exec better-convex convex deployment select local
```

The checked Better Convex runner clears inherited `CONVEX_*` values and writes
the selected local authority to `.env.local`. Inspect the variable names before
the first write. The file must select `local:*`, contain loopback Convex URLs,
and remain owner-readable only:

```bash
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env.local | sort
chmod 600 .env.local
```

Add `SITE_URL=http://localhost:3000`, copy the generated `VITE_CONVEX_URL` and
`VITE_CONVEX_SITE_URL` values to `NUXT_PUBLIC_CONVEX_URL` and
`NUXT_PUBLIC_CONVEX_SITE_URL`, and add independent random
`BCN_AUTH_PROXY_IP_SECRET` and `GINKO_LOCAL_DELIVERY_SECRET` values to the same
ignored file. Keep the local backend running in one terminal while its
Convex-only values are configured from another:

```bash
corepack pnpm exec better-convex convex dev
```

Configure independent random Better Auth and proxy secrets, a synthetic first
owner, and the loopback-only delivery capture. Pipe secrets to the checked
runner; do not put them in shell arguments or logs:

```bash
corepack pnpm exec better-convex convex env set SITE_URL http://localhost:3000
corepack pnpm exec better-convex convex env set GINKO_FIRST_OWNER_EMAIL owner+ginko-local@example.test
corepack pnpm exec better-convex convex env set GINKO_CMS_PASSWORD_RESET_WEBHOOK_URL http://127.0.0.1:5251/password-recovery
corepack pnpm exec better-convex convex env set GINKO_MEMBER_INVITATION_DELIVERY_URL http://127.0.0.1:5251/member-invitation
corepack pnpm exec better-convex convex env set GINKO_MEMBER_INVITATION_ACCEPT_URL http://localhost:3000/studio/invitations/accept
printf '0:%s' "$(openssl rand -base64 32)" | corepack pnpm exec better-convex convex env set BETTER_AUTH_SECRETS
set -a; . ./.env.local; set +a
printf '%s' "$BCN_AUTH_PROXY_IP_SECRET" | corepack pnpm exec better-convex convex env set BCN_AUTH_PROXY_IP_SECRET
printf '%s' "$GINKO_LOCAL_DELIVERY_SECRET" | corepack pnpm exec better-convex convex env set GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN
printf '%s' "$GINKO_LOCAL_DELIVERY_SECRET" | corepack pnpm exec better-convex convex env set GINKO_MEMBER_INVITATION_DELIVERY_SECRET
```

Use the same `localhost` origin configured by `SITE_URL`. Better Auth rejects a
different hostname or port as an invalid origin.

After the first deploy to a fresh Convex deployment, bootstrap its signing key
once before opening Studio:

```bash
corepack pnpm exec better-convex convex run auth:rotateSigningKey '{}'
```

Stop the temporary backend after setup. Ordinary development starts it
again with the rest of the stack. Create only synthetic accounts and content.
The inbox keeps reset and invitation links in memory and binds only to
`127.0.0.1`; it is not a sandbox against another local process.

This operator action is intentional: public JWKS reads never create signing
state. Run it again only for a planned key rotation.

## Start the authenticated HMR stack

```bash
corepack pnpm run dev:consumer
```

This one command:

- starts the worktree's selected local Convex backend through Better Convex's
  checked authority runner;
- loads the repository `.env.local`;
- starts the Nuxt playground at `http://localhost:3000`;
- starts the Studio Vite server at `http://localhost:5252` (or the next free
  port);
- starts the in-memory delivery inbox at `http://127.0.0.1:5251`;
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
Use normal member invitations to create publisher, editor, and viewer accounts.
Open captured one-time links from the local inbox; do not add role setters or a
test login bypass.

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
GINKO_LOCAL_DELIVERY_PORT=5254 corepack pnpm run dev:consumer
corepack pnpm run dev:consumer -- --studio-only
```

If the consumer URL changes, update the deployment's Better Auth `SITE_URL` (or
its trusted-origin configuration) to the exact browser origin before testing
login.
If the delivery port changes, update both delivery webhook URLs in the local
Convex deployment to the same port.

Cloud development and hosted staging are separate, explicit trials. Select an
isolated `dev:*` deployment in this worktree only when local Convex cannot prove
the required boundary. Record its deployment name, scoped key owner, synthetic
data, effect limits, and cleanup. The loopback inbox cannot receive callbacks
from Convex Cloud; use an approved hosted capture endpoint instead.

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
