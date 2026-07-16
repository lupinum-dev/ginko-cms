# Design

This file captures the design system the Ginko CMS Studio runs on. It exists so design choices stop being implicit. When in doubt about a token, surface, or pattern, check here first; if the answer isn't here, add it.

## Register

**Product.** Design serves the product, not the other way around. Editors live in this UI; it has to be calm and dense, not loud and decorative. PRODUCT.md anti-references "decorative SaaS dashboards" — the studio's job is to disappear into a fast workflow.

### Binding interaction principles (design review, 2026-07-15)

1. **One primary action per screen** — everything else is secondary/ghost or in a `⋯` menu; a status never wears the CTA's clothes.
2. **Say it once** — a status or fact appears in exactly one place per screen.
3. **Progressive disclosure** — developer/process detail collapses behind `Advanced details` (one disclosure per surface, not three).
4. **Content in the card, metadata in the right sidebar** — and the content column always wins the space fight (metadata panels register `compact`).
5. **Empty ≠ visible** — zero-count rows, "nothing selected" panels, and 0-chips disappear rather than render placeholders.
6. **One vocabulary, no internals** — no document ids, schema terms, or workflow jargon in the default persona's view; language machinery only exists on multilingual sites.
7. **Defaults over options** — every visible setting must justify why it isn't a good default.
8. **Grids respond to their container** — anything inside the inset card, a panel, a split pane, or a dialog uses `@container` variants (`@2xl/@3xl/@5xl`), never viewport `md:`/`lg:`.

## Color

OKLCH for everything. **Pure neutrals** (chroma 0) for all chrome surfaces AND for the default primary.

> Updated 2026-07-15 (design review): the Phase P template-parity pass replaced the emerald
> accent with the shadcn template's neutral primary. This section now describes the shipped
> system; the earlier emerald-single-accent scheme is retired.

### Strategy

**Restrained, neutral-first.** The default `--primary` is `--studio-action` = near-black `oklch(0.205 0 0)` (near-white in dark) — primary actions read as weight, not hue. `--ring` is neutral grey (`oklch(0.708 0 0)`, template parity). Color is reserved for SEMANTICS: `--success` (`oklch(0.63 0.09 160)`, decoupled from primary), `--warning`, `--destructive` — always via tokens, always paired with their `*-fg` partners on tinted surfaces.

**Optional accent themes.** `themes.css` ships user-selectable accent themes (`.color-blue`, `.color-violet`, …) that re-point `--primary`; Settings → Appearance exposes a curated set of five (default, blue, green, amber, violet). Studio components must therefore never assume the primary's hue — only its role.

### Light tokens (`oklch` triples)

| Token                  | Value                | Use                                                            |
| ---------------------- | -------------------- | -------------------------------------------------------------- |
| `--background`         | `1 0 0`              | Body bg fallback                                               |
| `--foreground`         | `0.145 0 0`          | Default text                                                   |
| `--card`               | `1 0 0`              | Card surface (white)                                           |
| `--studio-shell-bg`    | `0.97 0 0`           | Page canvas behind cards (pure neutral)                        |
| `--sidebar`            | `0.985 0 0`          | Sidebar tower surface                                          |
| `--muted`              | `0.97 0 0`           | Sub-surface backgrounds, hover states                          |
| `--muted-foreground`   | `0.556 0 0`          | Secondary text                                                 |
| `--primary`            | `0.205 0 0`          | Neutral near-black (= `--studio-action`). Primary CTAs         |
| `--primary-foreground` | `0.985 0 0`          | Text/icons on primary                                          |
| `--success`            | `0.63 0.09 160`      | Success semantics; soft surfaces via `/10`–`/12` opacity       |
| `--success-fg`         | `0.5 0.13 162`       | **Text on tinted-success bg.** AA-compliant pairing.           |
| `--warning`            | `0.769 0.188 70.08`  | Amber tint surface                                             |
| `--warning-fg`         | `0.48 0.13 70`       | **Text on tinted-warning bg.**                                 |
| `--destructive`        | `0.577 0.245 27.325` | Solid destructive (delete buttons)                             |
| `--destructive-fg`     | `0.45 0.2 27`        | **Text on tinted-destructive bg.**                             |
| `--border`             | `0.922 0 0`          | Default border. Used at /40 (default), /60 (strong), /30 (sub) |
| `--ring`               | `0.708 0 0`          | Focus ring; neutral grey (template parity)                     |

