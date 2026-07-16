# Audit C — Vocabulary & i18n Consistency (Ginko CMS Studio)

Repo: `/Users/matthias/Git/workspace/ginko-cms` · branch `studio-shadcn-shell` · READ-ONLY
Scope: `packages/cms/studio-app/src` (pages + components/studio) and locale packs
`packages/cms/src/public/locales/{en,de}.ts`. Reference: `UI-REVISION.md`
(Goal §5–29, Terminology Replacements ~L860).

Severity: **high** = user-visible untranslated block or wrong-persona internals in
primary UI · **med** = terminology drift / partial i18n · **low** = tone, dead keys,
cognate DE values.

---

## Summary table

| Class                | Finding count                                                                       | Worst offenders                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1. Hardcoded strings | ~50 literal attrs + ~120 text nodes across ~20 files                                | `StudioAssetBrowser`, `StudioPublishImpactSummary`, `StudioEntry*` rail, `StudioSettingsRevalidationSection`                        |
| 2. Terminology drift | 9 clusters                                                                          | `assetDetails`=“Asset details” on Media page; MCP-in-primary; `Stale`; `MDC`; `entry`                                               |
| 3. Editor-safe leaks | 6                                                                                   | `MDC Markdown`, `code-defined collection config`, `Custom JSON`, `Technical receipt`, `Review collection config`, `site-data reads` |
| 4. en/de parity      | keys: **clean (910=910)**; 0 missing/extra. ~10 DE values English (mostly cognates) | `Events`, `Global`                                                                                                                  |
| 5. Tone              | dominant = sentence-case + terminal period                                          | `Display Name`, `Studio Language`, 2 period-less descriptions                                                                       |

**Headline:** key parity is perfect and the locale terminology cutover largely landed
in `en.ts`/`de.ts`. The real gap is **whole editor-rail and asset-browser components
that never call `t()`** — the Phase 4/5 right-sidebar port shipped with hardcoded
English. Seven studio components have `i18n=0`.

---

## Class 1 — Hardcoded user-visible strings (not wired through `t()`)

### Components with ZERO i18n (entire template hardcoded) — HIGH

These import no `useCmsI18n`/`t`; every visible string is a literal:

- `components/studio/editor/StudioPublishImpactSummary.vue` — high — e.g. L130 “Previewing website changes...”, L159 “Website preview”, L206 “Website refresh targets”, L221 “Website refresh messages”, L285 “Live website content after publish”, L315/323 “Before”/“After”, L370 “Website visibility”, L429 “Other website changes”, L202 `title="Technical receipt"` — whole publish-impact panel hardcoded — needs `studio.publishImpact.*` keys.
- `components/studio/editor/StudioEntryStatusRail.vue` — high — L109 `title="Status"`, L194 `title="Translations"`, L253 `title="Issues"`, L301 `title="More details"`, L138 “Live since”, L153 “Current language”, L166 “Checking what can publish...”, L296 “Check links”, L309 `aria-label="Toggle detailed publishing information"`, L313 “URLs, publish checks, and version history…”.
- `components/studio/editor/StudioEntryPublicWorkflowPanel.vue` — high — L61 “Publish readiness”, L85 “What will change?”, L94 “Check links”, L103 “Checking live website content...”, L115 “Live website content”, L132 “Languages checked”, L140 “Live languages”, L148 “Issues blocking publish”, L171/181.
- `components/studio/editor/StudioEntryTranslationReadinessPanel.vue` — high — L23 “Language status”, L27, L80, L97 “Missing language”, L104 “Missing URL”, L111 “Parent blocked”, L118 “Missing fields”, L138 “Review language”.
- `components/studio/editor/StudioLocaleVisibilityRow.vue` — high — L24 “Current”, L39 “Draft”, L48 “Live”, L57 “Website surfaces”, L105 “Live URL differs from the editable slug because this collection uses stable URLs.”
- `components/studio/editor/StudioEntryTrackCard.vue` — high — L167 `title="Track live website"`, L219 “Live page”, L236 “Language versions”.
- `components/studio/editor/StudioWorkflowCard.vue` — high — L284 `title="Publishing flow"` (+ hardcoded body).
- `components/studio/editor/StudioRouteStatusCard.vue` — high — L33 `title="URL diagnostics"`, L50 “Open in site”.
- `components/studio/editor/StudioTranslationReadinessCard.vue` — high — L26 `title="Language status"`.
- `components/studio/editor/StudioWorkflowDiagnosticsList.vue` — high — i18n=0.
- `components/studio/settings/StudioSettingsRevalidationSection.vue` — high — L22 “Website refresh”, L28 “Where published changes are sent…”, L50 “No website refresh target is configured…”, L109 “Refresh”, L116 “No website refreshes have been recorded yet.”, L157 “Retry” — whole settings section hardcoded.

