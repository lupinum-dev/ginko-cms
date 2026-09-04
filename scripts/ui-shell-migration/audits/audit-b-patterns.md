# Studio UI Audit B — Component/Primitive Usage & Visual-Pattern Consistency

Scope: `packages/cms/studio-app/src` (pages + components/studio). `components/ui` (vendored shadcn primitives) excluded per brief. Branch `studio-shadcn-shell`. Read-only.

Canonical references internalized: the studio building blocks (StudioPageHeader/Body/Section/InspectorSection/ListFrame/EmptyState/Notice/StatusPill/SegmentedControl/DeveloperDetails/SplitPane/Workspace/FieldShell) and the **studio type ladder** defined in `styles/index.css` L203-260 (`studio-text-display/page-title/title/body/label/caption/eyebrow`). The radius scale from `components/ui`: cards/dialogs `rounded-xl`, buttons/inputs `rounded-lg`, small controls `rounded-md`, chips/swatches `rounded`/`rounded-sm`, pills `rounded-full`.

**Headline:** The shell and the newer pages (index, settings, collections, editor panels) are highly consistent and lean hard on the studio blocks. Nearly all real drift is concentrated in two legacy islands — **`StudioAssetBrowser.vue`** (86 KB, pre-design-system) and its mobile satellites — plus a systematic-but-cosmetic settings-section heading pattern. No ad-hoc dialogs, no non-`@lucide` raster icons, no native `<details>` outside the sanctioned wrapper, and `<Alert>` is only ever reached through `StudioNotice`.

---

## 1. Native elements where a primitive exists

### Native `<select>` (Select primitive is canonical — used in [collection]/index, settings/_, fields/FieldSelect, editor/_)

