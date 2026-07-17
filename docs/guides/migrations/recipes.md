# Contract Transition Recipes

Generate a transition scaffold first:

```bash
pnpm exec ginko-cms contract transition create <change-name>
```

The scaffold returns the exact output shape. The snippets below show only the
changed part; keep the scaffold's slug, placement, node-kind, and locale
mapping in every returned output.

## Rename A Shared Field

```ts
async up(entry) {
  const { badge, ...shared } = entry.shared
  return {
    ...outputFrom(entry),
    shared: { ...shared, category: badge },
  }
}
```

## Backfill A Required Field

```ts
async up(entry) {
  return {
    ...outputFrom(entry),
    shared: {
      ...entry.shared,
      summary: entry.shared.summary ?? 'Needs editorial summary',
    },
  }
}
```

## Move A Shared Field Into Locale Drafts

```ts
async up(entry) {
  const { role, ...shared } = entry.shared
  const base = outputFrom(entry)
  return {
    ...base,
    shared,
    locales: Object.fromEntries(
      Object.entries(base.locales).map(([locale, value]) => [
        locale,
        { ...value, values: { ...value.values, role } },
      ]),
    ),
  }
}
```

An optional local helper can keep recipes concise:

```ts
function outputFrom(entry) {
  return {
    slug: entry.slug,
    parentEntryId: entry.parentEntryId,
    orderRank: entry.orderRank,
    nodeKind: entry.nodeKind,
    shared: entry.shared,
    locales: Object.fromEntries(
      Object.entries(entry.locales).map(([locale, value]) => [
        locale,
        { slug: value.slug, values: value.values, bodyMdc: value.bodyMdc },
      ]),
    ),
  }
}
```

## Route And Structure Changes

Changing slugs, parents, or tree structure is validated as one staged graph.
Sibling collisions, cycles, invalid parents, removed locales, and unsafe slugs
block staging. Unpublish affected content first, record the intended redirect
behavior, and verify routes after republishing under the activated contract.

Collection renames, splits, and merges change entry identity and are not a
contract-transition transform. On this greenfield project, export the content,
create the target collections, import into a fresh deployment, and verify the
new stable IDs and relations explicitly.

## Run The Transition

```bash
pnpm exec ginko-cms contract transition stage ginko/transitions/<file>.ts --yes
pnpm exec ginko-cms contract transition status <run-id>
pnpm exec ginko-cms contract transition apply <run-id> --yes
pnpm exec ginko-cms contract transition activate <run-id> --yes
```

See [Changing the CMS contract](../changing-collections.md) for the complete
guarded workflow.
