# MCP Agent Workflows

Ginko CMS exposes one optional, Convex-native MCP endpoint at `/mcp`. It is a
small delegated authoring surface, not a raw Convex, schema, membership,
settings, or deployment API.

## Enable MCP

MCP is off by default. Enable the Nuxt module option and materialize the matching
Convex source:

```ts
export default defineNuxtConfig({
  ginkoCms: {
    mcp: true,
  },
})
```

```bash
pnpm exec ginko-cms init --mcp
pnpm exec ginko-cms deploy
```

With `mcp: false`, Ginko generates no MCP route. Re-running `ginko-cms init`
removes untouched generated MCP endpoint files. Credential administration
remains available so an owner can revoke existing credentials before or after
disabling the endpoint.

## Credentials And Admission

An owner creates a CMS-owned bearer credential in Studio. Convex returns the
secret once and stores only its SHA-256 hash. The sole `/mcp` ingress hashes the
presented bearer and performs admission atomically: it checks the abuse budget,
resolves the active credential, records invalid attempts, and returns
`access`, `invalid`, or `limited`.

There is no Nuxt MCP server, bridge assertion, shared MCP server secret, or
Better Auth session-token exchange in this path. Every accepted tool call
re-reads current credential, member, role, scope, tenant, and contract state in
the canonical Convex operation before an effect.

## Tool Surface

The current inventory is intentionally finite:

- `start-agent-run`
- `get-entry`
- `save-entry-draft`
- `preview-publish`
- `complete-agent-run`

Draft writes require an active agent run and optimistic draft-version match.
They remain ordinary writes and never publish public output. Publish preview is
read-only and reports the current impact; it is not authority and does not
execute publication.

MCP does not expose schema changes, member or settings administration, raw table
reads, deploy operations, content portability, publish, unpublish, archive,
restore, delete, purge, or bulk destructive actions.

## Safety Rules

- Tools never accept a user id, member id, role, token hash, or other caller
  authority from the MCP client.
- Bearer values and hashes never enter tool arguments, results, diagnostics, or
  activity payloads.
- Completed, revoked, failed, or expired agent runs cannot keep writing.
- Member removal, role downgrade, credential revocation, scope removal, tenant
  mismatch, and contract mismatch are enforced from current canonical state.
- Client-facing failures remain allowlisted and opaque; raw Convex causes and
  application denial details are not returned.

High-impact workflows remain application-owned. When Ginko adds an explicit
human review flow, the authoritative backend must produce the impact, bind any
confirmation to that impact, and revalidate current authority and state at the
terminal mutation.