- `components/studio/StudioAssetBrowser.vue:864,877,885,895,903,966` — six native `<select>` (sort, type/time/usage/size filters, upload destination) styled ad-hoc (`h-6/h-7 rounded-full/md border-0 bg-muted/60`). Should be `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, or a `DropdownMenu` for the pill filters. — **P1** (user-visible: these render as raw OS select controls inside an otherwise fully-themed toolbar; focus ring, chevron, and dark-mode styling all diverge).
- `components/studio/assets/StudioAssetMobileFilters.vue:46,57,67` — three native `<select>` (sort/type/date) in the mobile filter sheet. Same fix. — **P1**.

### Native toggle-button groups re-implementing StudioSegmentedControl / ToggleGroup

- `components/studio/StudioAssetBrowser.vue:840,851` — list/grid view toggle built from two native `<button>` in a `rounded-lg bg-muted/60 p-0.5` shell with hand-rolled active-state classes. `StudioSegmentedControl` exists for exactly this. — **P2**.
- `components/studio/assets/StudioAssetMobileFilters.vue:27` — same list/grid toggle, duplicated. — **P2**.

### Native `<button>` — accepted vs. flag

Most native `<button>` in the sweep are full-width **list/nav rows** (selectable rows, work-queue rows, scope nav), which is an accepted native pattern here (matches `StudioSidebarNavLink`). Not flagged individually:

- Accepted: `collections/StudioCollectionsListPanel.vue:67`, `collections/StudioCollectionDetailsPanel.vue:87,100`, `assets/StudioAssetMobileScopes.vue:54,82,106`, `fields/FieldRelations.vue:132,142` (combobox trigger + tag-remove), `editor/StudioLocaleEditorPanel.vue:96` (drag handle), `pages/site-data.vue:210` & `pages/[collection]/index.vue:669` (accordion/row headers).

Flag:

- `components/studio/StudioAssetBrowser.vue:912` — ad-hoc "Clear filters" text `<button>` (`h-6 rounded-full px-2 text-xs`) sitting beside real `Button` components in the same row. Use `Button variant="ghost" size="xs"`. — **P3**.

### Native `<input>` — all intentional

- `fields/FieldColor.vue:32` (`type="color"` swatch, paired with a real `Input` for hex), `fields/FieldRadio.vue:31` (`type="radio"` — no radio-group primitive is vendored), `fields/FieldRange.vue:37` (`type="range"` — no slider primitive), `StudioAssetBrowser.vue:636,1078,1121` (hidden file input + row checkboxes). No primitive covers these types. **No action** (documented as intentional per brief).

### Dialogs / overlays / details

- No ad-hoc `role="dialog"`, `fixed inset-0` overlays, or hand-rolled menus found — all modals go through `Dialog`/`Sheet`. ✅
- `<details>` appears only inside `StudioDeveloperDetails.vue` (the sanctioned wrapper). ✅

---

## 2. Hand-rolled versions of existing studio blocks

### Hand-rolled notice/callout boxes (StudioNotice exists, 16 adoptions)

- `components/studio/editor/StudioEntryStatusRail.vue:282` — blocking-issue callout hand-built from `flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/10 p-2.5` + `<AlertCircle>` + text. This is a StudioNotice `tone="warning"` open-coded. — **P2**.
- `components/studio/editor/StudioPublishDialog.vue:346` — `rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-fg` warning box → StudioNotice. — **P2**.
- `components/studio/settings/StudioSettingsMcpConnectionsSection.vue:77` — `rounded-lg border border-warning/30 bg-warning/10 p-4` warning callout → StudioNotice. — **P2**.
- `components/studio/StudioAssetMetadataForm.vue:223`, `settings/StudioSettingsRevalidationSection.vue:162`, `settings/StudioSettingsStorageSection.vue:103` — compact inline error/warning strips (`rounded-md bg-{destructive,warning}/1x px-3 py-2 text-xs`). Borderline (compact, no icon); could be a small StudioNotice variant. — **P3**.

Note: computed _tone-class helpers_ on status rows/cards/pills (`pages/index.vue:438`, `pages/[collection]/index.vue:489-491,708-709,796-797`, `editor/StudioEntryTrackCard.vue:151-155`, `editor/StudioLocaleEditorPanel.vue:42`, `dashboard/StudioDashboardWorkflowPath.vue:24-26`, `StudioAssetBrowser.vue:1580-1581,1873-1874`) are semantic state-tints on rows/cards, a distinct pattern from notice boxes — **not** flagged as StudioNotice candidates, but see §5 for their opacity drift.

### Status badges

- `StudioStatusPill` and `Badge` are used consistently for status. One hand-rolled numeric badge: `editor/StudioEntryStatusRail.vue:201` — a step-number chip (`size-8 rounded-full bg-primary/10 text-xs font-bold`); it is an avatar-style index marker, not a status pill, so acceptable, but its `font-bold` is a type outlier (see §3).

### Page headers / sections / empty states

- Page headers: all pages use `StudioPageHeader`. ✅ Empty states use `StudioEmptyState`. ✅ Section shells use `StudioSection`/`StudioListFrame`/`StudioInspectorSection`. ✅ No hand-rolled equivalents found.

---

## 3. Typography drift

Type ladder (canonical): title 16/600, body 14/400, label 14/500, caption 12/500, eyebrow 12/600, page-title 18/600, display 32/600.

### Histogram — `ginko:text-{size}` (pages + components/studio)

| Token              | Count | Ladder role                    |
| ------------------ | ----- | ------------------------------ |
| text-xs            | 464   | caption (12px)                 |
| text-sm            | 171   | body/label (14px)              |
| text-2xl           | 2     | — (24px, off-ladder)           |
| text-base          | 1     | title (16px, off-ladder token) |
| text-lg / xl / 3xl | 0     | —                              |

### Histogram — `ginko:font-{weight}`

| Token         | Count |
| ------------- | ----- |
| font-medium   | 206   |
| font-semibold | 30    |
| font-normal   | 7     |
| font-bold     | 2     |

### Histogram — `studio-text-*` utility adoption

| Utility             | Count |
| ------------------- | ----- |
| studio-text-title   | 24    |
| studio-text-caption | 13    |
| studio-text-eyebrow | 6     |
| studio-text-label   | 4     |
| studio-text-body    | 3     |

### Outliers / findings

- `pages/reviews.vue:195` — review-card title `<h2 class="text-base font-semibold">`. 16px/600 numerically equals `studio-text-title` but bypasses the utility, and it is the only `text-base` in the codebase. Use `studio-text-title`. — **P3**.
- `components/studio/settings/StudioSettingsLanguageSection.vue:16`, `StudioSettingsMembersSection.vue:16`, `StudioSettingsMcpConnectionsSection.vue:45`, `StudioSettingsLocalesSection.vue:15`, `StudioSettingsConfigurationSection.vue:16`, `StudioSettingsStorageSection.vue:17`, `StudioSettingsRevalidationSection.vue:18`, `StudioSettingsAppearanceSection.vue:66,108,141,173` — settings sub-section `<h2>` hardcode `text-sm font-medium text-foreground` (14px/500). This is exactly the `studio-text-label` spec, and the sibling `collections/StudioCollectionFieldsSection.vue:62` proves the intended pattern by using `studio-text-label` for the identical role. ~11 headings should switch to the utility. Systematic — **P3** (maintainability; renders identically today).
- `components/studio/reviews/StudioReviewDetail.vue:46,129,217` — sub-headings as `text-sm font-medium` (again the `studio-text-label` spec, raw). — **P3**.
- `components/studio/settings/StudioSettingsAppearanceSection.vue` — internal inconsistency: sub-section headings at L66/L108 carry an icon (`flex items-center gap-2` + lucide), L141/L173 do not. Same visual tier, differing composition. — **P3**.
- `pages/index.vue:513` — KPI value `text-2xl font-semibold tabular-nums` (24px/600). Off-ladder metric size; the ladder's nearest step is `display` (32/600). One-off dashboard stat — **P3** (consider a ladder step for KPI numerals, or accept as intentional data-viz numeral).
- `components/studio/editor/StudioEntryStatusRail.vue:201` — `font-bold` on the step-number chip; every other heading/label in the studio tops out at 600 (`font-semibold`). Lone `font-bold` besides the shared StudioPageHeader h1. — **P3**.
- Note: `StudioPageHeader.vue:44` h1 is `text-2xl font-bold` (24/700), which does not map to a ladder step (page-title is 18/600). This is the single shared page-header component so it stays consistent across pages, but it is worth reconciling the h1 with the documented ladder. — **P3**.

---

## 4. Spacing rhythm

Histograms across pages + components/studio (all container levels; Tailwind-scale steps).

### Padding `p-*` / `px-*` / `py-*`

| p-    | n   |     | px-    | n   |     | py-    | n   |
| ----- | --- | --- | ------ | --- | --- | ------ | --- |
| p-3   | 33  |     | px-4   | 62  |     | py-3   | 53  |
| p-4   | 26  |     | px-2   | 61  |     | py-2   | 46  |
| p-0   | 17  |     | px-3   | 29  |     | py-1.5 | 21  |
| p-5   | 7   |     | px-5   | 9   |     | py-1   | 19  |
| p-6   | 3   |     | px-6   | 5   |     | py-8   | 13  |
| p-2   | 3   |     | px-1.5 | 8   |     | py-0.5 | 12  |
| p-1   | 3   |     | px-2.5 | 4   |     | py-4   | 10  |
| p-0.5 | 3   |     | px-1   | 2   |     | py-12  | 4   |
| p-2.5 | 1   |     | px-3.5 | 1   |     | py-6   | 3   |
|       |     |     |        |     |     | py-2.5 | 3   |

### Gap / space-y

| gap-    | n   |     | space-y-    | n   |
| ------- | --- | --- | ----------- | --- |
| gap-2   | 160 |     | space-y-3   | 33  |
| gap-3   | 96  |     | space-y-2   | 31  |
| gap-4   | 35  |     | space-y-1   | 27  |
| gap-1   | 33  |     | space-y-4   | 22  |
| gap-1.5 | 26  |     | space-y-1.5 | 21  |
| gap-2.5 | 10  |     | space-y-5   | 5   |
| gap-5   | 6   |     | space-y-2.5 | 4   |
| gap-6   | 3   |     | space-y-6   | 3   |
| gap-0.5 | 2   |     | space-y-8   | 1   |
| gap-0   | 2   |     | space-y-10  | 1   |

Dominant rhythm is clean: page/content padding `p-4 lg:p-6` (StudioPageBody), card interiors `p-6`/`px-6 py-4/5` (StudioSection/ListFrame/InspectorSection), gaps `gap-2`/`gap-3`, stacks `space-y-{1..4}`. Findings:

- **Competing card/list-header horizontal padding: `px-5` vs the canonical `px-6`.** A distinct band of custom list/table headers uses `px-5 py-{2,3,4}` where `StudioListFrame`/`StudioSection` headers use `px-6`: `pages/site-data.vue:81`, `pages/[collection]/new.vue:668`, `pages/[collection]/index.vue:749,764`, `StudioAssetMetadataDialog.vue:29`, `StudioAssetMetadataForm.vue:249`, `editor/StudioEntryCompareToolbar.vue:59`, `editor/StudioLocaleEditorPanel.vue:93`. Content edges in these surfaces sit 4px inboard of the framed sections next to them. Normalize to `px-6` (or the frame's rhythm). — **P2**.
- `gap-0` (`pages/... 2 uses`) and `px-3.5`/`p-2.5`/`py-2.5` (1-3 uses each) are one-offs that fall between scale steps; low impact — **P3**.
- The settings sections' `py-8` vertical rhythm (13 uses) is its own intentional form-row rhythm (matches the two-column settings layout) — not flagged.

---

## 5. Border / rounding drift

### Rounded histogram

| Token                   | Count | Canonical role             |
| ----------------------- | ----- | -------------------------- |
| rounded-md              | 72    | small controls             |
| rounded-lg              | 61    | buttons/inputs             |
| rounded (bare, 0.25rem) | 35    | code chips / swatches      |
| rounded-xl              | 31    | cards / sections / dialogs |
| rounded-full            | 26    | pills / dots               |
| rounded-sm              | 4     | (near-`rounded`)           |

### Findings

- **`border-border/*` opacity is the one inconsistent structural token.** Histogram: `/40` ×110 (dominant), `/60` ×38 (mostly dashed empty-state + `[collection]` row dividers), solid `border-border` ×12, `/30` ×6 (ListFrame headers), `/50` ×4 (outlier). The four `/50` uses — `StudioAssetBrowser.vue:1150,1279,1765`, `reviews/StudioReviewDetail.vue:36` — sit between the `/40` and `/60` tiers with no rationale; normalize to `/40`. — **P3**.
- **`border-warning/*` tint opacity varies by author** across the state-tint callouts/rows: `/25` (StudioEntryStatusRail:282), `/30` (PublishDialog, McpConnections, TrackCard, AssetBrowser), `/40` (index, WorkflowPath), `/45` (LocaleEditorPanel:42). Same semantic (warning tint on a surface), four opacities. Pick one (`/30` is most common). — **P3**. (Consolidating these behind StudioNotice / a shared tone helper — see §2 — would erase this automatically.)
- **`rounded` vs `rounded-sm` for the same small-element role.** Inline code chips are almost all bare `rounded` (`pages/agents.vue:187-196`, `pages/activity.vue:161-169`, `settings/*` config chips), but a few small interactive/utility elements use `rounded-sm` (`pages/site-data.vue:212`, `pages/[collection]/index.vue:688,775`, `fields/FieldRelations.vue:146`). Two adjacent radius tokens (4px each in the default theme) used for like elements. Cosmetically identical at default radius; picking one avoids divergence if the radius token changes. — **P3**.
- No double-bordered nested cards found — framed sections (`StudioSection`/`StudioListFrame`, `rounded-xl border`) are not nested inside one another; inner rows use dividers (`border-b`) not nested card borders. ✅
- Card/section radius (`rounded-xl`) and dialog radius (`rounded-xl`) are consistent; small controls consistently `rounded-md`/`rounded-lg`. ✅

---

## 6. Icon consistency

- **All icons are `@lucide/vue`** (53 files import it) — no heroicons/iconify-raster/carbon. ✅
- **Two icon rendering conventions coexist:** the imported lucide _components_ (`<Search>`, `<AlertCircle>`, `size-*` classes) and an Iconify-style **`<Icon :name="...">`** component (14 files). The `<Icon>` component is legitimately used for **dynamic/config-driven names** — collection icons, field icons, sidebar nav icons, locale flags, social icons, color-mode icon (`StudioCollectionIcon`, `FieldIcon`, `StudioSidebarNavLink`, `StudioSidebarUser`, `FieldArray` socials, `StudioSettingsLanguageSection` flags). That is fine. But it is also used for **static, known icons** where a lucide component is the convention:
  - `pages/site-data.vue:219` — `Icon name="lucide:chevron-down/right"` accordion chevron.
  - `fields/FieldArray.vue:176`, `fields/FieldBlocks.vue:151` — collapse chevron via `Icon name="lucide:chevron-*"`.
  - `fields/FieldRichtext.vue:181` — `Icon name="lucide:eye/eye-off"` preview toggle.
  - `StudioSidebarUser.vue:131` — `Icon name="lucide:check/copy"` copy button.
    These render fine but mix the two systems for the same static-icon role; prefer `<ChevronDown/>` etc. for statically-known icons, reserving `<Icon>` for dynamic names. — **P3** (consistency/maintainability).
- **Icon size mixing by context** (not h/w vs size — everything uses `size-*`, no `h-4 w-4` icon drift found; the only `h-N w-N` hits are Skeletons). Counts: `size-4` ×104, `size-3.5` ×89, `size-5` ×25. Notable: **21 buttons use manual `mr-1.5 size-3.5`** on the leading icon (`pages/index.vue:460`, `StudioAssetBrowser.vue` upload buttons, etc.) instead of letting `Button` auto-size the svg (`size-4` default / `size-3.5` at `size="xs"`) and provide the gap. This double-specifies icon size and margin and, in `size="sm"` buttons, makes the icon 3.5 where the button convention is 4. Prefer relying on Button's `[&_svg]:size-*` + `gap`. — **P3**.

---

## Summary counts

| Class                        | P1                      | P2                           | P3                                                                                                       | Notable-but-accepted                                  |
| ---------------------------- | ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1. Native vs primitive       | 2 (9 native `<select>`) | 2 (2 toggle groups)          | 1 (Clear button)                                                                                         | native color/radio/range inputs; native nav/list rows |
| 2. Hand-rolled studio blocks | 0                       | 3 (warning callouts)         | 3 (inline error strips)                                                                                  | state-tint helpers; numeric chip                      |
| 3. Typography                | 0                       | 0                            | 6 (settings h2 batch, reviews h2, ReviewDetail h3s, appearance icons, KPI 2xl, bold chip, pageheader h1) | ladder adoption otherwise strong                      |
| 4. Spacing                   | 0                       | 1 (`px-5` vs `px-6` headers) | 2 (gap-0/px-3.5 one-offs)                                                                                | settings `py-8` rhythm                                |
| 5. Border/rounding           | 0                       | 0                            | 3 (`/50` border, warning-opacity spread, `rounded`/`-sm`)                                                | no nested double borders ✅                           |
| 6. Icons                     | 0                       | 0                            | 2 (Icon-vs-component for static, `mr-1.5 size-3.5` buttons)                                              | all @lucide ✅                                        |
| **Total**                    | **2**                   | **6**                        | **17**                                                                                                   |                                                       |

**Concentration:** `StudioAssetBrowser.vue` + `assets/StudioAssetMobileFilters.vue` account for both P1s and both segmented-control P2s — a single legacy component drives all the user-visible primitive drift. The settings-section heading utility swap (§3) is the largest single-fix maintainability win (~11 sites). Everything else is scattered P3 polish.
