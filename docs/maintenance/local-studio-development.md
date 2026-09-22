# Local Studio development

Use this workflow when changing the CMS Studio and you need a real Nuxt host,
Convex data, Better Auth login, and Studio hot module replacement (HMR).

## One-time setup

Each worktree owns one ignored `.env.local` and one local Convex data directory.
Do not copy `.env.local`, `.convex`, accounts, or data from another checkout.
From the Ginko CMS repository root:

```bash
corepack pnpm install
corepack pnpm run build
corepack pnpm exec better-convex convex dev --anonymous
```

The anonymous command creates a disposable local backend without requiring a
Convex account or an existing project. Keep it running while configuring the
environment below. For a worktree already associated with a Convex project,
`corepack pnpm exec better-convex convex deployment select local` selects its
existing local deployment instead; that command cannot create the first project.

The checked Better Convex runner clears inherited `CONVEX_*` values and writes
the selected local authority to `.env.local`. Inspect the variable names before
the first write. The file must select `anonymous:anonymous-*` or `local:*`, contain loopback Convex URLs,
and remain owner-readable only. The optional TLS workflow below instead selects
the exact same local backend through its explicit self-hosted URL/key pair.

```bash
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env.local | sort
chmod 600 .env.local
```

Add `SITE_URL=http://localhost:3000`, copy the generated `VITE_CONVEX_URL` and
`VITE_CONVEX_SITE_URL` values to `NUXT_PUBLIC_CONVEX_URL` and
`NUXT_PUBLIC_CONVEX_SITE_URL`, and add independent random
`BCN_AUTH_PROXY_IP_SECRET` and `GINKO_LOCAL_DELIVERY_SECRET` values to the same
ignored file. If the backend is not already running, start it in one terminal
while its Convex-only values are configured from another:

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
corepack pnpm exec better-convex convex env set GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_URL http://127.0.0.1:5251/email-verification
corepack pnpm exec better-convex convex env set GINKO_MEMBER_INVITATION_DELIVERY_URL http://127.0.0.1:5251/member-invitation
corepack pnpm exec better-convex convex env set GINKO_MEMBER_INVITATION_ACCEPT_URL http://localhost:3000/studio/invitations/accept
printf '0:%s' "$(openssl rand -base64 32)" | corepack pnpm exec better-convex convex env set BETTER_AUTH_SECRETS
set -a; . ./.env.local; set +a
printf '%s' "$BCN_AUTH_PROXY_IP_SECRET" | corepack pnpm exec better-convex convex env set BCN_AUTH_PROXY_IP_SECRET
printf '%s' "$GINKO_LOCAL_DELIVERY_SECRET" | corepack pnpm exec better-convex convex env set GINKO_CMS_PASSWORD_RESET_WEBHOOK_TOKEN
printf '%s' "$GINKO_LOCAL_DELIVERY_SECRET" | corepack pnpm exec better-convex convex env set GINKO_CMS_EMAIL_VERIFICATION_WEBHOOK_TOKEN
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
The inbox keeps verification, reset and invitation links in memory and binds only to
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

Each invited person must sign up with the invited email, open their email
verification link from the inbox, then sign in again before accepting the
invitation. The fresh session carries the verified-email claim. An account
without that claim cannot accept an invitation. Use separate browser profiles
when checking collaboration between two people; two tabs with the same session
do not test independent membership.

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
If the delivery port changes, update all three delivery webhook URLs in the local
Convex deployment to the same port.

Cloud development and hosted staging are separate, explicit trials. Select an
isolated `dev:*` deployment in this worktree only when local Convex cannot prove
the required boundary. Record its deployment name, scoped key owner, synthetic
data, effect limits, and cleanup. The loopback inbox cannot receive callbacks
from Convex Cloud; use an approved hosted capture endpoint instead.

## Optional HTTPS for local images

