# Better Convex vNext candidate evidence

Date: 2026-07-23

This record binds the Ginko CMS stabilization branch to the unpublished Better
Convex candidate set used for the vNext R0 re-entry review. It is evidence for a
local candidate only; it does not authorize publication.

## Source and package tuple

- Ginko CMS source: `5c589ff64e179f0e6fd0ba74d1f442ea7aebd4d5`
- Better Convex Vue/Nuxt source:
  `db5127cdfeb294d003c9ec3d4b712b89d4589319`
- Better Convex MCP source:
  `f4fd5d02b814ce8ee46bbaec8c38c40ec1a80d12`
- `better-convex-vue@0.8.0-beta.15`:
  `dd96a27fe097b6537fd28cc56a2e77580c0fe2c9086633ae77f0bfac3560b835`
- `better-convex-nuxt@0.8.0-beta.15`:
  `4855b990e3f016ee88b4f283e685480caa659fb983578c5568296ad28e6f80e3`
- `@better-convex/mcp@0.1.0-beta.5`:
  `cc45a4c9848bb17212f6c1795752bb725fa4ceec3fd15e59b0d42b03e83a2783`
- Nuxt runtime fingerprint:
  `bcn-release-v1-53f22482645ee2593d415fee01735197250780fec2f50f7d91b088f107a99d6a`

The committed manifests and lockfile use exact registry versions and integrity
values. They contain no workspace, Git, source-alias, or local-file path for a
Better Convex package. Local verification installed the unpublished tarballs
without changing that committed contract.

## Ginko candidate artifacts

The clean source commit was packed twice and both runs produced identical
archives:

- `@lupinum/ginko-cms-contract@0.2.0-rc.1`:
  `cd770fcc7f0e14d46c4bfd617c82034f1b491e0253b4665523e8e08ca88ca2f2`
- `@lupinum/ginko-cms-convex@0.2.0-rc.1`:
  `a380d220014b84e7e250130dfce1d869529e7d90e1f10bf9b505692b2b28ce9a`
- `@lupinum/ginko-cms@0.2.0-rc.1`:
  `32b3369210660a94c78788aec1b85b6aab98ea94b52be6fa8ed2d75342fe9c36`

The retained `@lupinum/ginko-content@0.3.0-rc.5` artifact remained byte exact:
`dffa7b7b49da19d28180a2ea61e53de92dc350818e32fe8a5e623f8ffe7e25a1`.
Its source worktree had unrelated later development, so the candidate reused
the already-certified immutable archive rather than repacking dirty source.

## Executed proof

- Focused stabilization matrix: 11 files, 85 tests passed.
- Full repository check: formatting, lint, release hygiene, compatibility
  matrix, all typechecks, package builds, production Studio Vite build, and
  182 test files / 1,202 tests passed; one explicitly skipped test remained.
- Isolated pnpm consumer: exact candidate install, MCP read/write behavior,
  package imports, production Nuxt/Nitro build, content safety probes, and
  portable-content verification passed.
- Isolated npm consumer: the same checks passed against the same candidate
  hashes; npm audited 734 installed packages and reported zero vulnerabilities.
- Candidate contract: machine-independent registry resolution and the exact
  Better Convex versions, hashes, and runtime fingerprint passed.

The isolated consumers were created outside the repository and installed from
empty task-specific npm and pnpm stores. The successful output named the exact
Vue, Nuxt, MCP, CMS, Convex component, contract, and content archives.

## External proof still required

`package:e2e:live` requires a separately authorized disposable Convex
deployment key or self-hosted admin key. It was not rerun for this artifact set.
The existing source-level live admission, authorization, and concurrency
regressions remain part of the stabilization evidence, but protected live
staging must still run before publication.
