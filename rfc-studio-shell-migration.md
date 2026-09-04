# RFC: Migrate the Ginko CMS Studio onto the shadcn Dashboard Shell

- **Status:** Implemented (Phases 0–6 landed on `studio-shadcn-shell`, 2026-07-15; Phase 7 auth pages pending as follow-up)
- **Date:** 2026-07-14
- **Owner:** Matthias
- **Source of truth for the target design:** `/Users/matthias/Git/1_apps/nuxt-shadcn-dashboard-template` (referred to below as **the template**)
- **Migration target:** `packages/cms/studio-app` (the Studio SPA), plus a follow-up for `packages/cms/src/auth`

---

## 1. Summary

We migrate the Studio UI onto the template's dashboard shell: its layout architecture (left sidebar + header + **resizable right sidebar**), its design tokens and theme system, and its component conventions — so that every screen in the CMS is consistent shadcn "new-york" style.

This is a **re-shell, not a rewrite**. Both codebases already share the same stack (Vue 3.5, Tailwind v4 CSS-first, vendored shadcn-vue on reka-ui, CVA + clsx + tailwind-merge, Lucide). The work is: merge the token systems, swap the shell components, adopt the right-sidebar system for detail panels (entry editor status/workflow/history, asset metadata, review details), refresh drifted ui primitives, and then run a systematic consistency audit over every page.

Estimated effort: **6–8 working days** including verification (right-sidebar adoption included; auth pages as a separate follow-up phase).

## 2. Motivation

- The Studio shell (`studio-app/src/Layout.vue`, `StudioSidebar.vue`, `StudioHeader.vue`) predates the template and has drifted from current shadcn conventions in spacing, tokens, and component versions.
- The entry editor crams status, workflow, publishing, and history detail into the main column / action rail. The template's right sidebar is a purpose-built, resizable, cookie-persisted split-view panel — exactly the right home for "details" surfaces.
- The template ships a complete theme system (10 color themes, mono/scaled variants, dark mode, OKLCH tokens) that we get for free once tokens are merged.
- One consistent shadcn design language across all 11 Studio routes reduces per-feature UI decisions going forward.

## 3. Current state (facts the plan relies on)

### 3.1 Ginko CMS Studio (`packages/cms/studio-app`)

| Aspect                 | State                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App type               | Standalone Vite + vue-router SPA, built via `studio:build`, mounted into Nuxt by `src/runtime/pages/studio-host.vue`. Fixed asset names `assets/main.js` / `main.css`.                                                                                             |
| Tailwind               | v4, **`@import 'tailwindcss' prefix(ginko)`**, everything scoped under `.ginko-cms` root class                                                                                                                                                                     |
| Tokens                 | `studio-app/src/styles/index.css` (~616 lines), shadcn semantic names in OKLCH, each with a **public `--ginko-cms-*` consumer-override fallback**                                                                                                                  |
| shadcn ui sets         | 26 folders under `studio-app/src/components/ui/` (129 files), incl. full sidebar block                                                                                                                                                                             |
| Shell                  | `Layout.vue`: `SidebarProvider → StudioSidebar → SidebarInset → StudioHeader → <slot>` + access-state cards                                                                                                                                                        |
| Nav                    | Data-driven: `studio-app/src/lib/studioNavigation.ts`, routes in `router.ts`                                                                                                                                                                                       |
| Editor detail UI today | `studio/editor/` (19 components): `StudioEntryStatusRail.vue`, `StudioWorkflowCard.vue`, `StudioVersionHistoryCard.vue`, `StudioEntryTranslationReadinessPanel.vue`, `StudioRouteStatusCard.vue`, etc., plus `StudioActionRail.vue` / `StudioActionRailToggle.vue` |
| State                  | 33 composables, no Pinia; toasts/confirm/prompt are custom Promise composables (no library APIs to unwind)                                                                                                                                                         |
| Dark mode              | `@nuxtjs/color-mode` on the host + local `useColorMode.ts`; `.dark .ginko-cms` token block                                                                                                                                                                         |
| Tests                  | 126 `*.test.ts` under root `test/`, incl. `studio-ui-primitives.test.ts`, `test/runtime/editor/*`, `test/runtime/studio-*`                                                                                                                                         |
| Scoped CSS             | Only 12 of ~241 `.vue` files have `<style>` blocks                                                                                                                                                                                                                 |