The production image policy requires HTTPS. A normal local Convex backend
returns HTTP storage URLs, so testing publication with real images needs a
trusted local HTTPS storage origin. Keep the production policy unchanged.

Use a localhost certificate from an **already trusted** development CA. Keep
the certificate and its private key in an ignored directory; make the private
key owner-readable only. Verify the certificate against the system trust store
before using it. This workflow never installs a CA, changes system trust, or
disables TLS verification. If the machine has no trusted development CA, its
setup is a separate operator decision.

Stop the ordinary local backend first and back up `.env.local` in an ignored,
owner-only location. Keep `.convex/local/default` and its database intact. Replace
the `CONVEX_DEPLOYMENT` selector with `CONVEX_SELF_HOSTED_URL` set to the existing
`http://127.0.0.1:<cloud-port>` and `CONVEX_SELF_HOSTED_ADMIN_KEY` set to the existing
`adminKey` from `.convex/local/default/config.json`. Do not select a different
deployment or introduce a hosted deploy key. Add these local-only settings:

```dotenv
GINKO_LOCAL_TLS_ORIGIN=https://localhost:3443
GINKO_LOCAL_TLS_CERT=.tmp/experience/certs/localhost.pem
GINKO_LOCAL_TLS_KEY=.tmp/experience/certs/localhost-key.pem
```

Run the same `corepack pnpm run dev:consumer` command. In this opt-in mode the
launcher owns the pinned native backend and a loopback-only storage proxy,
and Better Convex's checked runner deploys to that existing local backend.
It validates the URL and key against the local metadata before startup.
The native backend advertises HTTPS storage URLs; browser queries, authentication,
and deployment still use their existing loopback endpoints. Only storage
requests pass through the TLS proxy. Stopping the command stops both processes.
`node scripts/local-convex-tls.mjs` starts only this backend and proxy for checked
codegen or deployment; stop it before starting the full consumer command.

TLS protects transport; it does not change Convex's storage capability model.
Anyone who already possesses a raw storage URL can fetch its bytes. CMS draft
queries and asset discovery still require the normal membership checks.

To return to ordinary local development, stop the stack, restore the backed-up
anonymous/local authority, and remove the three TLS settings. Keep the same
database. Previously emitted HTTPS links require the proxy to remain available;
freshly resolved URLs follow the currently running backend's origin.

## Fast troubleshooting

- `Invalid origin`: use `http://localhost:3000`, not `127.0.0.1`, and verify
  the Convex deployment's `SITE_URL`.
- Redirected back to sign-in: verify the account exists and its email matches
  the configured first owner or an existing CMS member.
- Empty or failed CMS queries: rerun `corepack pnpm run dev:prepare` and inspect
  the Convex deployment logs.
- Installed contract differs after a restart: preparation resolves the current
  Content policy, but the launcher never installs a contract or migrates data.
  Prepare after changing Content configuration, then use the normal CMS
  `deploy --check` and reviewed contract deployment/transition workflow against
  that resolved contract. Do not reset the local database to clear the banner.
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
- Nitro reports `spawn EBADF` on macOS with Node 24: use `dev:consumer` or
  `dev`, which initialize Nitro's esbuild service before Nuxt changes terminal
  handling and keep Nuxt in that process with `--no-fork`. Direct `nuxi dev`
  does not include this local development workaround. No production or library
  runtime imports the preload.

## Local Content and Editor candidates

This integration branch installs the reviewed Content beta.9 and Editor 0.1.0
archives through the workspace overrides. Copy the exact archives recorded in
`packages/cms/compatibility.json` to `.pack/upstream/`, then run
`corepack pnpm install --frozen-lockfile`. Both packages share the host's Vue,
TipTap and Content instances through the normal dependency graph.

The archives are local development candidates, not registry-approved releases.
Their source commits and hashes identify the tested bytes. Do not substitute an
older package with the same version. `internals/migrations.md` records the
registry cutover and rollback conditions. There is no post-install script that
silently replaces dependency links.
