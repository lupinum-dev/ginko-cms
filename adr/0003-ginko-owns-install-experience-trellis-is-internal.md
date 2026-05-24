# ADR 0003: Ginko Owns Install Experience, Trellis Is Internal

Status: Accepted

## Context

Trellis powers internal app/backend structure, bridge generation, permissions,
and route protection. That implementation detail should not make Ginko CMS feel
like users are installing Trellis.

## Decision

Ginko CMS owns the user-facing installation, setup, and validation experience.
Trellis may power internals, but docs and commands should be framed around
Ginko CMS wherever possible.

## Consequences

Public docs should minimize Trellis concepts. When a Trellis command is still
the implementation path, explain it as a Ginko CMS setup/validation step rather
than as a separate product users need to understand.
