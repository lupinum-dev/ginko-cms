# Relations

This document describes how relations work in `@lupinum/ginko-cms` after the
stable-ID cutover and the locked public-read contract.

It covers:

- what is stored in the database
- what Studio writes when you select a relation
- what the public API returns to the frontend
- what the migration does for older content
- what is intentionally out of scope in v1

## Mental Model

A relation field does not store a nested object in the entry itself.

It stores a stable reference to another entry. Public reads return that stable
reference as data. They do not broadly expand relations at runtime.

Current flow:

1. You define a field with `type: 'relation'` or `type: 'relations'`
2. You point it at another collection via `relation.collectionId`
3. Studio saves the target entry's `stableId`
4. Public reads return that stable ID as the relation value
5. A future profile can deliberately expose an expanded relation shape if the
   generated types also own that shape

That means the editor and public contract stay normalized. Relation expansion is
not a broad runtime option in v1; profiles are the projection boundary.

## Field Definition

Single relation:

```ts
{
  key: 'author',
  type: 'relation',
  relation: { collectionId: 'authors' },
}
```

Multiple relations:

```ts
{
  key: 'authors',
  type: 'relations',
  relation: { collectionId: 'authors' },
}
```

`collectionId` here is the target collection slug, for example `authors`.

## What Is Stored

Relations are stored as `stableId` values.

Single relation:

```json
{
  "author": "a1b2c"
}
```

Multiple relations:

```json
{
  "authors": ["a1b2c", "d4e5f"]
}
```

Important details:

- Raw Convex entry `_id` values are no longer the canonical relation value
- Every entry now gets a `stableId`, even when the collection does not use
  stable slugs in URLs
- `needsStableId()` is still only about routing behavior, not relation storage

## Studio Behavior

In Studio, relation fields query the target collection and show selectable
entries.

When you pick one:

- `FieldRelation.vue` saves the selected entry's `stableId`
- `FieldRelations.vue` saves an array of selected `stableId`s

The picker still uses `_id` internally for rendering keys and entry identity in
the UI, but not as the stored relation value.

## Public API Behavior

Relations are returned as stable references in:

- `public.page`
- `public.list`
- `public.search`
- `public.nav`
- `public.surround`

For `relation` fields the value is a `stableId` string or `null`.

For `relations` fields the value is an array of `stableId` strings.

The public API does not expose `depth`, `include`, or `fields.omit` as runtime
shape-changing knobs. That is intentional: public reads should not return a
shape TypeScript cannot prove.

### Single Relation Result

If `blog.author` points to an author entry, the frontend receives:

```ts
post.data.author
```

as:

```ts
'a1b2c'
```

### Multiple Relations Result

If `blog.authors` is a `relations` field, the frontend receives:

```ts
post.data.authors
```

as an array of stable IDs.

## Frontend Usage

Typical usage:

```vue
<script setup lang="ts">
const route = useRoute()
const page = await useContentOne(blog, {
  by: { route: () => route.path },
})
</script>

<template>
  <article>
    <h1>{{ page?.title }}</h1>

    <div v-if="page?.author">
      <p>Author reference: {{ page.author }}</p>
    </div>
  </article>
</template>
```

For multiple relations:

```vue
<li v-for="authorId in page?.authors ?? []" :key="authorId">
  {{ authorId }}
</li>
```

## Missing or Unpublished Targets

If a target entry is missing or unpublished:

- the stored stable reference remains unchanged
- public reads do not silently expand, null, or filter the relation value

Validation and diagnostics should report broken references where that matters,
but v1 public reads do not rewrite relation values based on target publish
state.

## Locale Behavior

Relation values are stable across locales. A localized public query such as:

```ts
await api.public.page({ collection: 'blog', locale: 'de', path: '/blog/x' })
```

returns the stored stable reference. It does not resolve a locale-specific
target entry inline.

## Migration From Legacy `_id` Relations

Older content may still contain raw entry `_id` values in relation fields.

The one-off migration does two things:

1. Backfills missing `stableId`s on entries
2. Rewrites legacy relation values from `_id` to `stableId`

In the current model it rewrites relation data in:

- `entryDrafts`
- `entryRevisions`
- current entry draft/publish pointers where the helper needs to preserve
  active state

After rewriting, rebuild derived public rows, search text, relation cache tags,
and asset references from current source docs.

### Migration Trigger

The mutation added for this cutover is:

```ts
collections / sync.migrateLegacyRelationsToStableIds
```

Run it once after deploy in an environment that still contains old relation
values.

## Why This Approach

This design fits the locked public contract better than broad runtime relation
expansion.

Reasons:

- the editor stays normalized
- generated public types do not overpromise expanded objects
- public reads stay predictable and cacheable
- rollback and undo remain coherent after migration because draft and revision
  snapshots are rewritten too

## What This Does Not Do

Not included in v1:

- reverse relations
- recursive or multi-hop expansion
- runtime relation expansion in `page`, `list`, `search`, nav tree, or surround
  helpers
- GraphQL-style `include` or query-shape configuration

If those become necessary later, they should be added deliberately. The current
implementation is intentionally narrow and predictable.

## Practical Example

Assume:

- `authors` collection has fields `name` and `bio`
- `blog` collection has field `author` of type `relation`

Stored blog entry data:

```json
{
  "author": "a1b2c"
}
```

Public page result:

```json
{
  "title": "My post",
  "data": {
    "author": "a1b2c"
  }
}
```

Frontend access:

```ts
post.data.author
```
