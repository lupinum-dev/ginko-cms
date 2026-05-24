# Migration Recipes

These recipes assume the collection contract remains code-owned and the
migration only transforms stored content.

Run a drift check first:

```bash
pnpm exec ginko-cms push --check
```

Create a scaffold:

```bash
pnpm exec ginko-cms migrate create <change-name>
```

Export a backup before applying any transform to shared data:

```bash
pnpm exec ginko-cms backup export --scope full --out ./ginko-backup.json
```

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
3. Apply the content or redirect migration.
4. Push the new contract.
5. Verify public page, navigation, sitemap, and search output.

## Rename A Collection

Treat collection rename as create new collection plus move entries. Keep stable
entry IDs if published URLs, relations, or imports depend on them.

## Split Or Merge Collections

Write this as a project migration with explicit entry mapping. Do not try to
hide it with compatibility collection names. The migration should state where
each old entry goes and how routes and relations are handled.
