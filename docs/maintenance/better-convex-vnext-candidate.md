# Better Convex vNext candidate evidence

Date: 2026-07-24

Status: superseded.

The former Better Convex and Ginko prerelease candidate set was retired after
tracked compatibility corrections. Its source commits, artifact hashes, and
unpublished package coordinates are intentionally absent from the active tree;
Git history preserves the historical record.

The sole active dependency and artifact authority is
[`packages/cms/compatibility.json`](../../packages/cms/compatibility.json).
Its `sourceRehearsal` commit is a temporary, non-publishable CI input used to
prove Ginko against current Better Convex source. `releaseArtifacts` remains the
only authority for immutable candidate bytes; the packed-source consumer never
uploads, promotes, or substitutes its temporary archives into Ginko's root
dependency graph.
The superseded Better Convex rehearsal evidence is absent. The active
compatibility authority now records the immutable experimental
beta.28/beta.16 candidate evidence. This is support for the 2026-07-28 MCP
draft/RC, not a final-spec claim.
Current rehearsal and release procedures are documented in
[`release-candidate.md`](release-candidate.md) and
[`MAINTAINING.md`](../../MAINTAINING.md).
