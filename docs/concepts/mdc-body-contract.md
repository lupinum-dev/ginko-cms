# MDC Body Contract

Raw MDC text is the canonical editable body format for Ginko CMS v1.

This is a field-level content contract, not a promise that every table stores
body content. Locale drafts store `bodyMdc` as the authoring source and immutable
revisions snapshot it with the locale data they record. Public structural and
list projections deliberately do not duplicate the body. When a collection has
a rich body field, the canonical value for that field is valid MDC text,
conventionally named `bodyMdc`.

## Decision

The editable source of truth is MDC:

```txt
Filesystem .md/.mdc body
  -> bodyMdc field value
  -> parsed/rendered output for Nuxt

Ginko CMS localized body editor
  -> bodyMdc field value
  -> immutable publication revision
  -> page body plus bounded search output
```

Studio may use TipTap, component controls, previews, parsed ASTs, and rich UI
state. Those are editing aids. They must roundtrip back to valid MDC.

## Why

Filesystem content already uses Markdown/MDC as the natural authoring format.
Making MDC canonical keeps portability, editing, public rendering, and later
editor changes aligned.

Studio has an MDC workflow:

- `packages/cms/studio-app/src/editor/lib/markdown.ts`
- `packages/cms/studio-app/src/editor/lib/mdcToTiptap.ts`
- `packages/cms/studio-app/src/editor/lib/tiptapToMdc.ts`
- conversion tests under `test/runtime/editor/`

## Storage And Projection Model

Editable/admin state:

```txt
entryLocaleDrafts.bodyMdc
```

Immutable version state:

```txt
entryRevisions.snapshots[locale].bodyMdc
```

Rebuildable public state:

```txt
publicEntries: structural route/list identity plus bounded, body-free public field data and asset facts
publicSearchEntries: bounded search text fenced to the active revision
page/singleton result: bodyAst and toc parsed from the active immutable revision
list/search/nav/sitemap/surround result: no bodyAst or toc hydration
```

Only the MDC field value is canonical. Parsed body, plain text, table of
contents, search sections, and rendered output are derived.

The provider accepts the canonical `bodyMdc` shape. This greenfield cutover has
no legacy or alternate body-key compatibility path.

## Filesystem Mapping

Filesystem source:

```md
---
title: Content Routing
---

# Content Routing

::callout
Content routing works across locales.
::
```

Portability mapping:

```txt
markdown body -> bodyMdc field
frontmatter.title -> localized title field
derived plain text -> search projection
derived headings -> page/singleton response
```

## Studio Editing Flow

```txt
Load bodyMdc field
  |
  v
parse MDC
  |
  v
convert MDC AST to TipTap document
  |
  v
editor changes
  |
  v
convert TipTap document back to MDC
  |
  v
save bodyMdc as draft value
```

Roundtrip tests should cover common Markdown/MDC constructs:

- headings
- paragraphs
- marks
- links
- lists
- code blocks
- tables
- images/assets
- custom MDC components

## Parsing And Validation

On publish, Ginko CMS parses the stored MDC with the vendored
`parseMdcBody()` implementation from Ginko Content. The parser derives:

```txt
bodyAst
searchText
toc
```

Publishing also refreshes asset references found in `bodyMdc` and validates the
entry against the active collection contract. Unsupported content should be
reported as actionable diagnostics by the editing or publish workflow rather
than stripped into a second editable format.

Every canonical ingestion path enforces a 64 KiB UTF-8 ceiling for one locale's
`bodyMdc`. Revision and public projection documents are measured before write;
oversized content returns a typed workflow blocker instead of a raw database
limit failure. Structural rows are capped at 1 KiB, search rows at 5 KiB with
at most 4 KiB of search text, and body-free list payloads at 48 KiB. Those
limits keep navigation, sitemap, search, and 100-item list reads below Convex's
16 MiB transaction ceiling at the documented 1,500-entry/three-locale scale.

## What Not To Do

Do not make structured blocks the first canonical storage model:

```txt
Bad:
blocks are editable truth
MDC is generated as a secondary approximation
filesystem import has to guess block structure
```

Do not store two editable truths:

```txt
Bad:
bodyMdc is editable
bodyBlocks is editable
both can drift
```

Do not couple Nuxt page code to Studio editor internals:

```txt
Bad:
consumer app knows about TipTap JSON
```

## Future Option

A later visual block editor can still exist.

It should be implemented as:

```txt
MDC source
  -> editor document model
  -> user edits
  -> valid MDC source
```

If structured blocks ever become canonical, that must be an explicit
content-incompatible contract transition with its own portability story.

## Related Pages

- [Content portability](../guides/content-portability.md)
- [Content model](../reference/content-model.md)
