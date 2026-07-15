# Studio Design Review — shadcn fidelity + simplification

Created: 2026-07-15 · Branch: `studio-shadcn-shell` (after Phase L)
**Status: implemented** (same day) — waves F1a `5fc86f63`, S1 `48b7758e`, F1c `f83e551c`,
S2 `a47a91a4`, S3 `e2883e64` + i18n/docs follow-ups. Corrections found during
implementation: the `△ n ms ◎` footer pill (A4) is the Nuxt DevTools overlay from the
playground dev server, not product UI — no product change needed; the Media back-chevron
is folder-drill navigation, kept. Deferred with tracking: archived-entry restore action
(backend surface change, task chip), template shortcut conventions, entry-list
selection-preview panel.
Method: live walkthrough of all 11 routes + overlays in the browser (1440×900 light/dark, 375×812 mobile), measured with JS probes, plus four code audits (tokens, primitives/patterns, vocabulary/i18n, UI-REVISION reconciliation).

This review judges the current branch against its own two constitutions — `DESIGN.md`
(visual system) and `UI-REVISION.md` (editor-first IA, hard terminology cutover) — plus
an Apple-HIG-style simplicity bar, per the agreed scope: **restructure allowed,
content-editor persona, hybrid execution**.

## Binding principles (addendum to DESIGN.md / UI-REVISION.md)

1. **One primary action per screen.** Everything else is secondary/ghost or in a `⋯` menu.
2. **Say it once.** A status/fact appears in exactly one place per screen. Duplication is a bug.
3. **Progressive disclosure.** Developer/process detail collapsed by default; the empty screen is the default screen.
4. **Content in the card, metadata in the right sidebar** — and the content column always wins the space fight.
5. **Empty ≠ visible.** Zero-count queues, "nothing selected" panels, and 0-chips disappear rather than render placeholders.
6. **One vocabulary, no internals.** No Convex ids, schema terms ("flat", "shared properties", "MDC"), or workflow jargon in the default persona's view.
7. **Defaults over options.** Every visible setting must justify why it isn't a good default.
8. **Grids respond to their container, not the viewport.** Any layout beside the right sidebar must use container queries (`@container`), not `md:`/`lg:`.

Severity: **P1** broken or misleading for users · **P2** visible inconsistency/clutter · **P3** nit.
Tags: **[fidelity]** mechanical, I fix without further approval · **[simplify]** changes what users see — needs a yes/no in triage.

---

## A. Cross-cutting findings

| # | Sev | Tag | Finding |
|---|-----|-----|---------|
| A1 | P1 | fidelity | **Viewport-vs-container breakpoints.** With the editor panel open at 1440px the content column is 391px, but form grids still key off `md:` viewport → Title/Description render 2-up inside 390px; "Body" label truncates; breadcrumb crushes to `H… > B… >`. Fix: container queries for everything inside `SidebarInset`. |
| A2 | P1 | simplify | **The editor panel wins the space fight.** Measured at 1440×900: editing surface 391px vs. status panel 768px (57.5vw laptop split tier). The metadata panel gets 2× the content being edited. Proposal: editor panel becomes `compact` (320px) by default; the split-view tier is opt-in (drag), not default. |
| A3 | P1 | fidelity | **i18n bypass in the editor rail family.** `StudioEntryStatusRail`, `StudioPublishImpactSummary`, `StudioEntryPublicWorkflowPanel`, `StudioEntryTranslationReadinessPanel`, `StudioLocaleVisibilityRow`, `StudioEntryTrackCard`, `StudioWorkflowCard`, `StudioRouteStatusCard`, `StudioTranslationReadinessCard`, `StudioWorkflowDiagnosticsList`, `StudioSettingsRevalidationSection` never call `t()`. Locale packs are healthy (910/910 keys en/de) — the components just don't use them. |
| A4 | P2 | simplify | **Dev diagnostics footer on every page** (`△ 11 ms ◎` pill). Latency readouts are developer detail; on mobile the pill floats over content. Gate behind the existing debug/developer mode. |
| A5 | P2 | simplify | **"Publishing flow" pipeline rendered three times** (Home queue counts, Home pipeline diagram, editor panel steps). Keep exactly one instructional rendering (editor panel, collapsed), delete the Home diagram. |
| A6 | P2 | fidelity | **Empty-state styles diverge**: dashed border + CTA (site-data), dashed border no CTA (approvals), bare text no CTA (media "No items"), bordered box (home). Standardize on `StudioEmptyState` with icon + one CTA. |
| A7 | P2 | fidelity | **Eyebrow taxonomy ≠ sidebar groups.** Page eyebrows say HOME/CONTENT/EDITOR/PUBLISHING/OPERATIONS while the sidebar says Content/Editor/Operations/Settings ("Approvals" sits under *Editor* but its eyebrow is *PUBLISHING*). Pick one taxonomy; arguably drop eyebrows entirely — breadcrumb + H1 already locate you (they currently triple-label the page). |
| A8 | P2 | simplify | **"Nothing selected" right panels.** Media and Approvals keep a 320px panel open just to say "No asset selected". Panels should be closed until there's a subject (auto-open on selection). |
| A9 | P3 | fidelity | Icon-size / icon-system drift (`Icon :name` vs direct lucide imports), `px-5` vs `px-6` header padding split, `studio-text-label` not used on ~11 settings headings, off-ladder border/opacity steps. (Full lists in audit reports.) |

