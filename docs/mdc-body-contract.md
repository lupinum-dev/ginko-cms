# MDC Body Contract

Raw MDC text is the canonical editable body format for Ginko CMS v1.

This is a field-level content contract, not a promise that Convex stores a
dedicated `bodyMdc` column. Current storage keeps draft/published field values
as structured maps. When a collection has a rich body field, the canonical value
for that field is valid MDC text, conventionally named `bodyMdc`.

## Decision

The editable source of truth is MDC:

```txt
Filesystem .md/.mdc body
  -> bodyMdc field value
  -> parsed/rendered output for Nuxt

Ginko CMS localized body editor
  -> bodyMdc field value
  -> published projection data/search/toc output
```

Studio may use TipTap, component controls, previews, parsed ASTs, and rich UI
state. Those are editing aids. They must roundtrip back to valid MDC.

## Why

Filesystem content already uses Markdown/MDC as the natural authoring format.
Making MDC canonical keeps migration, export, editing, public rendering, and
future editor changes aligned.

The current Studio already has an MDC workflow:

- `packages/cms/studio-app/src/editor/lib/markdown.ts`
- `packages/cms/studio-app/src/editor/lib/mdcToTiptap.ts`
- `packages/cms/studio-app/src/editor/lib/tiptapToMdc.ts`
- conversion tests under `test/runtime/editor/`

## Storage And Projection Model

Editable/admin state:

```txt
draft.values.bodyMdc
```

Published version state:

```txt
published.values.bodyMdc
```

Public projection:

```txt
public entry data.bodyMdc
derived body/render shape
derived search text
derived headings/toc
```

Only the MDC field value is canonical. Parsed body, plain text, table of
contents, search sections, and rendered output are derived.

The provider may tolerate legacy or alternate body keys while older data exists,
but new v1 docs and examples should prefer `bodyMdc`.

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

Migration plan:

```txt
markdown body -> bodyMdc field
frontmatter.title -> localized title field
derived plain text -> search projection
derived headings -> toc projection
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

## Validation Rules

Before saving or publishing, body validation should be able to report:

```txt
invalid_mdc_syntax
unsupported_mdc_component
invalid_mdc_component_props
unsafe_html
missing_required_body
asset_reference_missing
relation_reference_missing
```

Validation should not silently strip unsupported content. Editors need
actionable diagnostics.

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

A future visual block editor can still exist.

It should be implemented as:

```txt
MDC source
  -> editor document model
  -> user edits
  -> valid MDC source
```

If structured blocks ever become canonical, that must be a separate schema
migration with its own import/export story.