### 3.2 Template (`nuxt-shadcn-dashboard-template`)

| Aspect            | State                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App type          | Nuxt 4 (`app/` dir) — we port **components/CSS**, not the app skeleton                                                                                                                                                                                                                                                                            |
| Tailwind          | v4 CSS-first, **unprefixed**, `tw-animate-css`                                                                                                                                                                                                                                                                                                    |
| Tokens            | `app/assets/css/tailwind.css` (`:root` / `.dark`, OKLCH, incl. `--sidebar-*`, `--header-height`, `--radius`) + `app/assets/css/themes.css` (371 lines: `.color-*` themes, `.theme-mono`, `.theme-scaled`)                                                                                                                                         |
| shadcn ui sets    | 38 folders under `app/components/ui/`                                                                                                                                                                                                                                                                                                             |
| Shell             | `app/layouts/default.vue`: `SidebarProvider → LayoutAppSidebar → SidebarInset (z-10) → LayoutHeader → @container/main page slot → RightSidebarRail → LayoutRightSidebar`                                                                                                                                                                          |
| Right sidebar     | `app/composables/useRightSidebar.ts` (+ `RightSidebar.vue`, `RightSidebarRail.vue`): provide/inject controller, per-page `useRightSidebarPanel()` registration, cookie-persisted open state + width, viewport-tiered widths (split-view ≈57.5vw on laptops, 320px panel on ≥1536px), drag-resizable, `Cmd/Ctrl+.` shortcut, mobile Sheet fallback |
| Header            | `LayoutHeader`: sticky, `SidebarTrigger`, separator, auto breadcrumbs from route, slot, right-sidebar toggle                                                                                                                                                                                                                                      |
| Nuxt-isms to shim | `useCookie`, `route.meta` (Nuxt route meta), `@nuxt/icon` `i-lucide-*` strings, `@nuxtjs/color-mode`, `useTextDirection`/`ConfigProvider` in `app.vue`                                                                                                                                                                                            |

## 4. Goals / Non-goals

### Goals

1. Studio shell = template shell: sidebar (inset variant, offcanvas collapse), sticky header with breadcrumbs, right-sidebar system.
2. **Right sidebar adopted as the standard "details" surface**, starting with the entry editor.
3. One merged token system: template tokens + themes.css layered under the existing `--ginko-cms-*` consumer-override contract. Nothing consumers rely on breaks.
4. All shared ui primitives refreshed to the template's snapshot; missing sets we need are added (`sonner`, `resizable`, `popover`, `tabs`, `table`, `kbd`, `breadcrumb`).
5. Every Studio page passes the shadcn-consistency audit (§8.4).
6. Existing test suite stays green throughout; new tests cover the right-sidebar controller and shell.

### Non-goals

- Rewriting the TipTap editor (`studio-app/src/editor/`) — black box; only its _container_ changes.
- Changing the SPA-in-Nuxt-host architecture, the host bridge, or the fixed asset names.
- Changing routes, permissions, data layer, or any composable in `composables/` (except additive shell composables).
- Adopting Nuxt-only machinery from the template (`@nuxt/icon`, `@nuxt/fonts`, cookies) — we shim instead.
- Porting the template's demo features (kanban, mail, tasks table demos).

## 5. Key design decisions

### D1 — Keep the `ginko:` prefix and `.ginko-cms` scope

The prefix/scope is our **public embedding contract** (the Studio mounts inside consumer Nuxt apps without style bleed). Template code is adapted to us, not the other way around. All copied template files pass through a prefix codemod (§7, Phase 0). Rejected alternative: dropping the prefix — would leak styles into host apps and break consumer theming.

