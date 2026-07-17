# Changing The CMS Contract

`content.config.ts` is the code-owned input to the one installed `cmsContract`.
The installed record contains the resolved collection schemas, locales, routing
policy, and presentation metadata with separate content and presentation
hashes. Studio never keeps a second editable copy.

Start every change with:

```bash
pnpm exec ginko-cms push --check
```

Presentation-only changes can be installed directly with `ginko-cms push`.
Content-compatible additions can also install directly when the drift report
marks them safe. A content-incompatible change must use the bounded owner-only
contract transition below.

## Incompatible Contract Changes

Examples include removing or renaming fields, changing field types or
localization, removing locales, changing a populated collection between flat
and tree structures, and removing a non-empty collection.

Before staging:

1. Create and verify an official Convex deployment backup.
2. Explicitly unpublish every live entry in an affected collection. The CMS
   refuses to begin while affected active publications exist.
3. Test the transition against a disposable deployment.

Create and edit a transition:

```bash
pnpm exec ginko-cms contract transition create <change-name>
pnpm exec ginko-cms contract transition stage ginko/transitions/<file>.ts --yes
```

Staging locks Studio writes, reads affected drafts in bounded pages, runs the
transform, validates every output under the exact target contract, and stores
input/output hashes with draft-version fences. The command prints the durable
run ID.

Inspect and finish the run:

```bash
pnpm exec ginko-cms contract transition status <run-id>
pnpm exec ginko-cms contract transition apply <run-id> --yes
pnpm exec ginko-cms contract transition activate <run-id> --yes
```

Apply is resumable after every page. Activation is atomic: it installs the
target content hash and unlocks Studio only after every staged item was
applied. Before apply begins, cancel with:

```bash
pnpm exec ginko-cms contract transition cancel <run-id> --yes
```

After apply begins the run is resume-only; cancellation is deliberately
rejected.

## Transition File Shape

Files live under `ginko/transitions/`. The generated scaffold shows the full
input and output types. Output contains only canonical draft fields:

```ts
export default {
  id: '2026-07-rename-post-badge-to-category',

  async up(entry) {
    const { badge, ...shared } = entry.shared
    return {
      slug: entry.slug,
      parentEntryId: entry.parentEntryId,
      orderRank: entry.orderRank,
      nodeKind: entry.nodeKind,
      shared: { ...shared, category: badge },
      locales: Object.fromEntries(
        Object.entries(entry.locales).map(([locale, value]) => [
          locale,
          { slug: value.slug, values: value.values, bodyMdc: value.bodyMdc },
        ]),
      ),
    }
  },
}
```

The output cannot change entry identity or collection membership. It may change
shared fields, localized values, slugs, placement, order, node kind, and the
set of locale drafts when those changes validate under the target contract.
Unknown output keys are rejected.

## Verification

After activation:

```bash
pnpm exec ginko-cms push --check
pnpm exec ginko-cms doctor
pnpm run typecheck
pnpm run build
```

Then republish deliberately and verify public routes, redirects, navigation,
search, sitemap output, relations, assets, and locale alternates.

For disposable greenfield data, abandoning the deployment is often simpler
than transforming it. Never treat a shared production reset as a transition.

## Related Pages

- [Transition recipes](./migrations/recipes.md)
- [Transition recovery](./migrations/recovery.md)
- [Backup and recovery](../maintenance/backup-and-recovery.md)
