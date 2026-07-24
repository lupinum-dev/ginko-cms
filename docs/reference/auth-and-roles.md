# Auth And Roles

Ginko CMS uses Better Auth for human identity, sessions, and delegated MCP
OAuth issuance. The CMS Convex component owns product roles and the
application delegation applied to a verified OAuth subject and client.

## Identity Ownership

Better Auth owns:

- users;
- sessions;
- accounts;

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

## MCP OAuth Delegations

The optional MCP endpoint is one Convex-native `/mcp` HTTP action protected by
the fixed Better Auth OAuth authorization-server profile. It uses Authorization
Code with PKCE, short-lived access tokens, one fixed resource, and explicit CMS
scopes. Ginko does not issue a second bearer credential, store an MCP secret
hash, or forward a token into a Convex function argument.

`mcpOAuthDelegations` stores only application authority:

- a random delegation generation id;
- the verified Better Auth user id and registered OAuth client id;
- the CMS scope ceiling and optional expiry;
- active or revoked status and audit fields.

Effective MCP authority is the intersection of:

- the freshly verified OAuth token scopes and subject/client provenance;
- the current Better Auth session, user, client, resource link, and consent;
- the current active Ginko OAuth delegation generation; and
- the user's current CMS member role.

Session deletion, client disablement, consent removal, delegation revocation,
role downgrade, and member removal take effect on the next protected call. A
revoked delegation may be recreated for the same client, but its new random
generation cannot resume agent runs created under the revoked generation.

Dynamic registration, refresh tokens, client credentials, DPoP, and direct
agent publication remain disabled. Owners register clients and the MCP resource
through the Better Auth OAuth administration endpoints; Ginko's mandatory
owner callback protects those endpoints. Enabling social login remains a
separate host decision and does not change MCP resource-server authority.

## Agent Runs And Review Requests

MCP writes must be linked to an active `agentRun`. The run records the delegated
user, OAuth client and delegation generation, immutable effective-scope
snapshot, expiry, and write timestamps. Current member and delegation state are
still re-checked on every operation; the snapshot is historical audit data, not
authorization.

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

The MCP client obtains a short-lived OAuth access token from the host's Better
Auth authorization server. The Convex-native MCP endpoint verifies the token's
signature, issuer, resource, client, subject, token class, lifetime, and scopes,
then rechecks the live provider records and Ginko delegation before every call.
Only the resulting allowlisted access context enters the application operation;
the token, provider-private session id, cookies, and authorization headers do
not enter Convex function arguments, results, diagnostics, or activity records.
