# Better Convex vNext candidate evidence

Date: 2026-07-24

This record binds the Ginko CMS stabilization branch to the unpublished Better
Convex candidate set used for the vNext R0 re-entry review. It is evidence for a
local candidate only; it does not authorize publication.

## Source and package tuple

- Ginko CMS OAuth hard-cut source:
  `d038cb5551e2d9d8b253a83f730fa01ee2a9da2b`
- Better Convex Vue/Nuxt source:
  `c53e50fd020aefe3255aad5e380740dea891a6fa`
- Better Convex MCP source:
  `fb4609af33be546507760d682947a66bce17b189`
- `better-convex-vue@0.8.0-beta.18`:
  `c66feb7629af679147c106fd2df3b964b523a5d7f5ed87be779eb64724b862f2`
- `better-convex-nuxt@0.8.0-beta.18`:
  `13889283dfca70a9ae24a694c3bc636fbb9d2cf6182814f7496fe136bf41c041`
- `@better-convex/mcp@0.1.0-beta.6`:
  `67c8843a8066554082a21f5fa0454db397bcfa111683fc7839445e11375ca90e`
- Nuxt runtime fingerprint:
  `bcn-release-v1-bc9b69a7706849733c43d6284c385aa4c63c1cf4493da187d0e305b2a5843caf`

The committed manifests and lockfile use exact registry versions and integrity
values. They contain no workspace, Git, source-alias, or local-file path for a
Better Convex package. Local verification installed the unpublished tarballs
without changing that committed contract.

## Ginko candidate artifacts

The clean source commit was packed twice and both runs produced identical
archives:

- `@lupinum/ginko-cms-contract@0.2.0-rc.1`:
  `ae86a2ed6b16dcb430296de1dc46d4ddcb3865b59419b4d5a6d29cd683dcf7a0`
- `@lupinum/ginko-cms-convex@0.2.0-rc.1`:
  `89fece5a5f82250776b485b8bd0bd317e0b27a98d3ae10ba36f62e297874b473`
- `@lupinum/ginko-cms@0.2.0-rc.1`:
  `d8931878ef7430b97938f52f0b3c453e5ca1fa6672ded13ad2050ca7406bfadb`

The retained `@lupinum/ginko-content@0.3.0-rc.5` artifact remained byte exact:
`dffa7b7b49da19d28180a2ea61e53de92dc350818e32fe8a5e623f8ffe7e25a1`.
Its source worktree had unrelated later development, so the candidate reused
the already-certified immutable archive rather than repacking dirty source.
The sibling worktree's local release manifest had subsequently been overwritten
by an ineligible dirty pack. Candidate construction therefore rebuilt a
temporary manifest from the committed compatibility tuple and the earlier
candidate record. The packer independently rechecked the archive name, package
manifest, version, and SHA-256 before admitting it; no dirty Content bytes were
used.

## Executed proof

- Focused OAuth/delegation/discovery matrix: 5 files, 32 tests passed,
  including synchronized eight-way delegation creation with exactly one active
  winner.
- Full repository check: formatting, lint, release hygiene, compatibility
  matrix, all typechecks, package builds, production Studio Vite build, and
  185 test files / 1,229 tests passed; one explicitly skipped test remained.
- Isolated pnpm consumer: exact candidate install, MCP read/write behavior,
  package imports, production Nuxt/Nitro build, content safety probes, and
  portable-content verification passed.
- Isolated npm consumer: the same checks passed against the same candidate
  hashes; npm audited 735 installed packages and reported zero vulnerabilities.
- Candidate contract: machine-independent registry resolution and the exact
  Better Convex versions, hashes, and runtime fingerprint passed.
- Production dependency audit: `pnpm audit --prod --audit-level low` reported no
  known vulnerabilities.

The hard cut also deleted the unexposed `mcpCreateEntry` component function and
its receipt table. The certified MCP inventory therefore has no speculative
second entry-creation path outside the explicit tools registered by the sole
Convex-native handler.

The isolated consumers were created outside the repository and installed from
empty task-specific npm and pnpm stores. The successful output named the exact
Vue, Nuxt, MCP, CMS, Convex component, contract, and content archives.

## External proof still required

`package:e2e:live` requires a separately authorized disposable Convex
deployment key or self-hosted admin key. It was not rerun for this artifact set.
The existing source-level live admission, authorization, and concurrency
regressions remain part of the stabilization evidence, but protected live
staging must still run before publication.
