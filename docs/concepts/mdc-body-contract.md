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

Studio uses the shared Ginko Editor MDC workflow:

- `@lupinum/ginko-editor` owns Markdown/MDC conversion and visual editing.
- `FieldRichtext.vue` owns CMS assets, permissions, draft values, and metadata dialogs.
- Conversion and lifecycle regressions live in the Editor repository; CMS keeps host-adapter tests.

## Studio reader preview

Rich-text Preview uses Ginko Content's renderer and the collection's authoring
policy. The Nuxt module imports only client-capable components named in
`editorialLayout.collections[collection].authoring.implementation`. Register those
components through Nuxt's normal component directories or module hooks; a
separate Studio component registry is unnecessary.

The host mounts each preview with its own Vue runtime and application context,
so reader injections and reactive state work. Studio passes detached parsed body,
policy, component names and locale through the existing host bridge. Closing the
field or leaving Studio destroys the preview. Missing implementations and reader
errors produce a visible message; a corrected source can recover the preview.

CMS resolves only media references recognized by Content. Updated asset URLs,
including unavailable assets, take precedence over a URL remembered by the
picker. Uploads and library selection use the existing CMS asset ownership and
registration workflow. Source stores stable references, never temporary preview
URLs.

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

## Convex body transport

Page and singleton responses use one body representation per entry. Ordinary
articles retain the existing native `bodyAst` object; structured pages retain
`bodyAst: null`. Parser trees containing keys reserved by Convex, including MDC
`props.$` markers, use the additive `bodyAstJson` string instead. These markers
remain intact. Such trees could not previously cross the Convex value boundary.

The CMS Nuxt provider decodes this string before Ginko Content validates and
renders the entry. Direct CMS API consumers can call
`decodeContentBodyAstJson(entry.bodyAstJson)` from
`@lupinum/ginko-cms-contract/shared/publicContent.js`. Consumers must reject a
response containing both representations. Malformed JSON, non-root trees and
oversized trees fail closed. Protected draft preview uses `bodyAstJson` for every
article and `null` for structured pages.

This is a transport encoding, not stored content. Immutable revision MDC remains
the only published body source; no data migration or duplicate stored AST is
needed. Body-free list/search results include only asset facts for returned
field data. Full pages also include body asset facts for media resolution.

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

On publish, Ginko CMS parses the stored MDC with the package-owned
`parseMdcBody()` implementation imported from Ginko Content. The parser derives:

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

## Rich text images in a host website

The shared Editor preserves an uploaded image's stable asset ID, filename, alt text, title, and dimensions in an `::image` block. This is a custom component: declare its exact props and media source in the host Content policy. Do not replace it with plain Markdown merely to bypass validation, because that drops media metadata.

The playground provides the complete recipe in `playground/image-authoring.ts` and `playground/app/components/ContentImage.vue`. The same authoring object supplies `content.componentPolicy` and the blog/docs `ginkoCms.editorialLayout.collections.<collection>.authoring` configuration. `content.markdown.tags.image` maps the stored tag to the safe host renderer. Studio discovers that renderer through its authoring `componentName`. The kit remains host-owned code configuration. Its runtime configuration value is encoded as one JSON string because Nuxt converts nested nulls to empty strings; the Studio bridge parses it and checks its policy before use. In source configuration it remains the typed object: it travels through the existing Studio host bridge and is excluded from persisted presentation and its hash. Studio uses it only when the host Content hash and the installed component policy agree; labels and field presentation remain versioned in the backend.

The `src` prop is an asset reference, with `media.sourceProp: 'src'`; the other approved props are `id`, `filename`, `alt`, `title`, `width`, and `height`. Dimensions accept numbers and numeric strings because the Editor’s YAML props fence uses HTML-style string attributes; the renderer emits only finite positive dimensions and forwards only actual image attributes. Draft preview resolves references under the current user's read permission; public delivery resolves only published asset facts. Stored MDC retains the asset ID. Arbitrary component props and executable URLs remain invalid.
