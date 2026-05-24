# ADR 0008: Canonical Body Source Is MDC

Status: Accepted

## Context

Ginko CMS needs editable rich content, filesystem migration, public rendering,
search, and future editor flexibility. A structured block model as the primary
source of truth would couple storage to the current editor too early.

## Decision

Raw MDC is the canonical editable body source for v1.

Studio editing, TipTap state, previews, parsed ASTs, table of contents, search
documents, and public render shapes are adapters or derived representations.

## Consequences

Imports and exports preserve MDC. Public projections may expose parsed or
renderable body shapes, but the editable source remains MDC.
