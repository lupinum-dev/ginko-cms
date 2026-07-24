# Better Convex vNext migration decisions

Date: 2026-07-24

This evidence record closes the application-ownership decisions required by the
Better Convex vNext RFC against Ginko commit `c7c03f53`. It is not a second
roadmap and does not authorize production cutover or package publication.

The rule is simple: retain a concept only when Ginko has one canonical purpose,
one owner, bounded retention, and an invariant test. Otherwise delete it. MCP
transport metadata, OAuth scopes, host UI, and identifiers never grant
application authority.

## Decision ledger

| Candidate                        | Decision                                                     | Canonical purpose and owner                                                                                                                                                                                                                                                                         | Enforcing evidence                                                                                                                                                                                                                                            | Remaining action                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent-run records                | Retain                                                       | `agentRuns` is Ginko's bounded delegation, attribution, budget, lifecycle, and audit record. It is not an MCP transport session. The component owns its state and hourly bounded retention.                                                                                                         | `agentRuns.test.ts`, `entries/mcp-operations.test.ts`, and `storage-maintenance.test.ts` prove owner/credential isolation, scope snapshots, lifecycle, current authority, attribution, retention, and that a run cannot create authority by itself.           | Replace its credential provenance during the OAuth hard cut; do not change its application purpose.                                                                                                                                                                                              |
| Caller-supplied `agentRunId`     | Retain as an opaque application handle                       | A caller may return the run identifier created by `startAgentRun`, but every read/write normalizes it and proves it belongs to the current credential/member context. The identifier is correlation, not actor identity or permission.                                                              | Cross-credential, cross-member, completed/revoked, missing, and foreign-run negatives in `agentRuns.test.ts`, `reviewRequests.test.ts`, and `entries/mcp-operations.test.ts`.                                                                                 | During OAuth migration, bind the run to verified OAuth provenance instead of a legacy credential id.                                                                                                                                                                                             |
| Generic confirmations            | Retain only for inspected destructive application operations | Ordinary MCP reads, drafts, rename-style writes, agent-run operations, and review creation do not enter a prepare/confirm lifecycle. `destructiveConfirmations` is owned only by Ginko's existing previewed destructive operations; publish review uses its canonical review authorization instead. | `operation-protocol.test.ts`, `canonical-editorial-core.test.ts`, `entries/mcp-operations.test.ts`, and `reviewRequests.test.ts` prove argument/preview binding, stale detection, replay prevention, and that ordinary operations create no confirmation row. | None for vNext; do not move this protocol into Better Convex.                                                                                                                                                                                                                                    |
| Operation receipts               | Retain narrowly                                              | The canonical review row and destructive audit receipt own idempotent recovery and security history. An MCP `operationKey` deduplicates one review creation and status recovery; equal arguments without that key are not treated as retries.                                                       | `reviewRequests.test.ts` proves retry parity, one row, subject isolation, stale/decision races, and receipt parity. `data-retention-and-privacy.md` defines bounded review retention and the intentional security hold for destructive audit receipts.        | Keep responses bounded and authorized; do not add a second MCP receipt table.                                                                                                                                                                                                                    |
| Ginko bearer-credential issuance | Replace before production vNext cutover                      | Current `mcpCredentialSettings` and `/mcp-credentials/` issuer implement the explicitly experimental preconfigured-bearer profile. They delegate a human member and therefore are not the final public remote-MCP authorization model.                                                              | `mcpCredentials.test.ts` and `mcp.test.ts` prove today's hashing, expiry, revocation, scope ceiling, current membership, atomic admission, and disclosure boundary. These tests preserve safety during migration; they do not justify permanence.             | Hard-cut delegated humans to Better Auth-backed MCP OAuth, then delete credential issuance, secret-hash admission, its failure buckets, and the preconfigured issuer. Never accept both indefinitely. Machine credentials remain separately gated on a proven standard profile and real clients. |
| Review-status polling            | Retain                                                       | Status reads project the one canonical `reviewRequests` row for lost-response recovery. They require the initiating application provenance, validate tenant/run ownership, return bounded state, and expose no list/enumeration API to MCP.                                                         | `reviewRequests.test.ts` and `mcp.test.ts` prove wrong credential/run/tenant denial, revoked access, bounded status, terminal parity, and one canonical row.                                                                                                  | Rebind status authorization to OAuth provenance in the same hard cut; retain no legacy fallback.                                                                                                                                                                                                 |

## Current hard-cut boundary

The current branch already has one Convex-native `/mcp` endpoint and one
explicit inventory. The Nitro MCP server, signed bridge, `/mcp/code`,
`/mcp-pilot`, toolkit dependency, and compatibility aliases are deleted.
Disabling MCP generates no route.

Ginko continues to own:

- current member, role, contract, tenant, and resource authorization;
- agent-run delegation and attribution;
- publish impact and reviewer policy;
- destructive preview, confirmation, effects, audit, and retention; and
- review status and operation-key recovery.

Better Convex owns only the bounded official-SDK transport, verified access
provenance, safe diagnostics, Vue lifecycle, and protocol projection. No Ginko
role, review state, confirmation, agent run, or receipt enters a Better Convex
token or public abstraction.

Focused verification:

```text
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  test/component/agentRuns.test.ts \
  test/component/reviewRequests.test.ts \
  test/component/operation-protocol.test.ts \
  test/component/mcpCredentials.test.ts \
  test/runtime/mcp.test.ts --reporter=dot
```

Result: five files and 33 tests passed. The complete exact-candidate check is
recorded separately in `better-convex-vnext-candidate.md`.

## OAuth cutover acceptance

The migration ledger is structurally closed, but the overall Ginko vNext
migration is not complete until the bearer row above is resolved. The OAuth
hard cut must prove all of the following in one change set:

1. Protected Resource Metadata and authorization-server discovery identify the
   exact deployed `/mcp` resource.
2. Authorization Code with PKCE, exact redirect handling, issuer validation,
   token-class separation, client/resource binding, and the fixed delegated
   profile pass through the installed Better Convex packages.
3. The Better Auth live-access callback rechecks the current session, user,
   client, consent, and resource link on every request.
4. Ginko maps verified issuer, subject, and client to current canonical member,
   role, contract, and resource authority for every effect.
5. Session, client, consent, member, role, and application delegation revocation
   block the next effect.
6. Existing bearer secrets stop authenticating at the cutover. The legacy
   issuance and admission schema/functions/routes/tests are deleted rather than
   hidden behind a compatibility flag.
7. Agent-run and review provenance has an explicit migration rule; legacy rows
   remain bounded history but cannot become OAuth-resumable from a guessable id.
8. Exact packed Nuxt/MCP/Ginko consumers, browser OAuth, concurrency, and
   disclosure matrices pass before protected cutover.

Until then, the preconfigured-bearer mode is local candidate evidence only. It
must not be documented as the stable Ginko remote-MCP authentication story.