### Components with partial i18n (some `t()`, many literals) — MED

- `components/studio/StudioAssetBrowser.vue` (i18n=4, large template port) — med/high —
  L651 “Choose or upload an asset without leaving this entry.”, L657/964 “Upload”,
  L678 “Collections”, L710/1657/1790 “Tags”, L742 “Library views”, L917/1050 “Clear”,
  L1003 “Add tag”, L1012 “Remove tag”, L1022/1712/2049 “Make available to this collection”,
  L1032/1723/2060 “Make available everywhere”, L1041/1733/2070 “Move to Trash”,
  L1090 “Name”, L1093 “Date Modified”, L1098 “Size”, L1101 “Kind”, L1453/1637/1936 “Save details”,
  L1458 “Select an asset to inspect it.”, L1647/1946 “Copy default details to missing languages”,
  L1956 “Location”, L1991 “Usage”, L1998 “Not used anywhere”, L2108 “Affected assets”, plus
  literal attrs L668/799/925/949/970 `aria-label`, L939 `placeholder="Search..."`,
  L992 `placeholder="Tag selected assets..."`, L1678/1825 `placeholder="Add tag..."`, L1066 `title="No items"`.
  (Note: the terminology in these literals is _already correct_ — “Make available…”, “Library views” — they just aren’t translatable.)
- `components/studio/collections/StudioCollectionContractSection.vue` (i18n=1) — high —
  L125 “Content type details”, L137 “Loading the selected content type...”, L152/153, L204,
  L212 “Stale URL prefix:”, L274, L294, L305, L346 `title="Review collection config"`.
- `pages/index.vue` (i18n=11, still many literals) — med — L536 “Drafts with no known blockers…”,
  L566 “Preview website changes”, L588, L594 “Reviews”, L626 “Out of date”, L662, L713, L763,
  L830 “Studio is still loading website refresh status.”, L844 “Website refreshes are healthy.”,
  plus `title=` empty-states L572/647/698/751/897/926.
- `pages/site-data.vue` (i18n=30) — med — L355 “Key:”, L359 “Visibility:”, L363 “Localized:”,
  L367 “This block is exposed through public site-data reads.” (also editor-safe + term drift, see §3).
- `pages/[collection]/new.vue` — med — L522 `title="Publishing details"`, L556/710 “Reset to title”,
  L572/726 `label="URL slug"`, L589 `label="Entry key"`, L678 `label="Draft setup"`.
- `pages/[collection]/index.vue` — med — L561 `aria-label="Publishing work"`, L562 `placeholder="Publishing work"`.
- `pages/agents.vue` — low — L246 “Revoke” (UI-REVISION: agent revoke → “End session”).
- `components/studio/StudioAssetMetadataForm.vue` (i18n=3) — med — L229 `label="Alt Text"`,
  L237 `label="Caption"`, L190 “Image details are not available.”, L252 “Cancel”, L256 “Save details”.
- `components/studio/StudioAssetMetadataDialog.vue` — med — L32 “Update image text used by editors. Live pages keep their current image details until they …”.
- `components/studio/settings/StudioSettingsMcpConnectionsSection.vue` (i18n=4) — med — L49 “MCP connections for AI tools”, L57, L90 “Copy access key”, L164 “Create MCP connection”, L189 “No active MCP connections.”, L223 “Revoke access”, L237 `title="Revoke MCP access?"` (also term drift, §2).
- `components/studio/StudioSharedFieldsPanel.vue` — low — L9 `title="Shared properties" badge="Applies to all languages"`.
- `components/studio/StudioVersionHistoryCard.vue` — low — L47 `title="Versions"`.
- `components/studio/StudioFieldShell.vue` — low — L30 “Optional”.
- `components/studio/StudioDashboardWorkflowPath.vue` — low — L37 `aria-label="Publishing workflow"`.
- `components/studio/StudioSidebar.vue` — low — L27 `aria-label="Studio navigation"`.
- `components/studio/editor/StudioEntryTopBar.vue` — low — L196 `aria-label="Breadcrumb"`, L297 `aria-label="More publish options"`.
- `components/studio/editor/StudioEntryCompareToolbar.vue` — low — L184 `aria-label="Swap languages"`.
- `components/studio/editor/StudioLocaleEditorPanel.vue` — low — L98 `aria-label="Reorder language"`, L194 `title="This language is missing key content."`.
- `components/studio/fields/FieldRelation.vue` / `FieldRelations.vue` — low — L203/225 “Keep typing to narrow more entries.”
- `components/studio/fields/FieldRichtext.vue` — low — L266 “Conversion needs attention before publishing.”
- `components/studio/fields/FieldArray.vue` / `FieldIcon.vue` — low (technical-ish) — `placeholder="Label"`, `placeholder="URL"`, `placeholder="icon"`, `placeholder="lucide:star"` (last is a technical token — exclude).

