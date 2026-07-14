# Repo Development

Use this reference when changing the Ginko CMS repository itself. Canonical
sources:

- `AGENTS.md`
- package scripts in `package.json`
- docs under `docs/`
- tests under `test/`

## Maintainer Bias

Prefer:

```text
delete > simplify > replace > add
```

Avoid adding second sources of truth, compatibility shims for unreleased paths,
derived state without rebuild coverage, generic adapters, or bridge-layer domain
logic.

Ginko CMS owns:

- Studio UI and Nuxt module integration
- CMS domain contracts and field definitions
- Convex component implementation
- host-owned Convex setup files and root adapters
- member/access workflows
- content publishing, assets, backups, migrations, projections
- MCP tools that operate on CMS operations

Do not move CMS policy into `better-convex-nuxt`, Ginko Content, or host setup
glue.

## Commands

Use pnpm through Corepack:

```bash
corepack pnpm run check
corepack pnpm run release:verify
```

For registry release candidates after Ginko Content and `better-convex-nuxt`
are published:

```bash
corepack pnpm run release:verify:registry
```

If nested scripts resolve an older global `pnpm`, use a temporary wrapper:

```bash
tmpdir="$(mktemp -d)"
printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$tmpdir/pnpm"
chmod +x "$tmpdir/pnpm"
PATH="$tmpdir:$PATH" corepack pnpm run check
```

## Focused Checks

Use focused tests while working, then run the broad gate before handoff when
touching package metadata, host setup generation, Convex auth, Studio workflows,
MCP, release scripts, or public docs.

Useful focused commands:

```bash
corepack pnpm run format:check
corepack pnpm exec eslint packages test
corepack pnpm run check:docs:install-story
corepack pnpm run check:compatibility-matrix
corepack pnpm run check:release-hygiene
corepack pnpm exec vitest run <test-files> --reporter=dot
```

## Generated Files

Convex generated files are regenerated, not edited:

```bash
corepack pnpm run prepare:component
```

Do not paste or manually edit the huge generated component output under
`packages/convex/src/_generated/`.

## Public Surface Changes

When behavior changes, update all relevant surfaces together:

- source implementation
- contract/shared types or validators
- generated or host-setup-facing exports when applicable
- focused tests
- docs and skill references

For public API or provider claims, verify against source and tests before
writing docs.