### D2 — Token merge is _layered_, not a replacement

`styles/index.css` keeps its structure and the `--ginko-cms-*` fallback pattern:

```css
--background: var(--ginko-cms-background, <template light value>);
```

Template values become the new defaults inside the existing fallbacks. `themes.css` (color themes, mono/scaled) is ported into the same file (or a sibling `themes.css` import), with selectors re-scoped: `.color-blue` → `.ginko-cms.color-blue` etc. Dark block stays `.dark .ginko-cms`. New tokens the template adds (`--header-height`, `--warning`, chart + `--vis-*` vars) are introduced with `--ginko-cms-*` fallbacks too, so the consumer contract stays uniform.

### D3 — Right sidebar is ported as an SPA composable with three shims

Port `useRightSidebar.ts` + `RightSidebar.vue` + `RightSidebarRail.vue` nearly verbatim, with:

| Nuxt API in template                                | SPA replacement                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `useCookie(OPEN_COOKIE)` / `useCookie(SIZE_COOKIE)` | `useStorage` (VueUse, localStorage) — Studio is client-only, no SSR hydration concern |
| `route.meta.rightSidebar` (Nuxt)                    | vue-router `meta: { rightSidebar: true }` in `router.ts` — API-identical              |
| `<Icon name="i-lucide-*">`                          | direct `@lucide/vue` component imports (already our convention)                       |

The controller API (`registerPanel`, `useRightSidebarPanel`, `widthVars`, tiered resize, `Cmd/Ctrl+.`) is kept identical to the template so future template updates diff cleanly. The SSR-comment caveats in the template code don't apply (SPA), but keep the tri-state open preference and the `defaultOpen` semantics — the editor wants `defaultOpen: true`.

### D4 — What goes into the right sidebar (initial panel map)

