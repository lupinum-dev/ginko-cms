# UI-REVISION.md Reconciliation Audit

Branch: `studio-shadcn-shell` · Date: 2026-07-15 · Read-only audit of `packages/cms/studio-app/src` + locales + git history.

## Key structural facts established up front

- **`/studio/imports` (imports.vue) was deleted** in commit `e4d8a006` ("feat!: add deterministic draft import"). The 447-line page, `lib/importRuns.ts`, `contract/src/schemas/imports.ts`, and the `imports.ts` Convex template were all removed and replaced by a `portability` command layer. There is **no imports route and no imports page** on the current branch. → The entire _Content Imports Revision_ section is **OBSOLETE**.
- **`/studio/model` now renders `collections.vue`** (route path `/model`, route name `studio-collections`; `router.ts:27-35`). `/collections` redirects to `/model`. So "Content model" → "Content setup" was implemented by renaming the page component to `collections.vue`, not by adding a new page. There is no separate `model.vue`.
- Right-sidebar panel system (`useRightSidebarPanel`) replaced the retired in-card action rails; entry status rail, collection details, create guidance, review details, and asset details are now right-sidebar panels. Several doc criteria phrased around "rails/status rail" are satisfied through panels → noted as **OBSOLETE (superseded, satisfied via panel)** where applicable.

---

## Global Navigation Changes (P0/P1 table)

| Criterion                                                           | Status                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 Add a visible `Home` sidebar item instead of relying on the logo | **REGRESSED**              | `StudioSidebarNav.vue` renders only Content(collections)/Editor/Operations/Settings groups; `sectionLinks()` handles only `editor\|operations\|settings` (lines 67-82). The `home` route (`studioNavigation.ts:26-33`, section `'home'`) is **never rendered as a nav link**. The only sidebar affordance to reach Home is the brand/logo row (`StudioSidebar.vue:37-53`, RouterLink to `studio-home`). This is exactly the "relying on the logo" state P0 set out to remove. Brand row does carry `aria-label="Ginko CMS Studio home"`, and command palette lists "Home", so it is reachable — but the discrete visible nav item is gone. |
| P0 Move `Assets` out of `Manage`, label `Media`                     | **MET**                    | `assets` route section `'editor'` (`studioNavigation.ts:44-51`); `assetsPage.title: 'Media'` (en.ts:244); `assets.vue` eyebrow `layout.editor`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P0 Rename `Reviews` → `Approvals`                                   | **MET**                    | `reviewsPage.title: 'Approvals'` (en.ts:904); `reviews.vue:114`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P0 Move Content model/Imports/Activity/Agents into Operations       | **MET (Imports OBSOLETE)** | `collections`, `activity`, `agents` all section `'operations'` (`studioNavigation.ts:61-87`). Imports no longer exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P0 Stop showing Activity/Agents to everyone; gate by capability     | **MET**                    | Both require `manageSettings` (`studioNavigation.ts:77,86`); nav filters via `canAccessRoute` (`StudioSidebarNav.vue:63-66`); pages also guard (`activity.vue:84`, `agents.vue:104`).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P1 Rename `Site data` → `Site-wide content` (editor-owned)          | **MET**                    | `siteDataPage.title: 'Site-wide content'` (en.ts:276); `site-data.vue` eyebrow `layout.editor`. Placed in Editor group.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P1 Replace singleton `1` badge with icon+tooltip / accessible text  | **OBSOLETE**               | The old numeric singleton badge is gone entirely in the migrated `StudioSidebarNavLink.vue` (icon+label only); no singleton marker rendered. `layout.singletonBadge:'single'` locale exists but is unused in nav. Confusing "1" removed → concern moot.                                                                                                                                                                                                                                                                                                                                                                                    |
| P1 Command palette ranks content/media/approvals before operations  | **MET**                    | `CmsCommandPalette.vue`: recent → content search group (`heading Content`, lines 276) → static links group (302). Static links ordered by `studioStaticRoutes` array (editor routes assets/reviews precede operations collections/activity/agents).                                                                                                                                                                                                                                                                                                                                                                                        |

Note: `siteData` route requires `manageSettings` capability (`studioNavigation.ts:41`), which is stricter than "editor-owned content." Editors without settings access won't see Site-wide content — mild tension with the role-based visibility intent, but not a doc acceptance failure.

---

## Home / Work Queue Revision

