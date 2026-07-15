# Audit A — Design-Token & Color Fidelity

Scope: `packages/cms/studio-app/src` (*.vue, *.ts, *.css), read-only, against `DESIGN.md`.
Branch: `studio-shadcn-shell`. Date: 2026-07-15.

Headline: component-level color hygiene is **strong** — semantic tokens are used almost everywhere and tinted-bg / `*-fg` pairing is correct in nearly all cases. The most material finding is **Class 6: DESIGN.md's Color tables are stale relative to the shipped tokens** (post "Phase P — visual parity with the dashboard template"). A handful of palette-literal and hex-literal spots remain, mostly in a dev debug panel and tag-color data.

---

## Class 1 — Hardcoded Tailwind palette classes on studio components

Only one file uses raw palette classes; everything else routes through semantic tokens.

- `editor/ui/DebugPanel.vue:15,17,20,24,25,31,39,49,52,55,61,66` — `ginko:bg-slate-950`, `ginko:text-slate-100/300/400/500`, `ginko:border-slate-700/800/900`, `ginko:bg-slate-900` — a full hardcoded slate "dark terminal" palette instead of tokens (`bg-card`/`bg-muted`/`text-muted-foreground`/`border-border`) — **suggested fix:** re-skin with semantic tokens (or a dedicated `--studio-debug-*` token set) so it follows theme + dark mode — **P3** (dev-only editor debug overlay, not shipped chrome, but a true palette-literal violation and it will not respond to the theme).

No `-emerald-/-amber-/-red-/-green-/-blue-/-zinc-/-gray-/-neutral-/-stone-` literals found on any user-facing studio component. No atmospheric-warning literal-palette surfaces found (the amber warning surfaces all use semantic `warning` tokens, not `amber-*`), so DESIGN's literal-amber exception is currently unused.

---

## Class 2 — Raw hex / rgb / hsl / oklch literals outside `styles/*.css`

- `composables/internal/useStudioAssetFinder.ts:149` — `const tagPalette = ['#ef4444','#f97316','#3b82f6','#22c55e','#a855f7','#eab308','#14b8a6']` — categorical tag-color palette hardcoded as hex in TS (these are Tailwind 500-ish literals) — **suggested fix:** move to a `--studio-tag-*` token ladder in `styles/`, or accept as content-level data coloring and document the exception — **P2** (possibly-sanctioned: tag chips are content categorization, not chrome; but violates "no hex outside styles").
- `composables/internal/useStudioAssetFinder.ts:159` — `?? '#888888'` fallback tag color — **fix:** use a token (e.g. `var(--muted-foreground)`) — **P3**.
- `components/studio/StudioAssetBrowser.vue:1814` — inline `backgroundColor: … ?? 'oklch(0 0 0 / 18%)'` fallback for a 6px tag dot — oklch literal outside styles — **fix:** fall back to `var(--border)` / `var(--muted-foreground)` token — **P3**.
- `components/Icon.vue:108–135` — SVG country-flag `fill="#fff"`, `#ffda44`, `#d80027`, `#333`, `#eee`, `#0052b4`, `#333` (DE/FR/other locale flag glyphs) — **assessment:** legitimate real-world flag colors that cannot be tokenized; the `#fff` here is a flag field, not a chrome surface, so DESIGN's `#fff` ban does not meaningfully apply — **P3 / acceptable** (note only, so a naive grep doesn't re-flag).
- `components/studio/fields/FieldColor.vue:43` — `placeholder="#000000"` — this is an input **placeholder string** for a color-picker field, not an applied color — **not a violation** (listed for completeness).

`COLOR_SWATCH` in `StudioSettingsAppearanceSection.vue:26–37` uses `var(--ginko-color-blue-700)` etc. (CSS var references, not raw hex) to render the appearance theme-picker swatches — **acceptable** (a color picker legitimately shows palette options; all via `var()`).

---

## Class 3 — Pairing-rule violations (tinted semantic bg + wrong foreground)

Overwhelmingly **compliant** — tinted `bg-success/warning/destructive` surfaces pair with `text-*-fg` across `StudioAssetBrowser`, `StudioWorkflowCard`, `StudioEntryTrackCard`, `StudioDashboardWorkflowPath`, `pages/index.vue`, `pages/[collection]/index.vue`, `StudioSettingsStorageSection`, `StudioSettingsRevalidationSection`, `StudioAssetMetadataForm`, alert/badge/button primitives, etc.

