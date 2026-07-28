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
only authority for immutable candidate bytes; source-rehearsal tarballs are
never uploaded, promoted, or accepted by the release-candidate workflow.
The superseded Better Convex beta.21/beta.9 evidence is absent, so candidate
packing fails closed until final beta.22/beta.10 evidence replaces it.
Current rehearsal and release procedures are documented in
[`release-candidate.md`](release-candidate.md) and
[`MAINTAINING.md`](../../MAINTAINING.md).
