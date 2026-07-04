# MCP Agent Workflows

Ginko CMS exposes MCP as a small CMS product surface for delegated content work.
It is not a raw database, schema, member, or settings API.

## Current Connection Model

MCP bearer tokens are Better Auth API keys. The raw key is shown only by Better
Auth at creation time and is not stored by Ginko CMS.

For a key to use CMS tools, an owner or settings-capable user must also create
active `mcpCredentialSettings` for the Better Auth API-key id. Those settings
bind the key to a CMS member, scopes, optional collection limits, and safety
mode.

The final Studio connection-management flow is not complete yet. Until that UI
ships, treat MCP connections as an advanced operator flow and verify them with:

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
table reads, deploy/admin tools, direct delete, purge, or direct publish as v1
defaults.

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
5. Have a publisher or owner approve or reject the request in Studio.

Approval calls the canonical backend publish operation and re-checks current
role plus stale draft state. Rejection has no public-output effect.

## Safety Rules

- MCP tools must not accept `authUserId`, member id, role, token hash, or raw
  authority fields.
- Structured MCP responses redact secret-bearing fields and Convex creation
  metadata.
- Completed, revoked, failed, or expired agent runs cannot keep writing.
- Trusted direct execution is metadata only in the current v1 slice; it does not
  grant direct publish/delete/purge.

## Server Environment

MCP bearer identity is Better Auth plus CMS credential settings. The server
requests a Better Auth Convex token for the verified API key and uses that token
for Convex calls. Keep raw MCP bearer tokens in external client config only.
