# ADR 0007: MCP Is An Opt-In First-Class CMS Surface

Status: Accepted

## Context

Unlike Ginko core, Ginko CMS has auth, operations, content management,
diagnostics, and backend state. That makes MCP useful and appropriate here.

## Decision

MCP is a first-class CMS interaction path, but the externally exposed MCP server
is opt-in.

The module should require explicit enablement, such as `mcp: true`, before
registering MCP routes. Underlying tables, bridge operations, generated types,
and CMS machinery may remain part of the core implementation.

## Consequences

MCP tools should expose safe CMS operations, resources, prompts, and diagnostics.
They should not expose raw database/table editing or destructive workflows
without appropriate operation semantics.
