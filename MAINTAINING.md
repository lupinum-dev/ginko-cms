# Maintaining Ginko CMS

Ginko CMS is the integration package. It owns CMS domain rules, Studio, the
Convex component, host Convex setup files, MCP tools, package e2e, and release
compatibility with Ginko Content and `@lupinum/better-convex-nuxt`.

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

The published Better Convex Nuxt/Vue beta.3 tuple is the validated integration
baseline. Install the committed dependency graph, then run the source and
packed-source checks:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run release:verify
```

Ordinary CI checks out `sourceRehearsal.betterConvexCommit` only for the
packed-source consumer. It does not inject an override into Ginko's dependency
graph. The committed lockfile remains the sole source-install authority.

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

The compatibility authority records the exact immutable registry artifacts,
their provenance source commits, and the Nuxt runtime fingerprint. The Better
Convex MCP beta was published earlier than the Nuxt/Vue beta.3 pair, so its
provenance commit is intentionally different and is recorded per artifact. The
MCP package remains experimental while its transport targets the final
2026-07-28 protocol.

For a real release candidate, also run the registry dependency lane after
Ginko Content is published:

```bash
pnpm run release:verify:registry
```

That lane must download every dependency from the registry and match the exact
hashes and integrity values in `packages/cms/compatibility.json`.

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
6. Trigger `.github/workflows/release-candidate.yml` manually to rehearse, or
   push the exact prerelease tag to publish. It downloads upstream registry
   bytes, packs once, requires both pnpm and strict npm consumers,
   and runs protected disposable Convex staging.
7. Download the `ginko-candidate-<commit>` artifact produced by that workflow.
8. Inspect the exact candidate tarballs:

```bash
tar -tzf .pack/candidate/lupinum-ginko-cms-contract-*.tgz | less
tar -tzf .pack/candidate/lupinum-ginko-cms-convex-*.tgz | less
tar -tzf .pack/candidate/lupinum-ginko-cms-*.tgz | less
pnpm run check:packs:no-local-specifiers
```

9. Publish only after the owner has reviewed the candidate manifest, protected
   staging evidence, tarballs, and npm package settings. The tag workflow
   publishes the original contract, Convex, and CMS archives in order through
   trusted publishing with provenance and the `next-staging` tag. It downloads
   all three registry versions and requires byte equality. It never repacks and
   never moves `latest` or shared `next`.

While the project has one maintainer, `ginko-release` uses tag restrictions
without a required reviewer. The evidence records `governanceMode:
solo-maintainer`, the tag actor, source commit, and commit author; it does not
invent a deputy, independent reviewer, or notification test.

- GitHub Actions must use the tag-restricted `ginko-release` environment.
- `ginko-release` must contain the non-secret variables `CONVEX_DEPLOYMENT`,
  `CONVEX_URL`, and `CONVEX_SITE_URL`, plus only the deployment-scoped
  `CONVEX_DEPLOY_KEY` secret. The deployment must be a dedicated empty
  development deployment whose key and URLs match its `dev:<name>` identity.
  Do not use a personal development or production deployment. Delete the
  dedicated deployment after the prerelease evidence is retained.
- The protected proof needs no CMS test-account credentials; do not add unused
  `GINKO_CMS_TEST_EMAIL` or `GINKO_CMS_TEST_PASSWORD` secrets.
- The release job must use Node 24 or newer and npm 11.15 or newer.
- Do not use package-manager caches in release jobs.
- Use OIDC trusted publishing instead of long-lived npm publish tokens.
- Configure npm package settings to require 2FA and disallow traditional tokens.
- Publish only the workflow-downloaded candidate archives; never run a local
  `npm publish` or repack an archive.

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
