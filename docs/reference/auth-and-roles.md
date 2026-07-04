# Auth And Roles

Ginko CMS uses Better Auth for identity and API-key lifecycle. The CMS Convex
component owns only CMS product roles, delegated MCP scope settings, and the
authorization checks around content operations.

## Identity Ownership

Better Auth owns:

- users;
- sessions;
- accounts;
- API-key creation, verification, expiry, and revocation.

Ginko CMS stores the stable Better Auth `user.id` on CMS member rows. It does
not create a second user, team, organization, or tenant system.

## CMS Roles

CMS roles are product roles:

- `owner`: bootstrap/admin role for the CMS product.
- `publisher`: can prepare and approve public content changes.
- `editor`: can draft and edit content but cannot approve public output.
- `viewer`: can inspect CMS content and diagnostics.

Role checks run in the Convex component. Studio controls are derived from those
backend capabilities; they are not a separate source of truth.

## First Owner

Before the first owner exists, set the allowed bootstrap email:

```bash
pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL owner@example.com
```

The matching Better Auth user can claim ownership in Studio. After an owner row
exists, normal CMS member management controls access.

## MCP Credentials

External MCP bearer tokens are Better Auth API keys. Ginko CMS never stores the
raw API key. After Better Auth verifies a bearer token, the CMS resolves the key
id through `mcpCredentialSettings`.

`mcpCredentialSettings` stores:

- the Better Auth API-key id;
- the owning Better Auth user id;
- CMS scopes;
- optional collection limits;
- review/trusted safety mode metadata;
- active or revoked status.

Effective MCP authority is the intersection of:

- the verified Better Auth API key;
- active `mcpCredentialSettings`;
- the owner's current CMS member role;
- the credential's configured scopes.

Role downgrades and member removal take effect on the next protected CMS call
because the component re-reads the current member state.

## Agent Runs And Review Requests

MCP writes must be linked to an active `agentRun`. The run records the delegated
user, credential id when present, requested scopes, safety mode, expiry, and
write timestamps.

Public or destructive agent work is review-gated by default. The current MCP
publish path is:

1. Save or update the draft.
2. Preview publish impact.
3. Create a review request.
4. Have a publisher or owner approve or reject in Studio.

Approval re-checks the reviewer role and stale draft state, then calls the
canonical backend publish operation. Direct agent publish, archive, delete, and
purge are not v1 defaults.

## Current Runtime Boundary

MCP product identity comes from Better Auth API keys and CMS credential
settings. Server-side MCP calls request a Better Auth Convex token for the
verified API key and use that token as Convex transport. Do not expose raw MCP
tokens to clients that should not act as the corresponding external agent.
