# Migration Recipes

Use these recipes when `ginko-cms push --check` reports drift that needs an
explicit content migration. The collection contract remains code-owned; the
migration transforms stored content so the next contract push can succeed.

Run a drift check first:

```bash
pnpm exec ginko-cms push --check
```

Create a scaffold:

```bash
pnpm exec ginko-cms migrate create <change-name>
```

Preserve a verified backup through an owner-authenticated operator workflow
before applying any transform to shared data. The migration command does not
create a backup or a migration history row.

Plan and apply the migration:

```bash
pnpm exec ginko-cms migrate plan ginko/migrations/<file>.ts
pnpm exec ginko-cms migrate apply ginko/migrations/<file>.ts --yes
```

## Rename A Field

Use when `badge` becomes `category`.

```ts
export default {
  id: '2026-05-rename-post-badge-to-category',
  collections: ['posts'],

  async up(entry) {
    const { badge, ...shared } = entry.shared
    return {
      ...entry,
      shared: {
        ...shared,
        category: badge,
      },
    }
  },
}
```

## Add A Required Field

Backfill a value before marking the field required in `content.config.ts`.

```ts
export default {
  id: '2026-05-backfill-post-summary',
  collections: ['posts'],

  async up(entry) {
    return {
      ...entry,
      shared: {
        ...entry.shared,
        summary: entry.shared.summary ?? 'Needs editorial summary',
      },
    }
  },
}
```

## Delete A Field

Remove stored values before removing the field from the collection contract.

```ts
export default {
  id: '2026-05-remove-post-legacy-badge',
  collections: ['posts'],

  async up(entry) {
    const { legacyBadge, ...shared } = entry.shared
    return { ...entry, shared }
  },
}
```

## Convert A String To An Array

```ts
export default {
  id: '2026-05-convert-post-tags',
  collections: ['posts'],

  async up(entry) {
    const tags = entry.shared.tags
    return {
      ...entry,
      shared: {
        ...entry.shared,
        tags:
          typeof tags === 'string'
            ? tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : tags,
      },
    }
  },
}
```

## Move Shared Field To Localized Field

Copy a shared value into every existing locale.

```ts
export default {
  id: '2026-05-localize-author-role',
  collections: ['authors'],

  async up(entry) {
    const { role, ...shared } = entry.shared
    const locales = Object.fromEntries(
      Object.entries(entry.locales).map(([locale, value]) => [
        locale,
        value
          ? {
              ...value,
              values: {
                ...value.values,
                role,
              },
            }
          : value,
      ]),
    )
    return { ...entry, shared, locales }
  },
}
```

## Move Localized Field To Shared Field

Pick one canonical locale. Do this only when the team agrees which locale wins.

```ts
export default {
  id: '2026-05-unlocalize-author-company',
  collections: ['authors'],

  async up(entry) {
    const canonical = entry.locales.en?.values.company
    const locales = Object.fromEntries(
      Object.entries(entry.locales).map(([locale, value]) => {
        if (!value) return [locale, value]
        const { company, ...values } = value.values
        return [locale, { ...value, values }]
      }),
    )
    return {
      ...entry,
      shared: {
        ...entry.shared,
        company: canonical,
      },
      locales,
    }
  },
}
```

## Change Routes

Route changes are content and product changes, not only schema changes. Decide
whether old paths should redirect before applying the new contract.

For production:

1. Export backup.
2. Record old path to new path mapping.
3. Apply the content migration.
4. Rerun `pnpm exec ginko-cms push --check`.
5. Push the new contract only if the check reports safe drift.
6. Verify public page, navigation, sitemap, and search output.

Stable-slug collections can return old-route redirects after a slug change and
republish. Otherwise, handle redirects in the host app or add a documented CMS
redirect operation before relying on CMS-managed redirects.

## Rename A Collection

`ginko-cms migrate` cannot change an entry's collection. Treat a collection
rename as an app-owned content move:

1. Add the target collection in code.
2. Move or recreate entries through an explicit import/editor workflow that
   preserves the stable IDs you still need.
3. Verify routes, relations, and public reads.
4. Empty the old collection before removing it from code.

## Split Or Merge Collections

`ginko-cms migrate` is still useful for reshaping fields before or after the
move, but it is not the move operation. Write a project plan with explicit
entry mapping. The plan should state where each old entry goes and how routes
and relations are handled.

## Related Pages

- [Changing collections](../changing-collections.md)
- [Migration recovery](./recovery.md)
