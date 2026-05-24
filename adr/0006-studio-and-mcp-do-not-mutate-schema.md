# ADR 0006: Studio And MCP Do Not Mutate Schema

Status: Accepted

## Context

Studio and MCP are two interfaces over the same CMS operations. If either can
mutate schema/config independently of app code, the typed app contract stops
being authoritative.

## Decision

Studio and MCP may inspect collection contracts and operate content workflows.
They must not mutate collection schema or app configuration.

## Consequences

MCP tools should expose validated operations and diagnostics, not raw table
patching. Studio should make code-defined contract state visible and actionable,
but not editable.
