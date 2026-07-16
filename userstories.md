# Ginko CMS User Stories

This document describes the dream end-to-end experience of using Ginko CMS from the perspective of the people doing the work. It is a product and acceptance catalog, not a claim that every story is implemented today.

The intended follow-up is a separate assessment pass in which the team records evidence, gaps, severity, and ownership for every story. Stable story IDs are used so tests, issues, screenshots, and release evidence can refer to the same workflow over time.

## How to read and assess a story

Every story contains:

- **User story**: the outcome the user is trying to achieve.
- **Dream experience**: how the workflow should feel when the product is excellent.
- **Steps**: the observable happy path.
- **Should happen**: required product behavior and invariants.
- **Should not happen**: failures, unsafe shortcuts, confusing behavior, and boundary violations.
- **Checks**: concrete functional, permission, data, public-output, accessibility, and failure-state verification.

For the later gap-assessment work package, add one assessment row per story:

| Current state                                     | Evidence                                              | Gap               | Severity                      | Owner          |
| ------------------------------------------------- | ----------------------------------------------------- | ----------------- | ----------------------------- | -------------- |
| Not assessed / absent / partial / meets / exceeds | Test, screenshot, recording, issue, or code reference | Short description | Blocker / high / medium / low | Team or person |

## Catalog coverage

| Area                                                | IDs | Stories |
| --------------------------------------------------- | --- | ------: |
| Access, identity, and recovery                      | ACC |       5 |
| Navigation and finding work                         | NAV |       5 |
| Collections and inventory                           | CON |       5 |
| Editing and rich documents                          | EDT |      10 |
| Hierarchical documentation                          | DOC |       6 |
| Localization and translations                       | LOC |       7 |
| Assets and files                                    | AST |       8 |
| Reviews and publishing                              | PUB |      10 |
| Lifecycle, deletion, and history                    | LIF |       7 |
| Site data                                           | DAT |       3 |
| Collaboration and activity                          | COL |       4 |
| Members, settings, and operations                   | ADM |       7 |
| Imports, migrations, backups, and recovery          | IMP |       6 |
| Agents and MCP                                      | AGT |       7 |
| Public website and API behavior                     | WEB |       7 |
| Reliability, accessibility, and responsive behavior | QUA |       8 |
| Developer setup and integration                     | DEV |       6 |
| Common expectations requiring product decisions     | CND |      12 |
| **Total**                                           |     | **123** |

## Product boundary

Ginko CMS is a content operations system for code-defined Nuxt websites.

- Developers define collections, fields, validation, routing capabilities, locales, and public behavior in code.
- Editors manage entries, documents, localized content, routes, SEO, assets, drafts, versions, and review preparation.
- Publishers and owners approve and execute entry public-output operations according to their backend permissions.
- In the current v1 authority model, immediately public site data is owner-managed settings; expanding its editorial workflow is the CND-12 decision.
- Agents may prepare work through MCP, but they use the same guarded operations and review model as humans.
- The Nuxt application owns presentation. Studio is not a visual page builder.
- Studio and MCP inspect the content model but do not create, change, delete, import, or reorder schema.
- Public website reads use published output only. Drafts must never leak through public reads.

## Personas and permissions

| Persona        | Primary goals                                                          | Expected authority                                                                 |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Public visitor | Read the current website in the right language                         | Published public output only                                                       |
| Viewer         | Inspect content, status, diagnostics, activity, and allowed settings   | Read only                                                                          |
| Editor         | Create and improve drafts, translations, routes, relations, and assets | Draft writes, no direct publish                                                    |
| Translator     | Complete and compare localized variants                                | Editor-role persona focused on locale work; publishing requires the publisher role |
| Publisher      | Review readiness and approve public changes                            | Draft writes and publishing, no owner-only administration                          |
| Owner          | Operate and administer the CMS safely                                  | Full CMS authority, including members and guarded destructive operations           |
| Developer      | Define the content model and connect the Nuxt application              | Code and operational setup, not editorial approval by default                      |
| External agent | Prepare bounded content work through MCP                               | Explicit credential scopes, active run, review-gated public changes                |

Permission controls in the UI are a presentation of backend authority, not a second authorization system. Every protected operation must be enforced by the backend even when called outside Studio.

“Operator” is a task hat, not another CMS role. In protected CMS workflows it means an **owner** performing imports, backups, restores, or destructive administration. In local non-mutating setup/check stories it may mean a **developer** running CLI verification without gaining CMS content authority.