| Criterion                                                                                                                         | Status            | Evidence                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename title `Content operations` → `Home`/`Work queue`                                                                           | **MET**           | `dashboard.title:'Work queue'` (en.ts:202); eyebrow `layout.home:'Home'`.                                                                                                                                                                                |
| Eyebrow `Dashboard` → `Today`/remove                                                                                              | **MET**           | Eyebrow is `layout.home`; a "Today" sub-header section exists (`today:'Today'`, en.ts:208; index.vue:486).                                                                                                                                               |
| Description replaced                                                                                                              | **MET**           | `headerDescription` exactly matches doc text (en.ts:204-205).                                                                                                                                                                                            |
| Remove `Content model` & `Imports` from quick links                                                                               | **MET**           | `quickLinks` filters to `['siteData','assets','reviews']` only (index.vue:369-378).                                                                                                                                                                      |
| Add quick links New content/Media/Approvals                                                                                       | **PARTIAL**       | Quick links = Site-wide content, Media, Approvals (reviews gated by publish). No explicit "New content"/first-create quick link in the header actions.                                                                                                   |
| `Needs attention` in editorial terms                                                                                              | **MET**           | Work-queue row with editorial description (index.vue:190-198).                                                                                                                                                                                           |
| Rename `Changed drafts`→`Drafts to continue`                                                                                      | **MET (variant)** | Row label "Continue editing" + "Continue editing" section (index.vue:210,660).                                                                                                                                                                           |
| Rename `Translations`→`Missing translations`                                                                                      | **MET (variant)** | "Missing languages" row (index.vue:220).                                                                                                                                                                                                                 |
| Rename `Revalidation`→`Website refresh`, out of metric row unless failing                                                         | **MET**           | "Website refresh" row only pushed when `failedRevalidation>0` or not-ready (index.vue:252-261).                                                                                                                                                          |
| `Import blockers` row only when non-zero                                                                                          | **OBSOLETE**      | Imports removed; no import row on home.                                                                                                                                                                                                                  |
| Replace 5 equal metric cards with prioritized queue                                                                               | **MET**           | Row-based `Today` queue (index.vue:492-518) + workflow path + sections, no equal metric-card grid.                                                                                                                                                       |
| Numbers attached to a visible row/action                                                                                          | **MET**           | Each row is a RouterLink with value + destination.                                                                                                                                                                                                       |
| Move `System health` into collapsed Operations status / Operations                                                                | **MET (variant)** | No System-health metric panel; replaced by "Track website updates" aside using website-refresh language (index.vue:809-861).                                                                                                                             |
| Rename `Content inventory`→`Content overview`                                                                                     | **MET**           | Section title "Content overview" (index.vue:761).                                                                                                                                                                                                        |
| Overview: `Mode`→`Website use`; Route-backed/Data-only relabel                                                                    | **MET**           | Column "Website use"; `routeModeLabel`→'Website pages'/'Shared data' (index.vue:431-433,772).                                                                                                                                                            |
| Hide raw `collection.type` unless details opened                                                                                  | **REGRESSED**     | `collection.type` is rendered raw as the sub-label under every collection name in the overview table (index.vue:788: `{{ collection.type }}`). The doc's own status section claimed this was hidden; the migrated table surfaces it on the first screen. |
| Acceptance: no `Content model`/`Convex`/`revalidation`/`operation`/`importRunId`/`schema`/`projection`/`JSON` in primary viewport | **MET**           | Visible copy uses website-facing language; `revalidation`/`failedRevalidation` appear only as JS identifiers, not rendered text.                                                                                                                         |

---

## Content Lists Revision (`/studio/content/:collection`)

| Criterion                                                 | Status  | Evidence                                                                                                                            |
| --------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------ |
| Keep collection lists primary                             | **MET** | Collections listed in sidebar Content group; `[collection]/index.vue`.                                                              |
| Website-facing collection labels                          | **MET** | `collectionLabel` from model (index.vue:58-61).                                                                                     |
| Row title = content title not slug/id                     | **MET** | `row.title                                                                                                                          |     | row.slug` (index.vue:691,778). |
| Technical slug/id in secondary disclosure                 | **MET** | Path shown as secondary mono text; no raw id in row.                                                                                |
| Columns Title/Public state/Locale/Last edited/Next action | **MET** | Header row Content/Languages/Live status/Next action/Edited/Edit (index.vue:751-756).                                               |
| Prefer rows over metric cards                             | **MET** | Row/table layout.                                                                                                                   |
| Empty state has next action                               | **MET** | Empty state with "New content" action (index.vue:610-626).                                                                          |
| Singleton opens entry / single-row copy                   | **MET** | `watchEffect` redirects singleton to first entry or `/new` (index.vue:221-233).                                                     |
| Filters use editor language                               | **MET** | Status (Draft/Published/Archived) + work state (All work/Drafts to continue/Needs attention/Missing languages) (index.vue:560-570). |
| Rename `New entry`→`New content`                          | **MET** | `collectionListPage.newEntry:'New content'` (en.ts:660).                                                                            |
| Demote flat/tree → List/Hierarchy                         | **MET** | Badge shows `typeTree:'Hierarchy'`/`typeFlat:'List'` (en.ts:320-321; index.vue:503-506).                                            |
| Acceptance: no raw id in first row unless title missing   | **MET** | Only title/slug/path rendered.                                                                                                      |