## B. Per-surface findings

### Home `/studio` — the noisiest screen in the app
- **P1 [simplify] Redundancy ×3**: queue rows, pipeline diagram, then per-queue sections ("Ready to preview", "Ready for review", "Continue editing") each with its own empty state — the page says the same thing three times, ~4 screens tall with only one real work item.
- **P1 [fidelity] REGRESSED (audit D): no Home nav item** — the shell swap dropped the discrete Home link (logo-as-home only), which UI-REVISION P0 explicitly fixed once already.
- **P2 [simplify] Zero-rows stay visible** (4 of 5 queues at 0). Show only non-empty queues + a single "All caught up" state.
- **P2 [fidelity] REGRESSED (audit D)**: raw `collection.type` ("flat") printed in the Content overview table (`index.vue:788`).
- **P2 [simplify]** Header quick links (Site-wide content / Media / Approvals) duplicate the sidebar 1:1.
- **P2 [simplify]** In-card `<aside>` (384px) holds "Already live" + "Latest CMS activity" — a terse feed ("Archived entry · Jul 11" ×12, no entry names). Fold into one compact "Recent" block or drop; principle 4 says metadata belongs in the right sidebar anyway.
- **P3** Buggy copy: `Revoked AI agent connection for "user or connection"`.

### Content list `/studio/content/blog`
- **P1 [fidelity] Title column collapses to 0px.** Hand-rolled grid `[minmax(0,1fr)_12rem_9rem_minmax(12rem,16rem)_7rem_4rem]`: the five fixed tracks total 764px — exactly the card width at 1440 with panel open — so the 1fr title track gets 0 and the header labels overlap ("CONTENT" over "LANGUAGES"). Violates UI-REVISION's "title-first rows" acceptance. Fix: real `Table` primitive or container-query column dropping; title track gets a min width, fixed tracks yield first.
- **P2 [simplify]** NEXT ACTION column spends 16rem repeating "Open entry" on every row; EDIT pencil column duplicates row-click. Title + status + edited is enough; actions on hover/⋯.
- **P2 [simplify]** Right panel duplicates the primary CTA ("New content" appears twice on screen) and shows zero-count Work queue rows; "Flat" pill leaks schema type into the panel header area.
- **P3** "List" view toggle renders as a one-option segmented control.

### Entry editor `/studio/content/blog/:id` — most important screen
- **P1 [simplify] Space inversion** (see A2) and **P1 [fidelity] container queries** (see A1).
- **P1 [simplify] Status-as-CTA.** The top bar's primary-styled button is labeled "Needs work" — a status, not an action (and disabled it reads as broken UI). The primary slot should hold the one true next action (Publish / Request review / Restore); status belongs in a pill.
- **P2 [simplify] Say-it-once violations**: "archived/needs work" appears 4× in the panel (Status badge, Check step, Language versions, Issues); "Not Live Yet" badge next to "Not live yet" heading; "Check links" button appears twice (STATUS and WORKFLOW sections).
- **P2 [simplify]** Single-language site still gets full "Language versions / Translations 0/1" blocks — hide language machinery when there's one locale.
- **P2 [simplify]** Jargon: "Shared properties / Applies to all languages" (→ e.g. "Details"), "Write content in MDC Markdown…" (→ "Start writing…"), "Source of truth".
- **P2 [fidelity]** Top-bar "Saved" indicator glyph collides with the Archived badge; breadcrumb should collapse to back + title on narrow widths.
- **P2 [fidelity]** Archived (read-only) state styles values placeholder-gray — a filled title looks empty; disabled state needs a visible "This entry is archived — Restore" notice instead.

### Publish dialog
- **P2 [simplify]** Six unexplained chips ("Sitemap included", "Website visibility 3", "Search preview 1"…) — counts without meaning for an editor. Collapse into "Included in sitemap, search, and navigation" prose + Advanced details.
- **P2 [simplify]** The blocking issue ("Entry is archived") renders at the bottom; blockers belong at the top with a resolution action, and the confirm button state should explain itself.

