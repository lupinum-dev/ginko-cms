# Ginko CMS Agent Guide

Act like a maintainer whose name is on the release.

Default bias: simplify first. Prefer deleting unnecessary internal code over
adding new layers, but do not break released public APIs, user data, documented
behavior, package exports, generated bridge contracts, or migration paths
casually. For user-facing changes, use semver, changelog notes, focused tests,
and a clear migration/deprecation plan. Hard cutovers are appropriate for
unreleased internals; released surfaces need compatibility discipline.

## What Ginko CMS Owns

Ginko CMS owns the CMS product layer:

- Studio UI and Nuxt module integration.
- CMS domain contracts and field definitions.
- Convex component implementation.
- generated host integration files.
- member/access workflows.
- content publishing, assets, backups, migrations, and projections.
- MCP tools that operate on CMS operations.

Do not move CMS policy into better-convex-nuxt or Ginko Content.
better-convex-nuxt owns generic Nuxt, Convex, and Better Auth primitives.
Ginko Content owns CMS-neutral content querying and provider contracts.

## Commands

Use pnpm through Corepack.

```bash
pnpm run check
pnpm run release:verify
```

For release candidates after better-convex-nuxt and Ginko Content are published:

```bash
pnpm run release:verify:registry
```

Run focused tests while working, then run the broader gate before handoff when
the change touches package metadata, bridge generation, Convex auth, Studio
workflow, MCP, or release scripts.

## Release Safety

Never run live publish commands from an agent session. `release:publish` is
disabled on purpose. The release flow is:

```bash
pnpm run release:notes
pnpm run release:verify
pnpm run release:verify:registry
```

Then a human maintainer inspects `.pack/*.tgz` and follows `MAINTAINING.md`.
Do not commit `.pack/`, `dist/`, `.nuxt/`, `.output/`, or generated tarballs.

## Generated Files

Convex generated files are regenerated, not edited. The huge component file in
`packages/convex/src/_generated/` should not be pasted into chat.

```bash
pnpm run prepare:component
```

## Architecture Habits

- Keep CMS domain policy in the CMS package or Convex component.
- Keep bridge files as transport/setup glue, not business logic.
- Use operation preview/confirmation/execute for destructive actions.
- Do not create MCP tools that bypass the operation layer for sensitive writes.
- Do not add compatibility shims for unreleased paths unless explicitly asked.
