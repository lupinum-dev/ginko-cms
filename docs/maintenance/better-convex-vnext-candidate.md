# Better Convex release evidence

Date: 2026-07-24

Status: published and verified.

The former Better Convex and Ginko prerelease candidate set was retired after
tracked compatibility corrections. Its source commits, artifact hashes, and
unpublished package coordinates are intentionally absent from the active tree;
Git history preserves the historical record.

The sole active dependency and artifact authority is
[`packages/cms/compatibility.json`](../../packages/cms/compatibility.json).
Its `sourceRehearsal` commit is a CI input used to prove Ginko against the exact
Better Convex Nuxt/Vue source that produced beta.3. This independent source
consumer does not override Ginko's registry-backed dependency graph.
`releaseArtifacts` is the authority for immutable registry bytes. It records
each package's registry URL, provenance source commit, SHA-256, SRI integrity,
and the Nuxt runtime fingerprint. The MCP beta was published from an earlier
commit than the Nuxt/Vue beta.3 pair, so provenance is intentionally recorded
per artifact rather than forced into one false shared-source invariant. The MCP
package remains experimental while targeting the final 2026-07-28 protocol.
Current rehearsal and release procedures are documented in
[`release-candidate.md`](release-candidate.md) and
[`MAINTAINING.md`](../../MAINTAINING.md).
