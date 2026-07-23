# Better Convex vNext exact MCP App proof

Date: 2026-07-23

This follow-up proof closes Ginko's local exact-package portion of Better
Convex task `P7-013`. It supplements
`better-convex-vnext-candidate.md`; it does not replace that candidate's package
hash record or authorize publication.

## Hard cut

The publish-impact fixture no longer imports Better Convex source from the
adjacent repository. Its production Vite build resolves:

- `better-convex-vue/mcp-app` from the installed Vue `0.8.0-beta.15` package;
- `@modelcontextprotocol/ext-apps` from Ginko's explicit exact `1.7.4` test
  dependency; and
- `@modelcontextprotocol/ext-apps/app-bridge` from that same installed SDK.

The removed `autoResize` option is no longer passed. The fixture asserts that
the production bundle includes the real installed `dist/mcp-app.mjs` and
contains no module under `packages/vue/src`.

## Executed proof

The Better Convex candidates were materialized from their immutable local
tarballs without changing Ginko's committed registry-clean dependency
contract. The temporary local overrides were removed before review.

```text
node node_modules/vitest/vitest.mjs run \
  test/module/candidate-release-contract.test.ts \
  test/module/package-boundaries.test.ts \
  test/runtime/mcp-publish-impact-app.test.ts
```

Result: three files and 27 tests passed, including the production Chromium App
boundary.

The proof covers:

- exact installed Vue App entry consumption;
- useful model-visible fallback;
- official App Bridge lifecycle;
- canonical publish-impact projection;
- no publish, approval, or review authority in the iframe;
- host-mediated refresh and external navigation;
- CSP, sandbox, teardown, and hostile-result handling; and
- absence of bearer, cookie, Convex JWT, service proof, provider reference,
  raw client, and raw-cause sentinels.

The manually reconciled lock entry was independently accepted by:

```text
pnpm install --frozen-lockfile --lockfile-only --ignore-scripts
```

Focused formatting, ESLint, and diff checks also passed.

## Remaining external evidence

This is a production browser harness, not evidence from a third-party MCP host
or protected deployment. Different-origin and real-host evidence remains a
Better Convex experimental/stabilization gate. Ginko production cutover and
live deployment also remain separately authorized operations.
