# Better Convex vNext migration decisions

Date: 2026-07-24

This evidence record closes the application-ownership decisions required by the
Better Convex vNext RFC against stabilization baseline `80145dd8` and the OAuth
hard-cut commit containing this record. It is not a second roadmap and does not
authorize production cutover or package publication.

The rule is simple: retain a concept only when Ginko has one canonical purpose,
one owner, bounded retention, and an invariant test. Otherwise delete it. MCP
transport metadata, OAuth scopes, host UI, and identifiers never grant
application authority.

## Decision ledger

| Candidate                        | Decision                                                     | Canonical purpose and owner                                                                                                                                                                                                                                                                         | Enforcing evidence                                                                                                                                                                                                                                            | Remaining action                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Agent-run records                | Retain                                                       | `agentRuns` is Ginko's bounded delegation, attribution, budget, lifecycle, and audit record. It is not an MCP transport session. The component owns its state and hourly bounded retention.                                                                                                         | `agentRuns.test.ts`, `entries/mcp-operations.test.ts`, and `storage-maintenance.test.ts` prove OAuth-delegation isolation, scope snapshots, lifecycle, current authority, attribution, retention, and that a run cannot create authority by itself.           | OAuth provenance is bound by random delegation generation plus verified user/client; do not change the record's application purpose. |
| Caller-supplied `agentRunId`     | Retain as an opaque application handle                       | A caller may return the run identifier created by `startAgentRun`, but every read/write normalizes it and proves it belongs to the current OAuth delegation/member context. The identifier is correlation, not actor identity or permission.                                                        | Cross-delegation, cross-member, completed/revoked, missing, and foreign-run negatives in `agentRuns.test.ts`, `reviewRequests.test.ts`, and `entries/mcp-operations.test.ts`.                                                                                 | Complete; revoked and recreated delegations cannot resume an earlier generation's run.                                               |
| Generic confirmations            | Retain only for inspected destructive application operations | Ordinary MCP reads, drafts, rename-style writes, agent-run operations, and review creation do not enter a prepare/confirm lifecycle. `destructiveConfirmations` is owned only by Ginko's existing previewed destructive operations; publish review uses its canonical review authorization instead. | `operation-protocol.test.ts`, `canonical-editorial-core.test.ts`, `entries/mcp-operations.test.ts`, and `reviewRequests.test.ts` prove argument/preview binding, stale detection, replay prevention, and that ordinary operations create no confirmation row. | None for vNext; do not move this protocol into Better Convex.                                                                        |
| Operation receipts               | Retain narrowly                                              | The canonical review row and destructive audit receipt own idempotent recovery and security history. An MCP `operationKey` deduplicates one review creation and status recovery; equal arguments without that key are not treated as retries.                                                       | `reviewRequests.test.ts` proves retry parity, one row, subject isolation, stale/decision races, and receipt parity. `data-retention-and-privacy.md` defines bounded review retention and the intentional security hold for destructive audit receipts.        | Keep responses bounded and authorized; do not add a second MCP receipt table.                                                        |
| Ginko bearer-credential issuance | Deleted                                                      | Delegated humans authenticate through the fixed Better Auth MCP OAuth profile. Ginko stores application delegation state, never another bearer token or secret hash.                                                                                                                                | `mcpOAuthDelegations.test.ts`, `mcp-oauth-live-access.test.ts`, `oauth-transaction.test.ts`, and `mcp.test.ts` prove generation binding, current provider/application authority, transaction validation, token absence, and standard OAuth challenges.        | Complete locally; protected production cutover and final exact-candidate evidence remain separately gated.                           |
| Review-status polling            | Retain                                                       | Status reads project the one canonical `reviewRequests` row for lost-response recovery. They require the initiating OAuth delegation generation, validate member/run ownership, return bounded state, and expose no list/enumeration API to MCP.                                                    | `reviewRequests.test.ts` and `mcp.test.ts` prove wrong delegation/run/member denial, revoked access, bounded status, terminal parity, and one canonical row.                                                                                                  | Complete locally; no legacy fallback remains.                                                                                        |

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
  test/component/mcpOAuthDelegations.test.ts \
  test/runtime/mcp-oauth-live-access.test.ts \
  test/runtime/oauth-transaction.test.ts \
  test/runtime/mcp.test.ts --reporter=dot
```

The focused OAuth hard-cut proof is updated with the completion commit. The
complete exact-candidate check remains recorded separately in
`better-convex-vnext-candidate.md`.

The current source passed `pnpm run check`: all format, security-boundary,
surface, install-story, compatibility, release-hygiene, lint, type, production
module/Studio build, and publish-specifier gates plus 185 test files and 1,229
tests. The focused OAuth/delegation/discovery matrix passed 5 files and 32 tests,
including synchronized eight-way delegation creation with exactly one active
winner. The unexposed legacy `mcpCreateEntry` mutation and its receipt table were
deleted instead of retained as a speculative second write surface.

## OAuth cutover acceptance

The bearer path is deleted locally. The OAuth hard cut is complete only after
the following proof set is attached to its completion commit:

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

The protected production cutover remains separately gated. Ginko accepts no
preconfigured-bearer fallback while that gate is pending.
