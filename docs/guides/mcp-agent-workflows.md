# MCP Agent Workflows

Ginko CMS exposes MCP as a small CMS product surface for delegated content work.
It is not a raw database, schema, member, or settings API.

## Current Connection Model

MCP bearer tokens are Ginko-owned credentials. An owner creates a connection
that binds the generated secret to a CMS member, supported MCP scopes, expiry,
and active status. The secret is shown once, only its hash is stored, and an
owner can revoke it immediately.

Owners manage the connection lifecycle in Studio settings. Verify the deployed
runtime and generated host boundary with:

```bash
pnpm exec ginko-cms mcp-doctor
```

## Tool Surface

The v1 MCP surface is intentionally narrow:

- list and inspect collection contracts;
- list, search, and read entries;
- create entries and save drafts;
- inspect assets and resolve public asset URLs;
- preview publish impact;
- request publish review;
- inspect own agent runs and review status.

MCP does not expose schema mutation, member management, settings management, raw
table reads, deploy/admin tools, content portability, direct delete, purge, or
direct public-output operations.

## Draft Work

Agents can prepare content by creating entries or saving drafts when their
credential scope and current CMS role allow it. Draft writes require an active
`agentRun` id so the CMS can audit which delegated work session performed the
write.

Saving a draft never changes public output.

## Publish Review

The supervised publish path is:

1. Read the entry and current draft version.
2. Save draft changes.
3. Call `preview-publish` to inspect blockers and public impact.
4. Call `request-publish-review` with the observed version.
5. Call `get-review-status` to follow the request.
6. Have a publisher or owner approve or reject the request in Studio.

Approval calls the canonical backend publish operation and re-checks current
role plus stale draft state. Rejection has no public-output effect.

## Safety Rules

- MCP tools must not accept `authUserId`, member id, role, token hash, or raw
  authority fields.
- Structured MCP responses redact secret-bearing fields and Convex creation
  metadata.
- Completed, revoked, failed, or expired agent runs cannot keep writing.
- MCP public-output and destructive actions remain review- or owner-controlled;
  no credential scope enables direct publish, unpublish, archive, restore,
  delete, or purge.

## Server Environment

MCP bearer identity is resolved from the Ginko credential hash and current CMS
state. The server signs a short-lived assertion bound to the exact Convex
function instead of forwarding the long-lived bridge secret. Keep raw MCP
bearer tokens in external client config only.
