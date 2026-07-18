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

The matching Better Auth user can claim ownership in Studio. The browser sends
only an optional display name; authorization and the persisted email come from
the verified JWT identity. After an owner row exists, normal CMS member
management controls access.

Studio always requires Better Convex Nuxt authentication. `convex.auth: false`
is not a supported CMS topology.

## Member Invitations

After bootstrap, owners grant access with bounded email invitations in Studio
Settings. The owner reviews an initial CMS role and an expiry from one hour to
30 days. At most 500 invitations may remain pending; expired rows still count
until an owner resends or revokes them.

The host Convex action generates a cryptographically random one-time token and
sends the raw acceptance link only to the configured host-owned delivery
boundary. The component stores only a double SHA-256 hash. Resending rotates the
token and invalidates the earlier link before the replacement is delivered;
revocation removes the pending invitation immediately.

Acceptance is authenticated and bound server-side to the Better Auth user id
and verified email claim. The browser supplies only a hash proof of the raw
token—it cannot choose a user id, email, or role. A successful transaction adds
the CMS member with the owner-reviewed role, consumes the invitation, and
writes activity. Ginko does not create or copy a Better Auth user account.
Invalid, expired, reused, revoked, duplicate-member, unverified-email, and
wrong-email attempts all receive the same non-enumerating response.

## MCP Credentials

External MCP bearer tokens are Better Auth API keys. Ginko CMS never stores the
raw API key. After Better Auth verifies a bearer token, its Convex JWT carries
the server-issued `mcp-api-key` credential kind and the CMS resolves the key id
through `mcpCredentialSettings`. A browser `sessionId` is never interpreted as
an API-key discriminator.

`mcpCredentialSettings` stores:

- the Better Auth API-key id;
- the owning Better Auth user id;
- CMS scopes;
- API-key expiry when configured;
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
user, credential id, immutable effective-scope snapshot, expiry, and write
timestamps. Current member access and credential settings are still re-checked
on every operation; the snapshot is historical audit data, not authorization.

Public or destructive agent work is review-gated by default. The current MCP
publish path is:

1. Save or update the draft.
2. Preview publish impact.
3. Create a review request.
4. Have a publisher or owner approve or reject in Studio.

Approval re-checks the reviewer role and stale draft state, then calls the
canonical backend publish operation. Direct agent publish, archive, restore,
delete, content portability, asset ownership changes, and purge are not
exposed.

## Current Runtime Boundary

MCP product identity comes from Better Auth API keys and CMS credential
settings. Server-side MCP calls request a Better Auth Convex token for the
verified API key and use that token as Convex transport. Do not expose raw MCP
tokens to clients that should not act as the corresponding external agent.
