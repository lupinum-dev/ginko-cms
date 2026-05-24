# Changing Collections During A Project

Ginko CMS keeps one source of truth for content models: the host app's code.
For Ginko Content apps, that is usually `content.config.ts`.

Studio, MCP, imports, and public reads inspect the synced collection contract,
but they do not edit schema. Contract changes move in one direction:

```text
content.config.ts -> ginko-cms push -> synced CMS contract
```

Stored content is separate. If a contract change can invalidate existing
entries, update the content explicitly before pushing the new contract.

## The Short Version

For every collection change, start with:

```bash
pnpm exec ginko-cms push --check
```

If the check reports only safe drift, run:

```bash
pnpm exec ginko-cms push
```

If the check reports that a migration is required:

```bash
pnpm exec ginko-cms migrate create <change-name>
pnpm exec ginko-cms backup export --scope full --out ./ginko-backup.json
pnpm exec ginko-cms migrate plan ginko/migrations/<file>.ts
pnpm exec ginko-cms migrate apply ginko/migrations/<file>.ts --yes
pnpm exec ginko-cms push --check
pnpm exec ginko-cms push
```

`migrate plan` reads live draft snapshots and shows counts plus sample changed
paths. It writes nothing. `migrate apply` refuses to run without `--yes`, applies
only changed entries, and uses `draftVersion` so entries edited after planning
are not overwritten. It does not create an automatic backup or a migration
history table.

## Safe Changes

These changes are safe to push because they do not invalidate stored entry data:

| Change                                         | Current handling |
| ---------------------------------------------- | ---------------- |
| Collection label change                        | Safe push        |
| Collection icon change                         | Safe push        |
| Non-schema collection settings change          | Safe push        |
| Add a new collection                           | Safe push        |
| Remove an empty collection                     | Safe push        |
| Add an optional field                          | Safe push        |
| Add a locale without removing existing locales | Safe push        |

Safe does not mean no work happened. Ginko CMS may still refresh derived state
so Studio lists, public projections, search, and navigation reflect the latest
contract.

## When A Migration Is Required

These changes can invalidate existing entries or public routes and require an
explicit content migration when the collection already has entries:

| Change                           | Why it is blocked                                             |
| -------------------------------- | ------------------------------------------------------------- |
| Add a required field             | Existing entries have no value                                |
| Remove a field                   | Stored values would become orphaned                           |
| Rename a field                   | The CMS cannot know whether this is rename or delete plus add |
| Change a field type              | Existing values may not validate                              |
| Change field localization        | Values must move between shared and locale state              |
| Change the collection schema     | Existing entries may no longer validate on publish            |
| Remove a locale                  | Locale-specific content must be archived, moved, or deleted   |
| Change routing                   | Published URLs and redirects need an explicit decision        |
| Change collection type           | Tree and flat entries have different invariants               |
| Remove a collection with entries | Content must be archived, exported, or deleted first          |
| Split or merge collections       | Entry identity, routes, relations, and public output change   |

The guard is conservative on purpose. A blocked push means "write down the data
change", not "clear tables until it works".

## Recommended Production Flow

1. Edit `content.config.ts`.
2. Run `pnpm exec ginko-cms push --check`.
3. If migration is required, create a migration scaffold:

   ```bash
   pnpm exec ginko-cms migrate create <change-name>
   ```

4. Export a full backup:

   ```bash
   pnpm exec ginko-cms backup export --scope full --out ./ginko-backup.json
   ```

5. Review the migration transform and plan it:

   ```bash
   pnpm exec ginko-cms migrate plan ginko/migrations/<file>.ts
   ```

6. Apply it explicitly:

   ```bash
   pnpm exec ginko-cms migrate apply ginko/migrations/<file>.ts --yes
   ```

7. Run `pnpm exec ginko-cms push --check`.
8. Run `pnpm exec ginko-cms push`.
9. Run `pnpm exec ginko-cms doctor`.
10. Run the host app's typecheck and build.
11. Verify the changed public routes in the site.

## Migration File Shape

`ginko-cms migrate create <name>` creates a file under:

```text
ginko/migrations/
```

The scaffold is intentionally plain TypeScript. It does not define schema. It
only describes how one stored content entry should be transformed.

```ts
type ContentMigrationEntry = {
  collection: string
  entryId: string
  stableId: string | null
  draftVersion: number
  shared: Record<string, unknown>
  locales: Record<string, { values: Record<string, unknown>; bodyMdc?: string | null } | null>
}

export default {
  id: '2026-05-rename-post-badge-to-category',
  collections: ['posts'],

  async up(entry: ContentMigrationEntry): Promise<ContentMigrationEntry> {
    const { badge, ...shared } = entry.shared
    return {
      ...entry,
      shared: { ...shared, category: badge },
    }
  },
}
```

The runner treats `collection`, `entryId`, `stableId`, and `draftVersion` as
identity fields. A migration may change `shared` values and locale values. It
may create a missing locale row by changing a locale from `null` to an object,
but it does not delete locale rows.

Keep migrations direct. Do not add compatibility fields, runtime fallbacks, or
parallel old/new models unless the product requirement is explicit.

## Development Resets

For disposable local data, a full CMS content reset can be acceptable after the
team confirms the data can be discarded.

For shared staging or production data, reset is not a migration path. Export a
backup and transform the content explicitly.