**Nav is fine:** `StudioSidebarNav.vue` wires labels via `t(route.labelKey)` and group
labels via `t('ginkoCms.studio.layout.*')`. Collection labels come from config (user data).

---

## Class 2 — Terminology drift vs UI-REVISION.md

| Location                                                                                                                      | Current string                                             | Issue                                                                                                                                         | Suggested                                               | Sev |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --- |
| `en.ts` L192-194 `studio.assetDetails.*` (used as **Media** page right-panel title `pages/assets.vue:24`)                     | “Asset details” / “No asset selected” / “Select an asset…” | `Assets`→`Media` cutover incomplete; user sees “Asset” on the Media page                                                                      | “Media details” / “No media selected” / “Select media…” | med |
| `en.ts` L196-199 `studio.reviewDetails.*` (used on **Approvals** page `pages/reviews.vue:52`)                                 | “Review details” / “No review selected”                    | page is “Approvals”; noun “review” inconsistent with page title                                                                               | “Approval details” / align to Approvals                 | low |
| `en.ts` L249 `assetsPage.scopeGlobal`, L835 `assetPicker.global`                                                              | “Global”                                                   | UI-REVISION: `Global` in media → `Shared library`                                                                                             | “Shared library”                                        | med |
| `StudioSettingsMcpConnectionsSection.vue` L49/164/189 + `en.ts` L378-395 `mcp*` (primary)                                     | “MCP connections”, “Connect an MCP client”                 | UI-REVISION: `MCP connections`→`AI agent connections` in **primary**, keep `MCP` only in details                                              | “AI agent connections” (primary); MCP behind Advanced   | med |
| `StudioCollectionContractSection.vue` L212                                                                                    | “Stale URL prefix:”                                        | UI-REVISION: `Stale`→`Out of date`                                                                                                            | “Out of date URL prefix”                                | med |
| `StudioCollectionContractSection.vue` (component name + L346 `title="Review collection config"`)                              | “collection config” / “Contract”                           | `Collection contract`→`Content type details`; component/name still “Contract”                                                                 | “Content type details”                                  | med |
| `en.ts` L155 `layout.entry`, L217-218 `entryCountOne/Other`, L893-902 agents, many `*.entry*`                                 | “Entry” / “{count} entries”                                | UI-REVISION leans editor language “content/document”; “entry” persists in editor-facing UI (breadcrumb `StudioHeader.vue:103`, `[id].vue:40`) | “content” / “document” where editor-facing              | low |
| `en.ts` L893-902 `agentsPage.title` = “AI work sessions” vs doc `Agent sessions`; `agentSessionId` L987 vs doc `Agent run id` | “AI work sessions”                                         | impl went further than doc (fine, but doc drift — flag for alignment)                                                                         | confirm canonical term                                  | low |
| `en.ts` L6 `common.manage` + L160 `layout.manage` = “Manage”                                                                  | “Manage”                                                   | UI-REVISION: `Manage`→`Operations`; **both keys unused in studio-app** (dead)                                                                 | remove or rename                                        | low |

Router still names routes `assets`/`reviews` (URLs `/studio/assets`, `/studio/reviews`)
while labels read Media/Approvals. Labels are wired to locale, so **no visible-label
mismatch** — only the URL slug differs (IA note, out of vocabulary scope).

---

## Class 3 — Editor-safe language (internals leaking to default persona)

Per UI-REVISION Goal L17-29 (“should not require understanding … MDC/JSON/collection
contracts/config”).

