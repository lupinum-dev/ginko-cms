# Ginko CMS UI Revision Plan

Created: 2026-07-05

> **Superseded route inventory and implementation record.** The editor-first
> design principles remain useful history, but this file is not current product
> architecture or acceptance evidence. The Imports page and its navigation were
> removed; portability is owner CLI-only. Use `docs/concepts/studio/ux-model.md`,
> `docs/concepts/studio/workflows.md`, and `userstories.md` for current behavior.

## Goal

Make Ginko CMS feel like an easy editor for marketing and content people, while still giving developers and operators a reliable place to inspect advanced details when they deliberately need them.

The first interaction should answer:

- What needs attention?
- What content can I edit?
- What is ready to publish?
- What will change on the website?
- Why is something blocked?

The first interaction should not require understanding:

- Convex internals
- collection contracts
- model versions
- operation ids
- agent run ids
- raw JSON payloads
- cache tags
- projections
- revalidation implementation
- filesystem import implementation

Advanced information stays available, but it must live behind explicit `Operations`, `Advanced`, or `Developer details` paths.

## Product Decision

Do a hard IA and language cutover. Do not add a second "simple mode" beside the current UI.

Reason: a simple/advanced mode split would create two product surfaces and two sources of truth. The simpler system is one Studio where editor tasks are primary and diagnostics are secondary.

## Implementation Status

Updated: 2026-07-15 — the shadcn shell migration (branch `studio-shadcn-shell`) and the
follow-up design review (`studio-design-review.md`) re-audited this plan. Two regressions
the migration introduced (missing Home nav item, raw `collection.type` on Home) are fixed;
the Content Imports section is obsolete (the imports page was replaced by the portability
command layer); remaining UNMET items (MCP naming, Revoke→End session, media/storage
settings section) were picked up by the design-review waves. Per-criterion evidence:
`scripts/ui-shell-migration/audits/audit-d-revision-reconcile.md`.

Previous status (2026-07-05):

Completed in the implementation pass:

- Primary navigation now has explicit `Home`, `Content`, `Editor`, `Operations`, and `Settings` groups.
- `Assets` is now `Media`; `Reviews` is now `Approvals`; `Content model` is now `Content setup`; `Imports` is now `Content imports`; `Agents` is now `Agent sessions`.
- Activity and agent-session links are gated behind operational/settings capability in the sidebar.
- `/studio` now reads as a work queue with editor-first quick links and website-facing status language.
- `/studio/model` now presents content setup and website use before developer detail.
- `/studio/imports` now presents import outcomes first and moves run ids, raw source strings, slugs, and JSON into `Developer details`.
- `/studio/reviews` now presents approval decisions first and moves operation ids, agent ids, entry ids, version numbers, and raw preview payload into `Developer details`.
- New content creation now uses `Create draft`; publish decisions stay in the entry editor.
- The Home metric strip was replaced with a prioritized row-based queue.
- `/studio/model` now uses a mobile list-first/detail-second layout with a back action.
- `/studio/reviews` now requires an explicit confirmation dialog before approving website changes.
- `/studio/settings` is grouped by job: People and access, Localization, Website connections, and Advanced system.
- Settings endpoint URLs, secret env names, job ids, paths/tags, table counts, Studio route, and agent key ids now sit behind `Developer details`.
- `Developer details` now uses one shared Studio disclosure component instead of repeated page-local `<details>` markup.
- Revoked agent connections are hidden by default behind `Show revoked`, and revoking agent access uses an explicit confirmation dialog.
- Navigation, sidebar links, and command-palette static routes now share one route policy source so labels, destinations, and capability gates do not drift.
- `/studio/content/:collection` now uses editor-facing list/hierarchy language, `Drafts to continue`, `Content`, `Edit`, title-first rows, next actions, and singleton redirect behavior.
- `/studio/activity` is intentionally positioned as an operational `Activity log`, with event kind and raw locale moved into `Developer details`.
- Media, site-wide content, settings, activity, public workflow, and editor diagnostics copy now use marketing/editor language where visible.
- English and German public locale labels were updated for the renamed navigation and page concepts.
- Focused tests were updated for the new content setup and published website language.
- Debug export now recursively redacts token-, secret-, auth-, session-, password-, and API-key-like diagnostic values before download.
- Activity queries now return both the raw persisted summary and an editor-safe display summary, so pages do not rewrite history in the template.
- Verified in the consumer app at `http://localhost:9999/studio` after packing and reinstalling the local CMS tarball.

Current implementation note:

- Advanced diagnostics stay explicit in each page, but the disclosure shell is shared. Page-specific contents remain local because the payloads differ by workflow.

## Source Material Reviewed

Local product and design sources:

- `PRODUCT.md`
- `DESIGN.md`
- `packages/cms/studio-app/src/router.ts`
- `packages/cms/studio-app/src/components/studio/StudioSidebar.vue`
- `packages/cms/studio-app/src/components/studio/StudioSidebarNav.vue`
- `packages/cms/studio-app/src/pages/index.vue`
- `packages/cms/studio-app/src/pages/collections.vue`
- `packages/cms/studio-app/src/pages/imports.vue`
- `packages/cms/studio-app/src/pages/reviews.vue`
- `packages/cms/studio-app/src/pages/[collection]/index.vue`
- `packages/cms/studio-app/src/pages/[collection]/[id].vue`
- `packages/cms/studio-app/src/editor/ui/DebugPanel.vue`
- Attached populated DOM snapshot for `/studio/imports`
- Live audit notes from the generated `.impeccable` critique run

External CMS references:

