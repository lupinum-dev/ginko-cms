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

Use these commands while working:

```bash
pnpm run check
pnpm run release:verify
```

`release:verify` is the development lane: it runs local checks, source-package
consumer verification, and the production audit. It is not release evidence.

The release-candidate lane consumes approved dependency tarballs without
rebuilding them:

```bash
GINKO_CONTENT_TARBALL=/absolute/path/to/ginko-content.tgz \
GINKO_CONTENT_SHA256=<sha256> \
BETTER_CONVEX_NUXT_TARBALL=/absolute/path/to/better-convex-nuxt.tgz \
BETTER_CONVEX_NUXT_SHA256=<sha256> \
pnpm run release:verify:candidate
```

It rejects mismatched hashes, wrong installed versions, and workspace/link
dependencies. The uncommitted result is `.pack/release-evidence.json`.

For a real release candidate, also run the registry dependency lane after
Ginko Content is published:

```bash
pnpm run release:verify:registry
```

That proves the CMS packages can consume the already-published Ginko Content and
`better-convex-nuxt` versions from `packages/cms/compatibility.json` instead of
accidentally relying on sibling workspaces.

## Release Runbook

Publishing is intentionally manual. The `release:publish` script exits with a
failure message so nobody, human or agent, can accidentally push packages to
npm.

1. Confirm Ginko Content and `better-convex-nuxt` are released at the
   versions in `packages/cms/compatibility.json`.
2. Start from a clean working tree on the release branch.
3. Update package versions and compatibility docs intentionally.
4. Generate release notes:

```bash
pnpm run release:notes
```

5. Review `CHANGELOG.md`; changelogen is a draft generator, not an authority.
6. Run local release verification:

```bash
pnpm run release:verify
```

7. Run registry dependency verification:

```bash
pnpm run release:verify:registry
```

8. Inspect `.pack/*.tgz` before publishing:

```bash
tar -tzf .pack/lupinum-ginko-cms-contract-*.tgz | less
tar -tzf .pack/lupinum-ginko-cms-convex-*.tgz | less
tar -tzf .pack/lupinum-ginko-cms-*.tgz | less
pnpm run check:packs:no-local-specifiers
npm publish .pack/lupinum-ginko-cms-contract-0.1.1.tgz --access public --otp <code>
npm publish .pack/lupinum-ginko-cms-convex-0.1.2.tgz --access public --otp <code>
npm publish .pack/lupinum-ginko-cms-0.1.3.tgz --access public --otp <code>
```

9. Commit the release prep. Do not commit `.pack/` artifacts.
10. Publish only after the owner has reviewed the tarballs and npm package
    settings.

For the first public release of a package, npm staged publishing cannot be used
because staged publishing requires the package to already exist on the registry.
Use an owner-controlled manual publish with 2FA.

For later releases, prefer npm trusted publishing plus staged publishing:

- GitHub Actions must use a protected environment with human approval.
- The release job must use Node 24 or newer and npm 11.15 or newer.
- Do not use package-manager caches in release jobs.
- Use OIDC trusted publishing instead of long-lived npm publish tokens.
- Configure npm package settings to require 2FA and disallow traditional tokens.
- Stage the tarballs in package order with `npm stage publish .pack/<name>.tgz`,
  download and inspect each staged package with `npm stage download <stage-id>`,
  then approve with `npm stage approve <stage-id>` and 2FA.
- CI sibling checkouts require `LUPINUM_CI_REPO_READ_TOKEN` when Ginko Content
  is private. Set `GINKO_CONTENT_CI_REF` when CI must test a release branch or
  tag instead of `main`.

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
  `ip-address`, `kysely`, `mermaid`, `nitropack`, `postcss`, `simple-git`, and
  `ws` keep transitive production audit clean.
- `qs` is held at the patched `6.15.2` line for the transitive Express parser
  chain currently pulled in by MCP tooling.
- `auditConfig.ignoreGhsas` contains the current unfixable `elliptic` advisory
  from the MCP tooling chain. Remove it as soon as upstream stops resolving
  `elliptic` or npm publishes a patched range.
- `convex@1.38.0` is the release tuple pin.
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
assets, members, backups, projections, host setup files, and Studio UX.

Ginko CMS must not own host app content, private canary scripts, frontend-owned
backend authority, duplicate confirmation systems, public bridge exports without
a current consumer, or compatibility shims for greenfield paths.