Exceptions (gray/default text on a tinted semantic bg):

- `components/studio/settings/StudioSettingsMcpConnectionsSection.vue:77–86` — container `ginko:bg-warning/10` with child title using default `foreground` and description using `ginko:text-muted-foreground` (line 84), no `text-warning-fg` — **suggested fix:** use `text-warning-fg` for the heading and `text-warning-fg/90` (or keep the surface neutral `bg-muted`) — **P2** (possibly-sanctioned atmospheric "token ready" surface, but literally the "gray text on colored bg" case DESIGN bans).
- `components/studio/editor/StudioLocaleEditorPanel.vue:42` — `ginko:border-warning/45 ginko:bg-warning/5` panel wrapper; body text inherits `foreground`/`muted-foreground` rather than `warning-fg` — **assessment:** tint is only 5%, effectively a hairline wash, so contrast risk is low — **P3**.

`StudioEntryStatusRail.vue:282` (`bg-warning/10`) correctly pairs — its children use `text-warning-fg` (lines 284,285). Verified as compliant.

---

## Class 4 — Ad-hoc opacity variants not in DESIGN's documented set

`border-border` documented weights are `/40`, `/60`, `/30`. Off-ladder uses:

- `components/studio/StudioAssetBrowser.vue:1150,1279,1765` — `border-border/50` — **fix:** snap to `/40` or `/60` — **P3**.
- `components/studio/reviews/StudioReviewDetail.vue:36` — `border-border/50` — **P3**.
- `editor/ui/Toolbar.vue:88` — `border-border/50` — **P3**.
- `editor/ui/Editor.vue:804` — `border-border/70` — **fix:** `/60` — **P3**.

Off-ladder semantic tints / borders / rings (DESIGN documents `bg-success/12`, `bg-warning/15`, `bg-destructive/10`, semantic border `/40`):

- `bg-primary/8` — `StudioAssetBrowser.vue:1113,1233` — non-standard 8% tint step — **fix:** `/10` — **P3**.
- `bg-success/10` (vs documented `/12`) — widespread (`StudioAssetBrowser`, `StudioEntryTrackCard`, `StudioCollectionContractSection`, `pages/[collection]/index.vue`) — **P3** tint-step drift.
- `bg-warning/10` (vs documented `/15`) — widespread (`StudioDashboardWorkflowPath`, `StudioEntryTrackCard`, `StudioEntryStatusRail`, `StudioPublishDialog`, `pages/index.vue`, `Editor.vue:720`) — **P3**.
- `bg-destructive/5` — `components/ui/alert/index.ts:15` — vs `/10` elsewhere — **P3**.
- Border opacities off `/40`: `border-warning/25` (`StudioEntryStatusRail.vue:282`), `border-warning/45` (`StudioLocaleEditorPanel.vue:42`), `border-warning/20` (`Editor.vue:720`), `border-warning/30` + `border-success/30` (`StudioAssetBrowser`, `StudioEntryTrackCard`, `McpConnections`, `StudioPublishDialog`), `border-primary/50` (`StudioLocaleVisibilityRow.vue:13`) — **P3** drift.
- Ring opacities (undocumented set): `ring-primary/20` (`StudioAssetBrowser.vue:1233`), `ring-success/30` (`StudioWorkflowCard.vue:274`), `ring-destructive/25` (`276`), `ring-warning/30` (`278`) — **P3** drift.

These are cosmetically minor; the cumulative effect is edge/tint-weight inconsistency, not wrong hues.

---

## Class 5 — Inline `style=""` / `:style` carrying colors

- `components/studio/StudioAssetBrowser.vue:727` and `components/studio/assets/StudioAssetMobileScopes.vue:95` — `:style="{ backgroundColor: tag.color }"` — data-driven tag color — **acceptable** (dynamic per-tag content color, cannot be a static class).
- `components/studio/settings/StudioSettingsAppearanceSection.vue:90` — `:style="{ backgroundColor: COLOR_SWATCH[color] }"` — theme-picker swatch via `var()` — **acceptable**.
- `components/studio/StudioAssetBrowser.vue:1811–1814` — see Class 2 (oklch literal fallback) — **P3**.

