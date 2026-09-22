# Edit a small website together

Ginko keeps one shared working version of each language. Editing in Studio or
on the website changes that same version. Public readers receive only the
selected published revision. Saving and publishing are separate operations:
autosave protects work; publishing approves what visitors will receive.

## Choose a page model

Articles use the existing page defaults, including the checked MDC body and
standalone Ginko Editor. A structured landing page can omit that article body:

```ts
const landing = defineCollection({
  type: 'page',
  body: false,
  route: '/landing',
  i18n: true,
  schema: z.object({
    cta_label: fields.text().localized(),
    cta_href: fields.text().localized(),
    hero_image: fields.image().localized(),
    hero_alt: fields.text().localized(),
  }),
})
```

This remains a page: routes, SEO, language identity and sitemap behavior remain
available. Do not change it to a data collection merely to hide a body field.
Use `ginkoCms.editorialLayout` in Nuxt configuration for marketer-facing labels.
Content's resolved semantic contract deliberately excludes presentation copy.

## Connect the website

The host owns the Vue page template. Render published and working data through
that same template, with named slots for editable fields. Keep editing controls
and their authenticated queries in the private preview route; public rendering
does not import the editor or subscribe to working content.

The `@lupinum/ginko-cms/editing` subpath exports:

- `EntryDraftSession`: acknowledged state, local changes, autosave, exact retries,
  field conflicts, pending editor work and disposal.
- `entryDraftSnapshot`: builds a baseline from stored values, never rendered
  language fallbacks or display defaults.
- `validateDraftSaveRequest`: checks the request at the transport boundary.

Supply the authenticated save mutation, current edit permission, and editor
flush/pending callbacks to the session. Feed authenticated snapshots into
`receive`. Pass the complete desired draft into `edit`, starting from
`session.patch`; this method replaces local state and does not accept a sparse
field patch. For example, after confirming that English exists:

```ts
const next = session.patch
const english = next.locales?.en
if (english) {
  english.values = { ...english.values, title: newTitle }
  session.edit(next)
}
```

Await `flush` before changing language, view, page or opening publication review.
Block navigation when flushing fails;
keep both values visible for overlapping edits. Call `dispose` on unmount.

The playground's `LandingDraftEditor.vue` and `LandingPage.vue` demonstrate the
integration, including CMS image IDs, exact-language selection, missing-language
creation, source review links and operation-confirmed publication. They are host
examples; the shared session is CMS-owned.

Articles retain the standalone rich-text Editor. Register the explicit
[image authoring and rendering contract](../concepts/mdc-body-contract.md) when
using managed images in article bodies; the host controls their public rendering.

## What collaboration means

Different fields and different languages can save independently. An overlapping
field shows the person's local value alongside the shared value and offers an
explicit choice. A rich-text body or nested field is atomic: this does not claim
same-paragraph character merging. Pending conversions and uploads must finish
before persistence or navigation.

A retry after a lost response uses the identical request identifier and payload.
The server checks current authorization and returns its original receipt instead
of replaying the write over later edits. Publication still requires a fresh
review token for the selected versions and languages, including shared fields.

## Translation review

A language can be authored independently or linked to another source language.
Copying an existing language records that source as unreviewed. Existing content
with unknown provenance stays unknown until someone explicitly chooses a source.

Review shows the previous reviewed source beside the current source and target.
An unchanged translation can be confirmed as still suitable. Changing either
language, the shared fields or the locale's identity invalidates a stale
confirmation. Publishing English never silently publishes German.

## Publishing and delivery

“Saved” means the working version is acknowledged. “Published” means the backend
has activated an approved revision. Claiming the delivered website is current
requires separate delivery evidence. The local playground reads publication
changes without rebuilding its frontend.

For Vercel ISR, configure the existing signed Content invalidation endpoint with
the [Vercel delivery adapter](./vercel-delivery.md). A fully prerendered deployment
still needs regeneration or a rebuild; a webhook response alone is not proof
that every cached page changed. Hosted CDN verification remains a release gate.

Private preview responses must be `private, no-store` and `noindex`; read and
write authorization must remain on the backend even when controls are hidden.

## Adoption and rollback

This integration uses the exact local Content and Editor candidates recorded in
`packages/cms/compatibility.json`. They are not approved registry releases.
Follow [active migrations](../../internals/migrations.md) before changing a
persisted contract. The reviewed transition rejects dropping nonempty article
content; asset-bearing article conversion requires an explicit media migration.

Editorial globals should use singleton entries if they need this publication
lifecycle. This pilot has no editable global footer and does not migrate existing
site-data blocks or operational settings. Its decorative footer remains part of
the developer-owned template.