---

## New Content Revision (`/studio/content/:collection/new`)

| Criterion                                        | Status  | Evidence                                                                                                                   |
| ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| One primary action `Create draft`                | **MET** | New-mode top bar has a single "Create draft" button (`StudioEntryTopBar.vue:226-231`).                                     |
| After creation route to editor                   | **MET** | `handleCreate` routes to `${contentRoute}/${collection}/${entryId}` (new.vue:447-452).                                     |
| Publish only in entry editor                     | **MET** | Comment + code confirm create-and-publish now routes to edit; `createAndPublish` locale also = 'Create draft' (en.ts:695). |
| No misleading "Create and publish"               | **MET** | Both handlers create a draft; no publish-on-create.                                                                        |
| Acceptance: creating never looks like publishing | **MET** | Single draft action; StudioNotice explains translations after create.                                                      |

---

## Entry Editor Revision (`/studio/content/:collection/:id`)

| Criterion                                                                                         | Status                             | Evidence                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep Save draft/Preview/Publish in top actions                                                    | **MET**                            | `StudioEntryTopBar` edit mode: save indicator, Save draft, publish affordances (`StudioEntryTopBar.vue:234+`).                                |
| Keep right status rail                                                                            | **OBSOLETE (satisfied via panel)** | Status rail became `StudioEntryDetailsPanel` right-sidebar panel, `defaultOpen:true` ([id].vue:39-45).                                        |
| Compare mode, default single locale                                                               | **MET**                            | `StudioEntryCompareToolbar`; compare/side-by-side locale keys present.                                                                        |
| `public output`→`published website`/`website output`                                              | **MET**                            | Publish dialog/outcome copy uses "published to the website"/"Website changes" (en.ts:769,787-789); no visible "public output".                |
| `revalidation`→`website refresh`                                                                  | **MET**                            | `websiteRefresh.*` + publishOutcomeRefresh\* copy (en.ts:472-476,799-804).                                                                    |
| Publish dialog shows affected pages/locales/blockers/draft age/refresh                            | **MET**                            | publishDialog* + publishOutcome* keys (en.ts:759-804).                                                                                        |
| Hide entry id/operation ids/versions/preview hash/cache tags/events/payloads in Developer details | **MET**                            | `StudioPublishImpactSummary.vue:197-234` wraps cacheTags + events in `StudioDeveloperDetails`; version detail via `StudioVersionHistoryCard`. |
| Destructive actions gated by confirmation; website-impact wording                                 | **MET**                            | Global confirm dialog primitives; publish/version restore prompts reference website impact (en.ts:737-749).                                   |
| Preserve DebugPanel as explicit diagnostics, not default                                          | **MET**                            | Rendered only `v-if="showDebug && !isFocusMode"`; `showDebug=settings.enableDebug` (Editor.vue:94,824).                                       |
| Acceptance: first viewport is form+publish state, not diagnostics                                 | **MET**                            | Debug gated off by default.                                                                                                                   |

---

## Media / Assets Revision (`/studio/assets`)