| Location                                                       | String                                                                      | Leak                                              | Suggested                               | Sev |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- | --- |
| `en.ts` L702 `collectionEditor.contentLabel`                   | “Content (MDC Markdown)”                                                    | `MDC` technical token                             | “Content”                               | med |
| `en.ts` L704 & L860 `*.richtextPlaceholder` (+ de.ts L714/878) | “Write content in MDC Markdown…”                                            | `MDC`                                             | “Write your content…”                   | med |
| `en.ts` L851 `fieldRenderer.sectionEmpty`                      | “Add sub-fields to this section in the **code-defined collection config**.” | “code-defined … config” internals                 | “…managed by developers.”               | med |
| `en.ts` L312 `siteDataEditor.customJson` (+de)                 | “Custom JSON”                                                               | raw JSON as primary field label                   | “Custom data” / behind Advanced         | med |
| `StudioPublishImpactSummary.vue` L202                          | `title="Technical receipt"`                                                 | “Technical” diagnostic surfaced in primary        | move behind Advanced details            | med |
| `pages/site-data.vue` L367                                     | “This block is exposed through public **site-data reads**.”                 | “site-data reads” + “block” (should be “section”) | “This section is shown on the website.” | med |
| `StudioCollectionContractSection.vue` L346                     | `title="Review collection config"`                                          | “config” internals                                | “Review content type”                   | low |

Positive: reviews advanced-details keys (`requestId`, `agentSessionId`, `entryId`,
`en.ts` L986-988) and the `workflow.issues.*` set are correctly reworded to website
language / kept behind Advanced — those pass.

---

## Class 4 — en.ts vs de.ts parity

Script: `scratchpad/parity.mjs` (flattens both default-export objects, diffs key trees).

- **Keys: 910 vs 910 — perfectly aligned. 0 missing, 0 extra on either side.**
- DE renamed concepts land correctly: `Medien`, `Freigaben`, `Content-Setup`,
  `KI-Arbeitssitzungen`, `Arbeitsliste`, `Website-weite Inhalte`.
- **DE values still identical to EN (~52 flagged; almost all legitimate cognates/tokens):**
  proper nouns (`Studio`, `Ginko CMS`), acronyms (`URL`, `MCP`, `SEO`), tokens
  (`lucide:file-text`, `user_abc123`, `Cmd K`), and web-cognates German keeps as-is
  (`Status`, `Slug`, `Live`, `Details`, `Navigation`, `Sitemap`, `Icon`, `Theme`,
  `System`, `Endpoint`). Genuinely worth a second look:
  - `settingsPage.events` = “Events” (de) — likely should be “Ereignisse” — low.
  - `assetsPage.scopeGlobal` / `assetPicker.global` = “Global” (de) — acceptable cognate but
    ties into the Media→“Shared library” term change (`Geteilte Bibliothek`) — low.
- DE carries the **same** editor-safe leaks as EN (`Inhalt (MDC Markdown)` L714,
  `MDC Markdown` L878, `Eigenes JSON` L317, `Asset-Details` L195) — fix in both packs.

Net: parity is healthy; the locale files are not the problem — the untranslated `.vue`
components are.

---

## Class 5 — Tone consistency in en.ts

**Dominant conventions:** page titles & buttons = **sentence case** (“Work queue”,
“Content setup”, “Save changes”, “Add member”); section/page descriptions = full
sentence **with terminal period**.

Outliers:

- `common.displayName` L35 = “Display Name” — Title Case (vs sentence-case siblings). → “Display name”.
- `settingsPage.studioLanguage` L366 = “Studio Language” — Title Case (cf. `defaultLocale` “Default language”, `locale` “Language”). → “Studio language”.
- `reviewsPage.description` L905 = “Review pending website changes” — **no terminal period** (sibling page descriptions have one).
- `activityPage.description` L884 = “Review operational and editorial history” — **no terminal period**.
- Hardcoded Title-Case leaks (once i18n’d, normalize): `StudioAssetMetadataForm` “Alt Text” (locale already has sentence-case “Alt text” L262), `StudioAssetBrowser` “Date Modified”, “Kind” (macOS-Finder styling).
- Consistent sub-conventions (not outliers): `commandPalette.*Subtitle` and
  `dashboard*Subtitle` are period-less by design (label style) and consistent among themselves.

---

## Appendix — method

- Literal attrs: `grep -E '(placeholder|title|aria-label|alt|label)="…[A-Za-z]…"'` minus
  bound (`:attr=`) and `data-testid` → 50 hits.
- Text nodes: capitalized multi-word lines in templates minus JS/imports/interpolation.
- i18n presence: `grep -c 'useCmsI18n|[^a-z]t('` per file (0 = fully hardcoded).
- Parity: `node scratchpad/parity.mjs`.