### New content `/studio/content/blog/new`
- Sanest page in the app. **P3**: "Publishing details" section title overstates (it's Title/Description/Body); MDC placeholder jargon (shared with editor).

### Media `/studio/assets`
- **P2 [simplify]** "Shared library" listed twice (COLLECTIONS and LIBRARY VIEWS); taxonomy needs flattening for the common single-library case.
- **P2 [fidelity]** Active-nav pill is solid black — the shell sidebar's active state is a subtle muted wash; two active-state languages in one window.
- **P2 [simplify]** Four always-visible filter dropdowns + search over an empty library; collapse to search + one Filter button that reveals chips.
- **P2 [fidelity]** "No items" empty state has no Upload CTA (and isn't StudioEmptyState).
- **P2 [fidelity]** Desktop split-pane content header keeps a mobile back-chevron ("< Shared library").
- **P1 [fidelity] (audit B)** 9 native `<select>` elements in the browser/mobile filters instead of the `Select` primitive — raw OS controls inside themed toolbars.
- **P3 (audit B)** Hand-built list/grid toggles instead of `StudioSegmentedControl`.

### Approvals `/studio/reviews`
- Clean. **P2 [simplify]** empty right panel (A8); **P3** "0 pending" chip when zero (principle 5).

### Site-wide content `/studio/site-data`
- Good empty state (has CTA). **P3**: "0 sections" chip; audit D notes `Custom JSON` field type isn't gated behind Advanced.

### Content setup `/studio/model`
- **P2 [simplify]** Three "Advanced details" disclosures visible on one screen — regroup so there's one per detail surface.
- **P2 [simplify]** Chip soup: "Page routes / Navigation / Surround / Search / Sitemap / SEO / Website changes preview" — "Surround" is internal vocabulary; convert chips to a sentence + advanced list.
- **P2 [fidelity]** Middle "Content type details" column is nearly empty while right column double-stacks cards — the master/detail grid needs rebalancing (and could adopt `StudioSplitPane` for consistency with Media).
- **P3** Cryptic standalone "2" chip in the page header.

### Activity log `/studio/activity`
- **P1 [fidelity]** Every row shows a raw Convex user id (`jn7d7njjh…`, 32 chars) as the actor, and "Archived entry" rows never name the entry. Display name + entry title; ids stay in Advanced details.

### AI work sessions `/studio/agents`
- **P3** "trusted MCP clients" in editor-facing empty state; audit D: "Revoke" → "End session" rename still UNMET.

### Settings `/studio/settings`
- **P2 [simplify] Appearance is a developer playground**: 11 accent swatches (saturated dots that violate DESIGN.md's calm register), Type treatment (Default/Mono/Scaled), six corner-radius options. Proposal: reduce to Theme (Light/Dark/System) + optionally 3–4 curated accents; gate the full picker behind consumer config (`appearance.userThemePicker`, the RFC's open question) or remove Type/Corners entirely.
- **P3 (audit C)** Title Case outliers ("Display Name", "Studio Language"); missing terminal periods on two descriptions.
- Audit D: MCP naming ("MCP connections" → "AI agent connections") UNMET; media/storage settings section UNMET.

### Shell / global
- **P2 [fidelity]** DESIGN.md's Color section is stale post-Phase P (primary is neutral, not emerald; ring neutral; success decoupled). The code is right; the constitution needs updating — includes deciding the fate of the emerald rule.
- **P3** Command palette content is good; `⌘K` shortcut verified working.
- Dark mode: tokens hold; no contrast failures spotted in walkthrough.

## C. Proposed implementation waves (Stage 2, after triage)

- **Wave F1 — fidelity, no approval needed:** container-query migration for in-card layouts (A1), content-list table rebuild (title never collapses), i18n wiring for the rail family (A3), Media native selects → primitives, empty-state normalization (A6), active-state normalization, eyebrow/taxonomy alignment (A7), Saved-glyph collision, archived-state styling, DESIGN.md color-section update, P3 sweep (audit lists).
- **Wave S1 — Home diet:** one queue (non-empty only) + one "Recent" block; delete pipeline diagram + per-queue empty sections + header quick links; restore Home nav item; fix `collection.type` leak.
- **Wave S2 — Editor focus:** compact-by-default panel; one primary action in the top bar; say-it-once panel regrouping (Status → Next action → History, language block only when multilingual); publish-dialog blocker-first + chip prose.
- **Wave S3 — Periphery:** Media taxonomy + filter collapse; Content setup regrouping; Activity actor/entry naming; Settings appearance reduction; diagnostics footer gating (A4); remaining UI-REVISION UNMET items.

Each wave: own commit(s), suite + `ginkoify --check` + `vue-tsc` gates, live browser verification desktop/mobile/dark, side-by-side with the template on :4400.

## D. Audit reports (`scripts/ui-shell-migration/audits/` — summaries folded in above)

- audit-a-tokens.md — 0 P1 / 6 P2 / ~20 P3 (DESIGN.md staleness is the headline)
- audit-b-patterns.md — 2 P1 / 6 P2 / 17 P3 (drift concentrated in StudioAssetBrowser)
- audit-c-vocabulary.md — ~120 hardcoded literals; en/de parity perfect; terminology drift list
- audit-d-revision-reconcile.md — 2 REGRESSED, 3 UNMET, imports-revision OBSOLETE, rest MET