The backend roles are exactly **viewer**, **editor**, **publisher**, and **owner**, and each is site-wide. “Translator” is an editor-role persona, not a fifth role: a translator who must publish holds the publisher role for the whole site. Restricting a member’s authority to specific locales or collections is an open product decision ([CND-11](#cnd-11-scope-member-authority-to-locales-or-collections)), not an implied capability.

## Universal dream-experience principles

These expectations apply to every story:

1. The user sees one clear primary next action.
2. The product uses website-facing language before implementation terminology.
3. Status, save state, locale, and public state are understandable without opening diagnostics.
4. Developer details remain available under a single advanced-details disclosure.
5. Loading, empty, denied, stale, offline, and failed states explain what happened and what the user can do next.
6. Destructive and public-output actions are previewed, explicitly confirmed, attributable, and auditable.
7. Failed operations do not leave partial writes or silently change public output.
8. Keyboard operation, visible focus, screen-reader labels, sufficient contrast, reduced motion, and narrow layouts are first-class behavior.
9. Secrets, raw tokens, internal authorization inputs, and private draft data never appear in URLs, logs, activity, public responses, or ordinary error messages.
10. Each important concept has one source of truth. Studio, MCP, review, preview, execution, and public reads must agree.

## Canonical editorial states

For an entry and locale, the user should see one of these understandable states:

- **Missing**: the locale is configured but no draft exists.
- **Draft**: work exists but has not yet passed readiness checks.
- **Needs work**: a specific content, route, relation, asset, SEO, parent, or policy blocker exists.
- **Ready**: the current draft can be published through the canonical publish operation.
- **In review**: a current, non-stale review request exists.
- **Live**: the current published version matches the draft.
- **Live with unpublished changes**: the public version remains live while a newer draft exists.
- **Archived**: the entry is intentionally removed from normal work and public output but can be restored.

The same entry and locale must not be described differently by the dashboard, collection list, editor, review inbox, MCP, and publish preview.

## Resolved semantics used by this catalog

These decisions remove ambiguity between stories and define what the checks must prove.

| Concept                           | Catalog decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft persistence                 | Autosave is the canonical editing model. “Save now” forces the current autosave to flush and reports its result; it does not create a second draft or a historical version. A separate “Save version” action may create a named history point through the versioning model.                                                                                                                                                                                                                 |
| Site data                         | In v1, site data has no separate draft/publish lifecycle. Only an owner may save it through the canonical `manageSettings` authority. A successful save changes canonical data immediately; it schedules public revalidation only when the block is public. Publishers, editors, and viewers inspect it read-only. V1 activity records attribution and the changed key/locale, not a recoverable value snapshot; expanded editorial authority or versioned rollback is the CND-12 decision. |
| Locale configuration              | The installed code/content policy is the source of truth for configured locales, fallback, and default locale. Studio inspects and diagnoses that projection; it does not maintain a competing editable locale list.                                                                                                                                                                                                                                                                        |
| Unpublish                         | Removes selected published locale output but keeps the entry in active editorial work, normally as Draft or Live with changes for remaining locales.                                                                                                                                                                                                                                                                                                                                        |
| Archive                           | Is entry-wide across all locales. It removes the entry from normal active work and removes its public output while preserving identity, content, locales, and history for restoration. Descendant editorial states are not silently archived.                                                                                                                                                                                                                                               |
| Permanent delete                  | Owner-only exceptional removal after archive, dependency resolution, confirmation, and any required backup/retention checks.                                                                                                                                                                                                                                                                                                                                                                |
| Single-entry multi-locale publish | Every locale included in one confirmed “Publish all ready” plan commits its content/public effects atomically or none of those locale effects commit. Revalidation delivery is tracked after content activation and may retry independently.                                                                                                                                                                                                                                                |
| Subtree route change              | The moved/renamed published entry and all affected published descendant route/projection effects in the locale commit atomically or none commit. Descendant draft content is never published as a side effect.                                                                                                                                                                                                                                                                              |
| Bulk inventory actions            | Each selected entry is an independently guarded item with a durable outcome receipt. The UI never implies cross-entry atomicity; retry targets only failed or stale items.                                                                                                                                                                                                                                                                                                                  |
| Backup and restore                | Export scope and restore capability are separate facts. V1 may export full, collection, entry, and asset artifacts, but restore apply is limited to the documented missing-asset scope. Export must never be presented as proof of full disaster recovery.                                                                                                                                                                                                                                  |
| Readiness truth                   | The composite readiness/work state is derived on demand from canonical draft, entry lifecycle status, revision, public-output, review, and configuration rows by one backend readiness computation shared by the dashboard, entry lists, editor, reviews, MCP, and publish preview/execution. The composite readiness projection is never stored, and no surface computes competing readiness rules.                                                                                        |
| Draft preview access              | In v1, rendered draft previews require an authenticated, authorized editor context. An implementation may use a short-lived session-bound credential, but it must not create a transferable anonymous share link. Stakeholder share links are the separate CND-06 decision.                                                                                                                                                                                                                 |
| Agent public operations           | In the current v1 runtime, MCP public-output and destructive operations are review-gated; agents prepare drafts and request review. Granting a trusted agent direct caller-parity publish, archive, or restore authority is the explicit CND-10 decision. Until accepted, no MCP tool may expose those direct operations.                                                                                                                                                                   |
| Performance target scale          | Checks that reference “target scale” mean the v1 scale target from VISION.md: hundreds to low thousands of entries, multiple locales, Convex-backed assets, and editorial/site-content search. The catalog makes no performance claims beyond that tested envelope.                                                                                                                                                                                                                         |

---

## 1. Access, identity, and first use

### ACC-01: Sign in and return to intended work

**User story:** As a CMS member, I want to sign in and continue the task I originally opened.

**Dream experience:** Authentication feels like a brief doorway, not a separate application. The user understands failures and returns to the exact protected Studio route after success.

**Steps:**

1. Open a protected Studio URL while signed out.
2. See the sign-in screen with the project identity and a clear sign-in action.
3. Enter valid credentials and submit.
4. Arrive at the originally requested Studio route with the correct session and role.

**Should happen:** Invalid credentials produce a clear, non-technical message. Expired sessions return the user to sign-in and preserve a safe return URL. Successful sign-in never briefly exposes protected data before authorization is known.

**Should not happen:** The user must not be redirected to an unrelated dashboard, trapped in a redirect loop, shown whether an email is a member, or receive raw authentication errors and tokens.

**Checks:** Valid and invalid credentials; deep-link return; expired and malformed session; open-redirect protection; keyboard submission; password-manager support; screen-reader labels; mobile layout.

### ACC-02: Claim the first owner safely

**User story:** As the configured first owner, I want to claim the CMS so that initial administration is secure and understandable.

**Dream experience:** The empty CMS explains exactly why ownership is needed and lets only the configured identity complete the one-time claim.

**Steps:**

1. Sign in with the configured bootstrap email before an owner exists.
2. See a one-time ownership claim action.
3. Confirm the claim.
4. Enter Studio as the owner and see the next setup actions.

**Should happen:** Authorization uses the verified identity. The persisted email comes from authentication, not browser input. The claim becomes unavailable after an owner exists and creates an audit record.

**Should not happen:** Another email, a spoofed browser payload, or a second user must not claim ownership. The system must not create a parallel user or organization model.

**Checks:** Allowed email; disallowed email; concurrent claims; repeated claim; audit evidence; no client-controlled identity fields.

### ACC-03: Sign out and revoke the local session

**User story:** As a member, I want to sign out so that the current browser can no longer access Studio.

**Dream experience:** Sign-out is immediate, predictable, and available from every primary screen.

**Steps:**

1. Open the account menu.
2. Choose sign out.
3. Return to the sign-in screen.
4. Try to revisit a protected route.

**Should happen:** Protected data disappears, cached Studio routes require authentication again, and the user can sign in as another account without stale role state.

**Should not happen:** Browser history, a refreshed tab, or a cached API response must not restore protected access.

**Checks:** Sign-out from multiple routes; browser back; refresh; second account sign-in; in-flight request behavior; cleared sensitive UI state.

### ACC-04: Understand denied access

**User story:** As a signed-in user without permission, I want to understand why an action or page is unavailable.

**Dream experience:** Denial feels deliberate and respectful. The product distinguishes “not signed in,” “not a member,” and “your role cannot do this” without exposing sensitive policy details.

**Steps:**

1. Open a page or invoke an action beyond the current role.
2. See a concise denied state.
3. Return to a permitted area or contact the named owner/admin path.

**Should happen:** Backend enforcement and UI controls agree. Role changes take effect on the next protected operation and after reactive reload.

**Should not happen:** Hidden buttons must not be the only security control. A denied operation must not partially write, leak data, or reveal internal authorization inputs.

**Checks:** Viewer/editor/publisher/owner matrix; direct URL access; direct API call; mid-session downgrade; member removal; safe error copy.

### ACC-05: Recover access through the authentication system

**User story:** As a CMS member who cannot sign in, I want to recover access through the configured authentication provider without weakening CMS membership controls.

**Dream experience:** Recovery is easy to find, privacy-preserving, and clearly owned by Better Auth or the configured identity system.

**Steps:**

1. Choose the documented password/account recovery action.
2. Submit the account identifier.
3. Complete the time-limited provider-owned recovery flow.
4. Sign in and return to the intended Studio route.

**Should happen:** The response does not reveal whether the identifier is a CMS member. Recovery tokens are time-limited, single-use, and owned by the authentication system. Existing CMS role and membership are rechecked after sign-in.

**Should not happen:** Ginko CMS must not create a parallel password-reset store, expose membership enumeration, grant CMS access merely because an identity account was recovered, or preserve a removed member’s access.

**Checks:** Known/unknown email; expired/reused token; removed member; open-redirect protection; rate limiting; safe email/log content; keyboard and mobile flow.

---

## 2. Navigation, dashboard, and finding work

### NAV-01: Start from a useful work queue

**User story:** As an editor or publisher, I want the dashboard to tell me what needs attention next.

**Dream experience:** The first screen answers “What should I work on?” rather than presenting decorative metrics.

**Steps:**

1. Open Studio home.
2. Review drafts with unpublished changes, blocked locales, pending reviews, failed revalidation, and recent activity.
3. Choose one item.
4. Land directly in the relevant entry, locale, review, or diagnostic context.

**Should happen:** Counts and states match the underlying lists. Items are ordered by actionable urgency and show one clear next action.

**Should not happen:** Empty categories must not occupy space, counts must not disagree with destination pages, and technical identifiers must not dominate the work queue.

**Checks:** Empty/new project; mixed workflow states; role-specific queue; stale counts; deep links; keyboard traversal; narrow viewport.

### NAV-02: Move reliably between primary Studio areas

**User story:** As a member, I want predictable navigation between Content, Assets, Reviews, Activity, Site Data, Content Model, Agents, Imports, and Settings.

**Dream experience:** The user always knows where they are, and the browser behaves like a normal application with working deep links, refresh, history, and bookmarks.

**Steps:**

1. Choose a primary section from navigation.
2. Open a nested item.
3. Refresh or copy the URL.
4. Navigate back and forward.

**Should happen:** Active navigation, page title, breadcrumbs, and route content agree. List filters and scroll position are preserved where useful.

**Should not happen:** Refresh must not produce a blank page, unknown route, lost authentication loop, or unrelated default screen.

**Checks:** Every primary route; nested entry deep links; browser history; copied link in a new tab; collapsed sidebar; mobile navigation.

### NAV-03: Use the command palette

**User story:** As a keyboard-oriented user, I want to jump to common destinations and actions without hunting through navigation.

**Dream experience:** The command palette is fast, searchable, permission-aware, and forgiving of collection and entry names.

**Steps:**

1. Open the palette with the documented shortcut or button.
2. Search for a section, collection, entry, or permitted common action.
3. Review grouped results.
4. Select a result and arrive in context.

**Should happen:** Results respect permissions, have unique accessible labels, and close after navigation.

**Should not happen:** The palette must not reveal inaccessible content, execute destructive work without preview, or trap focus after closing.

**Checks:** Shortcut conflicts; fuzzy search; no results; role filtering; focus return; screen reader; mobile invocation.

### NAV-04: Find content across collections

**User story:** As an editor, I want to find an entry when I know its title, slug, route, locale, status, or collection.

**Dream experience:** Search uses editorial language, returns useful context, and makes similarly named entries distinguishable.

**Steps:**

1. Open global or collection search.
2. Enter a title, slug, path, or phrase.
3. Narrow by collection, locale, or workflow state.
4. Open the desired result.

**Should happen:** Search results identify collection, locale readiness, public state, and route when relevant. Clearing filters restores the complete list.

**Should not happen:** Draft-only content must not appear to public users, hidden filters must not persist unexpectedly, and search must not silently omit exact matches.

**Checks:** Exact and partial search; diacritics; translated title; path search; pagination; empty state; URL-persisted filters; performance at target scale.

### NAV-05: Resume after interruption

**User story:** As an editor, I want to return to recent work without losing context.

**Dream experience:** Studio remembers useful context while never pretending an old draft or preview is still current.

**Steps:**

1. Leave an entry after saving or safely resolving unsaved work.
2. Return from recent activity, dashboard, browser history, or a bookmark.
3. Continue in the last useful locale and editor mode.

**Should happen:** Current backend state is reloaded. Stale previews, review requests, and permissions are visibly refreshed.

**Should not happen:** The UI must not restore stale unsaved field values over newer server data or display an outdated “Ready” status.

**Checks:** Saved return; permission change; another user edit; deleted/archived entry; locale removed from configuration; stale review.

---

## 3. Collections and entry inventory

### CON-01: Understand a collection before editing

**User story:** As an editor, I want to understand what a collection represents and what kinds of content it supports.

**Dream experience:** The collection page explains the content in editorial terms while keeping code-defined details available for inspection.

**Steps:**

1. Open a collection.
2. See its label, purpose, route capability, locales, fields, and public behavior summary.
3. Review its entries and current work states.

**Should happen:** The displayed content model matches the synced code contract and is read-only.

**Should not happen:** Studio must not offer schema creation, field editing, collection deletion, or schema reordering.

**Checks:** Route-backed and data-only collection; localized and single-language collection; contract drift; viewer mode; missing contract diagnostics.

### CON-02: Scan and filter an entry list

**User story:** As an editor, I want to scan a collection and narrow it to the entries that need work.

**Dream experience:** Status, locale readiness, public state, title, route, and last change are readable at a glance without duplicating facts.

**Steps:**

1. Open a collection list.
2. Sort or filter by workflow state, locale readiness, public visibility, or updated time.
3. Page through results.
4. Open an entry and return to the same list context.

**Should happen:** Filters have visible active state, counts remain accurate, and read-only users do not see write actions.

**Should not happen:** The list must not collapse distinct states into a vague “draft/published” flag or lose filter state on every navigation.

**Checks:** Each canonical state; combined filters; pagination boundaries; empty result; back navigation; large titles/routes; mobile list.

### CON-03: Create a new entry

**User story:** As an editor, I want to create a new blog post, document, page, or data entry under the correct collection.

**Dream experience:** Creation starts with the minimum required context and immediately leads into useful editing.

**Steps:**

1. Choose “New entry” from a collection.
2. Provide any required identity, locale, parent, or template choice.
3. Create the draft.
4. Enter the editor with clear next actions and save state.

**Should happen:** The entry receives a stable internal identity, uses the collection contract, and creates draft state without public output.

**Should not happen:** Creation must not publish, invent schema, create duplicate route identity, or require every optional field before the draft exists.

**Checks:** Each collection capability; primary and secondary locale start; route conflict; missing required creation input; double submission; editor/viewer denial.

### CON-04: Duplicate an entry intentionally

**User story:** As an editor, I want to use an existing entry as a starting point without accidentally duplicating its identity or public route.

**Dream experience:** Duplication clearly separates reusable content from fields that must be unique.

**Steps:**

1. Choose duplicate on an existing entry.
2. Review which fields, locales, relations, and assets will be copied.
3. Provide a new title and route identity where required.
4. Create the new draft.

**Should happen:** Stable IDs, slugs, routes, publication state, review state, and history are new. Shared asset references may be copied safely.

**Should not happen:** The duplicate must not overwrite the source, inherit a live URL, copy audit identity, or become public automatically.

**Checks:** Localized entry; hierarchical document; singleton/data-only restriction; route collision; referenced assets; source remains unchanged.

### CON-05: Understand an empty collection

**User story:** As a member, I want an empty collection to explain what belongs there and what I can do next.

**Dream experience:** The empty state is useful, role-aware, and connected to the collection’s actual purpose.

**Steps:**

1. Open a collection with no entries.
2. Read a short explanation.
3. Create the first entry if permitted or understand who can.

**Should happen:** Editors see a creation action; viewers see an informative read-only state.

**Should not happen:** The page must not look broken, show meaningless zero metrics, or advertise an action the user cannot perform.

**Checks:** Editor/viewer; unavailable backend; contract missing; mobile; accessible empty-state heading and action.

---

## 4. Editing content and rich documents

### EDT-01: Edit and save scalar fields

**User story:** As an editor, I want to change titles, summaries, dates, booleans, numbers, selections, and other structured fields safely.

**Dream experience:** Fields are understandable, validation is close to the input, and autosave gives calm, unambiguous feedback. “Save now” is available when the user wants to force an immediate flush.

**Steps:**

1. Open an entry draft.
2. Change one or more permitted fields.
3. Review inline validation.
4. Wait for autosave or choose “Save now.”

**Should happen:** Only the draft changes. Field types and required rules come from the active content model. The UI distinguishes saved, saving, unsaved, and failed states. Autosave and “Save now” write through the same canonical draft operation.

**Should not happen:** Saving must not change public output, silently coerce invalid data, overwrite another locale, or discard unknown failures.

**Checks:** Every supported field type; required/optional; invalid formats; server failure; retry; read-only role; changed/public comparison.

### EDT-02: Author rich text and structured MDC content

**User story:** As an editor, I want to write a blog post or document with headings, links, lists, code, images, and allowed content components.

**Dream experience:** Writing feels direct and resilient. Structured content remains valid without exposing storage syntax unless the user chooses an advanced source view.

**Steps:**

1. Place the cursor in the body editor.
2. Add and format content using keyboard or toolbar controls.
3. Insert links, assets, and permitted components.
4. Save, leave, reopen, and continue editing.

**Should happen:** The canonical MDC body round-trips without semantic loss. Invalid components or attributes receive actionable feedback before publish.

**Should not happen:** The editor must not corrupt valid source, drop unknown content silently, execute unsafe embedded code, or publish malformed output.

**Checks:** Formatting round-trip; paste from common sources; undo/redo; code blocks; links; assets; allowed components; invalid syntax; long document performance; keyboard-only editing.

### EDT-03: Autosave without losing control

**User story:** As an editor, I want protection from accidental loss while still knowing exactly what has been saved.

**Dream experience:** Autosave is quiet, trustworthy, and never masks a failed or conflicting write. An explicit “Save now” control flushes the same pending draft write rather than creating a second persistence path.

**Steps:**

1. Change draft content.
2. Pause or move focus.
3. Observe a concise saving then saved state.
4. Reload and find the saved draft intact.

**Should happen:** Writes are debounced or bounded, preserve draft identity, and surface failure with retry and retained local input. The UI defines when a change is pending, when a write begins, which draft version succeeded, and how long recoverable local input is retained.

**Should not happen:** The UI must not claim “Saved” before backend success, continuously write unchanged data, overwrite newer server state, or let autosave and “Save now” create competing draft versions.

**Checks:** Slow network; offline transition; rapid changes; tab close; failed save; retry; concurrent change; no-op edits.

### EDT-04: Prevent accidental loss on navigation

**User story:** As an editor, I want a warning before leaving unsaved work.

**Dream experience:** The warning appears only when a write is pending or failed and offers clear choices to stay, retry/save now, copy recoverable work, or explicitly discard.

**Steps:**

1. Change a field without a completed save.
2. Navigate away, close the tab, or switch entries.
3. Choose to stay, retry/save now, copy recoverable work, or explicitly leave.

**Should happen:** Staying preserves input and focus context. Leaving is an explicit decision. Successfully autosaved work does not trigger a false warning, and a pending flush is not treated as completed.

**Should not happen:** The route must not change behind the dialog, and canceled navigation must not clear the draft.

**Checks:** Internal route; browser back; refresh/tab close; autosave in flight; save failure; cancel and confirm paths; screen-reader dialog behavior.

### EDT-05: Resolve validation issues

**User story:** As an editor, I want validation to tell me what is wrong and how to fix it.

**Dream experience:** The editor can move from a readiness summary directly to the exact field or relationship causing the problem.

**Steps:**

1. Save or preview an invalid draft.
2. See grouped issues in plain language.
3. Activate an issue.
4. Land on and fix the relevant field.

**Should happen:** Field-level and publish-level validation use the same rules. Errors distinguish blockers from warnings and identify the affected locale.

**Should not happen:** The product must not show only a generic “validation failed,” disagree between save and publish, or focus an invisible/disabled field.

**Checks:** Required field; invalid URL/date/number; rich-text issue; locale-specific issue; relation/asset/route blocker; multiple errors; focus and announcement.

### EDT-06: Work with relations

**User story:** As an editor, I want to connect an entry to related authors, categories, pages, or records using stable references.

**Dream experience:** Relation selection is searchable, understandable, and shows enough context to avoid choosing the wrong item.

**Steps:**

1. Open a relation field.
2. Search or browse allowed target entries.
3. Select, reorder, or remove references as the field permits.
4. Save and preview the result.

**Should happen:** Stored relations use stable IDs. Invalid, deleted, inaccessible, or wrong-collection targets are blocked or clearly diagnosed.

**Should not happen:** Relations must not be stored only by title or slug, silently point to a different entry after rename, or expose inaccessible target data.

**Checks:** Single/multiple relation; reorder; target rename; archived target; missing target; collection restriction; publish blocker; public shaping.

### EDT-07: Edit route, slug, SEO, and public metadata

**User story:** As an editor, I want to control how an entry appears and is found on the website.

**Dream experience:** The user sees the resulting URL and search/social meaning, not a pile of unrelated technical fields.

**Steps:**

1. Edit slug, route fields, SEO title, description, canonical data, navigation, or sitemap/search flags allowed by the contract.
2. See the prospective public URL and validation.
3. Save the draft.
4. Preview website changes before publishing.

**Should happen:** Route uniqueness is validated per locale/path. Public metadata remains draft-only until publish. Redirect impact is shown when a live URL changes.

**Should not happen:** A draft route change must not break the current live URL, create a collision, or silently remove content from navigation/search/sitemap.

**Checks:** Valid/invalid slug; collision; locale prefix; canonical URL; live route rename; redirect preview; data-only collection; required SEO policy.

### EDT-08: See draft versus live differences

**User story:** As an editor or reviewer, I want to know what changed since the published version.

**Dream experience:** Differences are readable at field and document level, with locale and public impact clearly separated.

**Steps:**

1. Open an entry with unpublished changes.
2. Switch to compare mode or view a change summary.
3. Review changed fields, body content, assets, relations, route, and public flags.
4. Return to editing or proceed to review/publish.

**Should happen:** The comparison uses the current draft and actual active published version. Unchanged fields stay visually quiet.

**Should not happen:** The comparison must not use a stale checkpoint, combine locales, or imply that draft changes are already public.

**Checks:** New entry; one-field change; rich-text change; route change; asset metadata/reference change; no differences; long content; accessible diff semantics.

### EDT-09: Detect and resolve concurrent edits

**User story:** As an editor, I want protection when someone else changes the same draft while I am working.

**Dream experience:** The product prevents silent overwrites and gives a clear path to refresh, compare, copy local work, or retry.

**Steps:**

1. Open the same draft in two sessions.
2. Save a newer version in one session.
3. Attempt to save or publish from the stale session.
4. Resolve the conflict deliberately.

**Should happen:** Stale version state is detected by the backend before mutation. The user’s unsaved input remains recoverable.

**Should not happen:** Last-write-wins must not silently erase another user’s work, and a stale publish must not activate old content.

**Checks:** Stale save; stale publish; different locales; non-overlapping fields if supported; role change during edit; retry after refresh.

### EDT-10: Preview the rendered page before publishing

**User story:** As an editor, I want to preview the draft in website context without making it public.

**Dream experience:** Preview opens the correct route, locale, and responsive presentation while making its draft/private nature unmistakable.

**Steps:**

1. Save the draft.
2. Choose preview for the active locale.
3. Inspect the rendered page and navigate within a safely bounded preview context.
4. Return to the same editor state.

**Should happen:** Preview uses authorized draft data and the host app’s presentation. It is protected from public indexing and sharing beyond authorized access. In v1, preview requires an authenticated, authorized editor context; any short-lived preview credential is bound to that context and is not a transferable stakeholder link. Share links are the separate CND-06 decision.

**Should not happen:** Preview must not write public projections, expose an unguessable token in logs, or silently fall back to the live version when draft rendering fails.

**Checks:** New unpublished entry; live-with-changes entry; each locale; expired preview access; missing route; responsive sizes; return-to-editor context.

---

## 5. Hierarchical documentation and structure

### DOC-01: Create a document at the correct level

**User story:** As a documentation editor, I want to create a document at the root or beneath a parent page.

**Dream experience:** The parent choice and resulting path are obvious before creation, and the editor can change placement safely before publish.

**Steps:**

1. Choose to add a root document or child document.
2. Select the parent when required.
3. Enter the document title and slug.
4. Create and edit the draft.

**Should happen:** Parent identity uses a stable ID. The prospective route is validated, and draft creation does not affect the live documentation tree.

**Should not happen:** The document must not attach to a parent by title/path only, create a cycle, or become publicly navigable before publish.

**Checks:** Root/child; missing parent; archived parent; locale without public parent; path collision; maximum supported depth; permission denial.

### DOC-02: Reorder sibling documents

**User story:** As a documentation editor, I want to rearrange sibling pages so navigation reflects the intended reading order.

**Dream experience:** Reordering is fast with drag, keyboard, or explicit move controls, and the result is previewable before it affects the website.

**Steps:**

1. Open the document tree or ordered list.
2. Move a document before or after a sibling.
3. Review the new draft order.
4. Save and publish the relevant change.

**Should happen:** Ordering is deterministic, accessible without drag-and-drop, and stable under concurrent inserts. Public navigation changes only after successful publish.

**Should not happen:** Reordering must not change parent identity, lose documents, create duplicate order ambiguity, or immediately alter public navigation.

**Checks:** First/middle/last; keyboard move; concurrent reorder; large sibling set; draft versus public nav; viewer denial.

### DOC-03: Move a document to another parent

**User story:** As a documentation editor, I want to move a page or section within the documentation hierarchy.

**Dream experience:** The user sees the new path and every affected descendant URL before confirming the public change.

**Steps:**

1. Choose move on a document.
2. Select a valid new parent and sibling position.
3. Preview direct and descendant route changes for the active locale.
4. Save the draft and later publish with confirmation.

**Should happen:** Cycles and invalid parents are blocked. Publishing updates the moved entry and affected published descendants atomically, with redirects and revalidation where configured.

**Should not happen:** A failed move/publish must not leave half the subtree at old routes and half at new routes. Draft movement must not break current public URLs.

**Checks:** Leaf/subtree move; root move; cycle attempt; path collision; unpublished descendants; locale-specific parent readiness; rollback/failure atomicity.

### DOC-04: Rename a parent without breaking descendants

**User story:** As a documentation editor, I want to change a section slug and understand the downstream URL impact.

**Dream experience:** The publish preview lists the parent and descendant URLs, redirects, navigation, sitemap, search, and cache effects in plain language.

**Steps:**

1. Change the parent slug or route segment.
2. Save the draft.
3. Preview website changes.
4. Confirm publish.

**Should happen:** All affected routes in the locale are validated before mutation and activated together. Existing public output remains intact if any blocker or collision exists.

**Should not happen:** Descendant public routes, asset references, navigation, search, sitemap, or alternates must not remain stale after a successful publish.

**Checks:** One/many descendants; route collision; redirect creation; multi-locale variants; failed revalidation delivery; public API consistency.

### DOC-05: Archive and restore a documentation section

**User story:** As a publisher, I want to remove an obsolete documentation section from normal use without permanently destroying it.

**Dream experience:** Archive is the default destructive action, shows the subtree impact, and makes restoration straightforward.

**Steps:**

1. Choose archive on a document or section.
2. Review affected descendants, routes, references, navigation, search, sitemap, and locales.
3. Confirm the guarded operation.
4. Later open archived content and restore it to a valid location.

**Should happen:** Archive and restore semantics are the entry-wide semantics of LIF-01 and LIF-02; this story adds only the hierarchical concerns. Archiving the selected document is entry-wide across all its locales and removes its public output atomically while preserving content/history. Descendant entries are not silently marked archived; any descendant public-route effects are listed and handled by the canonical route operation. Archiving an entire subtree requires an explicit per-entry bulk plan. Restore revalidates parents, routes, and collisions before returning the selected entry to draft workflow.

**Should not happen:** Children must not become orphaned or remain publicly reachable unexpectedly. Restore must not overwrite a new route occupant.

**Checks:** Leaf/subtree; partially published locales; referenced documents; restore after parent deletion/move; collision; audit and revalidation.

### DOC-06: Navigate and search a large documentation tree

**User story:** As an editor, I want to find and understand documents in a deep hierarchy without losing my place.

**Dream experience:** The tree is fast, searchable, keyboard accessible, and shows only the structural metadata needed for the current task.

**Steps:**

1. Open the documentation collection.
2. Expand, collapse, search, or filter the tree.
3. Select a page.
4. Return to the same expanded and scrolled context.

**Should happen:** Breadcrumbs, parent, sibling order, route, locale, and status agree. Large trees load incrementally without changing order.

**Should not happen:** Search must not detach results from their hierarchy, and virtualization must not break keyboard focus or drag/move behavior.

**Checks:** Deep tree; duplicate titles; search by path; expand/collapse persistence; keyboard navigation; target-scale performance; mobile fallback.

---

## 6. Localization and translations

### LOC-01: See translation readiness for every configured locale

**User story:** As an editor, I want to know which translations are live, changed, blocked, or missing.

**Dream experience:** Every configured locale has one state, a short reason, and one primary next action.

**Steps:**

1. Open an entry or collection list.
2. Review all configured locales, including locales with no draft.
3. Select a locale needing work.

**Should happen:** Missing configured locales appear explicitly. The default locale comes from configuration, not a hardcoded language. States match backend readiness.

**Should not happen:** Missing translations must not disappear from the UI, be treated as global publish errors, or be inferred only from existing draft rows.

**Checks:** Single-language site; non-English default; missing/blocked/ready/live states; locale removed/added; list/editor/review consistency.

### LOC-02: Create a missing translation

**User story:** As a translator, I want to start a missing locale variant without affecting existing languages.

**Dream experience:** The user can start blank or copy from a chosen source, with translated versus shared fields clearly identified.

**Steps:**

1. Choose “Add translation” for a missing locale.
2. Start blank or copy from the primary/another locale.
3. Edit localized fields and route data.
4. Save the locale draft.

**Should happen:** Shared fields remain shared according to the contract. Localized fields become an independent draft variant. Existing locales and public output remain unchanged.

**Should not happen:** Creating one locale must not overwrite another, copy publication state, or silently publish fallback content as a true translation.

**Checks:** Blank/copy; localized body and slug; shared field behavior; no source locale; route collision; editor permission; audit attribution.

### LOC-03: Compare source and translation side by side

**User story:** As a translator, I want to compare a translation with its source while editing.

**Dream experience:** Both languages remain readable, aligned by field, and usable on a normal laptop without squeezing essential controls.

**Steps:**

1. Open compare mode.
2. Choose source and target locales.
3. Read the source and edit the target.
4. Save without leaving compare mode.

**Should happen:** Source content is read-only unless the user explicitly switches editing target. The details rail and readiness remain available without obscuring content.

**Should not happen:** Typing must not modify the wrong locale, scrolling must not lose context, and a narrow viewport must not force unusably thin columns.

**Checks:** Desktop stacked/two-column breakpoints; long rich text; missing source; RTL locale if supported; keyboard focus; screen reader locale labels.

### LOC-04: Publish one locale independently

**User story:** As a publisher, I want to publish a ready language even when another translation is missing or blocked.

**Dream experience:** The publish action names the locale and clearly states which other locales remain unchanged.

**Steps:**

1. Open a ready locale.
2. Preview website changes for that locale.
3. Confirm “Publish [language].”
4. Verify that locale is live and other locales retain their prior states.

**Should happen:** Only the selected locale’s public rows, routes, alternates, search, navigation, sitemap, asset facts, and revalidation effects change as defined by policy.

**Should not happen:** Missing secondary translations must not block the primary locale, and publishing one locale must not publish drafts from another.

**Checks:** Primary/secondary locale; missing other locale; blocked other locale; translated route; language-switch data; public provider results.

### LOC-05: Publish all ready locales safely

**User story:** As a publisher, I want to publish several ready translations together without accidentally including blocked work.

**Dream experience:** The preview groups effects by locale and makes skipped locales explicit.

**Steps:**

1. Choose “Publish all ready” when multiple locales qualify.
2. Review included, unchanged, and blocked locales.
3. Confirm once.
4. Review a per-locale outcome summary.

**Should happen:** Every included locale is revalidated against its current draft version. Blocked or stale locales are excluded and named before confirmation. After confirmation, all included locale content/public effects commit atomically or none commit; revalidation delivery may retry independently after activation.

**Should not happen:** The system must not interpret “all” as every configured locale, publish stale drafts, partially activate the confirmed locale set, or confuse a later revalidation delivery failure with partial content publication.

**Checks:** Two/many ready locales; one becomes stale; one blocked; route collision; operation failure; outcome/audit detail.

### LOC-06: Handle fallback without misrepresenting translation

**User story:** As an editor and visitor, I want locale fallback behavior to be predictable and honestly represented.

**Dream experience:** Editors know when content is genuinely translated versus served through an allowed fallback. Visitors never see an invalid route masquerading as a translation.

**Steps:**

1. Configure or inspect locale fallback policy in the code-defined/product settings surface.
2. Request content with a missing localized value or route.
3. Observe the documented fallback or missing behavior.

**Should happen:** Route-backed content is strict where required; data-only localized values may follow configured fallback and report the resolved locale. Canonical and alternate metadata remain correct.

**Should not happen:** The public site must not silently serve another language at a translated URL when policy forbids it or emit incorrect `hreflang` links.

**Checks:** Route-backed/data-only; missing required translation; field fallback; locale metadata; canonical/alternate tags; navigation/search/sitemap exclusion.

### LOC-07: Sync and inspect locale configuration without split truth

**User story:** As an owner/developer, I want the code-defined locales and default locale to be reflected consistently across Studio and public reads.

**Dream experience:** A code-defined locale configuration change has one documented source of truth and immediate diagnostics for affected content.

**Steps:**

1. Change the supported locale configuration through the documented code/content-policy workflow.
2. Sync or reload the installed content model and locale projection.
3. Review newly missing, invalid, or deprecated locale states.

**Should happen:** Studio presents the installed locale projection as read-only truth. Studio, provider reads, routes, translation summaries, preview, and publishing use the same locale set, fallback, and default.

**Should not happen:** Studio must not maintain a divergent editable locale list, assume `en`, mutate code-owned locale policy, or silently delete stored content for a removed locale.

**Checks:** Add locale; change default; remove/deprecate locale; non-English-only site; fallback chain; stored draft preservation; diagnostics.

---

## 7. Assets and file handling

### AST-01: Upload a file

**User story:** As an editor, I want to upload an image or file and use it in content.

**Dream experience:** Upload is fast, shows progress, validates early, and leaves the user with a clearly usable managed asset.

**Steps:**

1. Open Assets or an asset field.
2. Select or drop one or more permitted files.
3. Review progress and any validation feedback.
4. Add required metadata and finish upload.

**Should happen:** File type, size, checksum, storage status, and required metadata are validated. Retry is possible without duplicate records. The asset is private from public content until referenced and published according to policy.

**Should not happen:** Failed uploads must not leave misleading ready records, expose storage internals, accept unsafe file types, or create duplicates on retry.

**Checks:** Valid GIF/JPEG/PNG/WebP; wrong type; SVG and HTML rejected in v1; too large; zero-byte/corrupt; duplicate content/name; network interruption; multi-upload; keyboard/file-picker; mobile. Any later script-bearing file support requires a separate sanitization, content-type, disposition, and origin policy.

### AST-02: Browse, search, and filter assets

**User story:** As an editor, I want to find the right asset by filename, title, tags, type, usage, or upload date.

**Dream experience:** Grid and list views remain fast and show enough metadata to distinguish similar files.

**Steps:**

1. Open Assets.
2. Search or filter the library.
3. Switch view or sort order if useful.
4. Open asset details or select the asset.

**Should happen:** Selection and filters remain stable during detail inspection. Empty results explain how to clear filters or upload.

**Should not happen:** The library must not reveal inaccessible assets, lose selection during pagination, or load full originals unnecessarily.

**Checks:** Search; tags; type; used/unused; grid/list; pagination; large library; no results; mobile selection; keyboard navigation.

### AST-03: Add and edit asset metadata

**User story:** As an editor, I want to maintain alt text, caption, filename/title, tags, and other supported metadata.

**Dream experience:** Accessibility-critical metadata is prominent, while the product clearly explains when published pages will pick up metadata changes.

**Steps:**

1. Open asset details.
2. Edit metadata.
3. Save and see validation.
4. Review usage and freshness information.

**Should happen:** Metadata is stored once on the canonical asset. The UI follows the documented freshness strategy, such as requiring affected entries to be republished when published snapshots contain metadata.

**Should not happen:** The UI must not imply an immediate public update when snapshots remain stale, rewrite every draft silently, or allow required alt policy to be bypassed.

**Checks:** Metadata validation; save failure; shared asset usage; published snapshot behavior; locale-specific metadata if supported; audit record.

### AST-04: Select an asset in an entry

**User story:** As an editor, I want to attach an existing or newly uploaded asset without leaving my editing flow.

**Dream experience:** The picker makes the chosen file, metadata, crop/variant if supported, and usage consequence clear.

**Steps:**

1. Open an asset field or insert-media action.
2. Search, inspect, or upload.
3. Select an asset.
4. Confirm the field/body reference and save.

**Should happen:** References use stable asset IDs. Required metadata and type constraints are validated. Cancel returns to the editor unchanged.

**Should not happen:** The picker must not save on mere browsing, attach the wrong selected item, or embed a temporary upload URL as canonical content.

**Checks:** Existing/new asset; single/multiple fields; cancel; wrong type; asset deleted during selection; rich-text insertion; viewer denial.

### AST-05: See where an asset is used

**User story:** As an editor or owner, I want to know which drafts and published entries depend on an asset before changing or removing it.

**Dream experience:** Usage is understandable by entry, locale, draft/live state, and field/body location.

**Steps:**

1. Open asset details.
2. Review usage summary.
3. Open a referring entry in context.

**Should happen:** Usage is derived from canonical content and is rebuildable. Stale or incomplete reference indexing is diagnosed rather than presented as certainty.

**Should not happen:** The system must not claim “unused” when reference scanning failed or hide published dependencies.

**Checks:** Draft-only use; published use; body/field use; multiple locales; archived entry; rebuilt index; inaccessible referring content.

### AST-06: Replace an asset safely

**User story:** As an editor, I want to replace the underlying file while understanding whether existing references and public pages will change.

**Dream experience:** Replacement distinguishes “new version of this asset” from “choose a different asset” and previews freshness/revalidation consequences.

**Steps:**

1. Choose replace on an asset.
2. Select a compatible file.
3. Review affected uses and metadata behavior.
4. Confirm and verify the new version.

**Should happen:** Stable reference behavior is documented and consistent. The old file remains recoverable according to retention/backup policy. Public effects occur only through the defined freshness/revalidation path.

**Should not happen:** Replacement must not silently break dimensions/type constraints, orphan references, or irreversibly destroy the previous file without warning.

**Checks:** Same/different type; failed upload; referenced/unreferenced asset; cached public URL; metadata preservation; rollback/backup; concurrent use.

### AST-07: Move an asset to trash and restore it

**User story:** As an editor or owner, I want to remove an asset from normal use without immediately destroying it.

**Dream experience:** Trash is reversible, usage-aware, and clearly separated from permanent purge.

**Steps:**

1. Choose trash/delete on an asset.
2. Review active draft and published usage.
3. Confirm if policy permits.
4. Later restore the asset from trash.

**Should happen:** Referenced assets are blocked or require an explicit safe resolution. Restoration recovers the asset identity and valid references where possible.

**Should not happen:** A normal delete action must not permanently purge storage, leave broken live pages, or falsely remove usage evidence.

**Checks:** Unused/used asset; draft/live reference; bulk selection; restore; retention expiry; permission matrix; audit.

### AST-08: Permanently purge an asset

**User story:** As an owner, I want to permanently remove an eligible trashed asset when policy or privacy requires it.

**Dream experience:** Purge is rare, strongly gated, and explicit about irreversibility, backup requirements, and remaining references.

**Steps:**

1. Open a trashed asset.
2. Request purge preview.
3. Resolve blockers and verify the required backup artifact if policy applies.
4. Enter explicit confirmation and execute.

**Should happen:** The backend rechecks authority, usage, backup/checksum freshness, and confirmation token immediately before deletion. Audit evidence excludes sensitive storage credentials.

**Should not happen:** Purge must not be available to agents by default, bypass active references, accept stale confirmation, or claim success while storage remains unintentionally public.

**Checks:** Owner-only; active references; stale backup; checksum mismatch; expired confirmation; partial storage failure; retry/idempotency; audit.

---

## 8. Reviews and publishing

### PUB-01: Check readiness before publishing

**User story:** As an editor or publisher, I want to know whether the current entry and locale can go live.

**Dream experience:** Readiness is one trustworthy answer with exact next actions, not several panels with conflicting diagnoses.

**Steps:**

1. Open an entry locale.
2. Review its state and readiness issues.
3. Fix blockers or accept clearly labeled warnings.
4. Refresh readiness.

**Should happen:** Required fields, route, parent, relations, assets, SEO/public rules, stale draft state, and current permissions are evaluated by canonical backend logic.

**Should not happen:** “Ready” must not be inferred only in the browser, remain true after the draft changes, or disagree with publish execution.

**Checks:** Every blocker class; warnings; stale preview; role difference; route tree effects; list/editor/review/MCP parity.

### PUB-02: Preview website changes

**User story:** As an editor or publisher, I want to see exactly what publishing will change on the website.

**Dream experience:** The preview is written for a content professional and groups changes by locale and affected page.

**Steps:**

1. Choose preview website changes.
2. Review affected URLs, current/new state, SEO, redirects, navigation, search, sitemap, alternates, assets, and revalidation.
3. Open the visual page preview when available.
4. Return to edit, request review, or publish.

**Should happen:** Preview is computed from the current backend draft and contract. No write or public change occurs.

**Should not happen:** Caller-provided preview data must not become trusted truth, and technical IDs must not replace the marketer-readable summary.

**Checks:** New publish; update; route rename; unpublish/archive; subtree effect; localized publish; no changes; blocked preview; stale after edit.

### PUB-03: Request review

**User story:** As an editor or agent, I want to ask an authorized publisher to review prepared work.

**Dream experience:** One action packages the current change, its website impact, and a useful note without changing public output.

**Steps:**

1. Save the current draft.
2. Preview website changes.
3. Add an optional reviewer note and request review.
4. See the entry state change to “In review.”

**Should happen:** The backend computes and stores the canonical preview/version expectation. The request identifies entry, locale, requester, and current draft version.

**Should not happen:** Requesting review must not publish, trust spoofed preview JSON, or leave an old request appearing current after the draft changes.

**Checks:** Human/agent requester; blocked content; duplicate request; edited-after-request; reviewer visibility; audit; secret redaction.

### PUB-04: Review a proposed change

**User story:** As a publisher, I want to understand a proposed change without reconstructing it from technical records.

**Dream experience:** A review card answers who changed what, which locale, why, what the website will do, and whether the request is still current.

**Steps:**

1. Open Reviews.
2. Select a pending request.
3. Read the summary and compare draft versus live content.
4. Preview the page and inspect advanced details only if needed.

**Should happen:** The review uses current canonical readiness and clearly marks stale requests. Technical IDs and raw payloads stay under advanced details.

**Should not happen:** The reviewer must not need to interpret raw JSON, and a stale request must not retain an active approve button.

**Checks:** Human/agent request; new/update/route change; stale version; missing permission; long diff; accessible compare and actions.

### PUB-05: Approve and publish a review

**User story:** As a publisher, I want approval to publish through the same safe path as manual publishing.

**Dream experience:** “Approve and publish” is one accountable action with a fresh final confirmation.

**Steps:**

1. Review a current request.
2. Choose approve and publish.
3. Review the freshly recomputed website changes.
4. Confirm and inspect the outcome.

**Should happen:** Current role, request freshness, readiness, routes, and draft version are rechecked. Execution calls the canonical publish operation, creates an immutable revision, activates public output, emits revalidation, and records reviewer/requester attribution.

**Should not happen:** Review approval must not be a second publish implementation or accept stale/spoofed impact data.

**Checks:** Success; role downgrade; stale draft; new blocker; route collision; execution failure; audit attribution; same output as manual publish.

### PUB-06: Reject or request changes

**User story:** As a publisher, I want to return work with a clear reason and no public effect.

**Dream experience:** Feedback is actionable and appears where the editor resumes work.

**Steps:**

1. Open a review request.
2. Choose request changes/reject.
3. Add a required or policy-appropriate explanation.
4. Submit and return the entry to an editable state.

**Should happen:** The draft remains intact, public output is unchanged, and the requester can see the outcome and feedback.

**Should not happen:** Rejection must not archive/delete the draft, expose private reviewer notes publicly, or leave the request pending.

**Checks:** Human/agent requester; empty feedback policy; repeat review; audit; notification surface; viewer/editor permissions.

### PUB-07: Publish a new entry

**User story:** As a publisher, I want to make a new blog post, page, document, or data entry public safely.

**Dream experience:** The final dialog makes the first public URL, locale, inclusions, and revalidation consequence unmistakable.

**Steps:**

1. Complete a ready draft.
2. Preview website changes.
3. Confirm publication.
4. See a success outcome with public URL and verification state.

**Should happen:** An immutable published revision is created and public rows/routes activate atomically. Navigation/search/sitemap inclusion follows the contract. The user can open the live result.

**Should not happen:** Publish must not expose missing required content, create partial public records, or claim success before the canonical operation completes.

**Checks:** Route-backed/data-only; singleton; each locale; relation/asset dependency; duplicate submit; failure rollback; public API and page verification.

### PUB-08: Publish changes to a live entry

**User story:** As a publisher, I want to update a live blog post or page while the old version remains public until success.

**Dream experience:** The user understands that the live version is safe during editing and sees the precise change at confirmation.

**Steps:**

1. Edit a live entry and save the draft.
2. Observe “Live with unpublished changes.”
3. Preview and confirm publish.
4. Verify the new live version and history.

**Should happen:** The previous public output remains active until atomic replacement succeeds. A new immutable revision records the update.

**Should not happen:** Draft saves or failed publish attempts must not partially update live fields, public routes, search, sitemap, or assets.

**Checks:** Field/body/route change; failed execution; stale draft; cache/revalidation failure status; public read before/after; version history.

### PUB-09: Unpublish an entry

**User story:** As a publisher, I want to remove an entry from public output while retaining it for continued work.

**Dream experience:** Unpublish is explicit about affected URLs and discovery surfaces and is clearly different from archive or permanent deletion.

**Steps:**

1. Choose unpublish on a live entry/locale.
2. Preview affected URLs, redirects, navigation, search, sitemap, alternates, and descendants.
3. Confirm the guarded operation.
4. Continue with the retained draft/history.

**Should happen:** Public rows/routes are removed atomically for the selected scope, an immutable revision/audit record is created, and revalidation is emitted.

**Should not happen:** Unpublish must not delete draft content/history, affect unrelated locales, or leave the page discoverable through public APIs.

**Checks:** One locale/all locales; parent with children; data-only entry; public API/search/nav/sitemap; failed operation; republish later.

### PUB-10: Verify public output after publishing

**User story:** As a publisher, I want confidence that the website now reflects the approved version.

**Dream experience:** The publish outcome distinguishes CMS success, revalidation delivery, and externally verified page state without forcing the user into logs.

**Steps:**

1. Complete a publish/unpublish/archive operation.
2. Review affected pages and revalidation status.
3. Open the public result or run a verification check.
4. Follow a clear retry/diagnostic path if delivery fails.

**Should happen:** The CMS identifies the active public revision and tracks revalidation attempts separately from content activation.

**Should not happen:** A delivery failure must not be misreported as a content rollback, and a successful CMS write must not hide a failed cache refresh.

**Checks:** Successful delivery; endpoint failure; retry; multiple targets; page 200/redirect/404; active revision identity; no secret URLs in ordinary UI.

---

## 9. Entry lifecycle, deletion, and history

### Lifecycle transition contract

| Action                   | Typical source state                                                   | Resulting editorial state                              | Public effect                                                                                 | Reversible through normal UI         |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| Save/autosave draft      | Missing, Draft, Needs work, Ready, Live, Live with unpublished changes | Draft-derived state or Live with unpublished changes   | None                                                                                          | History/local recovery as supported  |
| Publish locale           | Ready or current approved review                                       | Live for that locale                                   | Atomically activates that locale’s planned public output                                      | Rollback or unpublish                |
| Unpublish locale         | Live or Live with unpublished changes                                  | Active Draft/Needs work/Ready for that locale          | Removes only the selected locale’s public output                                              | Publish again                        |
| Archive entry            | Any non-deleted state allowed by policy                                | Archived                                               | Removes all locale public output for the entry and its normal active-list presence            | Restore                              |
| Restore archive          | Archived                                                               | Active draft-derived state                             | None until separately published unless an explicitly reviewed restore-public operation exists | Archive again                        |
| Roll back public version | Live or Live with unpublished changes                                  | Live at a newly recorded rollback revision             | Atomically activates a prior publish shape under current validation                           | Roll forward through another publish |
| Permanent delete         | Archived and dependency-safe                                           | Deleted/absent except required audit/retention records | No public output may remain                                                                   | Not through normal UI                |

Unpublish and archive are separate operations. Unpublished content remains active editorial work and appears in normal lists with a non-public state. Archived content leaves normal active work queues and appears only when archived content is explicitly included.

### LIF-01: Archive a blog post or entry

**User story:** As a publisher, I want to archive obsolete content as the normal removal path.

**Dream experience:** Archive is reversible, preview-first, and clearly explains public and relational impact.

**Steps:**

1. Choose archive.
2. Review locales, public URLs, descendants, inbound relations, assets, navigation, search, sitemap, redirects, and revalidation.
3. Confirm.
4. Find the entry later in an Archived view.

**Should happen:** Archive is entry-wide across all locales. All public output for the entry is removed according to the canonical plan, content/history/locales remain intact, and the entry leaves normal active lists unless filters include archived content.

**Should not happen:** Archive must not permanently delete data, silently break required relations, or leave the old public page active.

**Checks:** Draft-only/live; multiple published locales removed together; referenced entry; hierarchical parent and descendant route impact; role matrix; failure atomicity; audit and restore availability.

### LIF-02: Restore an archived entry

**User story:** As a publisher, I want to bring archived content back into the editorial workflow.

**Dream experience:** Restoration explains whether the entry returns as a draft or can safely regain its previous public state.

**Steps:**

1. Open Archived content.
2. Select an entry and choose restore.
3. Review route, parent, relation, asset, locale, and contract blockers.
4. Confirm and continue editing or republishing.

**Should happen:** History and stable identity are preserved. Conflicts created since archive are surfaced before mutation.

**Should not happen:** Restore must not overwrite another route, resurrect invalid references, or automatically republish without explicit policy and confirmation.

**Checks:** Route reused; parent moved/deleted; contract changed; asset missing; localized variants; restore then publish; audit.

### LIF-03: Permanently delete an entry

**User story:** As an owner, I want to permanently delete eligible content when legal, privacy, or operational requirements demand it.

**Dream experience:** Permanent deletion is intentionally difficult and never confused with routine archive.

**Steps:**

1. Archive the entry first unless policy defines an exceptional path.
2. Request permanent-delete preview.
3. Resolve inbound relations, descendants, public remnants, asset implications, retention, and backup requirements.
4. Enter explicit confirmation and execute.

**Should happen:** Backend authority and all blockers are rechecked immediately before deletion. The operation is idempotent, audited, and honest about retained audit/legal records.

**Should not happen:** Editors, publishers, viewers, or agents must not permanently delete by default. Deletion must not leave public rows/routes, orphan children, dangling required relations, or misleading success after partial failure.

**Checks:** Owner-only; active/archived; related content; subtree; stale confirmation; backup policy; partial failure; repeated request; public absence.

### LIF-04: View version history

**User story:** As an editor or reviewer, I want to understand how an entry changed over time and who made each change.

**Dream experience:** History uses editorial language such as saved version, published, unpublished, archived, restored, and rolled back.

**Steps:**

1. Open History for an entry.
2. Review chronological versions and operations by locale.
3. Open a version summary or comparison.

**Should happen:** Published revisions are immutable, attribution distinguishes human and delegated agent work, and the active public version is clearly marked.

**Should not happen:** History must not expose raw tokens, use internal checkpoint jargon as the primary label, or allow past revisions to mutate.

**Checks:** New/update/publish/unpublish/archive/restore/rollback; locale filtering; agent attribution; long history; viewer access; accessible timeline.

### LIF-05: Compare two versions

**User story:** As an editor or publisher, I want to compare versions before restoring or explaining a change.

**Dream experience:** The comparison handles structured fields and rich text without turning the page into raw storage data.

**Steps:**

1. Select two versions or draft versus published.
2. Review field, body, route, relation, asset, and public-flag differences.
3. Return to history or choose a permitted restore action.

**Should happen:** Version identity and locale are explicit. Added, removed, and changed values are distinguishable without relying only on color.

**Should not happen:** The comparison must not combine incompatible locales/entries or omit a changed route/public behavior from the summary.

**Checks:** Scalar/rich text/asset/relation/route; large content; deleted field after contract change; no differences; keyboard and screen reader.

### LIF-06: Restore a previous version as a new draft

**User story:** As an editor, I want to recover older content without rewriting history or unexpectedly changing the website.

**Dream experience:** Restore clearly means “make this old version the current draft,” followed by normal review and publish.

**Steps:**

1. Choose a historical version.
2. Preview what restoring will replace in the current draft.
3. Confirm restore to draft.
4. Review, edit, and publish separately if desired.

**Should happen:** A new revision/event records the restore. The previous public version remains live until a later publish.

**Should not happen:** Restore must not mutate the historical revision, silently publish, or erase the pre-restore draft without a recoverable history event.

**Checks:** Restore published/old draft; current unsaved work; contract drift; missing asset/relation; locale-specific restore; audit.

### LIF-07: Roll back public output

**User story:** As a publisher, I want to return the website to a known good published version during an incident.

**Dream experience:** Rollback is fast but still shows routes, descendants, assets, and revalidation consequences.

**Steps:**

1. Select a previous published version.
2. Preview rollback impact.
3. Confirm.
4. Verify active public output and keep the newer work recoverable as draft/history.

**Should happen:** Rollback creates a new immutable operation/revision and atomically activates the selected content shape under the current contract or blocks safely.

**Should not happen:** Rollback must not delete later history, bypass current route collisions, or leave derived public surfaces inconsistent.

**Checks:** Simple content; route change; subtree; asset removed since version; current contract incompatibility; failure; public verification and revalidation.

---

## 10. Site data and reusable content

### DAT-01: Edit shared site data

**User story:** As an owner, I want to update reusable public content such as contact details, footer text, announcements, or organization information.

**Dream experience:** Site data is grouped by human purpose, shows where it is used, and makes its immediate public/revalidation effect clear before saving.

**Steps:**

1. Open Site Data.
2. Choose a block.
3. Edit shared or localized values and review affected website areas.
4. Explicitly confirm high-impact changes when required, then save and review revalidation behavior.

**Should happen:** Validation follows the block contract. Publishers, editors, and viewers can inspect without write controls. In v1, only owners may save through `manageSettings`; a successful save changes canonical site data immediately, schedules revalidation when the block is public, and has no separate unpublished draft. Activity records the actor, key, locale, and operation outcome without silently retaining the full prior value as a second recovery store.

**Should not happen:** Site data must not become a hidden schema editor, imply that a saved change is still only a draft, or claim a separate publish workflow that does not exist.

**Checks:** Shared/localized block; invalid payload; save failure; publisher/editor/viewer read-only behavior; owner save; public block schedules revalidation; private block does not schedule public revalidation merely for a data save; mistaken value corrected by a subsequent owner save; activity attribution without full-value leakage; public provider result; empty block list; CND-12 decision recorded.

### DAT-02: Understand site-data impact

**User story:** As an owner, I want to know which website areas may change when reusable site data is updated.

**Dream experience:** The product names affected pages/tags where provable and clearly labels broader conservative invalidation.

**Steps:**

1. Edit a site-data block.
2. Review its known usage and expected revalidation.
3. Confirm/save.
4. Verify delivery state.

**Should happen:** Cache tags and event IDs remain advanced details. The primary outcome describes website areas in plain language.

**Should not happen:** The UI must not promise exact page impact when dependency data is incomplete or silently skip required revalidation.

**Checks:** Known/broad usage; localized block; failed target; no active target; activity record; public read consistency.

### DAT-03: Handle missing or private site data publicly

**User story:** As a developer or visitor, I want missing/private site data to fail predictably without exposing drafts.

**Dream experience:** The public API provides a clear null/failure shape that the Nuxt app can handle deliberately.

**Steps:**

1. Request an available, missing, private, and locale-missing block.
2. Inspect returned data and locale metadata.

**Should happen:** Available public data is returned; missing/private data returns no private payload; configured fallback is reported honestly.

**Should not happen:** Draft/private values must not leak through public reads or generic error serialization.

**Checks:** Public/private; missing key; locale fallback; unauthenticated request; cache behavior; secret-like fields.

---

## 11. Collaboration, reviews, and activity

### COL-01: See who changed content

**User story:** As a team member, I want to know who last changed, published, archived, restored, or reviewed an entry.

**Dream experience:** Attribution is visible where it helps accountability without cluttering the writing surface.

**Steps:**

1. Open entry details, history, or activity.
2. Review actor, action, time, locale, and result.
3. Open the related entry/review/run where permitted.

**Should happen:** Delegated agent work identifies both the agent run/credential context and responsible member without exposing secrets.

**Should not happen:** System operations must not be mislabeled as a human, and removed members must not erase historical attribution.

**Checks:** Human/agent/system; member renamed/removed; denied/failed action; timezone formatting; viewer access; privacy policy.

### COL-02: Inspect recent activity

**User story:** As a publisher or owner, I want an activity feed that helps answer what happened recently.

**Dream experience:** Activity is an operational narrative, not a raw database log.

**Steps:**

1. Open Activity.
2. Filter by content, actor, operation type, result, or time.
3. Open a relevant record.

**Should happen:** Draft, publish, archive, import, backup, asset, member, MCP, review, and revalidation events appear where supported with useful links.

**Should not happen:** Sensitive payloads, tokens, passwords, raw authorization inputs, or unbounded internal noise must not appear.

**Checks:** Each event family; pagination; filters; removed target; failed/denied action; redaction; target-scale performance.

### COL-03: Understand stale work

**User story:** As an editor or reviewer, I want stale drafts, previews, and review requests to be obvious before I act.

**Dream experience:** The product explains what changed and offers one recovery action.

**Steps:**

1. Open work based on an older draft version or contract.
2. See a stale warning.
3. Refresh/recompare and continue.

**Should happen:** Staleness is backend-derived and blocks unsafe execution while preserving the user’s recoverable input.

**Should not happen:** Stale work must not keep a green Ready state or an active Approve/Publish action.

**Checks:** Another save; route/asset/relation change; role change; contract sync; review preview; browser cache.

### COL-04: Work without noisy notifications

**User story:** As a frequent Studio user, I want meaningful confirmations and errors without repetitive toast noise.

**Dream experience:** Persistent state changes appear in the page, while transient notifications are concise, actionable, and not duplicated.

**Steps:**

1. Save, publish, upload, review, or navigate.
2. Observe feedback in context.
3. Dismiss or act on transient feedback when necessary.

**Should happen:** Errors remain visible until resolved, success does not obscure the next action, and screen readers receive appropriate announcements.

**Should not happen:** The same fact must not appear as a badge, banner, card, and toast simultaneously.

**Checks:** Repeated autosaves; failed publish; upload progress; review outcome; reduced motion; live-region behavior; mobile stacking.

---

## 12. Members, settings, and operations

### ADM-01: View and manage members

**User story:** As an owner, I want to add members, change roles, and remove access safely.

**Dream experience:** The member list explains each role in product terms and makes access changes deliberate.

**Steps:**

1. Open Settings > Members.
2. Add or select a member.
3. Assign viewer, editor, publisher, or owner as allowed.
4. Confirm role change or removal.

**Should happen:** Backend role state is canonical. Changes affect the next protected Studio and MCP operation and produce activity/audit evidence.

**Should not happen:** Owners must not accidentally remove the last required owner, assign invented roles, or rely on UI hiding for enforcement.

**Checks:** Add/update/remove; self-change; last-owner guard; active session downgrade; MCP authority refresh; duplicate identity; viewer denial.

### ADM-02: Invite and onboard a new member

**User story:** As an owner, I want to invite a person who does not yet have a CMS-linked identity and assign their initial role safely.

**Dream experience:** The owner understands whether the person already has an account, when the invitation expires, and what access will begin after acceptance.

**Steps:**

1. Enter the invitee email and choose an initial CMS role.
2. Review the invitation scope and expiry.
3. Send, resend, or revoke the invitation.
4. The invitee authenticates through Better Auth and accepts the invitation.
5. The owner sees an active member linked to the verified Better Auth user ID.

**Should happen:** Invitation state is bounded and auditable, but identity remains owned by Better Auth. Acceptance verifies the intended email/identity, rejects expired or revoked invitations, and activates exactly the reviewed role.

**Should not happen:** An invitation record must not become a second user account, reveal whether an unrelated email has a CMS identity, remain reusable after acceptance, or let the browser supply the accepted user ID or role.

**Checks:** New/existing auth account; expiry; resend invalidates prior link as defined; revoke; wrong signed-in email; duplicate member; last-owner policy; enumeration-safe copy; role effective after acceptance.

### ADM-03: Inspect the code-defined content model

**User story:** As an editor or developer, I want to understand fields, required/localized behavior, relations, routes, and public capabilities.

**Dream experience:** The content model is readable and useful for troubleshooting without inviting unsupported schema editing.

**Steps:**

1. Open Content Model.
2. Select a collection.
3. Inspect fields, validation, route mode, locales, relations, and public behavior.

**Should happen:** The view reflects the synced contract and reports drift/missing generation clearly.

**Should not happen:** Studio must not create, edit, delete, import, or reorder collections and fields.

**Checks:** All field/capability types; stale contract; missing contract; viewer access; advanced raw details; responsive tables.

### ADM-04: Configure appearance without affecting content truth

**User story:** As a user, I want to choose light/dark/system mode and an allowed accent without changing other users’ content experience.

**Dream experience:** Appearance changes immediately, remains accessible, and persists at the intended user/browser scope.

**Steps:**

1. Open Appearance settings.
2. Choose theme and accent.
3. Navigate through Studio and reopen later.

**Should happen:** Contrast, semantic colors, focus, and charts remain valid across themes. Content data and public website presentation do not change.

**Should not happen:** Components must not assume one accent hue or flash an unreadable theme on load.

**Checks:** Light/dark/system; all accents; persistence; OS change; contrast; reduced motion; dialogs/popovers; no content writes.

### ADM-05: Configure and test revalidation targets

**User story:** As an owner/developer, I want to connect approved cache-revalidation endpoints and know whether delivery works.

**Dream experience:** Endpoint setup validates safety before saving and offers a bounded test with redacted diagnostics.

**Steps:**

1. Open revalidation settings.
2. Add or edit an endpoint and credential reference as supported.
3. Validate/test the target.
4. Save and inspect delivery status.

**Should happen:** Unsafe URLs, embedded credentials, unsupported protocols, and invalid configuration are rejected. Secrets are stored and displayed according to policy, never echoed in activity.

**Should not happen:** The CMS must not follow redirects blindly, expose bearer material, or claim a target works without a successful bounded check.

**Checks:** Valid/invalid URL; private-network/redirect policy; timeout; secret redaction; role enforcement; retry; activity record.

### ADM-06: Understand storage health

**User story:** As an owner, I want to know whether asset storage is configured and healthy before users encounter upload failures.

**Dream experience:** Settings shows actionable status, usage, constraints, and a safe diagnostic path.

**Steps:**

1. Open Storage settings.
2. Review configuration and health.
3. Run a permitted diagnostic if needed.

**Should happen:** The UI distinguishes missing setup, temporary failure, quota/limit, and healthy state without revealing credentials.

**Should not happen:** Storage diagnostics must not write permanent junk, expose provider secrets, or imply enterprise DAM capabilities beyond the product target.

**Checks:** Healthy/missing/failing; read-only role; upload correlation; quota display; redacted errors; mobile.

### ADM-07: Diagnose incomplete setup

**User story:** As a developer/owner, I want the product to explain missing Convex, auth, generated contract, provider, or environment setup.

**Dream experience:** The error names the exact missing artifact or configuration and the documented command that fixes it.

**Steps:**

1. Open Studio or run the CLI with incomplete setup.
2. Read the focused diagnosis.
3. Follow the documented fix.
4. Retry successfully.

**Should happen:** Errors remain safe and distinguish install, auth, contract drift, backend reachability, and provider setup.

**Should not happen:** The UI must not show a blank screen, raw stack trace, Trellis-era instruction, or live publish command as a fix.

**Checks:** Each missing config class; CLI doctor; stale generated files; network failure; secret redaction; links/commands accurate.

---

## 13. Imports, migrations, backups, and recovery

### V1 backup capability matrix

| Export scope | Artifact can be created and verified | V1 restore preview                                      | V1 restore apply                                                                                  |
| ------------ | ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Full CMS     | Yes                                  | May report contained/affected scope and incompatibility | No full-table restore                                                                             |
| Collection   | Yes                                  | May report contained/affected scope and incompatibility | No collection restore                                                                             |
| Entry        | Yes                                  | May report contained/affected scope and incompatibility | No entry restore                                                                                  |
| Asset        | Yes                                  | Yes, for the documented missing-asset recovery case     | Yes, only when the asset is missing and checksum, freshness, storage, and confirmation rules pass |

The matrix describes product capability, not merely current UI visibility. Every backup screen, CLI command, and maintenance guide must use the same claims.

### IMP-01: Preview a filesystem content import

**User story:** As an owner/operator, I want to understand an import before it writes anything.

**Dream experience:** The preview groups created, updated, unchanged, skipped, and blocked items and gives a fix path for every blocker.

**Steps:**

1. Select or initiate an import source.
2. Run preview/check.
3. Review item outcomes and blockers.
4. Fix source/configuration or proceed to confirmation.

**Should happen:** Unknown collections/fields, unresolved relations/assets, invalid routes/locales, and publish blockers are reported. Preview creates no content/public writes.

**Should not happen:** Imports must not invent or mutate schema, silently ignore unknown fields, or publish merely because source content was previously public elsewhere.

**Checks:** Every blocker type; create/update/no-op; duplicate input; localized/hierarchical content; large bounded run; no database mutation during preview.

### IMP-02: Apply an import safely

**User story:** As an owner/operator, I want to apply a reviewed import without partial or duplicate results.

**Dream experience:** Confirmation summarizes exact scope, and progress/outcomes remain inspectable after completion or failure.

**Steps:**

1. Start from a current successful preview.
2. Confirm the bounded import.
3. Observe progress.
4. Review receipts and resulting drafts.

**Should happen:** Preview freshness and authority are rechecked. Writes are idempotent and create drafts under existing contracts. Failure semantics and resumability are explicit.

**Should not happen:** An apply must not use stale preview silently, leave unknowable partial state, duplicate entries on retry, or change public output unless a separately confirmed publish flow exists.

**Checks:** Success; interrupted run; retry; stale plan; item failure; duplicate receipt; role denial; activity and run history.

### IMP-03: Inspect import history and recover from failure

**User story:** As an operator, I want to understand what an import did and safely continue after a problem.

**Dream experience:** The run page connects every input item to a clear outcome and next action.

**Steps:**

1. Open Imports/history.
2. Select a run.
3. Filter failed/blocked/skipped items.
4. Fix and retry through the supported workflow.

**Should happen:** Run status, leases, receipts, and errors are translated into operator language with advanced details available.

**Should not happen:** The product must not encourage editing database rows, deleting receipts manually, or guessing whether retry duplicates work.

**Checks:** Completed/failed/interrupted/expired lease; retry; item link; redacted error; large history; viewer visibility policy.

### IMP-04: Export and verify a backup

**User story:** As an owner/operator, I want a usable backup before risky work.

**Dream experience:** Scope, completion, checksum, download, retention, encryption/protection expectations, and restoration limits are explicit.

**Steps:**

1. Choose full, collection, entry, or asset backup where supported.
2. Start export.
3. Wait for completion and verify checksum/live-scope status.
4. Download and store the artifact safely.

**Should happen:** Backup artifacts are attributable, bounded, verifiable, and protected by owner authority. The UI shows a capability matrix stating what each artifact contains and whether any restore apply path exists for that scope.

**Should not happen:** The UI must not equate export with recoverability, claim restore coverage broader than implemented, expose backup URLs publicly, or mark incomplete output as verified.

**Checks:** Each scope; checksum success/failure; stale live data; download; expiry; owner-only; secret/privacy handling.

### IMP-05: Preview a restore

**User story:** As an owner/operator, I want to know exactly what a restore can and will change before applying it.

**Dream experience:** Restore preview is conservative and plainly states that v1 restore apply is limited to the documented missing-asset scope.

**Steps:**

1. Select a backup artifact.
2. Verify checksum and freshness.
3. Run restore preview.
4. Review affected records and blockers.

**Should happen:** Preview performs no restore writes and accurately reflects the narrow supported restore capabilities. Full, collection, and entry exports are labeled export/verification artifacts unless a separately implemented restore path exists.

**Should not happen:** The product must not imply full-table recovery when only asset-scoped restoration exists or accept stale/tampered artifacts.

**Checks:** Valid/stale/checksum mismatch; unsupported scope; missing asset target; already-restored target; no mutation; safe diagnostics.

### IMP-06: Apply a supported restore

**User story:** As an owner/operator, I want to restore a supported missing asset safely from a verified backup.

**Dream experience:** The operation is explicit about creating a fresh asset/storage object and what references will or will not reconnect.

**Steps:**

1. Start from a valid restore preview.
2. Confirm the narrow asset-scoped operation.
3. Execute.
4. Verify the restored asset and audit record.

**Should happen:** Authority, checksum, artifact freshness, and target eligibility are rechecked. Partial failure is surfaced and retry is safe.

**Should not happen:** Restore must not overwrite an existing asset, claim unsupported content/table recovery, or bypass storage validation.

**Checks:** Success; target exists; storage failure; stale confirmation; repeated apply; reference behavior; audit.

---

## 14. Agents and MCP-assisted work

### AGT-01: Create an MCP connection

**User story:** As an owner, I want to create a scoped external-agent connection without granting broad CMS authority.

**Dream experience:** The setup explains operation scopes, expiry, safety mode, and one-time secret handling before creation.

**Steps:**

1. Open Settings > MCP connections.
2. Choose create connection.
3. Configure allowed operation scopes, expiry, and safety mode.
4. Create and copy the raw key once.

**Should happen:** Better Auth owns the API key; CMS stores only its stable key ID and CMS policy. Raw key material is shown once and never persisted in CMS state.

**Should not happen:** The UI must not reveal old raw keys, accept client-supplied role/member authority, or default to unnecessary scopes.

**Checks:** Minimal/full operation scope; expiry; copy-once; reload hides key; owner-only; audit; secret redaction; no UI claim of locale/collection restriction unless CND-11 is accepted.

### AGT-02: Revoke or expire an MCP connection

**User story:** As an owner, I want external-agent access to stop immediately when revoked, expired, or its owner loses authority.

**Dream experience:** Connection status and impact are clear, and revocation is easy to verify.

**Steps:**

1. Select a connection.
2. Preview and confirm revocation.
3. Retry a protected MCP operation.
4. See a safe authentication failure.

**Should happen:** Revoked/expired/inactive keys and member removal/role downgrade affect the next protected operation.

**Should not happen:** Cached agent runs or scope snapshots must not preserve authority, and failure output must not echo the key.

**Checks:** Revoke; expiry; owner downgrade/removal; active run; malformed/unknown key; rate limiting; redaction.

### AGT-03: Start and inspect an agent run

**User story:** As a member or agent operator, I want delegated writes grouped into a bounded, attributable work session.

**Dream experience:** The run explains who delegated it, what it may do, which collections it covers, when it expires, and what it changed.

**Steps:**

1. Start a run using an authorized MCP credential.
2. Inspect effective scopes and expiry.
3. Perform permitted draft work.
4. Complete, fail, revoke, or let the run expire.

**Should happen:** The run stores an immutable historical scope snapshot while current member/credential authority is rechecked on every operation.

**Should not happen:** Completed, failed, revoked, or expired runs must not keep writing. A run ID must not confer authority by itself.

**Checks:** Lifecycle states; operation-scope intersection; expiry; current-role change; activity attribution; secret redaction.

### AGT-04: Let an agent prepare a draft

**User story:** As an editor, I want an agent to create or improve bounded draft content without touching public output.

**Dream experience:** Agent work looks like transparent editorial work with clear attribution, changed fields, and review readiness.

**Steps:**

1. Delegate a bounded task through an active run.
2. Agent reads the collection contract and target content.
3. Agent creates or saves a draft idempotently.
4. Human opens and reviews the result.

**Should happen:** Contract validation, route/asset/relation rules, stable identities, idempotency, and permissions match Studio operations.

**Should not happen:** Agents must not read raw tables, mutate schema/settings/members, bypass active-run requirements, or change public output through draft tools.

**Checks:** Create/update; idempotent retry; missing operation scope; unknown collection; invalid field; stale draft; no public change; human-visible attribution.

### AGT-05: Let an agent prepare a translation

**User story:** As a translator/editor, I want an agent to draft a missing locale while keeping human review and locale truth intact.

**Dream experience:** The result identifies source locale, target locale, changed fields, unresolved terms, and readiness blockers.

**Steps:**

1. Delegate a translation for a specific entry and locale.
2. Agent reads allowed source content and contract.
3. Agent writes only the target locale draft.
4. Human compares, edits, and requests/publishes through normal workflow.

**Should happen:** Shared fields and target-localized fields obey the contract. The agent cannot represent fallback content as completed translation.

**Should not happen:** Source locales, routes, publication state, or other entries must not change outside scope.

**Checks:** Missing/existing target; localized slug/body; glossary/unresolved note; scope denial; human compare; no public effect.

### AGT-06: Request human publish review from MCP

**User story:** As an agent, I want to submit completed draft work for human approval.

**Dream experience:** The request appears in Studio as a normal marketer-readable review, not as an opaque machine operation.

**Steps:**

1. Save a valid draft in an active run.
2. Request canonical publish preview.
3. Create a review request.
4. Inspect review status through allowed MCP tools.

**Should happen:** Convex recomputes preview and stores trusted review facts. Studio shows requester, entry, locale, changes, affected pages, readiness, and stale state.

**Should not happen:** MCP must not directly publish/delete/purge by default or provide caller-authored preview truth.

**Checks:** Ready/blocked; stale after request; approve/reject; run expiry; scope denial; Studio/MCP status parity; redaction.

### AGT-07: Keep MCP capabilities narrow and explainable

**User story:** As an owner/developer, I want the external tool surface to expose useful CMS workflows without becoming a generic admin backdoor.

**Dream experience:** Tool names and denials make the supported workflow obvious.

**Steps:**

1. Connect an MCP client.
2. Initialize and list tools.
3. Inspect collections, entries, public content, assets, runs, and reviews within scope.
4. Attempt a disallowed operation and receive a safe denial.

**Should happen:** Tools operate through CMS domain operations, redact secrets/creation metadata, and enforce current member role, credential status, operation scope, active run, and safety policy. Locale/collection credential limits are not claimed unless CND-11 is accepted and implemented as canonical authority.

**Should not happen:** No raw table reads, schema mutation, member/settings/deploy administration, authority-shaped inputs, or default direct destructive/public operations.

**Checks:** Tool list; each allowed read/write; anonymous/malformed/revoked key; missing operation scope; unknown collection; denial copy; rate limit; no double counting.

---

## 15. Public website and API behavior

### WEB-01: Serve published content only

**User story:** As a website visitor, I want stable public content without exposure to editorial drafts.

**Dream experience:** Public pages are fast and predictable regardless of active Studio work.

**Steps:**

1. Create or edit a draft.
2. Read the equivalent public page/API before publish.
3. Publish successfully.
4. Read again.

**Should happen:** Before publish, the old public version or not-found state remains. After publish, public reads use active published rows only.

**Should not happen:** Public providers/endpoints must never join in draft data, expose private fields, or require Studio authentication.

**Checks:** New draft; live-with-changes; failed publish; unpublish/archive; unauthenticated public calls; cache behavior.

### WEB-02: Resolve routes, redirects, and not-found states

**User story:** As a visitor and developer, I want routes to resolve to the right published locale, redirect, or clear not-found result.

**Dream experience:** URL changes preserve intentional redirects, while unpublished or invalid routes fail cleanly.

**Steps:**

1. Request a current route, redirected old route, missing route, and unpublished route.
2. Observe the provider/page-helper result.

**Should happen:** The result distinguishes entry, redirect, missing locale, not public, and not found as documented. Redirect targets are safe and public.

**Should not happen:** Route resolution must not leak draft existence/details, loop redirects, or serve a different locale silently where strict routing applies.

**Checks:** Current/old/missing/unpublished; locale route; redirect loop prevention; unsafe target; archive/restore; parent route change.

### WEB-03: Keep navigation consistent with published hierarchy

**User story:** As a visitor, I want menus and documentation navigation to match the pages that are actually public.

**Dream experience:** Ordering, nesting, labels, and locale links update together after publication.

**Steps:**

1. Publish, reorder, move, rename, unpublish, or archive hierarchical content.
2. Request public navigation.
3. Open resulting links.

**Should happen:** Navigation uses published hierarchy and order only. Every returned link resolves or intentionally redirects.

**Should not happen:** Draft order, archived entries, missing-locale routes, orphan children, or stale descendant paths must not appear.

**Checks:** Root/subtree; reorder; move; locale; missing parent; archived child; provider/page consistency.

### WEB-04: Keep search and sitemap consistent with publishing

**User story:** As a visitor or crawler, I want search and sitemap results to reflect current public inclusion rules.

**Dream experience:** Publishing or removing content updates discoverability as one coherent website change.

**Steps:**

1. Publish or change search/sitemap flags.
2. Query public search and sitemap.
3. Unpublish/archive and query again.

**Should happen:** Only eligible published locales/routes appear, with current titles, excerpts, URLs, and canonical metadata.

**Should not happen:** Draft/private/archived/fallback-only/unroutable rows or stale URLs must not remain discoverable.

**Checks:** Include/exclude flags; locale; route rename; subtree; unpublish; data-only content; revalidation timing.

### WEB-05: Expose correct translation alternates

**User story:** As a multilingual visitor or search engine, I want language alternatives to point only to valid public variants.

**Dream experience:** Language switching and `hreflang` reflect real published availability and configured locale policy.

**Steps:**

1. Publish one or more locale variants.
2. Request route metadata/translation summary.
3. Add, rename, unpublish, or archive a locale variant.

**Should happen:** Alternate URLs, canonical URLs, and missing/configured locale state remain consistent across page, navigation, sitemap, and provider reads.

**Should not happen:** Missing translations must not receive fake alternate URLs, and a translated slug change must not leave stale language-switch links.

**Checks:** One/many locales; missing translation; fallback; translated slug; unpublish one locale; non-English default.

### WEB-06: Fail safely when public output is inconsistent

**User story:** As an operator/developer, I want diagnostics and repair paths when derived public state is missing or inconsistent.

**Dream experience:** Visitors get a safe result while authorized operators get actionable diagnosis without manual database editing.

**Steps:**

1. Detect missing/stale route rows, asset refs, or delivery state through diagnostics/tests.
2. Run the named bounded repair/rebuild workflow where supported.
3. Verify invariants.

**Should happen:** Derived surfaces name their canonical source and rebuild path. Repair is bounded, auditable, and does not treat drafts as public truth.

**Should not happen:** The normal response must not be direct table editing, a second projection truth, or silent fallback to draft data.

**Checks:** Route repair; asset-ref rebuild; public-row limitation; concurrent publish; failed repair; public privacy; invariant tests.

### WEB-07: Inspect and retire public redirects

**User story:** As a publisher or owner, I want to see which public redirects exist and remove obsolete ones without breaking inbound links.

**Dream experience:** Redirects read as website facts — old URL, current target, status behavior, locale, and the operation that created them — not as database rows, and retiring one is as accountable as any other public-output change.

**Steps:**

1. Open the redirects inventory or route diagnostics.
2. Review each redirect’s source path, target, status code, locale, creating operation, and age.
3. Preview the removal impact for an obsolete redirect.
4. Confirm the guarded removal and verify revalidation.

**Should happen:** Redirect source is recorded using the canonical schema vocabulary (`publish`, `import`, or explicitly guarded `manual`). A publish-time redirect is created only when the collection and route-change policy support it. Removal is previewed, confirmed, audited, and emits revalidation for affected paths. A redirected source path is freed for reuse by new content only through the same canonical route-collision validation used everywhere else.

**Should not happen:** Studio must not invent redirects for unpublish/archive unless an explicit documented policy requires them, allow ad-hoc edits that bypass route validation, create loops or chains ending at non-public targets, silently drop a redirect that inbound links still depend on without preview, or leave a removed redirect served from cache indefinitely.

**Checks:** List/filter redirects; redirect created by live rename; supported permanent-status policy; removal preview and confirmation; loop/chain prevention; collision when a new entry claims a redirected path; locale-specific redirect; permission matrix; audit record; revalidation delivery.

---

## 16. Reliability, accessibility, responsive behavior, and edge states

### QUA-01: Use Studio with keyboard and assistive technology

**User story:** As a keyboard or screen-reader user, I want to complete every core editorial workflow without a pointer.

**Dream experience:** Navigation order, focus, labels, status announcements, dialogs, editors, trees, and drag alternatives feel intentional.

**Steps:**

1. Sign in and navigate primary sections by keyboard.
2. Create/edit/save/preview/request review/publish as permitted.
3. Use asset picker, document tree, dialogs, and history.

**Should happen:** Visible focus, semantic names, correct roles, escape behavior, focus return, live announcements, and non-color status cues meet WCAG AA expectations.

**Should not happen:** Focus traps, pointer-only reorder, unlabeled icon actions, hover-only information, or color-only errors/statuses.

**Checks:** Automated accessibility scan plus manual keyboard/screen-reader pass for every core workflow; 200% zoom; high contrast where supported.

### QUA-02: Use Studio on narrow screens

**User story:** As a user on a tablet or phone, I want to inspect and complete reasonable CMS tasks without horizontal overflow.

**Dream experience:** Content stays readable, actions wrap or move into appropriate sheets/menus, and dense desktop tools degrade gracefully.

**Steps:**

1. Open each primary route at supported narrow widths.
2. Navigate, search, edit simple fields, inspect details, and handle dialogs.

**Should happen:** No page-level horizontal overflow, clipped primary action, inaccessible details rail, or overlapping text. Complex comparisons/trees provide an intentional stacked alternative.

**Should not happen:** The product must not merely shrink desktop columns until fields and labels become unusable.

**Checks:** 390px and tablet widths; every primary page; virtual keyboard; long labels/routes/emails; dialogs/sheets; orientation change.

### QUA-03: Respect reduced motion and user appearance

**User story:** As a motion-sensitive user, I want Studio interactions to remain clear without unnecessary animation.

**Dream experience:** Reduced motion removes structural and decorative movement while preserving state comprehension.

**Steps:**

1. Enable reduced motion/system theme preferences.
2. Navigate, open sheets/dialogs, change status, and use editor interactions.

**Should happen:** Motion durations collapse appropriately, focus remains correct, and state does not depend on animation.

**Should not happen:** Parallax, bounce, delayed essential controls, flashing transitions, or theme-specific unreadable states.

**Checks:** Reduced motion; light/dark/system; all semantic statuses; dialog/sheet/sidebar; page transitions; no functional timing dependency.

### QUA-04: Recover from network and backend failures

**User story:** As an editor, I want failures to preserve my work and give me a safe retry path.

**Dream experience:** The page says what failed, what remains safe, and whether public output changed.

**Steps:**

1. Encounter a timeout, offline state, backend error, or interrupted upload/save/publish.
2. Review the contextual error.
3. Retry, reconnect, copy work, or leave safely.

**Should happen:** Draft input remains recoverable, idempotent operations do not duplicate, and publish/destructive failures report previous public state accurately.

**Should not happen:** Blank screens, raw stacks, infinite spinners, false success, lost input, partial public activation, or unsafe automatic retries.

**Checks:** Each core mutation; offline/online; timeout; 401/403/409/429/5xx; retry; duplicate submit; observability correlation without secrets.

### QUA-05: Handle empty, loading, stale, and missing states

**User story:** As a user, I want every non-happy state to explain itself and offer the correct next action.

**Dream experience:** Empty does not look broken, loading does not jump unpredictably, and missing/stale content does not strand the user.

**Steps:**

1. Open pages with no entries/assets/reviews/runs/activity/site data.
2. Open slow-loading pages.
3. Follow a link to removed, archived, or unavailable content.

**Should happen:** Role-aware actions, stable layout, safe skeletons, clear missing/archived distinction, and navigation back to a useful context.

**Should not happen:** Meaningless zero rows, permanent skeletons, misleading create actions, or technical not-found output.

**Checks:** Every primary page; each role; slow query; backend unavailable; invalid collection/entry; archived target; mobile and accessibility.

### QUA-06: Keep secrets and private data out of every surface

**User story:** As an owner and visitor, I want credentials, internal authority, and private drafts protected across UI, APIs, logs, MCP, activity, and errors.

**Dream experience:** Secure behavior is invisible during normal work and explicit when a secret is intentionally shown once.

**Steps:**

1. Exercise authentication, MCP creation/failure, revalidation, backup, upload, and denied operations.
2. Inspect visible responses, activity, URLs, logs, and public endpoints.

**Should happen:** Keys/tokens/passwords/secret URLs are redacted or omitted. Raw MCP keys appear only at creation. Public output contains only contract-approved published fields.

**Should not happen:** Header reflection, bearer echo, raw Convex creation metadata, stack traces, client-controlled role/member fields, or draft/private payload leakage.

**Checks:** Automated secret-pattern scans; malformed/unknown/revoked key; errors; audit; browser URL/history; public APIs; backups; support diagnostics.

### Experience quality contract

Speed, feel, and taste are assessed with the same discipline as functional stories: speed through measured budgets, feel and taste through a structured, repeatable review loop. Both use the **target-scale fixture**: a seeded dataset at the documented v1 scale target (on the order of 1,500 entries across three locales, a documentation tree at least five levels deep, several hundred assets, and long MDC bodies). Measurements against an empty or toy dataset do not count as evidence.

Initial interaction budgets (p95 on mid-range hardware against the target-scale fixture; changing a budget is a recorded product decision, not a release-time adjustment):

| Interaction                                    | Budget                    |
| ---------------------------------------------- | ------------------------- |
| Cold Studio load to interactive work queue     | < 2.5s                    |
| Navigation between primary sections            | < 300ms                   |
| Keystroke to rendered character in a long body | < 50ms, no dropped frames |
| Search or filter results                       | < 300ms                   |
| Entry list paging and sorting                  | < 200ms                   |
| Publish preview computation                    | < 2s                      |
| INP / CLS on primary routes                    | INP < 200ms, CLS < 0.1    |

### QUA-07: Meet interaction performance budgets at target scale

**User story:** As an editor working in Studio all day, I want every routine interaction to feel immediate so the CMS is never the slow part of my work.

**Dream experience:** Studio feels like a native tool: typing never lags, lists never stutter, and waiting is rare, brief, and explained.

**Steps:**

1. Seed the documented target-scale fixture.
2. Run the instrumented browser pass over primary routes and core editor interactions.
3. Compare measured p95 values against the published budget table.
4. Record the results per release and triage any regression as a finding.

**Should happen:** Budgets are versioned in this catalog, measured automatically through the existing UI-audit/live-story browser harness, and recorded per release so trends are visible. Speed is a measured fact, not an impression. A blown budget is a finding with severity and an owner, exactly like a functional failure.

**Should not happen:** Performance must not be assessed only against empty or trivial data, budgets must not be silently raised to make a release pass, skeletons and spinners must not mask unbounded waits, and measurement must not depend on manual stopwatch work that nobody repeats.

**Checks:** Cold load; section navigation; editor input latency on a long document; search/filter latency; list paging at target scale; publish preview computation; INP/CLS on primary routes; fixture documented and reproducible; per-release trend recorded; budget-change decisions auditable.

### QUA-08: Review taste and feel through a structured, repeatable loop

**User story:** As the product team, we want taste, feel, and language quality reviewed with the same discipline as functional stories so experience quality cannot silently erode between releases.

**Dream experience:** Every release gets an experience verdict a reviewer can defend: rubric scores, screenshot evidence, comparative anchors, and real-user signals — not one person’s mood on review day.

**Steps:**

1. Capture the standard screenshot set (primary routes across supported viewports in light and dark) with the UI-audit harness against the target-scale fixture.
2. Run a model-assisted design review of the set against the published rubric, producing scored, screen-referenced findings.
3. A human design owner triages every finding: accept, fix, or overrule with recorded rationale.
4. Periodically anchor the loop with a side-by-side benchmark against two reference tools and moderated task sessions with real editors.

**Should happen:** The rubric is versioned and derived from the binding sources — PRODUCT.md brand personality and anti-references plus the DESIGN.md interaction principles — so review criteria and product intent cannot drift apart. The model-assisted review is a repeatable lens that produces specific findings tied to a screen, route, and rubric dimension. The human owner holds the verdict. Interaction-cost counts (clicks/keystrokes) for the top recurring editorial tasks are tracked against ceilings, and real-user sessions happen on a stated cadence.

**Should not happen:** Taste review must not collapse into “looks fine to me” inside code review, the model reviewer must not become the sole authority without human triage, the rubric must not fork from PRODUCT.md/DESIGN.md into a second taste truth, screenshots must not be compared across incompatible build modes, findings must not lack a concrete screen reference, and real-user evidence must not be postponed indefinitely because proxy reviews exist.

**Checks:** Rubric exists and cites its source documents; screenshot set completeness (routes × viewports × themes); model review repeatability (same set yields substantially the same top findings); human triage record with rationale for overrules; interaction-cost table for the top ten tasks; comparative benchmark on file; at least one moderated user session per assessment cycle; findings triaged into the same tracker as functional gaps.

---

## 17. Developer setup and integration

### DEV-01: Install and initialize Ginko CMS in a clean Nuxt application

**User story:** As a Nuxt developer, I want to install and initialize the CMS from published packages without relying on the monorepo.

**Dream experience:** The documented commands produce a working, understandable host setup and clearly separate generated files from application-owned files.

**Steps:**

1. Install the published CMS, Convex component, contract, and required Nuxt/auth dependencies.
2. Run `ginko-cms init`.
3. Review the generated Convex setup and required environment variables.
4. Run code generation and the documented local development flow.

**Should happen:** Packed manifests contain publishable dependency specifiers, generated host bridge files are present, imports resolve, and setup uses the documented local Better Auth component integration.

**Should not happen:** Installation must not depend on workspace paths, unpublished packages, Trellis runtime metadata, hidden manual file copying, or live publish commands.

**Checks:** Clean temporary consumer; packed artifacts; package manifests; generated file inventory; Convex codegen/dev once; Nuxt build; repeat init/idempotency; Windows/path portability where supported.

### DEV-02: Diagnose setup with CLI checks

**User story:** As a developer, I want CLI diagnostics to identify incomplete or drifted setup before I debug runtime symptoms.

**Dream experience:** One check names the exact missing package, file, manifest field, environment value, content contract, auth component, or MCP setup issue and links it to the correct fix.

**Steps:**

1. Run `ginko-cms doctor`, `ginko-cms mcp-doctor`, and relevant `push --check` commands.
2. Review pass/fail output.
3. Apply the documented fix.
4. Rerun the check.

**Should happen:** Checks are non-destructive, deterministic, usable from packed packages, and redact secrets.

**Should not happen:** Diagnostics must not run live deploy/publish commands, print bearer material, assume the monorepo, or recommend obsolete Trellis paths.

**Checks:** Healthy setup; each known missing artifact; stale contract; auth/MCP misconfiguration; malformed environment value; redaction; exit codes; CI use.

### DEV-03: Define and sync a content model in code

**User story:** As a developer, I want to define collections and fields in code and have Studio inspect the exact installed contract.

**Dream experience:** Contract changes are type-checked, previewable, and synchronized without creating a second editable schema surface.

**Steps:**

1. Define or change a collection in the host application’s content configuration.
2. Run the documented check/sync flow.
3. Review compatibility and stored-content drift.
4. Open Content Model in Studio and verify the read-only result.

**Should happen:** Collection slugs, fields, required/localized behavior, relations, routes, public flags, search/sort/filter behavior, and locales have one code-owned source of truth.

**Should not happen:** Sync must not silently discard stored fields, invent migrations, publish content, or allow Studio/MCP to mutate schema.

**Checks:** New compatible collection; added optional/required field; field removal/type change; relation target change; locale change; contract SHA drift; generated types; Studio/MCP parity.

### DEV-04: Integrate published content into the Nuxt website

**User story:** As a developer, I want Nuxt pages to consume CMS content through the public provider rather than CMS storage internals.

**Dream experience:** Page, list, navigation, surroundings, search, sitemap, singleton, and site-data reads have documented, typed, website-shaped results.

**Steps:**

1. Configure the Ginko CMS provider.
2. Build route-backed and data-only consuming pages.
3. Handle entry, redirect, missing locale, not public, and not-found results.
4. Verify published content, navigation, search, sitemap, assets, and locale metadata.

**Should happen:** Public reads require no Studio session, use active published output only, and preserve the provider-neutral Ginko boundary.

**Should not happen:** The host app must not query draft tables, Convex component internals, raw projections, or CMS policy from presentation code.

**Checks:** SSR/client navigation; route helper; public API/provider; redirects; localization; assets; cache tags/revalidation; type checking; no draft leakage.

### DEV-05: Change a live content contract safely

**User story:** As a developer/operator, I want to evolve a deployed content model without silently breaking stored drafts or public pages.

**Dream experience:** The check/dry-run flow explains compatible changes, blockers, affected entries, required content fixes, and recovery before apply.

**Steps:**

1. Propose a code-defined contract change.
2. Run contract and migration check/dry-run.
3. Review affected drafts, published output, routes, locales, relations, and public shaping.
4. Apply through the documented migration/sync workflow.
5. Verify Studio diagnostics and public reads.

**Should happen:** Incompatible changes fail closed unless an explicitly authorized migration plan handles them. Derived data is rebuilt from named canonical sources where required.

**Should not happen:** A schema sync must not become an implicit data migration, leave old/new contract paths active together, or require direct table editing.

**Checks:** Each incompatible-change class; dry-run no writes; backup/recovery prerequisite; interrupted migration; reindex; public-output stability; rollback documentation.

### DEV-06: Prepare a release or deployment without publishing from the agent session

**User story:** As a maintainer, I want to verify distributable packages and host setup before a human-controlled release/deploy.

**Dream experience:** The release candidate produces inspectable artifacts and a clear pass/fail report without hidden live mutations.

**Steps:**

1. Run focused tests while developing.
2. Run `pnpm run check`, `pnpm run release:verify`, and registry verification when prerequisites are published.
3. Inspect package artifacts and release notes.
4. Hand the verified candidate to the human release procedure.

**Should happen:** Package metadata, generated bridges, auth, Studio workflows, MCP, migrations, and public provider contracts receive proportionate verification.

**Should not happen:** Agent sessions must not run live package publish, production deploy, or commit generated `.pack`, `dist`, `.nuxt`, `.output`, or tarball artifacts.

**Checks:** Release scripts; packed consumer; changelog/semver; clean artifact list; registry prerequisite behavior; failure exit codes; documented human handoff.

---

## 18. Common CMS expectations requiring explicit product decisions

These workflows are common enough that the team should assess them, but they are not silently accepted as v1 architecture. Several require expensive new canonical state, background jobs, notification delivery, or collaboration models. For each story, the gap assessment must choose **accept**, **defer**, or **reject with rationale** before implementation planning.

### CND-01: Schedule publication or unpublication

**User story:** As a publisher, I want approved content to go live or come down at a specific time.

**Dream experience:** Scheduling is a reviewed public operation with an exact timezone, visible upcoming state, and a trustworthy execution outcome.

**Steps:**

1. Prepare and approve a publish or unpublish plan.
2. Choose date, time, and explicit timezone.
3. Confirm the scheduled operation and its stale-content policy.
4. Review, change, or cancel it before execution.
5. Inspect the execution and revalidation outcome afterward.

**Should happen:** The schedule stores the exact expected draft/revision and canonical operation plan. At execution, authority/policy, readiness, route conflicts, and staleness are rechecked. DST ambiguity, missed jobs, retries, cancellation, and audit attribution have deterministic rules.

**Should not happen:** A scheduled job must not publish whatever draft happens to exist later, run twice, use an implicit browser timezone, bypass review, or hide a missed/failed execution.

**Checks:** Future/past time; DST gap/overlap; timezone display; edit after scheduling; role/member change; cancel/reschedule; worker outage; idempotent retry; public verification.

### CND-02: Perform bounded bulk editorial actions

**User story:** As an editor or publisher, I want to act on a reviewed set of entries without repeating the same workflow one item at a time.

**Dream experience:** Selection scope is explicit, every item receives its own preview/outcome, and the product never hides partial results behind a single success message.

**Steps:**

1. Filter and select entries explicitly, with “all results” requiring a separate bounded choice.
2. Choose a supported action such as archive, restore, request review, publish ready items, or export.
3. Review per-item included, blocked, stale, and unauthorized outcomes.
4. Confirm and observe progress.
5. Retry only failed or stale items.

**Should happen:** Every item is independently authorized and validated and receives a durable outcome receipt. Bulk publish includes only explicitly previewed ready versions. Selection survives pagination safely.

**Should not happen:** The UI must not imply cross-entry atomicity, silently select hidden results, publish blocked items, repeat successful items on retry, or make permanent delete a routine bulk action.

**Checks:** Current page/all filtered; permission mix; stale item; route collision; partial failure; cancel; retry; thousands-of-entries bound; accessible selection and progress.

### CND-03: Assign a review owner, due date, and priority

**User story:** As an editorial team, we want pending work to have a clear responsible reviewer and expected completion context.

**Dream experience:** Assignment improves accountability without becoming a second authorization system or blocking another authorized publisher during an incident.

**Steps:**

1. Request review.
2. Optionally assign an eligible reviewer, due date, and priority.
3. Reassign or clear the assignment with visible history.
4. Complete or close the review.

**Should happen:** Assignment is workflow metadata only; backend role still controls approval. Removed/downgraded assignees are flagged, dates use an explicit timezone, and stale requests remain stale regardless of assignment.

**Should not happen:** Assignment must not grant publish authority, hide the request from other authorized reviewers, or persist as unexplained denormalized state after closure.

**Checks:** Assign/reassign/unassign; ineligible user; member removal; overdue state; locale/version staleness; filters; audit; no authorization effect.

### CND-04: Discuss a review in a bounded feedback thread

**User story:** As an editor and reviewer, I want comments tied to a review so requested changes and resolutions remain understandable.

**Dream experience:** Feedback stays with the exact review/version, supports concise replies and resolution, and does not clutter the entry body or public output.

**Steps:**

1. Open a review request.
2. Add a comment or reply, optionally referencing a field/change.
3. Resolve or reopen a thread.
4. Submit a new review version while preserving prior discussion context.

**Should happen:** Comments have author/time attribution, permission checks, safe text rendering, bounded length/rate, and an explicit relationship to the review and expected draft version.

**Should not happen:** Comments must not modify content, become public, accept unsafe HTML, contain secrets by default, or remain deceptively attached to a materially different stale draft.

**Checks:** Editor/reviewer visibility; removed member attribution; stale/new review; resolve/reopen; sanitization; mentions if accepted; accessibility; retention/deletion policy.

### CND-05: Receive useful review and operation notifications

**User story:** As a team member, I want to know when work needs my attention or an important operation fails.

**Dream experience:** An in-product inbox is authoritative, external delivery is optional, and users can control noise without missing security-critical events.

**Steps:**

1. Trigger assignment, review request/change, approval/rejection, failed schedule, failed revalidation, or access change.
2. See a grouped in-product notification.
3. Open the exact context.
4. Mark read or configure permitted delivery preferences.

**Should happen:** Notification events derive from canonical operations, link safely to authorized resources, deduplicate retries, and distinguish informational from action-required items.

**Should not happen:** Email/Slack-style delivery must not become the sole source of truth, leak private content, notify removed users, or create a second operation-status store.

**Checks:** Each event; deduplication; read/unread; permission lost after creation; external failure; preference changes; digest if accepted; redaction.

### CND-06: Share a protected draft preview

**User story:** As an editor, I want a stakeholder without Studio editing access to review a specific draft preview for a limited time.

**Dream experience:** The share link is clearly private, time-limited, revocable, scoped to one entry/locale/version, and impossible to mistake for a live URL.

**Steps:**

1. Save the draft and request a share-preview link.
2. Choose expiry and any permitted access constraint.
3. Copy the one-time-visible or revocable link.
4. Stakeholder opens the exact rendered draft.
5. Editor revokes the link or lets it expire.

**Should happen:** The token is high entropy, stored hashed where possible, version-scoped, noindex, read-only, audited, and checked on every request.

**Should not happen:** The link must not grant Studio access, expose other drafts/locales, appear in public sitemap/search/log output, survive revocation, or silently show a newer draft than reviewed.

**Checks:** Expiry/revoke; wrong entry/locale; draft changed; archived/deleted entry; crawler headers; URL/log redaction; brute-force/rate limits; mobile preview.

### CND-07: Start content from an approved template

**User story:** As an editor, I want to start recurring content from an approved structure without duplicating identity or stale publication data.

**Dream experience:** Templates accelerate writing while remaining visibly subordinate to the code-defined content contract.

**Steps:**

1. Choose a template when creating an entry.
2. Preview copied fields, body structure, locales, relations, and assets.
3. Provide required unique identity/route information.
4. Create the draft and edit normally.

**Should happen:** Templates contain content defaults only, are versioned/owned through one defined source, and are validated against the active collection contract at use time.

**Should not happen:** A template must not create fields/schema, copy stable IDs/history/reviews/publication state, bypass required validation, or remain an unexplained second content truth.

**Checks:** Current/stale template; contract change; localized template; relation/asset references; route uniqueness; template removal; source-of-truth decision.

### CND-08: Validate internal links and references

**User story:** As an editor or publisher, I want to find broken links and references before they reach the website.

**Dream experience:** Readiness identifies the exact source and target, distinguishes draft/public availability, and offers a direct fix path.

**Steps:**

1. Save content containing internal links, relations, assets, or document references.
2. Run or observe bounded link/reference validation.
3. Fix missing, archived, locale-missing, redirected, or unauthorized targets.
4. Recheck before publish.

**Should happen:** Validation uses stable IDs where the field model supports them and route resolution where literal links are intentional. It distinguishes blockers from warnings and remains conservative when a remote check is unavailable.

**Should not happen:** The checker must not crawl without bounds, treat transient external failures as certain permanent breakage, expose private target details, or rewrite links silently.

**Checks:** Internal current/redirect/missing/unpublished/locale-missing; asset/relation; external timeout/status; anchors; subtree route move; target archived after preview.

### CND-09: Adjust an image crop or focal point per usage

**User story:** As an editor, I want an image to compose correctly in a specific content placement without destructively changing the shared original.

**Dream experience:** Crop/focal controls show the target aspect ratio and make clear whether the choice belongs to the asset or this usage.

**Steps:**

1. Select an image for a field or rich-text placement.
2. Open crop/focal controls when the content contract permits them.
3. Preview supported responsive shapes.
4. Save usage metadata and publish normally.

**Should happen:** The original asset remains canonical and unchanged. Usage-specific crop coordinates round-trip through MDC/field data, validate bounds, and appear in draft/live comparison and publish preview.

**Should not happen:** A crop must not destructively overwrite the original, leak across unrelated usages, disappear during editor conversion, or imply unsupported server-generated variants.

**Checks:** Crop/focal round-trip; invalid coordinates; responsive preview; shared asset in two usages; locale/shared-field behavior; asset replacement; public rendering.

### CND-10: Grant an agent direct guarded public-operation authority

**User story:** As an owner, I want to decide whether a trusted agent identity may publish, archive, or restore directly through the same guarded operations as an authorized human.

**Dream experience:** Caller parity is a deliberate, operation-specific configuration decision, not a drifting default. An agent granted one operation uses the identical preview, confirmation, execution, and audit path as a human with the required role; an agent without it requests review. Nothing about the agent path is a second implementation.

**Steps:**

1. Review the credential scope and safety-mode configuration for publish, archive, and restore.
2. Explicitly grant only the accepted operation scopes to one specific connection.
3. Start or use a verified active agent run.
4. The agent previews and executes an allowed operation through the canonical operation layer.
5. Inspect the outcome, attribution, and the effect of run expiry, revocation, or role downgrade.

**Should happen:** If accepted, every enabled direct agent operation uses the same canonical preview/confirm/execute/audit path and revalidation as its human equivalent. Publish produces identical readiness, revision, projection, and audit semantics. Archive/restore require the same owner authority and reversible lifecycle rules as human archive/restore. Effective authority remains the intersection of the verified credential, active operation scopes, a verified active agent run, the owning member’s current role, and safety mode; run expiry, revocation, or downgrade stops the operation on the next protected call.

**Should not happen:** A run ID or historical scope snapshot must not confer public-operation authority. Default connections must not gain scopes silently. Direct agent operations must not bypass preview/confirmation semantics, skip review-gating for connections that were not explicitly granted, diverge from human output, or expand to permanent delete, purge, backup administration, member management, or settings management.

**Checks:** Default-deny for new connections; independent publish/archive/restore scope decisions; explicit grant; active-run requirement; required owning-member role; run expiry; role downgrade; revocation mid-run; output/audit/revalidation identical to the human operation; readiness/stale-state parity; permanent delete/purge remain unavailable; recorded accept/defer/reject decision.

**Decision note:** `docs/concepts/studio/marketer-publishing-pipeline.md` names direct authorized agent publish and reversible archive/restore as product goals, while `docs/reference/auth-and-roles.md` and `docs/concepts/studio/workflows.md` describe the current runtime as review-gated with trusted-direct execution as a later, explicitly designed mode. The gap assessment must resolve the operation-specific conflict explicitly. This catalog treats review-gated as the v1 baseline until decisions are recorded.

### CND-11: Scope member authority to locales or collections

**User story:** As an owner, I want to decide whether a translator, agency, or contributor can be limited to specific locales or collections, or whether v1 keeps exactly four site-wide roles.

**Dream experience:** Authority stays one backend model. If scoping is accepted, every surface — Studio controls, MCP, reviews, readiness, and publish — enforces the same boundary from the backend. If it is rejected or deferred, personas and documentation stop implying that per-locale authorization exists.

**Steps:**

1. Review the current four-role, site-wide authority model against real team needs.
2. Record an accept, defer, or reject decision with rationale.
3. If accepted, define the canonical scope model, its enforcement in backend operations, and its Studio/MCP presentation.
4. Verify the full permission matrix, including denial states.

**Should happen:** In v1, viewer, editor, publisher, and owner remain the only backend roles and each is site-wide; the Translator persona maps to the editor role. Current MCP credentials also have flat operation scopes rather than locale/collection limits. Any accepted scoping is enforced by backend operations as one source of truth and appears consistently in Studio, MCP, readiness, reviews, and denial copy.

**Should not happen:** Locale or collection restrictions must not be implemented as UI-only hiding, become a parallel permission store beside CMS membership, ship half-enforced across Studio and MCP, or silently grant a “translator” publish authority narrower than the backend actually enforces.

**Checks:** Four-role matrix without scoping; documentation/persona alignment; current flat MCP operation scopes; if accepted: backend-enforced locale/collection denial in Studio and MCP, readiness and review parity, audit of scope changes.

### CND-12: Expand site-data editing and recovery beyond owner-only immediate writes

**User story:** As an owner and editorial team, we want to decide whether reusable site data should remain owner-only immediate settings or gain publisher/editor workflow, version history, and rollback.

**Dream experience:** The product makes one explicit choice. A simple v1 keeps owner-only immediate writes and honestly states the recovery limit. An expanded workflow uses one canonical version/approval model rather than hiding entry-like drafts inside settings.

**Steps:**

1. Review which site-data blocks can change public output and how often editors need to update them.
2. Record accept, defer, or reject decisions for broader edit authority and versioned recovery.
3. If accepted, define canonical roles, version storage, review/publish behavior, rollback, retention, and revalidation.
4. Verify the complete permission and recovery matrix.

**Should happen:** Until accepted, `manageSettings` remains owner-only, saves are immediately canonical/public where visibility is public, activity records attribution without full-value snapshots, and correction requires another owner save. Existing exports do not imply a v1 site-data restore path. If expanded, Studio, backend operations, activity, MCP policy, and public reads use one version truth with testable rollback semantics.

**Should not happen:** The UI must not imply editor/publisher write access that the backend denies, retain arbitrary previous values in generic activity records, add a second hidden site-data draft store, or claim rollback that only means manually reconstructing data from logs.

**Checks:** Current owner-only matrix; publisher/editor/viewer denial; immediate public save and revalidation; mistaken-save correction; accept/defer/reject record; if accepted: version immutability, approval authority, rollback, retention/privacy, concurrent edits, and public-output atomicity.

---

## Intentional non-stories and guardrails

These are important acceptance criteria because implementing them would violate the product boundary or create unsafe parallel systems.

1. Studio does not create, edit, delete, import, or reorder collection schema.
2. Studio is not a visual page builder and does not own the host website’s presentation.
3. Public website reads do not expose drafts or use draft fallback.
4. Saving a draft, running readiness, previewing publish, or previewing import does not change public output.
5. Missing translations do not globally block ready locales.
6. Permanent deletion is not the normal content-removal workflow; archive and restore are preferred.
7. MCP does not expose raw table access, schema mutation, member/settings management, deploy/admin tools, or client-supplied authority.
8. MCP does not directly publish, archive, restore, delete, or purge by default; public/destructive agent work is review-gated. Granting direct caller-parity publish/archive/restore authority is the explicit CND-10 decision, not a default.
9. Imports do not create schema and do not silently publish.
10. Backup UI does not claim restore capabilities the implementation does not provide.
11. Ginko CMS does not create a second user, tenant, organization, or workspace source of truth beside Better Auth identity and CMS membership.
12. Bridge/setup files do not contain CMS domain policy.
13. Derived data does not exist without a canonical source, rebuild story, and invariant tests.
14. Technical identifiers, projection terminology, cache tags, events, and raw payloads do not dominate editor-facing workflows.
15. Autosave and “Save now” do not become separate draft persistence systems.
16. Studio does not maintain locale policy independently from the installed code/content-policy source of truth.
17. Site-data saves are not described as unpublished drafts in v1; successful permitted writes change canonical data immediately, and public blocks schedule revalidation.
18. Scheduling, assignments, comments, notifications, templates, share previews, direct agent public operations, scoped member authority, expanded site-data workflow, and similar CND workflows are not implementation commitments until the team explicitly accepts their canonical state and lifecycle.

## Recommended assessment order

The later team assessment should evaluate complete vertical workflows before isolated screens:

1. **Core editorial slice:** sign in, find content, create draft, edit, save, preview, request review, publish, verify public output.
2. **Multilingual slice:** missing locale, create/copy translation, compare, readiness, publish one locale, verify alternates/search/nav/sitemap.
3. **Documentation slice:** create child, reorder siblings, move subtree, rename parent, publish, verify descendant routes and redirects.
4. **Lifecycle slice:** edit live content, version compare, archive, restore, unpublish, rollback, permanent-delete guards.
5. **Asset slice:** upload, metadata, attach, usage, replace, trash, restore, purge guards.
6. **Collaboration slice:** agent draft, review request, stale review, approve/reject, activity/audit attribution.
7. **Operations slice:** members, revalidation, imports, backup/verify, supported restore, diagnostics.
8. **Quality slice:** permission matrix, keyboard/screen reader, mobile, failure recovery, secret redaction, public draft isolation, interaction performance budgets, structured taste/feel review.
9. **Developer slice:** clean install, init/doctor, contract sync, provider integration, contract migration, release verification.
10. **Product-decision slice:** accept, defer, or reject each CND story with a named canonical source, lifecycle, permissions, retention, and testable acceptance boundary.

## Definition of “dream experience met”

A story meets the dream bar only when:

- the full happy path is usable without developer assistance;
- permissions are enforced in both presentation and backend operations;
- the failure, stale, and retry paths are understandable and safe;
- draft/public, locale, route, relation, asset, history, and audit invariants hold;
- public website behavior agrees with Studio’s preview and outcome;
- the workflow works with keyboard, assistive technology, and supported narrow layouts;
- user-facing language is calm and editorial while advanced diagnostics remain available;
- focused automated tests and at least one realistic browser verification provide evidence.