| Route                                     | Panel content (moved from main column / action rail)                                                                                                                                                                                                                                                           | `defaultOpen` |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/content/:collection/:id` (entry editor) | **Entry details panel**: `StudioEntryStatusRail` content, `StudioWorkflowCard`, `StudioEntryPublicWorkflowPanel`, `StudioEntryTranslationReadinessPanel`, `StudioRouteStatusCard`, `StudioVersionHistoryCard` — restructured as stacked sections (Tabs or Collapsible groups: **Status · Workflow · History**) | `true`        |
| `/content/:collection` (entry list)       | Selected-entry quick preview / metadata (phase 2, optional)                                                                                                                                                                                                                                                    | `false`       |
| `/assets`                                 | Asset metadata / details (`StudioAssetMetadataDialog` content becomes a panel; dialog kept for the picker context)                                                                                                                                                                                             | `false`       |
| `/reviews`                                | Review / website-change detail for the selected item                                                                                                                                                                                                                                                           | `false`       |
| `/activity`                               | Activity event detail (phase 2, optional)                                                                                                                                                                                                                                                                      | `false`       |
| Other routes                              | No panel registered → toggle hidden (controller's `available` handles this)                                                                                                                                                                                                                                    | —             |

`StudioActionRail.vue` / `StudioActionRailToggle.vue` and the `useActionRail` composable are **retired** once the editor panel ships; their triggers move to the header's right-sidebar toggle. Deletion happens only after the editor E2E checks pass (§8.5).

### D5 — Primitive refresh strategy

For the 26 existing ui sets: replace wholesale with the template version, then re-apply the prefix codemod. Our primitives must not carry local patches — if a diff against the pre-migration file shows intentional behavior changes (check `git log` per folder first), those are re-applied as documented patches listed in the PR description. Add from the template: `sonner` (optional — see D6), `resizable`, `popover`, `tabs`, `table`, `kbd`, `breadcrumb`, `tooltip` (already present — refresh), `drawer` (only if a mobile need appears).

### D6 — Toasts stay custom (for now)

We have no toast library; confirm/prompt are Promise-based composables. The template uses `vue-sonner`. **Decision: do not adopt sonner in this migration** — it adds a dep to a publishable module and nothing currently calls `toast()`. Re-evaluate after the shell lands. (If adopted later, mount `<Toaster>` in `App.vue` next to `StudioGlobalConfirm`.)

### D7 — Theme settings surface

Port `ThemeCustomize.vue` / `AppSettings.vue` in reduced form into **Settings → Appearance** (a new section in `pages/settings.vue`): color theme, radius/mono/scaled variant, dark mode. Persist in localStorage (`useStorage`), applied as classes on the `.ginko-cms` root element in `Layout.vue` (the SPA equivalent of the template's `<body>` classes in `app.vue`). The existing `cmsConfig.sidebar?.dark` consumer option must keep working (it maps onto the same class mechanism).

### D8 — Publish actions live in both the top bar and the panel, backed by one shared flow

The publish button in `StudioEntryTopBar` is **canonical** — a primary, high-stakes action must never be gated behind a closable/resizable panel. The panel's Workflow section adds a **contextual trigger** next to readiness/impact info, since that is where blockers are reviewed. Anti-drift rule: both triggers invoke the same shared publish dialog component driven by `useEntryPublishing` — two entry points, one flow, so validation and behavior can never diverge. (Same rule applies to checkpoint/restore if surfaced in both places.)

## 6. Target architecture (after migration)

```
studio-app/src/
  Layout.vue                      # SidebarProvider → StudioSidebar → SidebarInset(z-10)
                                  #   → StudioHeader → @container/main slot
                                  #   → RightSidebarRail → RightSidebar
                                  # access-state cards unchanged
  composables/
    useRightSidebar.ts            # ported controller (D3)
    useAppearance.ts              # theme classes (D7)
  components/
    ui/…                          # refreshed + new primitive sets (D5)
    layout/                       # NEW: shell components ported from template
      RightSidebar.vue
      RightSidebarRail.vue
    studio/
      StudioSidebar.vue           # rebuilt on template AppSidebar structure,
      StudioSidebarNav.vue        #   still fed by lib/studioNavigation.ts
      StudioSidebarUser.vue
      StudioHeader.vue            # template Header: trigger, breadcrumbs, slot,
                                  #   right-sidebar toggle (Cmd/Ctrl+.)
      editor/
        StudioEntryDetailsPanel.vue  # NEW: right-sidebar panel composition (D4)
        …                            # existing cards reused inside it
  styles/
    index.css                     # merged tokens (D2)
    themes.css                    # ported color/type themes, .ginko-cms-scoped
