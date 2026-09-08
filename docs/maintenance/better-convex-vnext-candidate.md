# Better Convex release evidence

Date: 2026-09-08

Status: local behavioral candidate; release certification pending.

The former Better Convex and Ginko prerelease candidate set was retired after
tracked compatibility corrections. Its source commits, artifact hashes, and
unpublished package coordinates are intentionally absent from the active tree;
Git history preserves the historical record.

The sole active dependency and artifact authority is
[`packages/cms/compatibility.json`](../../packages/cms/compatibility.json).
Its `sourceRehearsal` commit is a CI input used to prove Ginko against the exact
Better Convex Nuxt/Vue source that produced beta.5. This independent source
consumer does not override Ginko's registry-backed dependency graph.
`releaseArtifacts` is the authority for immutable registry bytes. It records
each package's registry URL, provenance source commit, SHA-256, SRI integrity,
and the Nuxt runtime fingerprint. The MCP beta was published from an earlier
commit than the Nuxt/Vue beta.5 pair, so provenance is intentionally recorded
per artifact rather than forced into one false shared-source invariant. The MCP
package remains experimental while targeting the final 2026-07-28 protocol.
The same authority pins Ginko Content beta.8, which keeps the CMS/provider
contract unchanged while adding site-owned locale-link behavior.

Beta.4 adds required generation fields to Better Auth users and sessions. The
fresh-component candidate lane proves the new schema. It does not prove an
in-place migration for a populated beta.3 component. Production deployment is
blocked until the target is proven to contain no depended-on auth rows or an
identity-preserving migration has been reviewed and rehearsed. Resetting the
component is not a migration because Ginko memberships depend on stable auth ids.
Current rehearsal and release procedures are documented in
[`release-candidate.md`](release-candidate.md) and
[`MAINTAINING.md`](../../MAINTAINING.md).
