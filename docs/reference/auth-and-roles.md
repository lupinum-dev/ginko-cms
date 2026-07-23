# Auth And Roles

Ginko CMS uses Better Auth for human identity and sessions. The CMS Convex
component owns CMS product roles and the complete private MCP service-credential
lifecycle.

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

## MCP Credentials

External private MCP bearer tokens are CMS-owned service credentials. Convex
generates 256 random bits, returns the bearer once, and stores only its SHA-256
hash. Better Auth sessions and browser `sessionId` values never enter this path.
The optional MCP endpoint runs as one Convex-native `/mcp` HTTP action; there is
no Nuxt bridge secret or second MCP identity protocol. Convex makes the final
authorization decision for every operation.

`mcpCredentialSettings` stores:

- the CMS credential id and secret hash;
- the owning Better Auth user id;
- CMS scopes;
- credential expiry when configured;
- active or revoked status.

Effective MCP authority is the intersection of:

- the atomically admitted CMS credential hash;
- active `mcpCredentialSettings`;
- the owner's current CMS member role;
- the credential's configured scopes.

Role downgrades and member removal take effect on the next protected CMS call
because the component re-reads the current member state.

## OAuth Roadmap

Better Convex Nuxt 0.7 provides the primitives, but OAuth is intentionally not
enabled by this release. Enabling it is product and security work, not a config
toggle:

1. Add human social sign-in provider-by-provider, with deployment-owned
   secrets, verified-email and account-linking policy, invitation/first-owner
   tests, and recovery behavior. The CMS member row remains the only product
   role source of truth.
2. Design delegated MCP OAuth as a separate interactive consent topology using
   short-lived access tokens, explicit CMS scopes, fixed resource metadata,
   PKCE, and revocation evidence. It must not reuse private service-credential
   hashes.
3. Keep dynamic registration, refresh tokens, client credentials, DPoP, and
   direct agent publication deferred until each has an accepted user story and
   failure-injection proof. Private service credentials remain the supported
   automation path meanwhile.

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

MCP product identity comes from Ginko-owned bearer credentials and current CMS
credential settings. Only a SHA-256 hash of the generated secret is stored. The
Nuxt bridge exchanges a valid bearer secret for short-lived, function-bound HMAC
assertions; Convex rechecks the credential, member, role, expiry, and scope for
every protected operation. Do not expose raw MCP credentials to clients that
should not act as the corresponding external agent.
