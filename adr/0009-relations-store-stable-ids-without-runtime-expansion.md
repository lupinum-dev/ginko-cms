# ADR 0009: Relations Store Stable IDs Without Runtime Expansion

Status: Accepted

## Context

Relation fields need stable references across drafts, publishes, imports, and
route changes. A broad expansion/depth/include query system would make v1 public
reads more complex than needed.

## Decision

Relation fields store stable entry references. Runtime expansion, depth, and
include-style APIs are not part of the v1 public contract.

## Consequences

Public reads may return stable references. Apps that need related content should
query it deliberately through supported content APIs. Do not promise GraphQL-like
runtime expansion unless it is designed as a later explicit feature.
