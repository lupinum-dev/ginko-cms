# ADR 0013: Convex And Better Auth Are V1 Foundations

Status: Accepted

## Context

Ginko CMS is not a generic provider shell. The repo contains a real CMS product
with backend storage, auth, projections, assets, and operations.

## Decision

Convex is the hard backend foundation for Ginko CMS v1. Better Auth is the hard
auth foundation for Ginko CMS v1.

Do not describe Convex as merely the first backend implementation or Better Auth
as a casually replaceable integration in v1 docs.

## Consequences

Docs should be honest: Ginko CMS uses Convex and Better Auth. Future
abstractions can be introduced only when there is a concrete reason and a real
implementation path.
