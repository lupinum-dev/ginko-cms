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

The MCP server environment needs a Convex URL plus one Better Auth base URL
source: `GINKO_CMS_BETTER_AUTH_BASE_URL`, `CONVEX_SITE_URL`, or
`BETTER_AUTH_URL`. Keep `CONVEX_DEPLOY_KEY` for setup and contract sync only.

## Backups

Before changing production content or generated host files, preserve a verified
backup through the owner-authenticated backup workflow. Restore apply is narrow
in v1 and should be treated as an operator repair path, not a generic rollback
button.

## Audit And Rollback

For MCP-assisted work, audit the `agentRuns` and `reviewRequests` records before
approving public-output changes. Review requests bind the operation id, caller,
target entry, arguments, preview state, and draft version; stale draft state or
changed diagnostics require a new request.

Rollback for a bad migration is operational, not automatic. Restore from a
verified backup only after preserving the current state, then rerun
`pnpm exec ginko-cms deploy --check` and inspect Studio before resuming writes.
