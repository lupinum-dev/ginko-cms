# ADR 0010: Filesystem Imports Target Existing Contracts

Status: Accepted

## Context

Ginko core supports filesystem-first content. Ginko CMS needs a migration path
from filesystem content into the CMS without changing the product rule that
collections are code-defined.

## Decision

Filesystem migration is a one-way import into existing code-defined contracts.
It is not a schema generator and should not mutate collection definitions.

## Consequences

Migration tooling should report unknown collections, unknown fields, ambiguous
relations, and asset issues. The app owner fixes contracts in code and reruns
the migration rather than accepting UI-generated schema changes.