- Directus collection and item pages: https://directus.com/docs/guides/content/explore and https://directus.com/docs/guides/content/editor
- Directus import/export: https://directus.com/docs/guides/content/import-export
- WordPress block editor: https://wordpress.org/documentation/article/wordpress-block-editor/
- WordPress Site Health: https://wordpress.org/documentation/article/site-health-screen/
- Strapi Content Manager: https://docs.strapi.io/cms/features/content-manager
- Sanity Structure tool: https://www.sanity.io/docs/studio/structure-introduction
- Sanity field groups: https://www.sanity.io/docs/studio/field-groups
- Payload Admin Panel: https://payloadcms.com/docs/admin/overview
- Payload Globals: https://payloadcms.com/docs/configuration/globals
- Payload Live Preview: https://payloadcms.com/docs/live-preview/overview
- Contentful content modeling basics: https://www.contentful.com/help/content-models/content-modelling-basics/
- Contentful web app overview: https://www.contentful.com/help/getting-started/contentful-web-app-overview/
- Contentful entry editor sidebar: https://www.contentful.com/help/content-and-entries/entry-editor-sidebar-overview/
- Contentful Live Preview: https://www.contentful.com/help/content-preview/live-preview/
- WordPress posts screen: https://wordpress.org/documentation/article/posts-screen/

## Reference CMS Takeaways

### Directus

Directus separates the content module from the data model. Editors browse, filter, and search collection items, then edit a tailored item form. Import/export is reached from collection context, not from a developer-looking first screen. Revisions, comments, shares, and raw field configuration are contextual secondary tools. Directus also splits the Data Studio into top-level modules such as content, files, users, insights, and settings, which supports the same Ginko direction: editor work and admin work should not look like one flat menu.

Borrow:

- Collection list -> item form as the main editor path.
- Put import/export near the content it affects or in Operations, not beside daily content navigation.
- Keep revisions and raw field detail contextual, not dashboard-level.

Do not borrow:

- General database-admin vocabulary as primary Ginko vocabulary.

### WordPress

WordPress keeps Posts, Pages, Media, and editor workflows primary. The block editor defaults to visual editing; code editing is a deliberate switch. The posts screen supports editing, viewing, filtering, searching, and bulk actions around content rows. Diagnostics such as Site Health live under Tools, away from the writing flow.

Borrow:

- Visual/editor-first defaults.
- Publishing settings in a side rail.
- Site/system health under a tools or operations area.
- Code/raw views as secondary switches.

Do not borrow:

- Overgrown admin sidebar sprawl. Ginko should stay narrower and more website-shaped.

### Strapi

Strapi separates Content Manager list/edit work from model/admin configuration. Draft/publish, review workflows, preview, filters, and configurable list views support editors without making schema details the main story.

Borrow:

- `Content Manager` mental model: list, filter, edit, preview, publish.
- Review stages as editorial status, not implementation status.
- List view customization only where it helps repeated editorial scanning.

Do not borrow:

- Exposing document ids or advanced list configuration in the default editor view.

### Sanity

Sanity's Structure tool is about shaping navigation around editor workflows instead of dumping every schema type into one generic list. It supports custom lists, views, and menus to create intuitive editor flows. Sanity field groups are a useful reference because they reorganize where fields appear in Studio without changing the underlying document shape.

Borrow:

- Use custom navigation groups that reflect how the website is edited.
- Prioritize intent routing: search results and create actions should land in the expected editor context.
- Use panes or master/detail only when they reduce navigation cost.
- Use field groups or tabs for long entries only as a presentation layer, not as a second data model.

Do not borrow:

- Over-custom structure that breaks predictable create/edit/search behavior.

### Payload

Payload has an admin panel for content management and supports drafts, versions, previews, and access control. Its admin is configurable, but the editor-facing concepts remain documents, versions, drafts, and preview.

Borrow:

- Draft/version/preview language.
- Access-aware admin surfaces.
- Collection admin options as advanced configuration, not daily editor copy.
- Globals as a model for site-wide singleton content such as navigation, banner alerts, and localized strings.
- Live Preview as an editor control for documents/globals where a website URL can be resolved.

Do not borrow:

- Config-heavy language in the primary UI.

### Contentful

Contentful treats content modeling as a planning/developer collaboration surface. Non-technical users test and give feedback, but the model is not the same as day-to-day editing.

Borrow:

- Position the content model as setup and diagnostics.
- Use editor-facing labels and examples when showing a content type.
- Saved content and asset views for repeated editorial queues.
- Entry sidebars with status, links, locales, versions, and an Info tab where technical entry information belongs.
- Side-by-side live preview, live updates, and inspector mode as a long-term reference for preview confidence.

Do not borrow:

- Making content-model administration a main editor destination.
- Spaces/environments complexity in the editor surface.

## Concrete Patterns to Borrow

These are patterns worth translating into Ginko's existing primitives. They do not require new data sources unless explicitly called out.

- Saved work views:
  - `Needs review`
  - `Drafts`
  - `Unpublished changes`
  - `Translation gaps`
  - `Failed website refresh`
  - `Out of date approvals`

- Entry status rail:
  - status and publish action
  - preview link
  - affected pages
  - locales
  - references/backlinks if already available
  - versions/history if already available
  - technical info in `Developer details`

- Long entry organization:
  - `Content`
  - `SEO`
  - `Publishing`
  - `Translations`
  - `Diagnostics`
  - Use this only when a content type is genuinely long enough to need grouping.

- Collection list ergonomics:
  - filters
  - stable status column
  - selectable columns only if already supported by local state
  - bulk actions only through operation preview -> confirmation -> execute

- Singleton/site-wide content:
  - direct edit pages for globals such as navigation, footer, site settings, and banner alerts
  - avoid presenting these as one-row database tables

- Preview:
  - preview as a primary editor control
  - side-by-side preview as a later enhancement if the website can be embedded safely
  - inspector jump-to-field only when a robust mapping exists

- Command palette:
  - create entry
  - jump to collection
  - open draft
  - preview
  - publish
  - run diagnostics, only for operational users

## Current Interaction Map