All other `:style` bindings found (`SidebarProvider`, `Sidebar`, skeleton widths, `paddingLeft` indentation, `RightSidebar` panelStyle) carry **layout/size only**, no color — **clean**.

---

## Class 6 — Token values contradicting DESIGN.md tables (spot-check)

`styles/index.css` ships tokens that **diverge from DESIGN.md's Color tables**. The divergence is systematic and matches the recent commit "Phase P — true visual parity with the dashboard template," so the implementation is deliberate and **DESIGN.md is the stale artifact**. Flagging so the constitution gets reconciled.

- **`--primary` is no longer emerald.** DESIGN table (line 30): `--primary = 0.696 0.17 162.48` (Emerald-500). Shipped: `index.css:379 --primary: var(--studio-action)` → `index.css:370 --studio-action: oklch(0.205 0 0)` (near-black) in light, `oklch(0.985 0 0)` (near-white) in dark (`548`/`539`). The entire "emerald is the single accent" premise (DESIGN §Color, Strategy, Sidebar "emerald solid pill") is superseded by a **neutral primary** matching the shadcn dashboard template — **P2** (doc/impl contradiction; impl intentional → update DESIGN.md).
- **`--ring` is neutral grey, not emerald.** DESIGN (line 39): `--ring = --primary` (emerald). Shipped: `index.css:398 --ring: oklch(0.708 0 0)` with inline comment `/* template parity: neutral grey focus ring */` (dark: `0.556 0 0`, line 567) — **P2** (contradiction acknowledged in-code; DESIGN stale).
- **`--success` is decoupled from `--primary`.** DESIGN (line 32): "`--success` … Same as primary" = `0.696 0.17 162.48`. Shipped: `index.css:390 --success: oklch(0.63 0.09 160)` (light), `559 oklch(0.58 0.08 160)` (dark) — a distinct muted green, no longer equal to primary — **P2** drift.
- **`--success-fg` value differs.** DESIGN (line 33): `0.5 0.13 162`. Shipped: `index.css:392 oklch(0.42 0.08 160)` (light) — darker/less chroma than documented — **P2** drift.
- Matches confirmed (no drift): `--warning 0.769 0.188 70.08` ✓, `--warning-fg 0.48 0.13 70` ✓, `--destructive 0.577 0.245 27.325` ✓, `--destructive-fg 0.45 0.2 27` ✓, `--border 0.922 0 0` ✓, `--muted 0.97 0 0` ✓, `--muted-foreground 0.556 0 0` ✓, dark borders alpha `oklch(1 0 0 / 0.10)` / input `/0.15` ✓, chart greyscale ladder ✓.
- `styles/themes.css` appearance themes (e.g. `--primary: var(--ginko-color-blue-700)`, line 174) use Tailwind palette vars — **acceptable** (this file defines user-selectable accent themes; it is inside `styles/` and palette references are its purpose).

Note: the `--warning` token carries a deliberate `ginko-keep` comment (`index.css:393`) documenting the intentional amber-h70 choice vs the template's yellow — good precedent; the `--primary`/`--ring`/`--success` divergences deserve the same explicit reconciliation in DESIGN.md.

---

## Summary counts

| Class | Finding kind | P1 | P2 | P3 | Notes/acceptable |
| ----- | ------------ | -- | -- | -- | ---------------- |
| 1 | Palette-literal classes (DebugPanel slate) | 0 | 0 | 1 | — |
| 2 | Hex / oklch literals outside styles | 0 | 1 | 3 | +2 acceptable (flags, placeholder) |
| 3 | Pairing-rule (gray/default text on tinted bg) | 0 | 1 | 1 | rest compliant |
| 4 | Off-ladder opacity variants | 0 | 0 | ~14 | cosmetic weight drift |
| 5 | Inline-style color | 0 | 0 | 1 | rest data-driven/acceptable |
| 6 | Token values vs DESIGN.md tables | 0 | 4 | 0 | DESIGN.md stale post-Phase-P |
| **Total** | | **0** | **6** | **~20** | |

No P1 (visibly-wrong-color) defects. Zero broken tinted/fg contrast pairings on user-facing surfaces. The real work item is **reconciling DESIGN.md's Color section with the shipped neutral-primary token set** (Class 6), then optionally normalizing off-ladder opacity steps (Class 4) and re-skinning the debug panel (Class 1).
