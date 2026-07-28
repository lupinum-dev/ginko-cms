# Maintaining Ginko CMS

Ginko CMS is the integration package. It owns CMS domain rules, Studio, the
Convex component, host Convex setup files, MCP tools, package e2e, and release
compatibility with Ginko Content and `better-convex-nuxt`.

## Package Surface

Publishable packages in this repo:

1. `@lupinum/ginko-cms-contract` from `packages/contract`.
2. `@lupinum/ginko-cms-convex` from `packages/convex`.
3. `@lupinum/ginko-cms` from `packages/cms`.

Publish order matters. The contract package is the lowest layer, the Convex
package depends on it, and the Nuxt CMS package depends on both.

The external package versions, source commits, and approved artifact hashes live
only in `packages/cms/compatibility.json`. Those packages must be approved before
the CMS packages are published.

## Daily Maintenance

The Better Convex beta.21/beta.9 coordinates are current-source rehearsal
versions, not release candidates. Pack the three packages from the exact
`sourceRehearsal.betterConvexCommit`, then install those temporary tarballs
before running source checks:

```bash
BETTER_CONVEX_NUXT_TARBALL=/absolute/path/to/better-convex-nuxt.tgz \
BETTER_CONVEX_VUE_TARBALL=/absolute/path/to/better-convex-vue.tgz \
BETTER_CONVEX_MCP_TARBALL=/absolute/path/to/better-convex-mcp.tgz \
pnpm run install:rehearsal:source
pnpm run check
pnpm run release:verify
```

`install:rehearsal:source` verifies package names and tuple versions, temporarily
overrides dependency resolution against the committed lock, and restores both
the lockfile and workspace configuration byte-for-byte in `finally`. These
tarballs are temporary CI inputs and are never candidate or publishable
artifacts. Delete this source-rehearsal path after the final Better Convex
packages are available from the registry.

The release-candidate lane consumes four approved dependency tarballs without
rebuilding them. Put the exact registry downloads in `.pack/upstream`, run the
single pack command, then verify the uploaded result:

```bash
pnpm run candidate:pack
pnpm run release:verify:candidate
```

`candidate:pack` verifies package names, versions, SHA-256, SRI, the Nuxt
runtime fingerprint binding, and reproducible Ginko packs against the single
compatibility authority. Candidate verification rejects wrong installed
versions and workspace/link dependencies.

Candidate packing currently fails closed because the superseded
beta.21/beta.9 hashes were removed. Add the coordinated final Better Convex
beta.22/beta.10 versions and immutable registry evidence only after their final
MCP reconciliation and certification succeed.

For a real release candidate, also run the registry dependency lane after
Ginko Content is published:

```bash
pnpm run release:verify:registry
```

That lane can become green only after every Better Convex coordinate in
`packages/cms/compatibility.json` is published. It must fail closed while the
rehearsal coordinates remain unpublished.

## Release Runbook

Publishing is intentionally manual. The `release:publish` script exits with a
failure message so nobody, human or agent, can accidentally push packages to
npm.

1. Confirm Ginko Content and the complete Better Convex family are released at the
   versions in `packages/cms/compatibility.json`.
2. Start from a clean working tree on the release branch.
3. Update package versions and compatibility docs intentionally.
4. Generate release notes:

```bash
pnpm run release:notes
```

5. Review `CHANGELOG.md`; changelogen is a draft generator, not an authority.
6. Trigger `.github/workflows/release-candidate.yml` manually or push the exact
   prerelease tag. It downloads upstream registry bytes, packs once, verifies
   pnpm and npm consumers, and runs protected disposable Convex staging.
7. Download the `ginko-candidate-<commit>` artifact produced by that workflow.
8. Inspect the exact candidate tarballs before publishing:

