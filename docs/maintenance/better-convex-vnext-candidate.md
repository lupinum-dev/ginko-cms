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
The active compatibility authority pins the validated beta.34/beta.22 source
tuple and the exact immutable artifacts produced by Better Convex's release
workflow. Their source commit, hashes, integrity values, and Nuxt runtime
fingerprint support deterministic local candidate verification. No registry URL
is recorded: publication and registry-equality gates stay blocked until those
exact bytes are published with provenance. The MCP package remains experimental
while targeting the final 2026-07-28 protocol.
Current rehearsal and release procedures are documented in
[`release-candidate.md`](release-candidate.md) and
[`MAINTAINING.md`](../../MAINTAINING.md).