```

## 7. Migration plan (phases, each independently verifiable)

Work happens on a feature branch (`studio-shadcn-shell`), one PR per phase. `pnpm test`, `vue-tsc`, `studio:build`, and playground boot must be green at every phase boundary (§8.1).

### Phase 0 — Tooling & baseline (0.5 day)

1. Write the **prefix codemod** (`scripts/ginkoify-template.mjs`): rewrites class attributes in copied template `.vue`/`.ts` files — `bg-background` → `ginko:bg-background`, incl. variants (`hover:`, `md:`, `dark:`, `data-[...]:`, `group-*`, `@container` variants) and `cn(...)`/CVA string literals. Also rewrites `i-lucide-*` `<Icon>` usages to `@lucide/vue` imports where trivially mappable (flag the rest).
2. Capture the **visual baseline**: script the 11 routes in the playground (light + dark) and store screenshots under `test/__screenshots__/pre-migration/` (or a scratch dir) for before/after comparison.
3. Record current bundle sizes of `assets/main.js` / `main.css` for the budget check in §8.6.

**Exit criteria:** codemod has unit tests on representative class strings (incl. arbitrary values `w-[57.5vw]`, `data-[state=open]:`, container queries `@md/main:`); baseline screenshots exist.

### Phase 1 — Tokens & themes (1 day)

1. Merge template `tailwind.css` `:root`/`.dark` values into `styles/index.css` per D2. Diff token-by-token; keep any deliberate Ginko brand values (document each keep).
2. Port `themes.css` re-scoped under `.ginko-cms`.
3. Add `tw-animate-css` import (verify it respects the prefix; if not, vendor the needed keyframes).
4. Add new tokens (`--header-height`, `--warning`, chart vars) with `--ginko-cms-*` fallbacks.

**Exit criteria:** §8.2 token checks pass; app renders with new palette but old shell; consumer-override test (§8.2 #4) passes.

### Phase 2 — Primitive refresh (1 day)

1. Replace the 26 existing ui sets with template versions (run codemod); re-apply documented local patches (D5).
2. Add the new sets needed for the shell and right sidebar (`resizable`, `breadcrumb`, `tabs`, `kbd`, `popover`, `table`).
3. Update `studio-ui-primitives.test.ts` for any renamed exports/props.

**Exit criteria:** full test suite green; §8.3 grep audits clean on `components/ui/`; every page still renders (smoke-click all 11 routes in playground).

### Phase 3 — Shell swap (1.5 days)

1. Rebuild `StudioSidebar.vue` / `StudioSidebarNav.vue` / `StudioSidebarUser.vue` on the template's `AppSidebar` + `SidebarNavGroup`/`SidebarNavLink` structure, fed unchanged by `studioNavigation.ts`. Keep `data-testid` hooks and the capability-based filtering.
2. Rebuild `StudioHeader.vue` on template `Header.vue`: sticky, `SidebarTrigger`, breadcrumbs (derive from vue-router matched routes + `studioNavigation.ts` labels — not raw path segments, since `/content/:collection/:id` needs human labels), page-level slot, right-sidebar toggle button (hidden while unavailable).
3. Update `Layout.vue` main area to the template structure: `SidebarInset` with `z-10`, page wrapper `@container/main ginko:p-4 lg:ginko:p-6`. Keep access-state cards and `studioClass` logic exactly as-is.
4. Wire appearance classes (D7) onto the `.ginko-cms` root.
5. Reconcile page-level scroll/overflow: current `Layout.vue` uses `overflow-hidden` full-height panes; template uses a growing document scroll. Decide per-page (editor keeps its own internal scroll containers) and document the rule in the PR.

**Exit criteria:** §8.4 checklist items 1–8 pass on all routes; sidebar collapse (`Cmd/Ctrl+B` if we adopt it, or existing trigger), dark mode, and `cmsConfig.sidebar.dark` all work; before/after screenshots reviewed.

### Phase 4 — Right sidebar system (1 day)

1. Port `useRightSidebar.ts`, `RightSidebar.vue`, `RightSidebarRail.vue` with the D3 shims (codemod for classes).
2. Register in `Layout.vue`; add `meta: { rightSidebar: true }` to editor/assets/reviews routes in `router.ts`.
3. Add unit tests for the controller: tri-state open preference, `defaultOpen` interaction, registration/disposal on route change (the disposer-races-new-registration case the template guards), clamp math for `setSize`, availability from route meta vs. registration.
4. Verify keyboard shortcut `Cmd/Ctrl+.` doesn't collide with the command palette or TipTap editor keymaps (test with focus inside the editor — the shortcut must not fire while typing produces `.` normally; template guards on meta/ctrl so it should be safe, verify anyway).

**Exit criteria:** toggle appears only on panel routes; open/width persist across reload (localStorage); drag-resize respects tier bounds; mobile (<768px) uses the Sheet.

### Phase 5 — Editor details panel (1–1.5 days)

1. Build `StudioEntryDetailsPanel.vue` composing the existing editor cards (D4 table) into Status / Workflow / History sections.
2. Register it from `pages/[collection]/[id].vue` via `useRightSidebarPanel({ title: entry title, defaultOpen: true, props: () => ({ editor }) })`. **Decision: do not rely on inject across the boundary** — the panel renders in the layout tree (`RightSidebar`), not the page subtree, so page-level provides won't resolve there. Instead: props-getter carries the editor context across, and `StudioEntryDetailsPanel.vue` calls `provideStudioEntryEditorContext(props.editor)` at its top — so all existing editor cards keep their current `inject` unchanged.
3. Slim the editor main column: remove the migrated cards/rail from `StudioEntryEditorShell.vue` / `StudioEntryTopBar.vue`; the main column becomes fields + TipTap.
4. Retire `StudioActionRail.vue` / `StudioActionRailToggle.vue` after E2E passes.
5. Add asset-details and review-details panels (thin wrappers around existing components) for `/assets` and `/reviews`.

**Exit criteria:** §8.5 editor workflow E2E passes; no regression in `test/runtime/editor/*`; publish/checkpoint/history flows all reachable from the panel; TipTap untouched (`git diff --stat studio-app/src/editor/` is empty).

### Phase 6 — Per-page consistency pass (1–1.5 days)

For each of the 11 routes, apply the audit checklist (§8.4) and fix violations: page headers via `StudioPageHeader` aligned to template spacing, cards/empty states/skeletons on refreshed primitives, consistent `ginko:gap-*`/`ginko:p-*` rhythm, semantic tokens only.

**Exit criteria:** §8.3 greps clean repo-wide (studio-app); §8.4 signed off per page (checklist table committed in the PR description); after-screenshots captured.

### Phase 7 (follow-up, separate PR) — Auth pages (1–1.5 days)

Port `src/auth/pages/{signin,register}.vue` + `src/auth/components/` from hand-written `cms-auth-layout__*` CSS to the template's `layout/Auth.vue` + auth form patterns. Constraint: these are **Nuxt runtime** pages, not the SPA — they need their own scoped Tailwind entry or reuse of the built `main.css` under a `.ginko-cms` wrapper. Scope decided in its own mini-RFC section when picked up.

## 8. Verification plan

### 8.1 Gates at every phase boundary (CI + local)

```bash
pnpm -w test                 # all 126+ test files
pnpm -w typecheck            # vue-tsc, or per-package equivalent
pnpm --filter @lupinum/ginko-cms studio:build   # SPA builds, fixed asset names preserved
ls packages/cms/dist/… | grep -E 'assets/main\.(js|css)'   # host-bridge contract intact
pnpm --filter playground dev # boots; /studio route mounts without console errors
pnpm -w lint
```

### 8.2 Token & theming checks (Phase 1)

1. **No orphan vars:** every `var(--x)` referenced in built `main.css` is defined in `:root`-equivalent scope. Script: extract `var\(--[a-z-]+` from the built CSS, diff against defined custom properties.
2. **Dark completeness:** every token defined in the light block has a counterpart in `.dark .ginko-cms` (scripted diff of the two blocks).
3. **Theme classes:** for each `.color-*` and `.theme-*` selector ported, toggling the class in the playground changes `--primary`/`--radius` (spot-check via devtools or a small runtime test).
4. **Consumer-override contract test (must-have):** a playground page sets `--ginko-cms-primary: <distinct value>` on a wrapper and asserts the rendered Studio button uses it. Add as a runtime test — this is the public API we must not break.
5. **Scope leak check:** render playground page containing Studio + non-Studio content; assert non-Studio elements' computed styles are unaffected (no unscoped selectors escaped `.ginko-cms`).

### 8.3 Automated consistency audits (Phases 2, 6 — wire into CI as a script)

All run over `packages/cms/studio-app/src` (excluding `editor/lib` internals where noted):

```bash
# 1. No unprefixed Tailwind utilities in class attributes (codemod misses)
#    Heuristic: known utility roots not preceded by 'ginko:' or a variant chain ending in 'ginko:'
grep -rnE 'class="[^"]*\b(?<!ginko:)(bg|text|border|ring|p|m|px|py|mx|my|gap|flex|grid|w|h|rounded|shadow)-' --include='*.vue' src/ | grep -v 'ginko:'   # then hand-review hits

# 2. No hardcoded palette colors — semantic tokens only
grep -rnE 'ginko:(bg|text|border|ring|fill|stroke)-(red|blue|green|gray|zinc|slate|neutral|stone|amber|yellow|orange|purple|violet|pink|rose|teal|cyan|sky|indigo|emerald|lime|fuchsia)-[0-9]' --include='*.vue' src/
# expected: 0 hits (destructive/warning/muted/primary etc. instead)

# 3. No raw hex/rgb in templates or new styles
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgb\(' --include='*.vue' src/ --exclude-dir=editor
# allowlist: documented exceptions only

# 4. No new scoped-style blocks beyond the pre-migration 12
grep -rl '<style' --include='*.vue' src/ | wc -l   # must be ≤ 12, ideally fewer

# 5. Icon consistency: only @lucide/vue imports, no leftover i-lucide strings
grep -rn 'i-lucide-' --include='*.vue' src/        # expected: 0

# 6. No dead references to retired components
grep -rn 'StudioActionRail\|useActionRail' src/    # expected: 0 after Phase 5
```

Plus a **primitive-drift check**: script that diffs each `components/ui/<set>` against the template's copy modulo the prefix transform (run codemod on template copy, then `diff -r`). Expected: byte-identical except documented patches. This keeps future template pulls cheap.

### 8.4 Manual shadcn-consistency checklist (per route — table committed in Phase 6 PR)

For each of: `/`, `/model`, `/assets`, `/activity`, `/agents`, `/reviews`, `/settings`, `/site-data`, `/content/:collection`, `/content/:collection/new`, `/content/:collection/:id`:

1. Header: sticky, `SidebarTrigger` + breadcrumbs present and human-readable (dynamic segments resolved to titles).
2. Page container: `@container/main` padding rhythm (`p-4 lg:p-6`), no double-padding against inner components.
3. All interactive elements are shadcn primitives (Button/DropdownMenu/Select/Dialog/…) — no bespoke buttons/inputs left.
4. Colors: only semantic tokens; destructive actions use `destructive`, notices use `muted`/`warning`.
5. Typography scale matches template conventions (page title, section title, description, `text-muted-foreground` for secondary).
6. Empty states, loading skeletons, and error notices use `StudioEmptyState`/`Skeleton`/`StudioNotice` consistently.
7. Dark mode: no illegible or unstyled region (toggle and eyeball every route).
8. Color themes: switch to 2 non-default `.color-*` themes; primary-colored elements follow.
9. Keyboard: `Cmd/Ctrl+.` toggles panel where available; command palette unaffected; no shortcut collisions while typing in inputs/TipTap.
10. Responsive: 375px (mobile — sidebar offcanvas, right panel = Sheet), 1280px (laptop — split-view widths), ≥1536px (wide — compact panel). No horizontal body scroll anywhere.
11. RTL not in scope (matches current Studio behavior) — confirm no regression in LTR only.

### 8.5 Editor right-sidebar E2E (Phase 5 — the critical flow)

Scripted (Playwright in playground, or extend `test/runtime/editor/*` where feasible) + manual run:

1. Open `/content/<collection>/<id>` → panel opens by default (`defaultOpen: true`), title = entry title.
2. Status section reflects entry state; changes after edit + autosave (watch autosave path — panel must not steal focus or trigger extra saves).
3. Publish flow: preview impact → publish from panel → `StudioPublishOutcomeCard` shows in panel; entry list reflects new state.
4. Checkpoint + version history: create checkpoint, restore an older version from History section; editor content updates.
5. Translation readiness + locale switching from panel; locale editor state consistent with main column.
6. Navigate editor → `/assets` → panel content swaps to asset panel (registration disposal works, no stale panel).
7. Resize panel via rail drag → reload → width persisted; reset works.
8. Close panel → all primary actions still reachable: publish remains in `StudioEntryTopBar` (canonical, per D8); the panel's Workflow-section trigger opens the identical shared dialog.
9. Mobile viewport: panel opens as Sheet; editor remains usable.
10. `git diff --stat packages/cms/studio-app/src/editor/` (TipTap dir) is empty across the whole migration.

### 8.6 Regression & release checks (before merge to main)

1. Full before/after screenshot comparison (Phase 0 baseline vs. final) — reviewed route-by-route; intentional diffs annotated.
2. Bundle budget: built `main.js`/`main.css` within +15% of Phase 0 baseline (new primitives cost something; guard against accidental template-demo imports).
3. Playground smoke as a consumer: fresh `pnpm install && build` of playground, Studio mounts, sign-in → edit → publish round-trip.
4. Consumer-override contract test (§8.2 #4) green.
5. `pnpm pack` the cms package; install into a scratch Nuxt app outside the workspace; verify Studio mounts and styles are scoped (the real publish path, not just the playground symlink).
6. CHANGELOG entry: new theming options, right-sidebar behavior + shortcut, retired ActionRail, any consumer-visible token additions.

## 9. Risks & mitigations

| Risk                                                                                                                                     | Likelihood | Mitigation                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Codemod misses class variants (arbitrary values, `data-[...]`, container-query variants) → silently unstyled elements                    | Medium     | Codemod unit tests (Phase 0); grep audit §8.3 #1; screenshot diffs                                                                          |
| Provide/inject (`studioEntryEditorContext`) doesn't cross into the right-sidebar render tree (panel renders in layout, not page subtree) | Certain    | **Resolved by design** (Phase 5 step 2): props-getter across the boundary + re-provide inside the panel; existing cards' `inject` untouched |
| Template's `tw-animate-css` / primitives assume unprefixed utilities internally                                                          | Low-Med    | Verified in Phase 1/2; vendor keyframes if needed                                                                                           |
| Right-sidebar width math assumes template's inset margins; ours differ                                                                   | Low        | Constants are exported and documented; retune `MAIN_CONTENT_RESERVE_PX` after Phase 3 layout is final                                       |
| Token merge changes a value a consumer relied on via default (not override)                                                              | Low        | Token-by-token diff reviewed in Phase 1; CHANGELOG documents default changes                                                                |
| Editor scroll/overflow regressions (current shell uses fixed panes)                                                                      | Medium     | Explicit scroll-model decision in Phase 3 step 5; editor E2E §8.5                                                                           |
| Shortcut collisions (`Cmd/Ctrl+.`, `Cmd/Ctrl+B`) with command palette / TipTap                                                           | Low        | Phase 4 step 4 dedicated check                                                                                                              |

## 10. Rollout

1. Feature branch `studio-shadcn-shell`; one PR per phase (0–6), each gated on §8.1.
2. Phases 0–2 are invisible-to-users groundwork and can merge quickly; Phases 3–6 are the visible change — merge to main only after §8.6 completes.
3. Version: minor-with-notes or major for the cms package depending on whether any default token values consumers see are considered breaking — decide at Phase 1 exit based on the token diff.
4. Phase 7 (auth) ships as its own follow-up PR.

## 11. Open questions

1. ~~**Publish actions placement**~~ — **Decided (D8):** both, backed by one shared dialog; top bar canonical.
2. Should entry list (`/content/:collection`) get a selection-preview panel in this migration or later? (Marked phase-2/optional in D4.)
3. Adopt the template's `G-*` / `Cmd+B` shortcut conventions wholesale, or keep current Studio shortcuts? (Decide in Phase 3.)
4. Do we expose the color-theme picker to end users (Settings → Appearance) or gate it behind a `cmsConfig` flag so host apps control branding? (Decide in Phase 3/D7; default proposal: config-gated, on in playground.)
