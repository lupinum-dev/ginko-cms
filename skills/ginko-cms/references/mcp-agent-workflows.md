# MCP Agent Workflows

Use this reference for Ginko's optional Convex-native MCP endpoint.

## Setup

MCP is disabled by default. Enable `ginkoCms.mcp` in Nuxt and materialize the
same mode with:

```bash
pnpm exec ginko-cms init --mcp
pnpm exec ginko-cms deploy
```

The deployment exposes one `/mcp` endpoint. It does not install a Nuxt MCP
server, code mode, `secure-exec`, a bridge secret, or alternate MCP routes.

## Authentication And Authorization

Studio issues a CMS-owned bearer once; Convex stores only its hash. The endpoint
atomically admits the credential and rate-limits invalid attempts. Canonical
component operations re-check current credential, member, role, scope, tenant,
contract, and optimistic version state for every effect.

Never pass or request user ids, member ids, roles, bearer values, hashes, or
other authority fields in tool arguments.

## Current Tools

1. `start-agent-run` opens a bounded delegated work session.
2. `get-entry` reads one authorized entry.
3. `save-entry-draft` performs an ordinary optimistic draft write.
4. `preview-publish` reports current impact without publishing.
5. `complete-agent-run` closes the work session.

MCP does not directly publish, delete, purge, change schemas, manage members,
change settings, run portability, or expose raw tables. High-impact review and
execution remain explicit application workflows with terminal backend
authorization.