| Route                             | Current role                         | Problem                                                                              | Target role                                                                                                                                               |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/studio`                         | Dashboard / content operations       | Good work queue idea, but imports, revalidation, and content model are too primary.  | Editor home / work queue.                                                                                                                                 |
| `/studio/content/:collection`     | Collection list                      | Mostly aligned. Needs stronger editor copy and next action language.                 | Primary content browsing and editing path.                                                                                                                |
| `/studio/content/:collection/:id` | Entry editor                         | Strongest surface. Advanced detail is already mostly hidden.                         | Keep as the canonical editor pattern.                                                                                                                     |
| `/studio/assets`                  | Assets                               | Should be primary for marketers.                                                     | Primary media library.                                                                                                                                    |
| `/studio/site-data`               | Site data                            | Ambiguous label. Could be editor-owned global website data or advanced data.         | Rename to `Site-wide content` if editor-owned; otherwise move to Operations.                                                                              |
| `/studio/model`                   | Content model / collection contracts | Developer concepts dominate.                                                         | `Content setup` under Advanced. Plain summary first, developer details hidden.                                                                            |
| `/studio/imports`                 | Import run inspector                 | Currently an operations/debug screen with run ids, JSON, and repeated metric cells.  | `Content imports` under Operations. Outcome first, raw run detail hidden.                                                                                 |
| `/studio/reviews`                 | Agent review                         | Approval action is mixed with operation ids, agent ids, expected versions, and JSON. | `Approvals`. Human-readable publish request first, raw request detail hidden.                                                                             |
| `/studio/activity`                | Activity log                         | Can be useful, but event language risks becoming operational.                        | `Recent changes` for editors or `Activity log` under Operations.                                                                                          |
| `/studio/agents`                  | Agent runs                           | Not a marketing editor task.                                                         | Operations-only. Label as `Agent sessions` for active sessions or `Agent runs` for historical logs. Pending publish requests surface through `Approvals`. |
| `/studio/settings`                | Settings                             | Too many jobs in one place.                                                          | Split by job: People, Localization, Integrations, System.                                                                                                 |

## Target Information Architecture

### Primary Sidebar

These are the first interaction points for marketing editors.

- `Home`
  - Route: `/studio`
  - Purpose: work queue, continue drafts, ready to publish, blockers, approvals, missing translations.

- `Content`
  - Route group: `/studio/content/:collection`
  - Purpose: browse and edit content by website-facing collection labels.
  - Include singleton entries, but explain them as one-of-a-kind website pages or settings.

- `Media`
  - Route: `/studio/assets`
  - Purpose: upload, find, replace, inspect usage, edit alt text.

- `Site-wide content`
  - Route: `/studio/site-data`, only if this contains editor-owned global website content.
  - Purpose: edit site-wide content values such as navigation labels, footer data, or global marketing content.

- `Approvals`
  - Route: `/studio/reviews`
  - Visible to users who can publish or approve.
  - Purpose: approve or reject human-readable website changes.

### Secondary Sidebar

Use one explicit advanced group. It can be collapsed by default for editor roles.

- `Operations`
  - `Content setup` -> `/studio/model`
  - `Content imports` -> `/studio/imports`
  - `Recent activity` or `Activity log` -> `/studio/activity`
  - `Agent sessions` or `Agent runs` -> `/studio/agents`
  - `System health` -> future setting section or existing operational panels

- `Settings`
  - `People and access`
  - `Localization`
  - `Integrations`
  - `Advanced system`

Do not keep `Manage` as the main group label. It is too broad and makes content model, agents, activity, imports, and settings feel equally important to content editing.

## Global Navigation Changes

| Priority | Change                                                                                                                                              | Files                                                | Acceptance                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| P0       | Add a visible `Home` item in the sidebar instead of relying on the logo.                                                                            | `StudioSidebarNav.vue`                               | A new editor can reach the work queue without knowing the logo is clickable.                            |
| P0       | Move `Assets` out of `Manage` and label it `Media`.                                                                                                 | `StudioSidebarNav.vue`, i18n labels                  | Media is visible next to Content for editor roles.                                                      |
| P0       | Rename `Reviews` to `Approvals`.                                                                                                                    | `StudioSidebarNav.vue`, `reviews.vue`, i18n labels   | The nav item describes the user's decision, not the implementation source.                              |
| P0       | Move `Content model`, `Imports`, `Activity`, and `Agents` into `Operations`.                                                                        | `StudioSidebarNav.vue`                               | Marketing users do not see these beside daily content by default unless permissions make them relevant. |
| P0       | Stop showing `Activity` and `Agents` to everyone. Gate by operational/admin capability.                                                             | `StudioSidebarNav.vue`, permissions if needed        | Editor-only users see Home, Content, Media, Site-wide content, Approvals when relevant.                 |
| P1       | Rename `Site data` to `Site-wide content` if it is editor-owned content. Otherwise move it to Operations.                                           | `StudioSidebarNav.vue`, `site-data.vue`, i18n labels | The label tells whether this is editable website content or system data.                                |
| P1       | Replace the singleton `1` badge with either a page/document icon plus tooltip `Single entry`, or keep the number only with clearer accessible text. | `StudioSidebarNav.vue`                               | Screen readers and tooltips explain what the marker means.                                              |
| P1       | Command palette should rank content entries, media, and approvals before operations commands.                                                       | command palette files                                | Searching for a page or entry never surfaces model/import/debug items first.                            |

## Home / Work Queue Revision

Route: `/studio`

Current issue:

The page is close to the right idea, but it is named `Content operations` and puts imports, revalidation, system health, content model quick links, and route behavior too close to the editor's first path.

Target:

Home should be a calm editorial work queue.

### Required changes

- Rename page title from `Content operations` to `Home` or `Work queue`.
- Change eyebrow from `Dashboard` to `Today` or remove the eyebrow.
- Replace description with: `Drafts, approvals, translation gaps, and publish blockers for this website.`
- Remove `Content model` and `Imports` from quick links.
- Add quick links for:
  - `New content` or first available create action
  - `Media`
  - `Approvals`, only if there are pending approvals or the user can approve
- Keep `Needs attention`, but define it in editorial terms:
  - publish blockers
  - missing required fields
  - stale approvals
  - failed website refreshes, summarized as website refresh failures
- Rename `Changed drafts` to `Drafts to continue`.
- Rename `Translations` to `Missing translations`.
- Rename `Revalidation` to `Website refresh`, and move it out of the metric row unless it is failing.
- Rename `Import blockers` to `Import needs review`, and only show it when non-zero.
- Replace the five equal metric cards with one prioritized queue:
  - `Needs attention`
  - `Ready to publish`
  - `Continue editing`
  - `Missing translations`
  - `Recently published`
- Keep numbers, but attach each number to a visible row or action.
- Move `System health` into a collapsed `Operations status` panel at the bottom or into Operations.
- Rename `Content inventory` to `Content overview`.
- In the overview table:
  - `Mode` -> `Website use`
  - `Route-backed` -> `Has website pages`
  - `Data-only` -> `Used as shared data`
  - hide raw `collection.type` unless the user opens details
- Avoid showing collection implementation terms on the first screen.

### Acceptance

- A marketing editor can open `/studio` and know what to do next within 5 seconds.
- The primary viewport contains no `Content model`, `Convex`, `revalidation`, `operation`, `importRunId`, `schema`, `projection`, or `JSON`.
- Operational failures still appear when they block publishing, but in website-facing language.

## Content Lists Revision

Routes: `/studio/content/:collection`

Current issue:

The content list route is one of the better surfaces. It should become the model for the rest of the Studio: rows, status, next action, search, and direct editing.

### Required changes

- Keep collection lists as a primary navigation destination.
- Use website-facing collection labels from the code-defined model.
- Make the main row title the content title, not slug/id.
- Keep technical slug/id in a secondary details disclosure.
- Show these columns when available:
  - Title
  - Public state
  - Locale readiness
  - Last edited
  - Next action
- Prefer `StudioRow` or table-like rows over repeated metric cards.
- Empty state must include a next action:
  - `Create first entry`
  - `Import content`, only for admin/operations users
  - `Open content setup`, only when the collection cannot be edited yet
- For singleton collections, open the entry directly or show a single-row list with clear copy:
  - `This content type has one entry.`
- Search and filters should use editor language:
  - `Published`
  - `Draft`
  - `Needs translation`
  - `Blocked`
  - `Ready to publish`
- Rename `New entry` to `New content` or collection-specific copy such as `New post`, `New author`, `New page`.
- Demote `flat/tree` view language if present:
  - Primary: `List` / `Hierarchy`
  - Details: explain the technical tree/flat behavior only if needed.
- Rename generic `Tools` labels to the concrete action group:
  - `View options`
  - `Bulk actions`
  - `Developer details`, depending on contents.
- Keep raw paths secondary. Show website paths when they help editors find the content, but do not use path/slug as the row title when a title exists.

### Acceptance

- No raw entry id appears in the first row view unless the title is missing.
- Every list row exposes either a next action or clear status.
- A singleton collection does not feel like a broken one-row database table.

## New Content Revision

Route: `/studio/content/:collection/new`

Current issue:

The new-entry path should not imply publishing before the editor has reviewed preview/readiness. If a button currently says `Create and publish` but the flow creates an entry and routes to edit, the copy is misleading.

### Required changes

- Use one primary action: `Create draft`.
- After creation, route to the entry editor for preview/readiness/publish.
- Keep publish actions only in the entry editor after the draft exists.
- If collection-specific labels are available, use:
  - `Create post draft`
  - `Create page draft`
  - `Create author draft`
- Avoid a second create path for `create and publish` unless the operation layer truly supports preview -> confirm -> execute in that same flow.

### Acceptance

- Creating content never looks like it silently publishes.
- The publish decision always happens in the entry editor with readiness and website impact visible.

## Entry Editor Revision

Routes: `/studio/content/:collection/new`, `/studio/content/:collection/:id`

Current issue:

This is the strongest part of the current Studio. It already has top actions, compare mode, a status rail, publishing affordances, and advanced diagnostics mostly hidden.

Target:

Use the entry editor as the reference pattern for the whole CMS.

### Required changes

- Keep `Save draft`, `Preview`, and `Publish` in the top action area.
- Keep the right status rail.
- Keep compare mode for localization, but make the default view a single focused locale.
- Rename `public output` to `published website` or `website output`.
- Rename `revalidation` to `website refresh` in primary copy.
- In publish dialogs and rails, show:
  - affected pages
  - affected locales
  - readiness blockers
  - draft age or changed-since-publish state
  - website refresh status after publish
- Hide these behind `Developer details`:
  - entry id
  - operation ids
  - version numbers
  - draft version
  - preview hash
  - cache tags
  - events
  - raw payloads
  - projection details
  - debug timelines
- Keep destructive actions gated by explicit confirmation.
- Ensure destructive actions say what will happen to the website, not only what happens to data.
- Preserve `DebugPanel.vue` as a development or explicit diagnostics tool, not a default editor panel.
- If long entries become hard to scan, add presentation-only groups:
  - `Content`
  - `SEO`
  - `Publishing`
  - `Translations`
  - `Diagnostics`
  - Do not change the underlying content shape just to create tabs.

### Publish dialog requirements

- Keep public URL, changed fields, readiness, affected locale scope, and publish note visible.
- Hide `Draft version`, `Preview hash`, cache tags, raw events, and raw operation ids unless advanced mode is explicitly enabled.
- Use `published website content` in primary copy.
- Use `website refresh` instead of `revalidation`.

### Acceptance

- The first editor viewport is a form and publish state, not diagnostics.
- A publisher can answer `what will go live?` before confirming.
- A developer can still find raw ids and debug data through one deliberate disclosure.

## Media / Assets Revision

Route: `/studio/assets`

Target:

Media is a primary marketing workflow. It should not live under `Manage`.

### Required changes

- Rename nav label to `Media`.
- Rename `Full View` to `Library views`.
- Rename `Global` to `Shared library`.
- Rename `Share in Collection` to `Make available to this collection`.
- Rename `Make Global` to `Make available everywhere`.
- Primary actions:
  - `Upload`
  - `Replace`
  - `Copy URL`, if safe and already supported
  - `Edit alt text`
- Primary list/grid fields:
  - thumbnail
  - file name or title
  - alt text completeness
  - usage count or `Used by`, if already available
  - upload date
  - size/type
- Hide storage keys, bucket names, raw URLs, and internal ids under `Developer details`.
- Empty state must explain the next action:
  - `Upload images and files used by website content.`
- Asset deletion must show usage impact before storage/file-size details.
- If usage tracking is not already available, do not add a new projection just for this revision. Show `Usage unavailable` in details and leave usage work as a separate data-model decision.

### Acceptance

- A marketer can upload or find an image without touching Settings or Operations.
- Technical storage details are not visible in the first asset view.

## Website Data Revision

Route: `/studio/site-data`

Decision:

If this route contains global website content, keep it primary and rename it `Site-wide content`. If it contains operational data, move it under Operations.

### Required changes if editor-owned

- Rename `Site data` to `Site-wide content`.
- Use forms and content labels, not database labels.
- Explain singleton/global records as one-of-a-kind website data.
- Show publish/readiness state if these values affect the website.
- Rename `block` to `section`.
- Rename `Public API` to `Shown on website`.
- Hide raw keys, ids, provider names, and `Custom JSON` under `Advanced` or `Developer details`.

### Required changes if operational

- Move to Operations.
- Rename to `System data`.
- Add a short warning that this is not a normal content editing area.

### Acceptance

- The nav label makes it clear whether the page is content or system configuration.

## Content Setup Revision

Route: `/studio/model`

Current issue:

The page uses `Content model`, `Manage`, `Code-defined`, `Collection contracts`, and Convex sync language as first-order concepts. This makes the UI feel like a schema inspector.

Target:

This page becomes `Content setup` under Operations. It starts with an editor-friendly summary and only then offers developer details.

### Required changes

- Rename nav label from `Content model` to `Content setup`.
- Move route under the Operations nav group.
- Change header:
  - Eyebrow: `Operations`
  - Title: `Content setup`
  - Description: `Content types available in this Studio and how they appear on the website.`
- Replace `Code-defined collections` badge with hidden or secondary copy:
  - Primary: `Managed by developers`
  - Details: `Defined in code`
- Rename `Collection contracts` to `Content types`.
- Rename `Collection contract` to `Content type details`.
- First list should show:
  - content type label
  - editor description
  - single/multiple entry behavior
  - website use
  - locales
  - entry count
  - setup status
- Field detail should show:
  - field label
  - field purpose
  - required/optional
  - localization behavior
  - editor input type
- Field keys, schema type names, route patterns, model version, contract ids, and Convex sync status go into `Developer details`.
- Replace missing sync copy:
  - Current: `Convex has not synced this code-defined content model yet.`
  - Target primary: `Content setup is still installing. Editing will be available after setup finishes.`
  - Developer details: mention Convex snapshot sync.
- Add mobile master/detail behavior:
  - Mobile first screen: content type list only.
  - Selecting a type opens detail with a back button.
  - Do not squeeze list and detail side by side on narrow screens.

### Acceptance

- `/studio/model` no longer feels like the first destination for editors.
- The first viewport contains content type labels and setup status, not contracts and runtime implementation.
- Developers can still inspect the exact model through a clearly labeled details section.

## Content Imports Revision

Route: `/studio/imports`

Current issue:

The attached DOM snapshot shows `Operations`, `Imports`, `Code-defined collections`, `Inspector only`, latest run ids, source strings, repeated metric cells, manual user ids, and `Import result JSON`. That is useful for operators, but it is not a marketing editor workflow.

Target:

Imports become an Operations page that explains outcomes first and raw run data last.

### Required changes

- Keep imports in Operations, not primary editor navigation.
- Change header description:
  - Current: `Inspect filesystem-to-Ginko previews, applies, blockers, and public-output refreshes.`
  - Target: `Review content imported from files before it affects the website.`
- Remove `Code-defined collections` from the header. Put it in `Developer details`.
- Replace `Inspector only` with either:
  - no badge, if the page is useful for operators, or
  - `Operations`, if a badge is needed.
- Replace top metric grid with an outcome summary:
  - `Last import`
  - `Changed content`
  - `Needs review`
  - `Published to website`
- Do not show `latestRun.importRunId` in primary copy.
- Run card primary title should be:
  - `Posts import`
  - `Pages import`
  - `Authors import`
  - plus date/status.
- Replace `filesystem: content @ posts` with `Posts from filesystem content`.
- Replace `apply`, `preview`, `published` badges with human-readable sequence:
  - `Previewed`
  - `Applied to drafts`
  - `Published`
- Hide these under `Developer details`:
  - `importRunId`
  - raw `createdBy` id
  - raw source strings
  - raw JSON
  - stable ids
  - internal entry ids
- Rename `Import result JSON` to `Developer details: raw import result`.
- Redact secrets and auth/session material in any debug or raw payload view.
- Replace repeated five-cell metric blocks inside each run with a compact summary row:
  - `43 entries changed`
  - `22 published`
  - `0 blockers`
  - `0 warnings`
- If an import has blockers, put blockers first and make `Review blockers` the row action.
- If no blockers exist, the primary message should be success/outcome, not a raw run report.
- Do not add a new import execution path unless the operation layer already supports preview/confirm/execute.

### Acceptance

- A non-developer can understand what an import did without opening JSON.
- Raw import ids and raw JSON are invisible until `Developer details` is opened.
- Import blockers are more prominent than successful run telemetry.

## Approvals Revision

Route: `/studio/reviews`

Current issue:

The page is called `Agent review` and exposes `operationId`, `agentRunId`, `target entry`, `expected version`, and raw preview JSON near an approve/reject action. That makes a high-impact publishing decision feel technical and underexplained.

Target:

Approvals should make the publishing decision clear, accountable, and website-facing.

### Required changes

- Rename nav label and page title to `Approvals`.
- Change eyebrow from `Agent review` to `Publishing`.
- Change description to: `Review pending website changes before they are published.`
- In each approval card, primary content should be:
  - title
  - summary of change
  - content type
  - affected entry title
  - affected locales
  - affected website pages, if available
  - requested by
  - requested time
  - stale/blocker status
- Remove `operationId` badge from primary card header.
- Replace `Agent run` with `Requested by agent` only if relevant, and put the raw id in details.
- Replace `Target entry` id with linked entry title.
- Replace `Expected version` with:
  - Primary: `Based on current draft` or `Outdated request`
  - Details: exact version number.
- Replace raw preview JSON with a `What will change` summary.
- If only raw preview JSON exists today, wrap it in `Developer details` and do not pretend it is editor-ready.
- Approve button should open a confirmation dialog or inline confirmation if the request changes public website output.
- Confirmation should show:
  - affected pages/locales
  - stale status
  - requester
  - irreversible/undo information
- Reject should support a short optional reason if the operation layer supports it. Do not add a backend feature just for this pass.

### Acceptance

- The first visible card does not show operation ids, agent run ids, entry ids, expected version numbers, or JSON.
- A publisher can approve based on visible website impact.
- Stale requests cannot be approved without a clear reason and disabled or confirmation state.

## Activity Revision

Route: `/studio/activity`

Target:

Activity can be useful to editors if it reads as recent changes. It belongs in Operations if it reads as an event log.

### Required changes

- Decide route label based on content:
  - `Recent changes` if editor-facing.
  - `Activity log` if operational.
- Primary row copy should be:
  - who
  - did what
  - to which content
  - when
  - publish effect if applicable
- Hide event kind, event id, operation id, payload, and raw locale fields in details.
- On Home, show only the last few human-readable recent changes. Link to the full activity route.

### Acceptance

- Activity rows read like content history, not application logs.

## Agent Runs Revision

Route: `/studio/agents`

Target:

Agents are operational infrastructure. They should not be a marketing editor's first interaction point.

### Required changes

- Move `Agents` into Operations.
- Gate visibility to operational/admin users.
- Rename to `Agent sessions` if the page is about active/ending sessions; use `Agent runs` only for historical execution logs.
- Do not surface agent run state in primary editor navigation.
- If an agent creates a publish request, surface that through `Approvals` with human-readable change summary.
- Rename `Revoke` to `End session` when ending an active agent session.
- Keep raw agent run ids, credential keys, delegated user ids, scopes/permissions, safety-mode internals, prompts, payloads, raw errors, and execution logs in `Developer details`.

### Acceptance

- Editor roles can approve agent-proposed content without visiting `/studio/agents`.

## Settings Revision

Route: `/studio/settings`

Current issue:

Settings currently risks becoming a catch-all for access, credentials, integrations, revoked items, operational state, and system toggles. A page with many badges and controls feels like admin software, not a focused CMS.

Target:

Settings should be split by job, not by implementation source.

### Required sections

- `People and access`
  - members
  - roles
  - invites
  - active/revoked access

- `Localization`
  - interface language
  - website languages
  - default locale
  - enabled locales
  - fallback rules, if exposed

- `Website connections`
  - host route
  - preview URL
  - public website integration
  - webhooks or refresh endpoints if exposed

- `Media and storage`
  - upload limits
  - storage usage
  - allowed file types

- `Advanced system`
  - AI agent connections
  - credentials
  - MCP details
  - website refresh diagnostics
  - storage diagnostics
  - operational health
  - raw ids
  - revoked credentials archive

### Required changes

- Use rows and grouped settings sections, not repeated status-card grids.
- Put revoked credentials behind `Show revoked`.
- Redact credential values and long ids.
- Place destructive actions in their own gated area.
- Do not add a generic settings framework. Use explicit sections and existing primitives.
- Move endpoint URLs, tokens, secret env names, job ids, paths/tags, table counts, and Studio route into `Developer details`.
- Keep the current settings view model as the single source of truth when splitting sections.

### Acceptance

- An editor can find people/localization/website connection settings without scanning operational internals.
- Advanced system details are still available to admins in one explicit place.

## Terminology Replacements

| Current                       | Replace with                                            | Where                              |
| ----------------------------- | ------------------------------------------------------- | ---------------------------------- |
| `Content operations`          | `Home` or `Work queue`                                  | `/studio`                          |
| `Dashboard`                   | `Today` or remove                                       | `/studio`                          |
| `Manage`                      | `Operations` or specific job label                      | headers/sidebar                    |
| `Content model`               | `Content setup`                                         | nav and `/studio/model`            |
| `Collection contracts`        | `Content types`                                         | `/studio/model`                    |
| `Collection contract`         | `Content type details`                                  | `/studio/model`                    |
| `Code-defined`                | `Managed by developers` or `Managed in code` in details | `/studio/model`, `/studio/imports` |
| `Convex has not synced...`    | `Content setup is still installing...`                  | `/studio/model`                    |
| `public output`               | `published website content` or `website output`         | global                             |
| `revalidation`                | `website refresh`                                       | primary UI                         |
| `Route-backed`                | `Has website pages` or `Creates website pages`          | `/studio`, model details           |
| `Data-only`                   | `Used as shared data` or `Content-only`                 | `/studio`, model details           |
| `Path prefix`                 | `URL prefix`                                            | model/details                      |
| `Agent review`                | `Approvals` or `Publish review`                         | `/studio/reviews`                  |
| `operationId`                 | `Request id` in Developer details                       | approvals/details                  |
| `agentRunId`                  | `Agent run id` in Developer details                     | approvals/details                  |
| `Target entry`                | linked content title                                    | approvals                          |
| `Expected version`            | `Based on current draft` / `Outdated request`           | approvals                          |
| `Stale`                       | `Out of date`                                           | approvals                          |
| `Preview` in reviews          | `Proposed changes`                                      | approvals                          |
| `Import result JSON`          | `Developer details: raw import result`                  | imports                            |
| `filesystem: content @ posts` | `Posts from filesystem content`                         | imports                            |
| `Apply` in imports            | `Import`                                                | imports                            |
| `Import run`                  | `Import`                                                | imports                            |
| `Inspector only`              | remove or `Operations`                                  | imports                            |
| `Agent run`                   | `Agent session`                                         | agents/details                     |
| `Revoke` for an agent session | `End session`                                           | agents                             |
| `MCP connections`             | `AI agent connections` in primary, `MCP` in details     | settings                           |
| `Scopes`                      | `Permissions`                                           | settings/agents                    |
| `Storage hygiene`             | `Storage diagnostics`                                   | settings                           |
| `Invalidation job`            | `Refresh job`                                           | settings/activity                  |
| `projection`                  | hide in Developer details                               | global                             |
| `Projection batch`            | `Publish batch` or hide in Developer details            | global                             |
| `cache tags`                  | hide in Developer details                               | global                             |
| `Debug Timeline`              | `Editor diagnostics`                                    | debug panel                        |
| `Export Debug`                | `Export diagnostics`                                    | debug panel                        |
| `Full View`                   | `Library views`                                         | media                              |
| `Global` in media             | `Shared library`                                        | media                              |
| `Share in Collection`         | `Make available to this collection`                     | media                              |
| `Make Global`                 | `Make available everywhere`                             | media                              |
| `Site data`                   | `Site-wide content` if editor-owned                     | site-data                          |
| `block` in site-data          | `section`                                               | site-data                          |
| `Public API` in site-data     | `Shown on website`                                      | site-data                          |

## Design System Rules

Use existing Studio primitives. Do not invent a new UI kit for this revision.

Required primitives:

- `StudioPageHeader`
- `StudioSection`
- `StudioListFrame`
- `StudioRow`
- `StudioEmptyState`
- `StudioInspectorSection`
- `StudioStatusPill`
- existing `Dialog` and `DialogFooter`

Rules:

- Use rows and tables for repeated operational records.
- Use cards for grouped editor content, repeated items, modals, and framed tools only.
- Do not put cards inside cards.
- Do not add hero dashboards or decorative metric grids.
- Do not use raw JSON as primary content.
- Use `Developer details` disclosures for raw identifiers and payloads.
- Use `StudioStatusPill` for public/draft/blocked/ready state.
- Keep typography on the existing `DESIGN.md` ladder.
- Keep color restrained: neutral surfaces, emerald for primary/success, warning/destructive only for semantic states.
- Keep diagnostics accessible by keyboard and screen reader when disclosed.

## Role-Based Visibility

Marketing editor default:

- Home
- Content
- Media
- Site-wide content, if editor-owned
- Approvals, if they can approve

Publisher:

- Everything a marketing editor sees
- Approvals
- publish actions
- publish history

Developer/operator:

- Operations group
- Content setup
- Content imports
- Activity log
- Agent sessions/runs
- Advanced system settings
- Developer details disclosures

Admin:

- Settings
- People and access
- integrations
- destructive/system actions

Acceptance:

- A user without operational permissions does not see `Content setup`, `Imports`, `Activity log`, or `Agent sessions/runs` as first-level navigation.
- Permissions should hide navigation and guard routes. Do not rely on nav hiding only.

## Advanced Details Pattern

Every advanced block should follow the same pattern:

- Label: `Developer details`
- Optional helper: `Ids, raw payloads, and implementation state for troubleshooting.`
- Closed by default.
- No primary action hidden inside it unless the action is genuinely developer-only.
- Redact secrets and auth/session data.

Allowed inside:

- ids
- raw JSON
- cache tags
- provider names
- operation/request ids
- model versions
- stack traces
- debug timelines
- Convex-specific status

Not allowed inside only:

- publish blockers
- affected pages
- affected locales
- destructive impact
- validation errors editors must fix

## Editor Diagnostics and Debug Export

Files:

- `packages/cms/studio-app/src/editor/ui/DebugPanel.vue`
- `packages/cms/studio-app/src/editor/ui/Editor.vue`
- `packages/cms/studio-app/src/editor/model/useDebugExport.ts`

Current issue:

Debug export can include unpublished draft content, raw markdown, HTML/text output, editor JSON, and event payloads. That is valuable for support, but it is too sensitive for normal editor chrome.

Required changes:

- Rename `Debug Timeline` to `Editor diagnostics`.
- Rename `Export Debug` to `Export diagnostics`.
- Keep the panel gated behind advanced/diagnostic mode.
- Add warning copy before export:
  - `Diagnostics may include unpublished content and editor state. Share only with trusted support or developers.`
- Redact token-like values and auth/session material before export if any can reach this payload.
- Do not show the diagnostic timeline in the first entry editor viewport.

Acceptance:

- Editors can work without seeing debug terminology.
- Developers can still export diagnostics intentionally.
- Export does not casually expose secrets or auth/session data.

## Security and Privacy Rule

Debug output must never display secrets, auth tokens, session tokens, private credentials, or full user auth payloads in a normal Studio screen.

If raw payloads are needed for development:

- make them dev-only or capability-gated
- redact token-like values
- hide behind `Developer details`
- avoid including them in copied DOM/debug reports by default

## Implementation Phases

### Phase 0: IA and terminology hard cutover

Goal: make the navigation and labels editor-first without changing domain behavior.

Tasks:

- [x] Add `Home` sidebar item.
- [x] Move `Media` into primary navigation.
- [x] Rename `Reviews` to `Approvals`.
- [x] Move `Content setup`, `Content imports`, `Activity log`, and `Agent sessions/runs` to Operations.
- [x] Gate Operations links by existing capabilities.
- [x] Apply the terminology replacement table in visible UI copy.
- [x] Keep existing routes unless there is a separate routing decision. Do not add compatibility shims for unreleased internal names.

Verification:

- [x] Editor role first-level nav contains only editor tasks.
- [x] Operator/admin role can still reach every existing operations route.

### Phase 1: Home work queue

Goal: make `/studio` the editor's daily starting point.

Tasks:

- [x] Rename page to `Home` or `Work queue`.
- [x] Remove model/import quick links.
- [x] Convert metric grid into prioritized action sections.
- [x] Move system health into collapsed operations status.
- [x] Rename content inventory columns.
- [x] Keep recent activity human-readable.

Verification:

- [x] First viewport has clear next actions.
- [x] No raw implementation vocabulary appears in the primary home view.

### Phase 2: Advanced surfaces cleanup

Goal: make model/imports/reviews useful without letting them dominate the editor experience.

Tasks:

- [x] Revise `/studio/model` to `Content setup`.
- [x] Revise `/studio/imports` to outcome-first import history.
- [x] Revise `/studio/reviews` to `Approvals`.
- [x] Move ids and JSON into `Developer details`.
- [x] Add mobile master/detail behavior for content setup.

Verification:

- [x] Content setup first screen is understandable without schema knowledge.
- [x] Import history first screen is understandable without JSON.
- [x] Approval cards are actionable without raw ids.

### Phase 3: Media, website data, settings

Goal: make supporting workflows clear and job-based.

Tasks:

- [x] Promote assets as `Media`.
- [x] Decide and rename/move `Site data`.
- [x] Split settings into People, Localization, Website connections, Media/storage, Advanced system.
- [x] Hide revoked credentials and advanced credentials by default.

Verification:

- [x] A marketer can upload/find media from primary nav.
- [x] Settings are organized by task, not by implementation source.

### Phase 4: Responsive and accessibility pass

Goal: make the simplified IA hold on desktop, tablet, and mobile.

Tasks:

- [x] Check `/studio`, `/studio/content/:collection`, entry editor, `/studio/model`, `/studio/imports`, `/studio/reviews`, `/studio/settings` at mobile width.
- [x] Ensure content setup uses single-pane master/detail on mobile.
- [x] Ensure action buttons wrap without overlap.
- [x] Ensure disclosures are keyboard accessible.
- [x] Ensure status is not color-only.

Verification:

- [x] No incoherent text overlap on common mobile and desktop widths.
- [x] All primary workflows can be reached by keyboard.

### Phase 5: Tests and release gate

Goal: prove the revision did not create a second source of truth or break existing operations.

Tasks:

- [x] Add focused tests for any changed permission/nav derivation.
- [x] Add component tests if route copy depends on capability combinations.
- [x] Run `pnpm run check`.
- [x] `pnpm run release:verify` not required because package metadata, host setup generation, Convex auth, Studio workflow contracts, MCP tool contracts, and release scripts were not changed.
- [x] Run an Impeccable detector pass:
  - `node /Users/matthias/.agents/skills/impeccable/scripts/detect.mjs --json packages/cms/studio-app/src`
- [x] Browser-check the key routes manually or with Playwright.

Verification:

- [x] No new database table, projection, cache, bridge export, MCP tool, or config option was added for this UI revision.
- [x] No old/simple and new/advanced UI paths are kept side by side.
- [x] Advanced data remains reachable through one deliberate route or disclosure.

## Page-Level Backlog

### Global

- [x] Add explicit Home nav item.
- [x] Promote Media.
- [x] Move Operations links out of daily editor nav.
- [x] Rename Reviews to Approvals.
- [x] Gate Activity and Agents.
- [x] Standardize `Developer details`.
- [x] Apply terminology replacements.
- [x] Redact sensitive raw debug values.

### `/studio`

- [x] Rename page.
- [x] Remove model/import quick links.
- [x] Replace metric strip with editorial queue.
- [x] Collapse operational status.
- [x] Rename route/data columns.
- [x] Keep recent changes concise.

### `/studio/content/:collection`

- [x] Verify row language is title-first.
- [x] Hide ids by default.
- [x] Add or refine next-action labels.
- [x] Improve singleton handling.
- [x] Ensure empty state has a real next action.

### `/studio/content/:collection/:id`

- [x] Preserve current editor shell.
- [x] Rename public-output/revalidation copy.
- [x] Keep affected pages/locales before publish.
- [x] Keep diagnostics behind explicit advanced disclosure.

### `/studio/assets`

- [x] Rename to Media.
- [x] Put upload/find/alt text work first.
- [x] Hide storage internals by default.
- [x] Do not add usage tracking infrastructure unless separately approved.

### `/studio/site-data`

- [x] Decide content vs operations role.
- [x] Rename accordingly.
- [x] Hide raw keys/ids by default.

### `/studio/model`

- [x] Rename to Content setup.
- [x] Move to Operations.
- [x] Replace contract language.
- [x] Show content type summary first.
- [x] Move code/model/Convex details into Developer details.
- [x] Fix mobile master/detail.

### `/studio/imports`

- [x] Keep in Operations.
- [x] Outcome summary first.
- [x] Hide latest run id.
- [x] Replace source strings.
- [x] Collapse raw JSON.
- [x] Put blockers first.

### `/studio/reviews`

- [x] Rename to Approvals.
- [x] Remove operation id from card header.
- [x] Show affected entry/pages/locales.
- [x] Replace raw preview JSON with summary or details disclosure.
- [x] Confirm approve action with website impact.

### `/studio/activity`

- [x] Decide `Recent changes` vs `Activity log`.
- [x] Human-readable rows first.
- [x] Hide event ids/payloads.

### `/studio/agents`

- [x] Move to Operations.
- [x] Gate by operational/admin capability.
- [x] Surface publish decisions only through Approvals.

### `/studio/settings`

- [x] Split into job-based sections.
- [x] Hide revoked credentials by default.
- [x] Redact sensitive values.
- [x] Gate destructive actions.

## Do Not Do

- Do not add a separate `simple mode`.
- Do not keep old and new navigation side by side.
- Do not add database tables, projections, caches, background jobs, public bridge exports, MCP tools, or generic adapters for this UI-only revision.
- Do not move CMS policy into Ginko Content or host setup glue.
- Do not put backend invariants in frontend orchestration.
- Do not create a generic settings framework.
- Do not expose raw JSON as the primary explanation for an editor decision.
- Do not show internal ids where a content title or website path exists.
- Do not make a visual page builder.

## Definition of Done

The revision is done when:

- A marketing editor can open Studio, find content, edit it, preview it, and understand publish blockers without seeing implementation details.
- A publisher can approve or publish based on website impact, affected pages, locales, and blockers.
- A developer/operator can still inspect model, imports, activity, agents, raw ids, and payloads through Operations or Developer details.
- The app uses one IA, one source of truth, and existing Studio primitives.
- The implementation passes focused tests and `pnpm run check`.
