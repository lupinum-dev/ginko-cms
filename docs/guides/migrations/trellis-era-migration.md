# Trellis-Era Migration

This guide is for host apps moving from older Trellis-era Ginko CMS setup files
to the direct Convex and Better Auth package shape.

## Target Shape

A migrated host app installs the publishable packages directly:

```bash
pnpm add @lupinum/ginko-content @lupinum/ginko-cms @lupinum/ginko-cms-convex better-convex-nuxt @convex-dev/better-auth better-auth
pnpm add -D convex
```

The Nuxt app owns Convex and Better Auth wiring. Ginko CMS owns the CMS product
component, Studio, content contracts, assets, publishing, MCP credential
settings, agent runs, and review requests.

## Regenerate The Setup Baseline

From the host app root, run:

```bash
pnpm exec ginko-cms init
pnpm exec ginko-cms doctor
```

Review the generated files before deploying:

- `convex/auth.ts`
- `convex/auth.config.ts`
- `convex/http.ts`
- `convex/schema.ts`
- `convex/convex.config.ts`

Keep these files host-owned and thin. Add app-specific Better Auth providers in
`convex/auth.config.ts` and app tables in `convex/schema.ts`.

## Deploy And Sync

Create or provide a server-only Convex deploy key:

```bash
pnpm exec convex deployment token create ginko-cms-local-admin --save-env .env.local
```

Deploy and sync contracts through the CMS CLI:

```bash
pnpm exec ginko-cms deploy
```

For CI validation that must not run Convex deploy:

```bash
pnpm exec ginko-cms deploy --check
```

## Cleanup Checklist

Remove old host-generated Trellis artifacts and local-only assumptions:

- Trellis package dependencies and aliases.
- `#trellis` imports.
- `_trellisForwarding` host bridge code.
- generated operation descriptor or handle files from old bridges.
- local `file:`, `workspace:`, or `link:` dependency specs for CMS packages in
  release-facing manifests.
- old custom MCP key UI or docs that refer to CMS-owned raw `mcpKeys`.
- any client-visible use of `CONVEX_DEPLOY_KEY`.

Then run:

```bash
pnpm exec ginko-cms doctor
pnpm exec ginko-cms deploy --check
```

## MCP Changes

Legacy CMS-owned `mcpKeys` are gone. MCP bearer tokens are Better Auth API keys
plus CMS `mcpCredentialSettings`.

Normal MCP tool calls no longer use `CONVEX_DEPLOY_KEY` as Convex transport.
The server verifies the Better Auth API key, requests a Better Auth Convex token
from `/api/auth/convex/token`, and the CMS component treats the request as MCP
only when that token's `sessionId` matches active credential settings owned by
the authenticated user.

Agent public-output changes are review-gated by default. Existing automation
that expected direct publish/delete should be moved to draft, preview, and
review-request workflows.

The MCP server uses the normalized `runtimeConfig.public.convex.siteUrl` owned
by `better-convex-nuxt`. Configure `convex.siteUrl` (or its supported Convex
environment input) once; do not add a CMS-specific runtime auth origin. Keep
`CONVEX_DEPLOY_KEY` for setup and contract sync only.

### Required v0.1.3 Credential Cutover

The `0.1.3` component schema contains hashed legacy `mcpKeys`. Those secrets
cannot be converted into Better Auth API keys. Production upgrades therefore
use the coordinated bridge artifact from commit `2d4827e0` before the final
`0.2` candidate:

1. Take and verify an official Convex deployment snapshot.
2. Deploy the bridge package and regenerate the host setup files.
3. Run the host-internal one-shot function:

   ```bash
   pnpm exec convex run ginkoCms/legacyCredentialCutover:revokeAndDeleteLegacyMcpKeys '{}'
   ```

4. Run it once more and require `alreadyComplete: true`, then verify the
   `legacyCredentialCutovers` receipt and an empty `mcpKeys` table.
5. Deploy the final `0.2` package and delete the temporary host
   `convex/ginkoCms/legacyCredentialCutover.ts` wrapper.
6. Owners create replacement Better Auth API keys and explicit CMS credential
   settings.

No bridge runtime accepts a legacy token. The bridge only deletes the old rows
and records aggregate counts; it never reads or exports raw credential material.

## Backups

Before changing production content or generated host files, create and verify an
official Convex deployment snapshot. Custom CMS exports are bounded comparison
artifacts; restore apply is a narrow unreferenced-asset repair path, not a generic
rollback button.

## Audit And Rollback

For MCP-assisted work, audit the `agentRuns` and `reviewRequests` records before
approving public-output changes. Review requests bind the operation id, caller,
target entry, arguments, preview state, and draft version; stale draft state or
changed diagnostics require a new request.

Rollback for a bad migration is operational, not automatic. Restore an official
pre-upgrade Convex snapshot only after preserving the current state, then rerun
`pnpm exec ginko-cms deploy --check` and inspect Studio before resuming writes.
Downgrade of a deployment containing `0.2.x` data to `0.1.3` is unsupported.