| Criterion                                                     | Status            | Evidence                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nav label `Media`                                             | **MET**           | en.ts:244; assets.vue eyebrow Editor.                                                                                                                                                                                              |
| `Full View`→`Library views`                                   | **MET**           | `StudioAssetBrowser.vue:742`, `StudioAssetMobileScopes.vue:42`.                                                                                                                                                                    |
| `Global`→`Shared library`                                     | **MET**           | Scope option label "Shared library" (`StudioAssetBrowser.vue:264,188`). Internal var names still `global` (not user-visible).                                                                                                      |
| `Share in Collection`→`Make available to this collection`     | **MET**           | `StudioAssetBrowser.vue:1022,1712,2049`.                                                                                                                                                                                           |
| `Make Global`→`Make available everywhere`                     | **MET**           | `StudioAssetBrowser.vue:1032,1723,2060`.                                                                                                                                                                                           |
| Primary actions Upload/Replace/Copy URL/Edit alt              | **MET**           | Asset metadata form + browser actions; alt text fields (en.ts:262-263).                                                                                                                                                            |
| Hide storage keys/bucket/raw URLs/ids under Developer details | **MET (assumed)** | Asset details panel surfaces filename/size/type/alt; storage internals not primary.                                                                                                                                                |
| Empty state explains next action                              | **MET**           | `emptyDescription:'Upload images and files used by website content.'` (en.ts:255).                                                                                                                                                 |
| Deletion shows usage impact before storage details            | **PARTIAL**       | Delete dialog warns "permanently deletes the file and its details" + "cannot be undone" (en.ts:266-270) but no explicit usage-impact summary (usage tracking not added, consistent with the doc's "do not add projection" caveat). |

---

## Website Data Revision (`/studio/site-data`) — decided editor-owned

| Criterion                                                                     | Status            | Evidence                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename `Site data`→`Site-wide content`                                        | **MET**           | en.ts:276.                                                                                                                                                                                                                            |
| Forms/content labels not database labels                                      | **MET**           | siteDataPage copy uses sections/content wording.                                                                                                                                                                                      |
| Explain singleton/global records                                              | **MET (partial)** | Description "global website content shared across pages"; emptyDescription lists examples (en.ts:277,283-284).                                                                                                                        |
| Rename `block`→`section`                                                      | **MET**           | blocksCount/newBlock/createBlock all say "section(s)" (en.ts:278-296).                                                                                                                                                                |
| Rename `Public API`→`Shown on website`                                        | **MET**           | `publicApi:'Shown on website'` (en.ts:287).                                                                                                                                                                                           |
| Hide raw keys/ids/provider names/Custom JSON under Advanced/Developer details | **PARTIAL**       | `site-data.vue:307-320` has a `StudioDeveloperDetails` block; but `Custom JSON` editing (`siteDataEditor.customJson`, en.ts:312) is rendered in `StudioSiteDataEditor.vue` as an inline field, not gated behind Advanced. Minor leak. |
| Acceptance: nav label makes content-vs-system clear                           | **MET**           | "Site-wide content" under Editor group.                                                                                                                                                                                               |

---

## Content Setup Revision (`/studio/model` → `collections.vue`)

| Criterion                                                                                          | Status                           | Evidence                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename nav `Content model`→`Content setup`                                                         | **MET**                          | `collectionsPage.title:'Content setup'` (en.ts:315).                                                                                                                                                 |
| Move route under Operations                                                                        | **MET**                          | `collections` section `'operations'` (`studioNavigation.ts:64`).                                                                                                                                     |
| Header eyebrow Operations / title Content setup / description                                      | **MET**                          | collections.vue:26-30 (eyebrow `layout.operations`, headerDescription en.ts:316-317).                                                                                                                |
| Replace `Code-defined collections` badge → `Managed by developers` (details: Defined in code)      | **MET (partial)**                | Badge text `codeDefinedBadge:'Managed by developers'` (en.ts:318; collections.vue:35-37). Badge still always visible in header (not moved to details) but text is editor-friendly.                   |
| Rename `Collection contracts`→`Content types`; `Collection contract`→`Content type details`        | **MET**                          | `noCollections:'No content types'`, `collectionSettings:'Content type details'` (en.ts:319,333); section component `StudioCollectionContractSection` (internal name) renders "Content type details". |
| First list shows label/description/single-multiple/website use/locales/entry count/setup status    | **MET (assumed via list panel)** | `StudioCollectionsListPanel` + list items; supportedLocales, fieldsCount, type labels present.                                                                                                       |
| Field detail shows label/purpose/required/localization/input type                                  | **MET**                          | `StudioCollectionFieldsSection`; field keys deferred to details.                                                                                                                                     |
| Field keys/schema types/route patterns/model version/contract ids/Convex sync in Developer details | **MET**                          | `StudioCollectionContractSection.vue` uses `StudioDeveloperDetails`.                                                                                                                                 |
| Replace `Convex has not synced…` → `Content setup is still installing…`                            | **MET**                          | `installingTitle`/`installingDescription` (en.ts:326-328); shown via StudioNotice (collections.vue:47-52).                                                                                           |
| Mobile master/detail with back button                                                              | **MET**                          | Responsive `ginko:hidden ginko:lg:flex` list/detail split + `backToList` button `ginko:lg:hidden` (collections.vue:58-97).                                                                           |
| Acceptance: first viewport is labels+setup status, not contracts/runtime                           | **MET**                          | Editor-facing list; developer detail disclosed.                                                                                                                                                      |

---

## Content Imports Revision (`/studio/imports`)

**Entire section OBSOLETE.** The imports page and its data layer were removed in commit `e4d8a006` and replaced by a deterministic draft-import `portability` command layer (`packages/cms/src/portability/*`, `templates/convex/ginkoCms/portability.ts`). No route (`router.ts` has no `/imports`), no page, no `importRunId` UI. Every acceptance criterion and backlog item under this section is void because the surface no longer exists. (Storage diagnostics still reference "Import runs" as a stored-row count in settings — en.ts:418 — but that is a footprint metric, not the imports page.)

---

## Approvals Revision (`/studio/reviews`)

| Criterion                                                                                       | Status  | Evidence                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Rename nav+title `Approvals`                                                                    | **MET** | en.ts:904; reviews.vue:114.                                                                                                                |
| Eyebrow `Agent review`→`Publishing`                                                             | **MET** | eyebrow `layout.publishing:'Publishing'` (reviews.vue:115; en.ts:159).                                                                     |
| Description "Review pending website changes…"                                                   | **MET** | en.ts:905.                                                                                                                                 |
| Card primary: title/summary/type/entry/locales/pages/requested by/time/stale                    | **MET** | Card shows status pills, title, summary, affected locales, requested, requested-by (reviews.vue:184-271).                                  |
| Remove `operationId` from card header                                                           | **MET** | Header badges are Pending/Out of date/status/source only.                                                                                  |
| `Agent run`→`Requested by agent`, raw id in details                                             | **MET** | `requestSourceLabel`; operationId as `requestId` only inside Developer details (reviews.vue:351-357).                                      |
| `Target entry` id→linked title                                                                  | **MET** | entryId only in Developer details (reviews.vue:361-363).                                                                                   |
| `Expected version`→`Based on current draft`/`Outdated request`                                  | **MET** | Confirm dialog shows `currentDraftRequest`/`outOfDateRequest` (reviews.vue:313-317).                                                       |
| Replace raw preview JSON with `What will change` summary; raw JSON wrapped in Developer details | **MET** | `StudioReviewDetail.vue` shows whatChanged/field summaries; `formatJson(request.preview)` (line 305) sits inside `StudioDeveloperDetails`. |
| Approve opens confirmation with website impact                                                  | **MET** | `requestApprovalConfirmation`→Dialog with locales/version state/publish impact/requester/time + staleReason notice (reviews.vue:277-373).  |
| Stale requests cannot be approved                                                               | **MET** | Approve button `:disabled` on `request.isStale` in card (line 228) and dialog (line 380-384).                                              |
| Acceptance: no ids/versions/JSON in first card                                                  | **MET** | All raw data behind Developer details.                                                                                                     |

---

## Activity Revision (`/studio/activity`)

| Criterion                                                     | Status            | Evidence                                                                                                                                              |
| ------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decide label `Recent changes`/`Activity log`                  | **MET**           | `activityPage.title:'Activity log'`, operational, eyebrow Operations (activity.vue:63-64).                                                            |
| Row copy who/what/content/when/publish effect                 | **MET**           | `displaySummary` rows, collection badge, timestamp, entry link (activity.vue:141-186).                                                                |
| Hide event kind/id/operation id/payload/raw locale in details | **MET**           | kind/locale/raw summary inside `StudioDeveloperDetails` (activity.vue:159-173).                                                                       |
| Home shows few human-readable recent changes + link           | **MET (partial)** | Home "Latest CMS activity" uses `displaySummary` (index.vue:907-923); no explicit "view all" link to /activity but content is concise/human-readable. |
| Acceptance: rows read like content history                    | **MET**           | displaySummary-first.                                                                                                                                 |

---

## Agent Runs Revision (`/studio/agents`)

| Criterion                                                          | Status            | Evidence                                                                                                                                 |
| ------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Move Agents into Operations                                        | **MET**           | section `'operations'` (`studioNavigation.ts:83`).                                                                                       |
| Gate by operational/admin capability                               | **MET**           | requires `manageSettings` (studioNavigation.ts:86; agents.vue:104).                                                                      |
| Rename to `Agent sessions`/`Agent runs`                            | **MET (variant)** | `agentsPage.title:'AI work sessions'` (en.ts:894) — editor-friendly variant.                                                             |
| Don't surface agent run state in primary editor nav                | **MET**           | Not in editor group; publish requests surface via Approvals.                                                                             |
| Agent publish requests surface through Approvals                   | **MET**           | reviews list includes `requestSource==='agent'` (index.vue/reviews).                                                                     |
| Rename `Revoke`→`End session`                                      | **UNMET**         | Button label is hardcoded "Revoke" (`agents.vue:246`); error string "Failed to revoke agent run." (line 74). No `endSession` locale key. |
| Keep raw ids/keys/user/scopes in Developer details                 | **MET**           | run id/key/user in `StudioDeveloperDetails` (agents.vue:185-200); `scopeSummary` says "permissions" (line 62-65).                        |
| Acceptance: editors approve agent content without visiting /agents | **MET**           | Approvals surfaces AI-prepared requests.                                                                                                 |

---

## Settings Revision (`/studio/settings`)

| Criterion                                                                                               | Status            | Evidence                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split into job-based sections                                                                           | **MET (mostly)**  | Sections: People and access, Appearance, Localization, Website connections, Advanced system (settings.vue:56-128).                                                                                            |
| Dedicated `Media and storage` section                                                                   | **UNMET**         | No Media/storage section (upload limits, allowed file types, storage usage). Storage appears only as `StudioSettingsStorageSection` (diagnostics) under Advanced system. Phase 3 checkbox claimed this split. |
| `People and access` section                                                                             | **MET**           | Members section (settings.vue:57-69).                                                                                                                                                                         |
| `Localization` section                                                                                  | **MET**           | Language + Locales sections (settings.vue:85-98).                                                                                                                                                             |
| `Website connections` section                                                                           | **MET**           | Configuration section (settings.vue:100-112).                                                                                                                                                                 |
| `Advanced system` section                                                                               | **MET**           | MCP + Revalidation + Storage (settings.vue:114-128).                                                                                                                                                          |
| Use rows/grouped sections, not status-card grids                                                        | **MET**           | Grouped `<section>` with divide-y.                                                                                                                                                                            |
| Revoked credentials behind `Show revoked`                                                               | **MET (assumed)** | `StudioSettingsMcpConnectionsSection` tracks non-active count for a revoked toggle; revoke uses confirm dialog (component lines 14,22-33).                                                                    |
| Redact credential values / long ids                                                                     | **MET**           | secret redaction util used app-wide; mcp key shown once.                                                                                                                                                      |
| Destructive actions gated                                                                               | **MET**           | Revoke MCP connection uses confirmation dialog.                                                                                                                                                               |
| Move endpoint URLs/tokens/env names/job ids/paths/tags/table counts/Studio route into Developer details | **MET (mostly)**  | Configuration/Storage/MCP sections use `StudioDeveloperDetails`; `studioRoute`/`collectionsConfigured` labels present.                                                                                        |
| `revalidation`→`website refresh` in settings                                                            | **MET**           | Section titled "Website refresh"; `websiteRefreshStatusLabel` (StudioSettingsRevalidationSection.vue:12,22,132).                                                                                              |
| `MCP connections`→`AI agent connections` primary, MCP in details                                        | **UNMET/PARTIAL** | Heading is "MCP connections for AI tools" (StudioSettingsMcpConnectionsSection.vue:49) — MCP still primary rather than "AI agent connections".                                                                |
| `Storage hygiene`→`Storage diagnostics`                                                                 | **MET**           | `storageHygiene:'Storage diagnostics'` (en.ts:401).                                                                                                                                                           |
| `Scopes`→`Permissions`                                                                                  | **MET**           | `scopes:'Permissions'` (en.ts:460); agents scopeSummary "permissions".                                                                                                                                        |
| Acceptance: editor finds people/localization/website settings without operational internals             | **MET**           | Sections ordered people→appearance→localization→website→advanced.                                                                                                                                             |

---

## Terminology Replacements table

| Term                                                           | Status            | Evidence                                                                |
| -------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `Content operations`→`Home`/`Work queue`                       | MET               | en.ts:202.                                                              |
| `Dashboard`→`Today`/remove                                     | MET               | eyebrow Home + Today sub-header.                                        |
| `Manage`→`Operations`/job label                                | MET               | Group labels Editor/Operations/Settings; `manage` locale unused in nav. |
| `Content model`→`Content setup`                                | MET               | en.ts:315.                                                              |
| `Collection contracts`→`Content types`                         | MET               | en.ts:319,333.                                                          |
| `Collection contract`→`Content type details`                   | MET               | en.ts:333.                                                              |
| `Code-defined`→`Managed by developers`/in details              | MET               | en.ts:318.                                                              |
| `Convex has not synced…`→`Content setup is still installing…`  | MET               | en.ts:326-328.                                                          |
| `public output`→`published website content`/`website output`   | MET               | en.ts:769,787.                                                          |
| `revalidation`→`website refresh`                               | MET               | en.ts:472-476.                                                          |
| `Route-backed`→`Has website pages`                             | MET (variant)     | 'Website pages' (index.vue:433).                                        |
| `Data-only`→`Used as shared data`                              | MET (variant)     | 'Shared data'.                                                          |
| `Path prefix`→`URL prefix`                                     | MET               | en.ts:329.                                                              |
| `Agent review`→`Approvals`/`Publish review`                    | MET               | en.ts:904.                                                              |
| `operationId`→`Request id` (details)                           | MET               | reviews.vue:355.                                                        |
| `agentRunId`→`Agent run id` (details)                          | MET               | agents Developer details.                                               |
| `Target entry`→linked content title                            | MET               | reviews entryId in details only.                                        |
| `Expected version`→`Based on current draft`/`Outdated request` | MET               | reviews.vue:313-317.                                                    |
| `Stale`→`Out of date`                                          | MET               | en.ts:908; reviews.                                                     |
| `Preview` in reviews→`Proposed changes`                        | MET               | `proposedChanges` (en.ts:916).                                          |
| `Import result JSON`→`Developer details: raw import result`    | OBSOLETE          | imports removed.                                                        |
| `filesystem: content @ posts`→`Posts from filesystem content`  | OBSOLETE          | imports removed.                                                        |
| `Apply` in imports→`Import`                                    | OBSOLETE          | imports removed.                                                        |
| `Import run`→`Import`                                          | OBSOLETE          | imports removed.                                                        |
| `Inspector only`→remove/`Operations`                           | OBSOLETE          | imports removed.                                                        |
| `Agent run`→`Agent session`                                    | MET (variant)     | "AI work sessions"/"AI work".                                           |
| `Revoke` for agent session→`End session`                       | **UNMET**         | agents.vue:246 hardcoded "Revoke".                                      |
| `MCP connections`→`AI agent connections` primary               | **UNMET/PARTIAL** | "MCP connections for AI tools".                                         |
| `Scopes`→`Permissions`                                         | MET               | en.ts:460.                                                              |
| `Storage hygiene`→`Storage diagnostics`                        | MET               | en.ts:401.                                                              |
| `Invalidation job`→`Refresh job`                               | MET (variant)     | "Website refresh" used; no "Invalidation job" text remains.             |
| `projection`/`Projection batch`/`cache tags` hidden            | MET               | cacheTags in Developer details (StudioPublishImpactSummary).            |
| `Debug Timeline`→`Editor diagnostics`                          | MET               | DebugPanel.vue:22.                                                      |
| `Export Debug`→`Export diagnostics`                            | MET               | DebugPanel.vue:42; Editor.vue:714.                                      |
| `Full View`→`Library views`                                    | MET               | asset browser.                                                          |
| `Global` in media→`Shared library`                             | MET               | asset browser.                                                          |
| `Share in Collection`→`Make available to this collection`      | MET               | asset browser.                                                          |
| `Make Global`→`Make available everywhere`                      | MET               | asset browser.                                                          |
| `Site data`→`Site-wide content`                                | MET               | en.ts:276.                                                              |
| `block` in site-data→`section`                                 | MET               | en.ts:278-296.                                                          |
| `Public API` in site-data→`Shown on website`                   | MET               | en.ts:287.                                                              |

---

## Editor Diagnostics and Debug Export

| Criterion                                   | Status | Evidence                                                                                    |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `Debug Timeline`→`Editor diagnostics`       | MET    | DebugPanel.vue:22.                                                                          |
| `Export Debug`→`Export diagnostics`         | MET    | DebugPanel.vue:42; Editor.vue:714.                                                          |
| Panel gated behind advanced/diagnostic mode | MET    | `showDebug=settings.enableDebug` (Editor.vue:94,708,824).                                   |
| Warning copy before export                  | MET    | "Diagnostics may include unpublished content and editor state." (DebugPanel.vue:26).        |
| Redact token/auth/session before export     | MET    | `useDebugExport.ts:37-56` `redactDebugValue` recursively redacts via secretRedaction utils. |
| Timeline not in first editor viewport       | MET    | Gated off by default.                                                                       |

---

## Security and Privacy Rule

| Criterion                                                              | Status | Evidence                                                                |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| No secrets/tokens/session in normal Studio screens                     | MET    | `secretRedaction` utils; mcp key one-time reveal.                       |
| Raw payloads dev-only/capability-gated, redacted, in Developer details | MET    | Debug gated; redaction on export; ids/JSON in `StudioDeveloperDetails`. |

---

## Role-Based Visibility

| Criterion                                                   | Status       | Evidence                                                                                   |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Editor default nav = Home/Content/Media/Site-wide/Approvals | MET (mostly) | Nav gates by capability; Site-wide requires manageSettings (stricter than "editor-owned"). |
| No operational routes as first-level nav without permission | MET          | collections/activity/agents require capabilities.                                          |
| Permissions hide nav AND guard routes                       | MET          | Nav filter + page-level `accessRequired` empty states (activity.vue:84, agents.vue:104).   |

---

## Implementation Phases

| Phase / task                                                                                                     | Status                                                    | Evidence                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0** Add Home item                                                                                        | **REGRESSED**                                             | See Global nav P0 above — Home is not a discrete nav item; relies on brand row.                 |
| Phase 0 Media in primary nav                                                                                     | MET                                                       | Editor group.                                                                                   |
| Phase 0 Reviews→Approvals                                                                                        | MET                                                       | en.ts:904.                                                                                      |
| Phase 0 Move setup/imports/activity/agents to Operations; gate                                                   | MET (imports obsolete)                                    | studioNavigation sections.                                                                      |
| Phase 0 Apply terminology table                                                                                  | MET (except Revoke→End session, MCP→AI agent connections) | see terminology table.                                                                          |
| **Phase 1** Home rename/remove quick links/queue/health/columns/recent                                           | MET (raw collection.type regressed)                       | index.vue.                                                                                      |
| **Phase 2** model→setup / imports outcome-first / reviews→Approvals / ids-JSON to details / mobile master-detail | MET for model+reviews; **imports OBSOLETE**               | collections.vue, reviews.vue.                                                                   |
| **Phase 3** Promote Media / decide site-data / split settings / hide revoked                                     | MET except **Media/storage settings section UNMET**       | assets, site-data, settings.vue.                                                                |
| **Phase 4** Responsive/a11y pass                                                                                 | MET (assumed)                                             | master/detail responsive classes, keyboard-accessible disclosures, status pills not color-only. |
| **Phase 5** Tests/check/impeccable/browser                                                                       | Not re-verifiable in this read-only audit                 | doc-claimed [x]; not re-run.                                                                    |

---

## Page-Level Backlog

| Item                                            | Status                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Global: Add Home nav item                       | **REGRESSED**                                                 |
| Global: Promote Media                           | MET                                                           |
| Global: Move Operations links out of editor nav | MET                                                           |
| Global: Rename Reviews→Approvals                | MET                                                           |
| Global: Gate Activity/Agents                    | MET                                                           |
| Global: Standardize Developer details           | MET (shared `StudioDeveloperDetails`, sole `<details>` owner) |
| Global: Apply terminology                       | MET (2 gaps: End session, AI agent connections)               |
| Global: Redact sensitive debug                  | MET                                                           |
| /studio (all 6 items)                           | MET except raw collection.type (REGRESSED)                    |
| /studio/content/:collection (5)                 | MET                                                           |
| /studio/content/:collection/:id (4)             | MET                                                           |
| /studio/assets (4)                              | MET                                                           |
| /studio/site-data (3)                           | MET (Custom JSON not gated — partial)                         |
| /studio/model (6)                               | MET                                                           |
| /studio/imports (6)                             | **OBSOLETE** (page removed)                                   |
| /studio/reviews (5)                             | MET                                                           |
| /studio/activity (3)                            | MET                                                           |
| /studio/agents (3)                              | MET (Revoke→End session pending)                              |
| /studio/settings (4)                            | MET (Media/storage section UNMET)                             |

---

## REGRESSED items rollup (highest value)

1. **Home nav item removed — reverted to logo-as-home (Phase 0 / P0).** `StudioSidebarNav.vue` renders no discrete "Home" link; the `home` route in `studioNavigation.ts` is defined (section `'home'`) but never emitted because `sectionLinks()` only iterates `editor/operations/settings`. Reaching Home now depends on the brand/logo row (`StudioSidebar.vue:37-53`) — precisely the state P0 set out to eliminate. The shadcn shell's team-switcher brand row reintroduced the pattern. Mitigations present: aria-label on brand row + "Home" in command palette. Fix: add the `home` route as a rendered SidebarMenu item (or a dedicated top-of-nav link).

2. **Raw `collection.type` re-exposed on the Home "Content overview" table.** `index.vue:788` renders `{{ collection.type }}` as the sub-label under every collection name. The doc status explicitly claimed this implementation term was hidden behind details; the migrated table surfaces it on the first editor screen, contradicting the Home acceptance ("no schema/implementation terms in the primary viewport").

---

## UNMET high-value items rollup

1. **`Revoke`→`End session` on the Agents page (terminology + Agent Runs Revision).** `agents.vue:246` still shows a hardcoded "Revoke" button and "Failed to revoke agent run." error; no `endSession` locale key exists. Editor-facing wording for ending an active AI session was never applied.

2. **`MCP connections`→`AI agent connections` primary label (Settings + terminology).** `StudioSettingsMcpConnectionsSection.vue:49` heads the section "MCP connections for AI tools" — MCP remains the primary term instead of "AI agent connections" with MCP relegated to details.

3. **Dedicated `Media and storage` settings section (Phase 3).** Settings has no section for upload limits / allowed file types / storage usage; only `StudioSettingsStorageSection` (diagnostics) exists under Advanced system. The Phase-3 checkbox claiming this split is not reflected in code.

4. **Home "New content" / first-create quick link (Home Required changes).** Header quick links are Site-wide content / Media / Approvals; the intended create action ("New content" / first available create) is absent from the Home header.

5. **Site-data `Custom JSON` not gated behind Advanced/Developer details (Website Data Revision).** `StudioSiteDataEditor.vue` renders the customJson field inline rather than under a disclosure.

## OBSOLETE (superseded by shell migration or feature removal)

- Entire **Content Imports Revision** + all `/studio/imports` backlog/terminology rows — page and data layer deleted in `e4d8a006`, replaced by portability CLI.
- **Entry status rail**, **collection action rail**, **create/asset/review detail rails** — replaced by `useRightSidebarPanel` panels; doc "rail" wording satisfied via panels.
- **Singleton `1` badge** rework — the numeric badge was removed entirely in the migrated sidebar nav link; no marker to make accessible.