```bash
tar -tzf .pack/candidate/lupinum-ginko-cms-contract-*.tgz | less
tar -tzf .pack/candidate/lupinum-ginko-cms-convex-*.tgz | less
tar -tzf .pack/candidate/lupinum-ginko-cms-*.tgz | less
pnpm run check:packs:no-local-specifiers
npm publish .pack/candidate/lupinum-ginko-cms-contract-0.2.0-rc.2.tgz --access public --otp <code>
npm publish .pack/candidate/lupinum-ginko-cms-convex-0.2.0-rc.2.tgz --access public --otp <code>
npm publish .pack/candidate/lupinum-ginko-cms-0.2.0-rc.2.tgz --access public --otp <code>
```

9. Publish only after the owner has reviewed the candidate manifest, protected
   staging evidence, tarballs, and npm package settings.

For the first public release of a package, npm staged publishing cannot be used
because staged publishing requires the package to already exist on the registry.
Use an owner-controlled manual publish with 2FA.

For later releases, prefer npm trusted publishing plus staged publishing. While
the project has one maintainer, `ginko-release` uses tag restrictions without a
required reviewer. The evidence records `governanceMode: solo-maintainer`, the
tag actor, source commit, and commit author; it does not invent a deputy,
independent reviewer, or notification test.

- GitHub Actions must use the tag-restricted `ginko-release` environment.
- The release job must use Node 24 or newer and npm 11.15 or newer.
- Do not use package-manager caches in release jobs.
- Use OIDC trusted publishing instead of long-lived npm publish tokens.
- Configure npm package settings to require 2FA and disallow traditional tokens.
- Stage the tarballs in package order with `npm stage publish .pack/<name>.tgz`,
  download and inspect each staged package with `npm stage download <stage-id>`,
  then approve with `npm stage approve <stage-id>` and 2FA.

## Supply-Chain Policy

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` so new dependency
  versions must sit on the registry for 24 hours before fresh resolution.
- Release jobs must use the committed lockfile. Do not delete and regenerate the
  lockfile as a casual fix.
- Temporary `overrides` are local workspace policy only. Packed packages must
  not ship override policy.
- Remove an override when `pnpm why <name>` shows upstream owners resolve the
  patched version without help and `pnpm audit --prod --audit-level low` remains
  green.

Current temporary overrides are for audit and ecosystem compatibility:

- `brace-expansion`, `devalue`, `fast-uri`, `fast-xml-builder`, `hono`,
  `ip-address`, `kysely`, `mermaid`, `nitropack`, `oxc-parser`, `postcss`,
  `simple-git`, `vue-sfc-transformer`, and `ws` keep transitive production
  resolution and audit clean.
- `qs` is held at the patched `6.15.2` line for the transitive Express parser
  chain currently pulled in by MCP tooling.
- `auditConfig.ignoreGhsas` contains the current unfixable `elliptic` advisory
  from the MCP tooling chain. Remove it as soon as upstream stops resolving
  `elliptic` or npm publishes a patched range.
- `convex@1.42.2` is the release tuple pin.
- `h3@1.15.11` is held until h3 2 is stable and Nuxt ecosystem peers accept it.
- Vite 7 and Nuxt DevTools 3 are held until their next major lines are stable
  across Nuxt, Vitest, and the Studio build.

## Generated Files

`packages/convex/src/_generated/component.ts` is generated by Convex and can be
very large. Do not hand-edit it and do not paste it into LLM context. Regenerate
it with:

```bash
pnpm run prepare:component
```

Review generated-file changes by command and checksum/context, not by asking an
agent to reason over the entire generated output.

CMS Convex consumes `@lupinum/ginko-content/cms-contract` directly. There is no
CMS-owned vendor copy or regeneration command. Candidate verification must use
the exact clean Content tarball recorded in `packages/cms/compatibility.json`;
normal checks resolve the installed package and do not read sibling source.

## Ownership Boundary

Ginko CMS owns destructive operation previews, publish workflow integration,
assets, members, asset recovery, owner-CLI portability, projections, host setup
files, and Studio UX.

Ginko CMS must not own host app content, private canary scripts, frontend-owned
backend authority, duplicate confirmation systems, public bridge exports without
a current consumer, or compatibility shims for greenfield paths.