### Dark tokens

Mirror structure with parallel `--ginko-cms-dark-*` overrides. Primary flips to near-white (`--studio-action` dark value); `--sidebar-primary` follows `--studio-action`. Borders use **alpha** rather than fixed grey: `--border: oklch(1 0 0 / 0.10)`, `--input: oklch(1 0 0 / 0.15)` — they pick up the surface beneath, so a card on a dialog and a card on the page get appropriately-weighted edges.

**Dark elevation ladder** (deliberate divergence from the Phase-1 template snapshot, matching shadcn's own dark refresh — every overlay tier is one visible step above the one it floats on):

| Lightness | Tier          | Tokens                                        |
| --------- | ------------- | --------------------------------------------- |
| `0.145`   | Well          | `--background` (inset canvas)                 |
| `0.205`   | Canvas / card | `--card`, `--sidebar`, dark page canvas       |
| `0.269`   | Overlay       | `--popover` — menus, selects, **and dialogs** |
| `0.32`    | Nav hover     | `--sidebar-accent`                            |
| `0.371`   | Hover fill    | `--accent`                                    |

Dialogs render on `bg-popover` (not `bg-background`), so consumers theme them through `--ginko-cms(-dark)-popover`.

### Pairing rule

Tinted backgrounds (`bg-success/12`, `bg-warning/15`, `bg-destructive/10`) **must** use the `*-fg` foreground token, not the `--success` / `--warning` color directly. The `--success` lightness (0.696) on a 12%-tinted-success background fails WCAG AA (~2.6:1). `--success-fg` (0.5) gets you to ~5.2:1.

**Dark tint rule:** tinted semantic surfaces read muddy at light-mode opacities on dark canvases — every `bg-{success,warning,destructive}/5..15` pairs with a `dark:` bump roughly one step up (`/5→/10`, `/10→/15`, `/12→/20`, `/15→/25`), always with `*-fg` text.

### Charts

`--chart-1` through `--chart-5` form a **greyscale lightness ladder** (`0.87 → 0.556 → 0.439 → 0.371 → 0.269`, all chroma 0). The studio is an editor cockpit; charts when they appear (asset-storage breakdown, version-history density) match the surrounding calm rather than introducing decorative palette colors. Multicolor charts would clash with the single-accent rule.

### Banned

- `#000` / `#fff` — both fail the pure-neutral rule (use `--background` / `--foreground`).
- Warm chroma on chrome surfaces — page wash, sidebar, sidebar-accent must stay chroma 0.
- Hard-coded `text-emerald-700`, `bg-amber-500/10`, etc. inside studio components — drift. Use semantic tokens. Exception: pages that render an atmospheric warning surface (like the issue-card amber backgrounds) — those are intentional and stay literal.
- Gray text on colored backgrounds. Always pair tinted bg with the matching `*-fg`.

## Typography

Type ladder. Seven steps. Apply via `studio-text-*` class (see `styles/index.css`) or compose Tailwind so the result resolves to one of these. **No free-form font sizes.**

| Step         | Size  | Weight | Letter | Use                                         |
| ------------ | ----- | ------ | ------ | ------------------------------------------- |
| `display`    | 32 px | 600    | 0      | Empty states and dashboard hero copy        |
| `page-title` | 18 px | 600    | 0      | Page headers and editor top bar leaf titles |
| `title`      | 16 px | 600    | 0      | Section headers, card titles                |
| `body`       | 14 px | 400    | 0      | Form fields, button labels, default text    |
| `label`      | 14 px | 500    | 0      | Field labels, secondary controls            |
| `caption`    | 12 px | 500    | 0      | Helpers, timestamps, locale codes           |
| `eyebrow`    | 12 px | 600    | 0      | Section group labels (CONTENT, MANAGE)      |

Geist / Geist Mono (self-hosted via `@fontsource-variable`, template parity since Phase P). Cap body line-length at 65–75ch where possible.

## Spacing

Seven steps. Same logic as type — components pick one, never a free-form value.

| Token         | px  | Use                                       |
| ------------- | --- | ----------------------------------------- |
| `--space-xs`  | 4   | Chip↔chip, label↔input                    |
| `--space-sm`  | 8   | Icon↔text, intra-row                      |
| `--space-md`  | 12  | Between related fields                    |
| `--space-lg`  | 16  | Card inner padding (compact)              |
| `--space-xl`  | 24  | Card inner padding and canvas L/R padding |
| `--space-2xl` | 32  | Wider canvas padding                      |
| `--space-3xl` | 40  | Canvas bottom padding, between sections   |

Tailwind's default scale is acceptable as long as the resulting spacing maps onto these — `gap-3` (12 px) maps to `--space-md`, `p-6` (24 px) to `--space-xl`, etc.

## Borders

Three weights. Anything else is drift.

| Class              | Use                                                               |
| ------------------ | ----------------------------------------------------------------- |
| `border-border/40` | **Default outer card edge.** ~114 sites use this; it's the canon. |
| `border-border/60` | Strong separator (header bottom, sidebar bottom).                 |
| `border-border/30` | Sub-row dividers inside a card.                                   |

Sub-cards (a tinted-bg block inside an outer card) typically use **no border** — the bg shift is enough. Avoid nesting border + bg-card inside a parent border + bg-card.

**Dark mode** uses alpha-based borders (`oklch(1 0 0 / 0.10)`) rather than a fixed dark grey. They render as hairlines that adapt to the surface they sit on — a card-on-page and a card-on-dialog both get appropriately-weighted edges without retuning per surface.

## Shadows

`shadow-sm` on outer cards. `shadow-xs` rarely. No `shadow-lg` / `shadow-xl` on routine surfaces — those land in dialogs/popovers only.

## Radii

Resolved from `--radius: 0.625rem` (10 px) via a **multiplicative scale**, so retuning the base radius reflows the whole system proportionally.

| Class          | Multiplier | Resolved | Use                                                        |
| -------------- | ---------- | -------- | ---------------------------------------------------------- |
| `rounded-sm`   | 0.6×       | 6 px     | kbd chips, tiny chips                                      |
| `rounded-md`   | 0.8×       | 8 px     | Buttons, badges, sub-controls                              |
| `rounded-lg`   | 1.0×       | 10 px    | Inner sub-cards, view-toggle chassis                       |
| `rounded-xl`   | 1.4×       | 14 px    | Outer cards (Section, ListFrame, EmptyState, Locale panel) |
| `rounded-2xl`  | 1.8×       | 18 px    | Reserved (large surfaces, hero cards)                      |
| `rounded-3xl`  | 2.2×       | 22 px    | Reserved                                                   |
| `rounded-4xl`  | 2.6×       | 26 px    | Reserved                                                   |
| `rounded-full` | —          | full     | Avatars, small status pills                                |

## Density

Compact-but-not-cramped. Editors work in this all day.

- Sidebar menu height: 2 rem (32 px). Dense desktop product, but large enough to scan on high-DPI displays.
- Shell header: `--studio-shell-header-height` = 3.5 rem (56 px). Toolbar: `--studio-shell-toolbar-height` = 2.75 rem (44 px).
- Header buttons: `h-8` (32 px). Icon buttons: `size-8`.
- Form inputs: `h-9` (36 px) default, `h-8` for dense contexts.
- Section card padding: `p-5` (20 px) default, `p-4` (16 px) compact.
- Canvas padding: `px-6 pb-8` (24 / 32 px).

## Motion

Four durations, three curves. Components compose — never invent a per-component duration; reference the tokens (`duration-(--motion-*)` in Tailwind, `var(--motion-*)` in keyframes).

| Token / class        | Duration | Curve                 | Use                                                 |
| -------------------- | -------- | --------------------- | --------------------------------------------------- |
| `studio-motion-fast` | 120 ms   | `ease-out-quart`      | Hover, focus, color flips, page crossfade           |
| `studio-motion-base` | 180 ms   | `ease-out-quart`      | State transitions (status pill flips, collapsibles) |
| `studio-motion-slow` | 280 ms   | `ease-in-out`         | Layout-adjacent (sheet slide)                       |
| `--motion-panel`     | 240 ms   | `--motion-ease-panel` | Structural panels (both sidebars, inset resize)     |

All three utility classes transition only color/border/box-shadow/opacity by default. Components that need transform opt in.

**Page transitions:** opacity-only crossfade (`--motion-fast`) on the RouterView in App.vue — no translate (it fights the fixed-pane scroll model), no `appear`.

`prefers-reduced-motion: reduce` is **token zeroing**: the media query collapses every `--motion-*` (and tw-animate's `--tw-duration`) to 1 ms, so anything animated through the tokens needs no per-class rules.

**Reveal:** outer cards (`StudioSection`, `StudioListFrame`, `StudioEmptyState`) opt into `studio-reveal` — `@starting-style` fade + 4 px settle on first paint. Skipped under reduced motion. Subtle, never bouncy. No bounce, no elastic, no spring physics on the chrome.

## Components

### Sidebar

- 16 rem expanded; collapses to 3.5 rem (icon mode); mobile sheet is 18 rem.
- White surface (`bg-sidebar`), border-right `border-border/40`.
- Logo: emerald-filled rounded-lg `h-7 w-7` square with white pyramid SVG.
- Title: "Ginko Studio" + small inline version chip.
- Nav menu items: 2 rem height, `text-sm`, `border-radius: 0.375rem`. Active state = emerald solid pill (token-driven via `--sidebar-primary`).
- Section labels: `studio-text-eyebrow` (12 px / 600 / uppercase), 60 % opacity.
- Footer: user button with `h-7 w-7` avatar, name + email, ChevronDown trigger.

### Header

- White surface, `h-14`, `border-b border-border/60`.
- Breadcrumb: Lucide icon → muted label → `ChevronRight h-3.5` → leaf icon → `font-medium text-foreground` label. `text-sm` throughout.
- No global search button; search lives in the sidebar (⌘K).

### Cards

Three card primitives + helpers. Don't invent more.

- **`StudioSection`**: titled white card. Header has title + optional description + optional badge. Body slot. `rounded-xl border-border/40 shadow-sm`. Use for grouped editor content.
- **`StudioListFrame`**: list-bearing card. Optional header bar with title/count/actions on `bg-muted/20`. Use for collection lists, asset lists.
- **`StudioEmptyState`**: dashed-bordered placeholder. Icon container + title + description + action slot. PRODUCT.md anti-references "minimal empty states that hide the next action" — always pass an action.

Inspector content uses **`StudioInspectorSection`** — not a card, a divided block inside the rail. `py-5`, optional `border-b border-border/40`.

### Layout primitives

These compose with the cards above. Use them instead of re-implementing the same shape inline.

- **`StudioPageHeader`** ([StudioPageHeader.vue](packages/cms/studio-app/src/components/studio/StudioPageHeader.vue)): the title strip at the top of every page. `eyebrow` + `title` props, plus `description` / `breadcrumb` / `badges` / `actions` slots. Container: `flex min-h-14 items-start justify-between gap-4 border-b border-border/40 bg-card px-5 py-3`. Title uses the page-title step; eyebrow uses the 12 px eyebrow step.
- **Rows and irregular lists**: use shadcn-style `Item` / `ItemGroup` primitives for composed list rows and `StudioListFrame` or native tables for table-like data. Do not restore a Studio-specific row wrapper.
- **Canvas widths**: `--studio-canvas-max-width` is 80 rem (1280 px), `--studio-canvas-wide-max-width` is 96 rem (1536 px), `--studio-action-rail-width` is 20 rem (320 px), and `--studio-action-rail-collapsed-width` is 3.5 rem (56 px). Header content, toolbar controls, list frames, editor cards, and rails align through these tokens.
- **Page body rhythm**: `.studio-page-body` is the default inner padding for normal Studio pages. Pair it with `.studio-page-content` or `.studio-page-content--wide`; do not reintroduce page-specific `p-4 sm:p-5 lg:p-6` drift.
- **`StudioWorkspace`** owns the shell regions: header, toolbar, content, and optional rail. Pages provide content; they do not redefine shell geometry.
- **`useStudioActionRailController`** owns rail state, persistence, breakpoint policy, sheet state, and toggle labels. Page headers use `StudioActionRailToggle`; they do not compute rail labels, icons, or breakpoint behavior locally.
- **`StudioActionRail`** owns the right rail frame. Desktop renders a 320 px rail or 56 px collapsed icon rail; tablet/mobile render a right-side shadcn `Sheet`. Rail content scrolls independently and the actions slot is pinned at the bottom.
- **Rail copy**: `Action rail` is an internal implementation name only. User-facing panel headings, sheet titles, tooltips, and aria labels use `Details`, `Entry details`, `Collection details`, `Show details`, or `Hide details`.

For dialogs: use shadcn-style `<Dialog>` + `<DialogFooter>` (in `src/components/ui/dialog/`). Page actions should live in the relevant `StudioPageHeader`, `StudioSection`, or `StudioListFrame` slot instead of a separate footer wrapper.

### Editor shell

- Page chrome (`.studio-shell`) provides the warm-neutral wash.
- Layout: sidebar + main column. Main column = StudioHeader + slot.
- Entry editor: `StudioEntryTopBar` (breadcrumb + save/publish/toggle actions) + `StudioEntryCompareToolbar` (single/compare + locale picker) + canvas + `StudioActionRail`.
- The right rail is a first-class shell region at `--studio-action-rail-width` (320 px). It owns workflow context, readiness, public URL, translations, diagnostics, and history. Rail padding, title, sheet behavior, collapsed state, and sticky actions come from `StudioActionRail`, not from each rail body.
- Compare mode keeps the rail when the user has it open. Two-column compare starts at `min-[1600px]`; below that, locales stack so the rail does not force cramped editor columns.
- Collection list pages use `StudioCollectionActionRail` for work queue state, filters, translation blockers, and primary collection actions. Non-content pages keep the same workspace/header/canvas alignment without forcing an empty rail.

### Status pill

`StudioStatusPill` is the single source of truth for status display. Tones:

| Tone      | Variant                                           | Use                        |
| --------- | ------------------------------------------------- | -------------------------- |
| `success` | Badge `success` (`bg-success/12 text-success-fg`) | Published, ready, public   |
| `warning` | Badge `warning` (`bg-warning/15 text-warning-fg`) | Draft, stale, blocked-soft |
| `danger`  | Badge `destructive` (solid red)                   | Failed, archived           |
| `neutral` | Badge `soft`                                      | Default, unknown           |

The pill carries `studio-motion-base` so tone changes crossfade, not snap.

## Anti-patterns

These are forbidden in the studio shell. Match-and-refuse rather than re-discuss.

- **Side-stripe borders** (`border-l-4 border-emerald-500` as a callout). Use a full border or a tinted bg.
- **Gradient text** (`bg-clip-text`). Solid color, weight contrast.
- **Glassmorphism on cards**. Solid bg or nothing.
- **Hero metric template** (big number + small label + gradient + 4 stat tiles).
- **Identical card grids** (5 same-sized cards with icon + heading + text). Vary, or list.
- **Modal as first thought.** Inline disclosure, expanding row, or progressive panel first.
- **Em dashes in copy.** Use commas, colons, semicolons, periods, parentheses.
- **Decorative motion.** Particles, cursor-follow gradients, parallax, generative art. Studio is calm.

## Files of record

- Theme tokens & utilities: [packages/cms/studio-app/src/styles/index.css](packages/cms/studio-app/src/styles/index.css)
- Card primitives: [`StudioSection`](packages/cms/studio-app/src/components/studio/StudioSection.vue), [`StudioListFrame`](packages/cms/studio-app/src/components/studio/StudioListFrame.vue), [`StudioEmptyState`](packages/cms/studio-app/src/components/studio/StudioEmptyState.vue), [`StudioInspectorSection`](packages/cms/studio-app/src/components/studio/StudioInspectorSection.vue)
- Layout primitives: [`StudioPageHeader`](packages/cms/studio-app/src/components/studio/StudioPageHeader.vue), [`StudioWorkspace`](packages/cms/studio-app/src/components/studio/StudioWorkspace.vue)
- Field rhythm: [`StudioFieldShell`](packages/cms/studio-app/src/components/studio/StudioFieldShell.vue) plus `components/ui/field` primitives (shared label / input / description / error pattern)
- Status: [`StudioStatusPill`](packages/cms/studio-app/src/components/studio/StudioStatusPill.vue), [`Badge`](packages/cms/studio-app/src/components/ui/badge/index.ts)
- Editor shell: [`StudioEntryEditorShell`](packages/cms/studio-app/src/components/studio/editor/StudioEntryEditorShell.vue), [`StudioEntryTopBar`](packages/cms/studio-app/src/components/studio/editor/StudioEntryTopBar.vue), [`StudioEntryStatusRail`](packages/cms/studio-app/src/components/studio/editor/StudioEntryStatusRail.vue)
- Sidebar: [`StudioSidebar`](packages/cms/studio-app/src/components/studio/StudioSidebar.vue), [`StudioSidebarNav`](packages/cms/studio-app/src/components/studio/StudioSidebarNav.vue)
